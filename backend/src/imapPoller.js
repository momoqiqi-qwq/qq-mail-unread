'use strict';

const { ImapFlow } = require('imapflow');
const { formatAddressList } = require('./mailUtils');
const { extractBodyPreviewFromSource, makeBodyPreview } = require('./bodyUtils');
const { sanitizeError, buildTroubleshooting } = require('./errors');
const { nowIso } = require('./logger');

class AccountPoller {
  constructor(account, config, statusStore, logger, ignoreStore) {
    this.account = account;
    this.config = config;
    this.statusStore = statusStore;
    this.logger = logger;
    this.ignoreStore = ignoreStore;
    this.client = null;
    this.isConnected = false;
    this.connectingPromise = null;
    this.timer = null;
    this.isPolling = false;
    this.consecutiveFailures = 0;
    this.stopped = false;
    this.stoppedAt = null;
  }

  shouldReadBodyPreview() {
    if (this.account.includeBodyPreview === true) return true;
    if (this.account.includeBodyPreview === false) return false;
    return Boolean(this.config.includeBodyPreview);
  }

  async ensureConnected() {
    if (this.client && this.isConnected) return;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = (async () => {
      await this.safeLogout();

      const client = new ImapFlow({
        host: 'imap.qq.com',
        port: 993,
        secure: true,
        auth: {
          user: this.account.email,
          // 这里必须填写 QQ 邮箱官方生成的 IMAP/SMTP 服务授权码，不是 QQ 登录密码。
          pass: this.account.authCode
        },
        connectionTimeout: this.config.requestTimeoutMs,
        greetingTimeout: this.config.requestTimeoutMs,
        socketTimeout: this.config.requestTimeoutMs,
        logger: false
      });

      client.on('close', () => {
        this.isConnected = false;
      });

      client.on('error', (err) => {
        this.isConnected = false;
        this.logger.account(this.account, `IMAP 连接异常：${sanitizeError(err)}`, 'warn');
      });

      this.client = client;
      await client.connect();
      this.isConnected = true;
      this.logger.account(this.account, 'IMAP 已连接');
    })().finally(() => {
      this.connectingPromise = null;
    });

    return this.connectingPromise;
  }

  async safeLogout() {
    if (!this.client) return;
    try {
      await this.client.logout();
    } catch (_) {
      // 忽略旧连接关闭失败。
    } finally {
      this.client = null;
      this.isConnected = false;
    }
  }

  validateAccount() {
    if (!this.account.id || !this.account.email || !this.account.authCode) {
      throw new Error('账号配置不完整：请检查 id、email、authCode。authCode 必须是 QQ 邮箱 IMAP/SMTP 服务授权码，不是 QQ 登录密码。');
    }
  }

