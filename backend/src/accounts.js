'use strict';

const { ACCOUNTS_FILE, ACCOUNTS_EXAMPLE_FILE } = require('./paths');
const { ensureFileFromExample, readJsonFile, writeJsonFile } = require('./fileUtils');

function normalizeAccount(acc, index) {
  const id = String(acc && acc.id ? acc.id : `acc${index + 1}`).trim();
  const email = String(acc && acc.email ? acc.email : '').trim();
  const nickname = String(acc && acc.nickname ? acc.nickname : (email || id)).trim();
  const includeBodyPreviewRaw = acc && Object.prototype.hasOwnProperty.call(acc, 'includeBodyPreview')
    ? acc.includeBodyPreview
    : null;

  return {
    id,
    email,
    // QQ 授权码有时复制时会带空格，这里去掉所有空白字符。
    // 注意：这是 QQ 邮箱 IMAP/SMTP 服务授权码，不是 QQ 登录密码。
    authCode: String(acc && acc.authCode ? acc.authCode : '').replace(/\s/g, ''),
    nickname,
    // null 表示跟随后端全局设置；true/false 表示账号级覆盖。
    includeBodyPreview: includeBodyPreviewRaw === true ? true : (includeBodyPreviewRaw === false ? false : null)
  };
}

function loadRawAccounts() {
  const rawAccounts = readJsonFile(ACCOUNTS_FILE, []);
  return Array.isArray(rawAccounts) ? rawAccounts : [];
}

function loadAccounts(logger) {
  const created = ensureFileFromExample(ACCOUNTS_FILE, ACCOUNTS_EXAMPLE_FILE);
  if (created && logger) {
    logger.warn('未发现 accounts.json，已根据 accounts.example.json 自动生成。可在后端 GUI 的“账号管理”中编辑。');
  }

  const accounts = loadRawAccounts().map(normalizeAccount);

  if (accounts.length === 0 && logger) {
    logger.warn('accounts.json 中没有可用账号，请在后端 GUI 的“账号管理”中新增 QQ 邮箱账号。');
  }

  return accounts;
}

function publicAccount(account) {
  return {
    id: account.id,
    email: account.email,
    nickname: account.nickname,
    includeBodyPreview: account.includeBodyPreview,
    hasAuthCode: Boolean(account.authCode)
  };
}

function getPublicAccounts() {
  return loadAccounts().map(publicAccount);
}

function saveAccountsFromPublic(nextAccountsInput) {
  if (!Array.isArray(nextAccountsInput)) {
    throw new Error('账号数据必须是数组');
  }

  const existingMap = new Map(loadAccounts().map((acc) => [acc.id, acc]));
  const seen = new Set();
  const nextAccounts = nextAccountsInput.map((input, index) => {
    const normalized = normalizeAccount(input || {}, index);
    if (!normalized.id) throw new Error(`第 ${index + 1} 个账号缺少 id`);
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(normalized.id)) {
      throw new Error(`账号 id “${normalized.id}” 只能包含英文、数字、下划线、短横线，长度 1-40`);
    }
    if (seen.has(normalized.id)) throw new Error(`账号 id 重复：${normalized.id}`);
    seen.add(normalized.id);

    if (!normalized.email) throw new Error(`账号 ${normalized.id} 缺少 email`);
    if (!normalized.email.includes('@')) throw new Error(`账号 ${normalized.id} 的邮箱格式不正确`);

    const existed = existingMap.get(normalized.id);
    if (!normalized.authCode && existed && existed.authCode) {
      normalized.authCode = existed.authCode;
    }
    if (!normalized.authCode) {
      throw new Error(`账号 ${normalized.id} 缺少授权码。授权码不是 QQ 登录密码，需要在 QQ 邮箱 IMAP/SMTP 服务里生成。`);
    }

    return normalized;
  });

  writeJsonFile(ACCOUNTS_FILE, nextAccounts);
  return nextAccounts;
}

function exportAccountsForMigration() {
  return loadAccounts().map((acc) => ({
    id: acc.id,
    email: acc.email,
    authCode: acc.authCode,
    nickname: acc.nickname,
    includeBodyPreview: acc.includeBodyPreview
  }));
}

function importAccountsForMigration(accountsInput) {
  return saveAccountsFromPublic(accountsInput);
}

module.exports = {
  normalizeAccount,
  loadAccounts,
  getPublicAccounts,
  saveAccountsFromPublic,
  exportAccountsForMigration,
  importAccountsForMigration,
  publicAccount
};
