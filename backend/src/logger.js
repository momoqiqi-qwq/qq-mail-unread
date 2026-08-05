'use strict';

const { maskEmail } = require('./mailUtils');

function nowIso() {
  return new Date().toISOString();
}

class Logger {
  constructor(config, logStore = null) {
    this.config = config;
    this.logStore = logStore;
  }

  accountLabel(account) {
    const email = this.config.verboseLog ? account.email : maskEmail(account.email);
    return `[${account.id}] ${account.nickname} <${email}>`;
  }

  push(level, message, meta) {
    if (this.logStore) this.logStore.add(level, message, meta);
  }

  info(message, meta = {}) {
    const line = `[${nowIso()}] ${message}`;
    console.log(line);
    this.push('info', message, meta);
  }

  warn(message, meta = {}) {
    const line = `[${nowIso()}] ${message}`;
    console.warn(line);
    this.push('warn', message, meta);
  }

  error(message, meta = {}) {
    const line = `[${nowIso()}] ${message}`;
    console.error(line);
    this.push('error', message, meta);
  }

  account(account, message, level = 'info') {
    const line = `${this.accountLabel(account)} - ${message}`;
    if (level === 'error') this.error(line, { accountId: account.id });
    else if (level === 'warn') this.warn(line, { accountId: account.id });
    else this.info(line, { accountId: account.id });
  }
}

module.exports = {
  Logger,
  nowIso
};
