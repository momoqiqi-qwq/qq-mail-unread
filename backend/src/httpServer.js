'use strict';

const express = require('express');
const { ADMIN_DIR } = require('./paths');
const { patchRuntimeConfig, getPublicConfig } = require('./config');
const { getPublicAccounts, saveAccountsFromPublic, exportAccountsForMigration, importAccountsForMigration } = require('./accounts');
const { testAccountConnection } = require('./accountTester');
const { cleanOldCodeMails } = require('./codeMailUtils');

function corsForChromeExtension(config) {
  return function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;
    const allowedList = Array.isArray(config.allowedExtensionOrigins) ? config.allowedExtensionOrigins : [];

    // Chrome 扩展请求本地 HTTP 接口时 Origin 是 chrome-extension://<扩展ID>。
    // 这里仅对 Chrome 扩展来源放行，且服务本身只监听 127.0.0.1。
    if (origin && origin.startsWith('chrome-extension://')) {
      const allowed = allowedList.length === 0 || allowedList.includes(origin);
      if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
    }

    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  };
}

function createHttpServer(config, statusStore, pollerManager, deps = {}) {
  const app = express();
  const ignoreStore = deps.ignoreStore;
  const logStore = deps.logStore;
  const logger = deps.logger;

  app.use(express.json({ limit: '2mb' }));
  app.use(corsForChromeExtension(config));

  app.get('/status', (_req, res) => {
    res.json(statusStore.getStatus());
  });

  app.get('/health', (_req, res) => {
    res.json(statusStore.getHealth());
  });

  app.get('/backend-config', (_req, res) => {
    res.json({ ok: true, config: getPublicConfig(config), health: statusStore.getHealth() });
  });

  app.post('/backend-config', (req, res) => {
    const result = patchRuntimeConfig(config, req.body || {});
    statusStore.updateConfig(config);
    pollerManager.applyConfig();
    if (logger) logger.info(`后端设置已更新：${result.changed.join('、') || '无变化'}`);
    res.json({
      ok: true,
      config: getPublicConfig(config),
      changed: result.changed,
      ignored: result.ignored,
      health: statusStore.getHealth()
    });
  });

  app.get('/accounts', (_req, res) => {
    res.json({ ok: true, accounts: getPublicAccounts() });
  });

  app.post('/accounts', async (req, res) => {
    try {
      const accounts = saveAccountsFromPublic(req.body && req.body.accounts);
      await pollerManager.replaceAccounts(accounts, { start: true });
      if (logger) logger.info(`账号配置已保存并重载：${accounts.length} 个账号`);
      res.json({ ok: true, accounts: getPublicAccounts(), status: statusStore.getStatus() });
    } catch (err) {
      if (logger) logger.error(`保存账号失败：${err.message || err}`);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });


  app.post('/test-account', async (req, res) => {
    try {
      const body = req.body || {};
      const account = body.account || body;
      const result = await testAccountConnection(account, config);
      if (logger) logger.info(`账号连接测试：${account.email || 'unknown'} - ${result.ok ? '成功' : '失败'}`);
      res.json(result);
    } catch (err) {
      if (logger) logger.error(`账号连接测试异常：${err.message || err}`);
      res.status(400).json({ ok: false, error: err.message || String(err), message: err.message || String(err) });
    }
  });

  app.get('/accounts/export', (_req, res) => {
    const exportedAt = new Date().toISOString();
    const payload = {
      version: 1,
      type: 'qq-mail-unread-accounts-export',
      exportedAt,
      securityNotice: '本文件包含 QQ 邮箱 IMAP/SMTP 授权码，请只保存在自己的可信设备上，不要发给他人。',
      accounts: exportAccountsForMigration()
    };
    if (logger) logger.warn('已导出账号配置。提醒：导出文件包含授权码，请妥善保管。');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="qq-mail-accounts-${exportedAt.slice(0, 10)}.json"`);
    res.send(`${JSON.stringify(payload, null, 2)}\n`);
  });

  app.post('/accounts/import', async (req, res) => {
    try {
      const body = req.body || {};
      const accountsInput = Array.isArray(body.accounts) ? body.accounts : (body.payload && body.payload.accounts);
      const accounts = importAccountsForMigration(accountsInput);
      await pollerManager.replaceAccounts(accounts, { start: true });
      if (logger) logger.warn(`已导入账号配置并重载：${accounts.length} 个账号`);
      res.json({ ok: true, imported: accounts.length, accounts: getPublicAccounts(), status: statusStore.getStatus() });
    } catch (err) {
      if (logger) logger.error(`导入账号失败：${err.message || err}`);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/clean-old-code-mails', async (req, res) => {
    try {
      const body = req.body || {};
      const result = cleanOldCodeMails(statusStore.getStatus(), ignoreStore, {
        olderThanHours: body.olderThanHours,
        accountId: body.accountId || null
      });
      for (const row of result.ignored) statusStore.ignoreMail(row.accountId, row.uid);
      if (logger) logger.info(`一键清理旧验证码：阈值 ${result.olderThanHours} 小时，新增忽略 ${result.ignored.length} 封`);
      res.json({ ok: true, cleaned: result.ignored.length, ...result, status: statusStore.getStatus() });
    } catch (err) {
      if (logger) logger.error(`清理旧验证码失败：${err.message || err}`);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get('/ignored-mails', (req, res) => {
    res.json({
      ok: true,
      ignoredMails: ignoreStore ? ignoreStore.list({ accountId: req.query.accountId, limit: req.query.limit }) : []
    });
  });

  app.post('/ignore-mail', async (req, res) => {
    try {
      const body = req.body || {};
      const ignored = ignoreStore.add(body.accountId, body.uid, {
        reason: body.reason || 'local-ignore',
        subject: body.subject,
        from: body.from,
        date: body.date
      });
      statusStore.ignoreMail(body.accountId, body.uid);
      if (logger) logger.info(`已本地忽略邮件：${body.accountId}:${body.uid}`);
      res.json({ ok: true, ignored, status: statusStore.getStatus() });
    } catch (err) {
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/mark-mail-read', async (req, res) => {
    try {
      const body = req.body || {};
      const account = await pollerManager.markMailRead(body.accountId, body.uid);
      if (logger) logger.info(`已标为已读：${body.accountId}:${body.uid}`);
      res.json({ ok: true, account, status: statusStore.getStatus() });
    } catch (err) {
      if (logger) logger.error(`标为已读失败：${err.message || err}`);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.post('/clear-ignored-mails', async (req, res) => {
    const accountId = req.body && req.body.accountId ? req.body.accountId : null;
    const count = ignoreStore ? ignoreStore.clear(accountId) : 0;
    if (logger) logger.info(accountId ? `已清除账号 ${accountId} 的本地忽略记录 ${count} 条` : `已清除全部本地忽略记录 ${count} 条`);
    await pollerManager.refreshAll();
    res.json({ ok: true, cleared: count, status: statusStore.getStatus() });
  });

  app.get('/logs', (req, res) => {
    res.json({
      ok: true,
      logs: logStore ? logStore.list({ level: req.query.level || 'all', limit: req.query.limit || 300 }) : []
    });
  });

  app.delete('/logs', (_req, res) => {
    const cleared = logStore ? logStore.clear() : 0;
    res.json({ ok: true, cleared });
  });


  app.get('/polling', (_req, res) => {
    res.json({ ok: true, pollingEnabled: config.pollingEnabled !== false, status: statusStore.getStatus() });
  });

  app.post('/polling', (req, res) => {
    const enabled = req.body && Object.prototype.hasOwnProperty.call(req.body, 'enabled') ? req.body.enabled !== false : true;
    config.pollingEnabled = enabled;
    const finalEnabled = pollerManager.setPollingEnabled(enabled);
    statusStore.setPollingEnabled(finalEnabled);
    if (logger) logger.info(finalEnabled ? '已恢复后台 IMAP 轮询' : '已暂停后台 IMAP 轮询');
    res.json({ ok: true, pollingEnabled: finalEnabled, status: statusStore.getStatus() });
  });



  app.post('/repair-and-refresh', async (_req, res) => {
    try {
      config.pollingEnabled = true;
      pollerManager.setPollingEnabled(true);
      statusStore.setPollingEnabled(true);
      const resetCount = pollerManager.resetStoppedAccounts();
      await pollerManager.refreshAll({ includeStopped: false, ignorePaused: true });
      if (logger) logger.info(`一键修复并轮询完成：重置停止账号 ${resetCount} 个`);
      res.json({ ok: true, resetCount, status: statusStore.getStatus(), health: statusStore.getHealth() });
    } catch (err) {
      if (logger) logger.error(`一键修复并轮询失败：${err.message || err}`);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get('/backend-backup/export', (_req, res) => {
    const exportedAt = new Date().toISOString();
    const payload = {
      version: 1,
      type: 'qq-mail-unread-full-backup',
      appVersion: statusStore.getHealth().version,
      exportedAt,
      securityNotice: '本文件包含 QQ 邮箱 IMAP/SMTP 授权码和本地缓存设置，请只保存在自己的可信设备上，不要发给他人。',
      config: getPublicConfig(config),
      accounts: exportAccountsForMigration(),
      ignoredMails: ignoreStore ? (ignoreStore.data || { version: 1, ignored: {} }) : { version: 1, ignored: {} }
    };
    if (logger) logger.warn('已导出完整后端备份。提醒：备份包含授权码，请妥善保管。');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="qq-mail-backend-backup-${exportedAt.slice(0, 10)}.json"`);
    res.send(`${JSON.stringify(payload, null, 2)}\n`);
  });

  app.post('/backend-backup/import', async (req, res) => {
    try {
      const body = req.body || {};
      const accountsInput = Array.isArray(body.accounts) ? body.accounts : (body.payload && body.payload.accounts);
      const accounts = importAccountsForMigration(accountsInput || []);

      if (body.config && typeof body.config === 'object') {
        patchRuntimeConfig(config, body.config);
        statusStore.updateConfig(config);
        pollerManager.applyConfig();
      }

      if (ignoreStore && body.ignoredMails && typeof body.ignoredMails === 'object') {
        const ignored = body.ignoredMails.ignored && typeof body.ignoredMails.ignored === 'object'
          ? body.ignoredMails.ignored
          : {};
        ignoreStore.data = { version: 1, ignored };
        ignoreStore.save();
      }

      await pollerManager.replaceAccounts(accounts, { start: true });
      if (logger) logger.warn(`已导入完整后端备份：账号 ${accounts.length} 个`);
      res.json({
        ok: true,
        importedAccounts: accounts.length,
        importedIgnored: ignoreStore ? Object.keys(ignoreStore.data.ignored || {}).length : 0,
        config: getPublicConfig(config),
        accounts: getPublicAccounts(),
        status: statusStore.getStatus()
      });
    } catch (err) {
      if (logger) logger.error(`导入完整后端备份失败：${err.message || err}`);
      res.status(400).json({ ok: false, error: err.message || String(err) });
    }
  });

  app.get('/diagnostics', (_req, res) => {
    const status = statusStore.getStatus();
    const accounts = Object.values(status.accounts || {});
    const recentErrors = logStore ? logStore.list({ level: 'error', limit: 8 }) : [];
    const suggestions = [];
    if (config.pollingEnabled === false) suggestions.push('后台轮询已暂停：可在扩展或后端 GUI 中恢复。');
    if (accounts.length === 0) suggestions.push('尚未配置账号：请进入后端 GUI 的“账号管理”新增 QQ 邮箱账号。');
    if (accounts.some((acc) => acc.status === 'stopped' || acc.stopped)) suggestions.push('存在已停止账号：修复授权码或网络后，点击“重置已停止账号”。');
    if (accounts.some((acc) => acc.status === 'error')) suggestions.push('存在连接异常账号：请检查 IMAP/SMTP 服务是否开启、授权码是否正确。');
    if (recentErrors.length > 0) suggestions.push('最近存在错误日志：可在后端 GUI 的“运行日志”查看详情。');
    if (suggestions.length === 0) suggestions.push('当前未发现明显配置问题。');
    res.json({ ok: true, generatedAt: new Date().toISOString(), health: status.health, suggestions, recentErrors });
  });

  app.post('/reset-stopped', (_req, res) => {
    const resetCount = pollerManager.resetStoppedAccounts();
    res.json({ ok: true, resetCount, status: statusStore.getStatus() });
  });

  // 手动刷新接口：仍然只监听 127.0.0.1，并通过 CORS 允许 Chrome 扩展调用。
  app.post('/refresh', async (_req, res) => {
    await pollerManager.refreshAll();
    res.json(statusStore.getStatus());
  });

  // 本地后端设置 GUI：只由 127.0.0.1 暴露，用来调整轮询、账号、正文比例、失败保护等后端参数。
  app.get(['/admin', '/admin/'], (_req, res) => {
    res.sendFile(require('path').join(ADMIN_DIR, 'index.html'));
  });
  app.use('/admin', express.static(ADMIN_DIR));

  return app;
}

module.exports = {
  createHttpServer
};
