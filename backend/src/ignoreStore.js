'use strict';

const { IGNORED_MAILS_FILE } = require('./paths');
const { readJsonFile, writeJsonFile } = require('./fileUtils');

function mailKey(accountId, uid) {
  return `${String(accountId)}:${String(uid)}`;
}

class IgnoreStore {
  constructor(filePath = IGNORED_MAILS_FILE) {
    this.filePath = filePath;
    this.data = this.load();
  }

  load() {
    const raw = readJsonFile(this.filePath, { version: 1, ignored: {} });
    if (!raw || typeof raw !== 'object') return { version: 1, ignored: {} };
    if (!raw.ignored || typeof raw.ignored !== 'object') raw.ignored = {};
    return raw;
  }

  save() {
    writeJsonFile(this.filePath, this.data);
  }

  isIgnored(accountId, uid) {
    return Boolean(this.data.ignored[mailKey(accountId, uid)]);
  }

  add(accountId, uid, meta = {}) {
    if (!accountId || uid === undefined || uid === null || uid === '') {
      throw new Error('缺少 accountId 或 uid');
    }
    const key = mailKey(accountId, uid);
    this.data.ignored[key] = {
      accountId: String(accountId),
      uid: String(uid),
      reason: meta.reason || 'local-ignore',
      subject: meta.subject || '',
      from: meta.from || '',
      date: meta.date || '',
      ignoredAt: new Date().toISOString()
    };
    this.save();
    return this.data.ignored[key];
  }

  remove(accountId, uid) {
    const key = mailKey(accountId, uid);
    const existed = Boolean(this.data.ignored[key]);
    delete this.data.ignored[key];
    if (existed) this.save();
    return existed;
  }

  clear(accountId = null) {
    let count = 0;
    if (!accountId) {
      count = Object.keys(this.data.ignored).length;
      this.data.ignored = {};
      this.save();
      return count;
    }

    for (const key of Object.keys(this.data.ignored)) {
      if (this.data.ignored[key] && this.data.ignored[key].accountId === String(accountId)) {
        delete this.data.ignored[key];
        count += 1;
      }
    }
    if (count > 0) this.save();
    return count;
  }

  list({ accountId = null, limit = 200 } = {}) {
    let rows = Object.values(this.data.ignored || {});
    if (accountId) rows = rows.filter((row) => row.accountId === String(accountId));
    rows.sort((a, b) => new Date(b.ignoredAt || 0) - new Date(a.ignoredAt || 0));
    return rows.slice(0, Math.max(1, Math.min(1000, Number(limit) || 200)));
  }
}

module.exports = {
  IgnoreStore,
  mailKey
};
