'use strict';

const { nowIso } = require('./logger');

class StatusStore {
  constructor(config, version) {
    this.config = config;
    this.version = version;
    this.startedAt = nowIso();
    this.data = {
      ok: true,
      version,
      updatedAt: null,
      pollIntervalSeconds: config.pollIntervalSeconds,
      maxRecentMails: config.maxRecentMails,
      includeBodyPreview: config.includeBodyPreview,
      bodyPreviewRatio: config.bodyPreviewRatio,
      maxBodyPreviewChars: config.maxBodyPreviewChars,
      maxConsecutiveFailures: config.maxConsecutiveFailures,
      pollingEnabled: config.pollingEnabled !== false,
      accounts: {}
    };
  }

  emptyAccountStatus(acc) {
    const accountBodySetting = acc.includeBodyPreview;
    const effectiveBodyPreview = accountBodySetting === null || accountBodySetting === undefined
      ? this.config.includeBodyPreview
      : Boolean(accountBodySetting);
    return {
      id: acc.id,
      nickname: acc.nickname,
      email: acc.email,
      status: 'loading',
      unreadCount: 0,
      rawUnreadCount: 0,
      ignoredUnreadCount: 0,
      recentMails: [],
      updatedAt: null,
      error: null,
      troubleshooting: [],
      failureCount: 0,
      maxConsecutiveFailures: this.config.maxConsecutiveFailures,
      stopped: false,
      stoppedAt: null,
      includeBodyPreview: accountBodySetting,
      effectiveBodyPreview
    };
  }

  initAccounts(accounts) {
    this.data.accounts = {};
    for (const acc of accounts) {
      this.data.accounts[acc.id] = this.emptyAccountStatus(acc);
    }
    this.data.updatedAt = nowIso();
  }

  replaceAccounts(accounts) {
    this.initAccounts(accounts);
  }

  updateAccount(accountId, partial) {
    this.data.accounts[accountId] = {
      ...(this.data.accounts[accountId] || {}),
      ...partial
    };
    this.data.updatedAt = nowIso();
  }

  ignoreMail(accountId, uid) {
    const account = this.data.accounts[accountId];
    if (!account) return false;
    const before = Array.isArray(account.recentMails) ? account.recentMails.length : 0;
    account.recentMails = (account.recentMails || []).filter((mail) => String(mail.uid) !== String(uid));
    const removed = before !== account.recentMails.length;
    if (removed) {
      account.ignoredUnreadCount = Number(account.ignoredUnreadCount || 0) + 1;
      account.unreadCount = Math.max(0, Number(account.unreadCount || 0) - 1);
      account.updatedAt = nowIso();
      this.data.updatedAt = nowIso();
    }
    return removed;
  }

  markMailRead(accountId, uid) {
    const account = this.data.accounts[accountId];
    if (!account) return false;
    const before = Array.isArray(account.recentMails) ? account.recentMails.length : 0;
    account.recentMails = (account.recentMails || []).filter((mail) => String(mail.uid) !== String(uid));
    const removed = before !== account.recentMails.length;
    account.unreadCount = Math.max(0, Number(account.unreadCount || 0) - 1);
    account.rawUnreadCount = Math.max(0, Number(account.rawUnreadCount || 0) - 1);
    account.updatedAt = nowIso();
    this.data.updatedAt = nowIso();
    return removed;
  }

  updateConfig(config) {
    this.config = config;
    this.data.pollIntervalSeconds = config.pollIntervalSeconds;
    this.data.maxRecentMails = config.maxRecentMails;
    this.data.includeBodyPreview = config.includeBodyPreview;
    this.data.bodyPreviewRatio = config.bodyPreviewRatio;
    this.data.maxBodyPreviewChars = config.maxBodyPreviewChars;
    this.data.maxConsecutiveFailures = config.maxConsecutiveFailures;
    this.data.pollingEnabled = config.pollingEnabled !== false;
    for (const account of Object.values(this.data.accounts || {})) {
      account.maxConsecutiveFailures = config.maxConsecutiveFailures;
      account.effectiveBodyPreview = account.includeBodyPreview === null || account.includeBodyPreview === undefined
        ? config.includeBodyPreview
        : Boolean(account.includeBodyPreview);
    }
    this.data.updatedAt = nowIso();
  }

  setPollingEnabled(enabled) {
    this.data.pollingEnabled = enabled !== false;
    this.data.updatedAt = nowIso();
  }

  getStatus() {
    return {
      ...this.data,
      health: this.getHealth()
    };
  }

  getHealth() {
    const accounts = Object.values(this.data.accounts || {});
    const okCount = accounts.filter((acc) => acc.status === 'ok').length;
    const errorCount = accounts.filter((acc) => acc.status === 'error').length;
    const stoppedCount = accounts.filter((acc) => acc.status === 'stopped' || acc.stopped).length;
    const unreadTotal = accounts.reduce((sum, acc) => sum + (Number(acc.unreadCount) || 0), 0);
    const rawUnreadTotal = accounts.reduce((sum, acc) => sum + (Number(acc.rawUnreadCount || acc.unreadCount) || 0), 0);
    const ignoredUnreadTotal = accounts.reduce((sum, acc) => sum + (Number(acc.ignoredUnreadCount) || 0), 0);

    return {
      ok: true,
      version: this.version,
      startedAt: this.startedAt,
      uptimeSeconds: Math.floor(process.uptime()),
      accountCount: accounts.length,
      okAccountCount: okCount,
      errorAccountCount: errorCount,
      stoppedAccountCount: stoppedCount,
      unreadTotal,
      rawUnreadTotal,
      ignoredUnreadTotal,
      pollIntervalSeconds: this.data.pollIntervalSeconds,
      maxRecentMails: this.data.maxRecentMails,
      includeBodyPreview: this.data.includeBodyPreview,
      bodyPreviewRatio: this.data.bodyPreviewRatio,
      maxBodyPreviewChars: this.data.maxBodyPreviewChars,
      maxConsecutiveFailures: this.data.maxConsecutiveFailures,
      pollingEnabled: this.data.pollingEnabled !== false,
      lastUpdatedAt: this.data.updatedAt
    };
  }
}

module.exports = {
  StatusStore
};
