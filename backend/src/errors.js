'use strict';

function sanitizeError(err) {
  if (!err) return '未知错误';
  const msg = err.message || String(err);

  if (/authentication|auth|login|password|credentials|invalid credentials/i.test(msg)) {
    return '认证失败：请检查邮箱地址、IMAP/SMTP 服务是否开启，以及授权码是否正确。注意授权码不是 QQ 登录密码。';
  }
  if (/timeout|timed out|etimedout/i.test(msg)) {
    return '连接超时：请检查网络、代理、防火墙或 QQ 邮箱 IMAP 服务可用性。';
  }
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|network/i.test(msg)) {
    return '网络连接失败：请检查当前网络环境，或稍后重试。';
  }

  return msg.slice(0, 200);
}

function buildTroubleshooting(errorMessage) {
  const msg = String(errorMessage || '');
  if (/认证失败|授权码|IMAP\/SMTP/i.test(msg)) {
    return [
      '确认 accounts.json 中填写的是 QQ 邮箱 IMAP/SMTP 服务授权码，不是 QQ 登录密码。',
      '登录 QQ 邮箱网页版，在设置中开启 IMAP/SMTP 服务并重新生成授权码。',
      '修改 accounts.json 后需要重启本地后端。'
    ];
  }

  if (/超时|网络/i.test(msg)) {
    return [
      '确认电脑可以正常访问网络。',
      '检查代理、防火墙或安全软件是否阻止 Node.js 访问 imap.qq.com:993。',
      '稍后点击扩展中的“刷新”再次尝试。'
    ];
  }

  return [
    '检查账号配置是否完整。',
    '确认 QQ 邮箱 IMAP/SMTP 服务已经开启。',
    '查看后端终端日志获得更多信息。'
  ];
}

module.exports = {
  sanitizeError,
  buildTroubleshooting
};
