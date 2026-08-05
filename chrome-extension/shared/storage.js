import { STORAGE_KEYS, DEFAULT_SETTINGS } from './config.js';

const OPTIMIZED_DEFAULTS_PATCH = {
  optimizedDefaultsApplied: true,
  fontSize: 'xlarge',
  compactMode: false,
  bodyPreviewMode: 'full',
  displayMailCount: 20,
  popupWidth: 760,
  popupHeight: 820,
  panelWidth: 760,
  panelHeight: 820
};

export async function getStoredStatus() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.STATUS);
  return result[STORAGE_KEYS.STATUS] || null;
}

export async function setStoredStatus(status) {
  await chrome.storage.local.set({ [STORAGE_KEYS.STATUS]: status });
}

export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  const stored = result[STORAGE_KEYS.SETTINGS] || {};
  const shouldApplyOptimizedDefaults = stored.optimizedDefaultsApplied !== true;
  const next = {
    ...DEFAULT_SETTINGS,
    ...stored,
    ...(shouldApplyOptimizedDefaults ? OPTIMIZED_DEFAULTS_PATCH : {})
  };

  if (shouldApplyOptimizedDefaults) {
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  }

  return next;
}

export async function setSettings(settingsPatch) {
  const current = await getSettings();
  const next = { ...current, ...settingsPatch, optimizedDefaultsApplied: true };
  await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: next });
  return next;
}

export async function getLastUnreadByAccount() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_UNREAD_BY_ACCOUNT);
  return result[STORAGE_KEYS.LAST_UNREAD_BY_ACCOUNT] || {};
}

export async function setLastUnreadByAccount(value) {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_UNREAD_BY_ACCOUNT]: value || {} });
}
