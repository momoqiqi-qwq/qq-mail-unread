'use strict';

/**
 * QQ 邮箱多账号未读提醒 - 本地后端入口
 *
 * 重要安全说明：
 * 1. 本服务强制只监听 127.0.0.1，绝不监听 0.0.0.0。
 * 2. accounts.json 里的 authCode 必须是 QQ 邮箱官方生成的 IMAP/SMTP 服务授权码，不是 QQ 登录密码。
 * 3. v2.2 支持后端设置 GUI：http://127.0.0.1:8765/admin/，可管理账号、测试授权码、导入导出、清理旧验证码、查看日志和配置托盘模式。
 */

const { createApp } = require('./src/app');

createApp().catch((err) => {
  console.error('[fatal] 后端启动失败：', err);
  process.exit(1);
});
