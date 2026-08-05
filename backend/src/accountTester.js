'use strict';

const { ImapFlow } = require('imapflow');
const { sanitizeError } = require('./errors');

function normalizeAuthCode(value) {
  return String(value || '').replace(/\s/g, '');
}

function maskError(err) {
  return sanitizeError(err);
}

/**
 * 测试 QQ 邮箱 IMAP 授权码是否可用。
 * 注意：这里只连接 INBOX 并查询未读数量，不读取正文。
 */
async function testAccountConnection(account, config = {}) {
  const email = String(account && account.email ? account.email : '').trim();
  const authCode = normalizeAuthCode(account && account.authCode);
  const timeout = Number(config.requestTimeoutMs || 20000);

  if (!email || !email.includes('@')) {
    throw new Error('邮箱地址为空或格式不正确');
  }
  if (!authCode) {
    throw new Error('授权码为空。请填写 QQ 邮箱 IMAP/SMTP 服务授权码，不是 QQ 登录密码。');
  }

  const client = new ImapFlow({
    host: 'imap.qq.com',
    port: 993,
    secure: true,
    auth: { user: email, pass: authCode },
    connectionTimeout: timeout,
    greetingTimeout: timeout,
    socketTimeout: timeout,
    logger: false
  });

  const startedAt = Date.now();
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    let unreadCount = 0;
    try {
      const unseenUids = await client.search({ seen: false }, { uid: true });
      unreadCount = Array.isArray(unseenUids) ? unseenUids.length : 0;
    } finally {
      lock.release();
    }

    return {
      ok: true,
      email,
      unreadCount,
      latencyMs: Date.now() - startedAt,
      message: `连接成功，当前服务器未读 ${unreadCount} 封。`
    };
  } catch (err) {
    return {
      ok: false,
      email,
      latencyMs: Date.now() - startedAt,
      error: maskError(err),
      message: maskError(err)
    };
  } finally {
    try {
      await client.logout();
    } catch (_) {}
  }
}

module.exports = {
  testAccountConnection
};
