'use strict';

const fs = require('fs');
const { CONFIG_FILE } = require('./paths');
const { readJsonFile } = require('./fileUtils');

const DEFAULT_CONFIG = {
  pollIntervalSeconds: 60,
  httpHost: '127.0.0.1',
  httpPort: 8765,
  requestTimeoutMs: 20000,
  verboseLog: false,
  maxRecentMails: 20,
  includeBodyPreview: true,
  bodyPreviewRatio: 0.6,
  maxBodyPreviewChars: 3000,
  maxConsecutiveFailures: 15,
  pollingEnabled: true,
  allowedExtensionOrigins: []
};

const RUNTIME_EDITABLE_KEYS = [
  'pollIntervalSeconds',
  'requestTimeoutMs',
  'verboseLog',
  'maxRecentMails',
  'includeBodyPreview',
  'bodyPreviewRatio',
  'maxBodyPreviewChars',
  'maxConsecutiveFailures',
  'pollingEnabled'
];

function clampNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeConfig(input = {}) {
  const config = { ...DEFAULT_CONFIG, ...(input || {}) };

  config.pollIntervalSeconds = Math.round(clampNumber(config.pollIntervalSeconds, 60, 10, 3600));
  config.httpPort = Math.round(clampNumber(config.httpPort, 8765, 1, 65535));
  config.requestTimeoutMs = Math.round(clampNumber(config.requestTimeoutMs, 20000, 5000, 120000));
  config.verboseLog = Boolean(config.verboseLog);
  config.maxRecentMails = Math.round(clampNumber(config.maxRecentMails, 20, 5, 100));
  config.includeBodyPreview = Boolean(config.includeBodyPreview);
  config.bodyPreviewRatio = clampNumber(config.bodyPreviewRatio, 0.6, 0.05, 1);
  config.maxBodyPreviewChars = Math.round(clampNumber(config.maxBodyPreviewChars, 3000, 200, 20000));
  config.maxConsecutiveFailures = Math.round(clampNumber(config.maxConsecutiveFailures, 15, 1, 100));
  config.pollingEnabled = config.pollingEnabled !== false;
  config.allowedExtensionOrigins = Array.isArray(config.allowedExtensionOrigins)
    ? config.allowedExtensionOrigins.filter((item) => typeof item === 'string')
    : [];

  // 安全要求：无论配置如何填写，都强制只监听 127.0.0.1。
  if (config.httpHost !== '127.0.0.1') {
    console.warn(`[${new Date().toISOString()}] 安全提醒：已强制把 httpHost 改为 127.0.0.1，禁止监听公网地址。`);
    config.httpHost = '127.0.0.1';
  }

  return config;
}

function loadConfig() {
  return sanitizeConfig(readJsonFile(CONFIG_FILE, {}));
}

function toPersistedConfig(config) {
  const safe = sanitizeConfig(config);
  return {
    pollIntervalSeconds: safe.pollIntervalSeconds,
    httpHost: '127.0.0.1',
    httpPort: safe.httpPort,
    requestTimeoutMs: safe.requestTimeoutMs,
    verboseLog: safe.verboseLog,
    allowedExtensionOrigins: safe.allowedExtensionOrigins,
    maxRecentMails: safe.maxRecentMails,
    includeBodyPreview: safe.includeBodyPreview,
    bodyPreviewRatio: safe.bodyPreviewRatio,
    maxBodyPreviewChars: safe.maxBodyPreviewChars,
    maxConsecutiveFailures: safe.maxConsecutiveFailures,
    pollingEnabled: safe.pollingEnabled
  };
}

function saveConfigFile(config) {
  const persisted = toPersistedConfig(config);
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(persisted, null, 2)}\n`, 'utf8');
  return persisted;
}

function patchRuntimeConfig(config, patch = {}) {
  const allowedPatch = {};
  for (const key of RUNTIME_EDITABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      allowedPatch[key] = patch[key];
    }
  }

  const before = { ...config };
  const next = sanitizeConfig({ ...config, ...allowedPatch });
  Object.assign(config, next);
  saveConfigFile(config);

  return {
    config,
    changed: RUNTIME_EDITABLE_KEYS.filter((key) => before[key] !== config[key]),
    ignored: Object.keys(patch || {}).filter((key) => !RUNTIME_EDITABLE_KEYS.includes(key))
  };
}

function getPublicConfig(config) {
  const safe = sanitizeConfig(config);
  return {
    version: 'public',
    pollIntervalSeconds: safe.pollIntervalSeconds,
    httpHost: safe.httpHost,
    httpPort: safe.httpPort,
    requestTimeoutMs: safe.requestTimeoutMs,
    verboseLog: safe.verboseLog,
    maxRecentMails: safe.maxRecentMails,
    includeBodyPreview: safe.includeBodyPreview,
    bodyPreviewRatio: safe.bodyPreviewRatio,
    bodyPreviewPercent: Math.round(safe.bodyPreviewRatio * 100),
    maxBodyPreviewChars: safe.maxBodyPreviewChars,
    maxConsecutiveFailures: safe.maxConsecutiveFailures,
    pollingEnabled: safe.pollingEnabled,
    editableKeys: RUNTIME_EDITABLE_KEYS
  };
}

module.exports = {
  DEFAULT_CONFIG,
  RUNTIME_EDITABLE_KEYS,
  loadConfig,
  sanitizeConfig,
  patchRuntimeConfig,
  getPublicConfig,
  saveConfigFile
};