  async pollOnce() {
    if (this.stopped) {
      const current = this.statusStore.getStatus().accounts[this.account.id];
      this.logger.account(this.account, `账号已因连续失败 ${this.consecutiveFailures} 次停止轮询，修复配置后可在后端 GUI 重置`, 'warn');
      return current;
    }

    if (this.isPolling) {
      this.logger.account(this.account, '上一次轮询尚未结束，本轮跳过');
      return this.statusStore.getStatus().accounts[this.account.id];
    }

    this.isPolling = true;

    try {
      this.validateAccount();
      await this.ensureConnected();

      const lock = await this.client.getMailboxLock('INBOX');
      try {
        const unseenUids = await this.client.search({ seen: false }, { uid: true });
        const rawUnreadCount = Array.isArray(unseenUids) ? unseenUids.length : 0;
        const activeUids = [...unseenUids].filter((uid) => !this.ignoreStore.isIgnored(this.account.id, uid));
        const ignoredUnreadCount = rawUnreadCount - activeUids.length;
        const unreadCount = activeUids.length;
        const maxRecentMails = Math.min(100, Math.max(5, Number(this.config.maxRecentMails) || 20));
        const recentUids = activeUids.sort((a, b) => b - a).slice(0, maxRecentMails);
        const recentMails = [];
        const includeBodyPreview = this.shouldReadBodyPreview();

        if (recentUids.length > 0) {
          const uidRange = recentUids.join(',');
          const fetchOptions = { uid: true, envelope: true, internalDate: true };
          if (includeBodyPreview) {
            // 可按全局或账号级设置读取正文预览。只保存在本机内存和 Chrome 本地缓存中，不上传第三方。
            fetchOptions.source = true;
          }

          for await (const msg of this.client.fetch(uidRange, fetchOptions, { uid: true })) {
            const envelope = msg.envelope || {};
            const dateValue = msg.internalDate || envelope.date || null;
            let bodyInfo = makeBodyPreview('', this.config);

            if (includeBodyPreview && msg.source) {
              try {
                bodyInfo = await extractBodyPreviewFromSource(msg.source, this.config);
              } catch (err) {
                this.logger.account(this.account, `正文预览解析失败 UID ${msg.uid}：${sanitizeError(err)}`, 'warn');
              }
            }

            recentMails.push({
              uid: msg.uid,
              mailKey: `${this.account.id}:${msg.uid}`,
              accountId: this.account.id,
              from: formatAddressList(envelope.from),
              subject: envelope.subject || '(无主题)',
              date: dateValue instanceof Date ? dateValue.toISOString() : (dateValue ? String(dateValue) : null),
              ignored: false,
              ...bodyInfo
            });
          }
        }

        recentMails.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

        this.consecutiveFailures = 0;

        const accountStatus = {
          id: this.account.id,
          nickname: this.account.nickname,
          email: this.account.email,
          status: 'ok',
          unreadCount,
          rawUnreadCount,
          ignoredUnreadCount,
          recentMails,
          updatedAt: nowIso(),
          error: null,
          troubleshooting: [],
          failureCount: 0,
          maxConsecutiveFailures: this.config.maxConsecutiveFailures,
          stopped: false,
          stoppedAt: null,
          includeBodyPreview: this.account.includeBodyPreview,
          effectiveBodyPreview: includeBodyPreview
        };

        this.statusStore.updateAccount(this.account.id, accountStatus);
        const ignoredText = ignoredUnreadCount ? `，本地忽略 ${ignoredUnreadCount} 封` : '';
        this.logger.account(this.account, `轮询成功，未读 ${rawUnreadCount} 封${ignoredText}，显示 ${unreadCount} 封`);
        return accountStatus;
      } finally {
        lock.release();
      }
    } catch (err) {
      this.isConnected = false;
      this.consecutiveFailures += 1;
      const errorMessage = sanitizeError(err);
      const maxFailures = Math.max(1, Number(this.config.maxConsecutiveFailures) || 15);
      const shouldStop = this.consecutiveFailures >= maxFailures;

      if (shouldStop) {
        this.stopped = true;
        this.stoppedAt = nowIso();
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
      }

      const troubleshooting = buildTroubleshooting(errorMessage);
      if (shouldStop) {
        troubleshooting.unshift(`该账号已连续轮询失败 ${this.consecutiveFailures} 次，后端已停止继续轮询此账号。请修复授权码、网络或 IMAP 设置后，在后端 GUI 点击“重置已停止账号”。`);
      } else {
        troubleshooting.unshift(`连续失败 ${this.consecutiveFailures}/${maxFailures} 次，达到 ${maxFailures} 次后将自动停止轮询此账号。`);
      }

      const accountStatus = {
        id: this.account.id,
        nickname: this.account.nickname,
        email: this.account.email,
        status: shouldStop ? 'stopped' : 'error',
        unreadCount: 0,
        rawUnreadCount: 0,
        ignoredUnreadCount: 0,
        recentMails: [],
        updatedAt: nowIso(),
        error: shouldStop ? `${errorMessage}；已停止轮询` : errorMessage,
        troubleshooting,
        failureCount: this.consecutiveFailures,
        maxConsecutiveFailures: maxFailures,
        stopped: shouldStop,
        stoppedAt: shouldStop ? this.stoppedAt : null,
        includeBodyPreview: this.account.includeBodyPreview,
        effectiveBodyPreview: this.shouldReadBodyPreview()
      };

      this.statusStore.updateAccount(this.account.id, accountStatus);
      this.logger.account(this.account, shouldStop
        ? `连续失败 ${this.consecutiveFailures} 次，已停止轮询：${errorMessage}`
        : `轮询失败 ${this.consecutiveFailures}/${maxFailures}：${errorMessage}`, shouldStop ? 'error' : 'warn');
      await this.safeLogout();
      return accountStatus;
    } finally {
      this.isPolling = false;
    }
  }

  async markMailRead(uid) {
    if (this.stopped) {
      throw new Error('账号已停止轮询，请先在后端设置中重置该账号。');
    }
    this.validateAccount();
    await this.ensureConnected();
    const lock = await this.client.getMailboxLock('INBOX');
    try {
      await this.client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      this.statusStore.markMailRead(this.account.id, uid);
      this.logger.account(this.account, `已标为已读 UID ${uid}`);
      return this.statusStore.getStatus().accounts[this.account.id];
    } finally {
      lock.release();
    }
  }

