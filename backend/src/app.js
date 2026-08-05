'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');
const { loadAccounts } = require('./accounts');
const { Logger, nowIso } = require('./logger');
const { LogStore } = require('./logStore');
const { IgnoreStore } = require('./ignoreStore');
const { StatusStore } = require('./statusStore');
const { PollerManager } = require('./imapPoller');
const { createHttpServer } = require('./httpServer');
const { RESOURCE_DIR } = require('./paths');

function getPackageVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(RESOURCE_DIR, 'package.json'), 'utf8'));
    return pkg.version || '2.1.0';
  } catch (_) {
    return '2.1.0';
  }
}

async function createApp() {
  const config = loadConfig();
  const logStore = new LogStore(500);
  const logger = new Logger(config, logStore);
  const ignoreStore = new IgnoreStore();
  const accounts = loadAccounts(logger);
  const statusStore = new StatusStore(config, getPackageVersion());
  statusStore.initAccounts(accounts);

  const pollerManager = new PollerManager(accounts, config, statusStore, logger, ignoreStore);
  pollerManager.start();

  const app = createHttpServer(config, statusStore, pollerManager, { ignoreStore, logStore, logger });
  const server = app.listen(config.httpPort, config.httpHost, () => {
    logger.info(`本地 HTTP 服务已启动：http://${config.httpHost}:${config.httpPort}`);
    logger.info('可用接口：GET /status、GET /health、GET/POST /backend-config、GET/POST /accounts、POST /test-account、GET /accounts/export、POST /accounts/import、POST /clean-old-code-mails、GET /logs、POST /ignore-mail、POST /refresh');
    logger.info(`后端设置 GUI：http://${config.httpHost}:${config.httpPort}/admin/，支持账号管理、账号测试、导入导出、日志查看、正文比例、账号级正文读取开关和旧验证码清理。`);
    logger.info('安全说明：服务仅监听 127.0.0.1；授权码只保存在本地 accounts.json；请勿填写 QQ 登录密码。');
  });

  async function shutdown() {
    logger.info('正在退出...');
    server.close();
    await pollerManager.stop();
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  process.on('unhandledRejection', (err) => {
    logger.error(`未处理的 Promise 异常：${err && err.stack ? err.stack : err}`);
  });

  logger.info(`启动时间：${nowIso()}`);
  return { app, server, pollerManager, statusStore, logStore, ignoreStore };
}

module.exports = {
  createApp
};