  scheduleTimer() {
    if (this.timer) clearInterval(this.timer);
    if (this.stopped || this.config.pollingEnabled === false) {
      this.timer = null;
      return;
    }
    this.timer = setInterval(() => this.pollOnce(), this.config.pollIntervalSeconds * 1000);
  }

  start() {
    if (this.config.pollingEnabled !== false && !this.stopped) {
      this.pollOnce();
    }
    this.scheduleTimer();
  }

  applyConfig() {
    this.scheduleTimer();
  }

  resetStopped() {
    if (!this.stopped) return false;
    this.stopped = false;
    this.stoppedAt = null;
    this.consecutiveFailures = 0;
    this.statusStore.updateAccount(this.account.id, {
      status: 'loading',
      unreadCount: 0,
      rawUnreadCount: 0,
      ignoredUnreadCount: 0,
      recentMails: [],
      updatedAt: nowIso(),
      error: null,
      troubleshooting: [],
      failureCount: 0,
      maxConsecutiveFailures: this.config.maxConsecutiveFailures,
      stopped: false,
      stoppedAt: null
    });
    this.scheduleTimer();
    this.pollOnce();
    return true;
  }

  async stop() {
    if (this.timer) clearInterval(this.timer);
    await this.safeLogout();
  }
}

class PollerManager {
  constructor(accounts, config, statusStore, logger, ignoreStore) {
    this.config = config;
    this.statusStore = statusStore;
    this.logger = logger;
    this.ignoreStore = ignoreStore;
    this.pollers = this.makePollers(accounts);
    this.refreshPromise = null;
  }

  makePollers(accounts) {
    return accounts.map((account) => new AccountPoller(account, this.config, this.statusStore, this.logger, this.ignoreStore));
  }

  start() {
    if (this.config.pollingEnabled === false) {
      this.statusStore.setPollingEnabled(false);
      this.logger.info('后台 IMAP 轮询已暂停，后端仍提供管理界面和缓存状态。');
      return;
    }
    this.statusStore.setPollingEnabled(true);
    for (const poller of this.pollers) poller.start();
  }

  async replaceAccounts(accounts, { start = true } = {}) {
    await Promise.allSettled(this.pollers.map((poller) => poller.stop()));
    this.pollers = this.makePollers(accounts);
    this.statusStore.replaceAccounts(accounts);
    if (start) this.start();
  }

  applyConfig() {
    this.statusStore.updateConfig(this.config);
    if (this.config.pollingEnabled === false) {
      for (const poller of this.pollers) {
        if (poller.timer) {
          clearInterval(poller.timer);
          poller.timer = null;
        }
        poller.safeLogout();
      }
      this.statusStore.setPollingEnabled(false);
      return;
    }
    this.statusStore.setPollingEnabled(true);
    for (const poller of this.pollers) poller.applyConfig();
  }

  setPollingEnabled(enabled) {
    this.config.pollingEnabled = enabled !== false;
    this.applyConfig();
    if (this.config.pollingEnabled) {
      this.refreshAll({ includeStopped: false, ignorePaused: true });
    }
    return this.config.pollingEnabled;
  }

  resetStoppedAccounts() {
    let count = 0;
    for (const poller of this.pollers) {
      if (poller.resetStopped()) count += 1;
    }
    return count;
  }

  async markMailRead(accountId, uid) {
    const poller = this.pollers.find((item) => item.account.id === accountId);
    if (!poller) throw new Error(`未找到账号：${accountId}`);
    if (!uid) throw new Error('缺少邮件 UID');
    return poller.markMailRead(uid);
  }

  async refreshAll({ includeStopped = false, ignorePaused = false } = {}) {
    if (this.refreshPromise) return this.refreshPromise;
    if (this.config.pollingEnabled === false && !ignorePaused) {
      this.statusStore.setPollingEnabled(false);
      return [];
    }

    const targets = includeStopped ? this.pollers : this.pollers.filter((poller) => !poller.stopped);
    this.refreshPromise = Promise.allSettled(targets.map((poller) => poller.pollOnce()))
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  async stop() {
    await Promise.allSettled(this.pollers.map((poller) => poller.stop()));
  }
}

module.exports = {
  AccountPoller,
  PollerManager
};
