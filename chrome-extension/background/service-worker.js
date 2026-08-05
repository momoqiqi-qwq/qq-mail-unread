import { ALARM_NAME, POLL_INTERVAL_MINUTES } from '../shared/config.js';
import { fetchStatus, requestBackendRefresh } from '../shared/api.js';
import {
  getSettings,
  getLastUnreadByAccount,
  setLastUnreadByAccount,
  setStoredStatus
} from '../shared/storage.js';
import {
  calcTotalUnread,
  countErrorAccounts,
  countStoppedAccounts,
  findNewUnreadAccounts,
  toUnreadMap
} from '../shared/status.js';

let refreshInFlight = null;
let qqMailWindowId = null;

async function ensureAlarm() {
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) {
    await chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: POLL_INTERVAL_MINUTES
    });
  }
}

async function updateBadge(statusPayload, offline = false) {
  if (offline) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#D93025' });
    return;
  }

  const total = calcTotalUnread(statusPayload);
  const paused = statusPayload && statusPayload.pollingEnabled === false;
  const errorCount = countErrorAccounts(statusPayload) + countStoppedAccounts(statusPayload);

  if (total > 0) {
    await chrome.action.setBadgeText({ text: total > 999 ? '999+' : String(total) });
    await chrome.action.setBadgeBackgroundColor({ color: '#1A73E8' });
  } else if (paused) {
    await chrome.action.setBadgeText({ text: '停' });
    await chrome.action.setBadgeBackgroundColor({ color: '#64748B' });
  } else if (errorCount > 0) {
    await chrome.action.setBadgeText({ text: '!' });
    await chrome.action.setBadgeBackgroundColor({ color: '#F9AB00' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

async function showNewMailNotifications(previousMap, statusPayload) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return;

  const changed = findNewUnreadAccounts(previousMap, statusPayload);
  for (const item of changed) {
    const nickname = item.account.nickname || item.id;
    const title = `${nickname} 有 ${item.delta} 封新未读邮件`;
    let message = `当前未读 ${item.current} 封。`;

    if (settings.notificationShowSubjects) {
      const firstMail = Array.isArray(item.account.recentMails) ? item.account.recentMails[0] : null;
      if (firstMail) {
        message = `${firstMail.from || '未知发件人'}：${firstMail.subject || '(无主题)'}`;
      }
    }

    await chrome.notifications.create(`qq-mail-${item.id}-${Date.now()}`, {
      type: 'basic',
      iconUrl: 'icons/icon128.png',
      title,
      message,
      priority: 1
    });
  }
}

function safeWindowNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

async function openQqMailSmallWindow() {
  const settings = await getSettings();
  const width = 1100;
  const height = 780;

  if (settings.reuseQqMailWindow !== false && qqMailWindowId) {
    try {
      await chrome.windows.update(qqMailWindowId, { focused: true });
      return;
    } catch (_) {
      qqMailWindowId = null;
    }
  }

  try {
    const win = await chrome.windows.create({
      url: 'https://mail.qq.com',
      type: 'popup',
      width,
      height,
      focused: true
    });
    qqMailWindowId = win && win.id ? win.id : null;
  } catch (_) {
    await chrome.tabs.create({ url: 'https://mail.qq.com' });
  }
}

async function openResizablePanel(message = {}) {
  const settings = await getSettings();
  const width = safeWindowNumber(message.width || settings.panelWidth || settings.popupWidth, 520, 360, 900);
  const height = safeWindowNumber(message.height || settings.panelHeight || settings.popupHeight, 720, 420, 900);

  await chrome.windows.create({
    url: chrome.runtime.getURL('popup/popup.html?panel=1'),
    type: 'popup',
    width,
    height,
    focused: true
  });
}

async function persistOnlineStatus(payload, { notify = true } = {}) {
  const stored = {
    ok: true,
    offline: false,
    fetchedAt: new Date().toISOString(),
    ...payload
  };

  const previousMap = await getLastUnreadByAccount();
  await setStoredStatus(stored);
  await updateBadge(stored, false);

  if (notify) {
    await showNewMailNotifications(previousMap, stored);
  }

  await setLastUnreadByAccount(toUnreadMap(stored));
  return stored;
}

async function persistOfflineStatus(err) {
  const stored = {
    ok: false,
    offline: true,
    fetchedAt: new Date().toISOString(),
    error: '未检测到本地服务，请确认本地后端程序已启动',
    detail: err && err.message ? err.message : String(err || ''),
    accounts: {}
  };

  await setStoredStatus(stored);
  await updateBadge(stored, true);
  return stored;
}

async function refreshStatus({ forceBackendRefresh = false, notify = true } = {}) {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const payload = forceBackendRefresh ? await requestBackendRefresh() : await fetchStatus();
      return await persistOnlineStatus(payload, { notify });
    } catch (err) {
      return await persistOfflineStatus(err);
    }
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureAlarm();
  await refreshStatus({ notify: false });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureAlarm();
  await refreshStatus({ notify: false });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    refreshStatus({ notify: true });
  }
});

chrome.notifications.onClicked.addListener(() => {
  openQqMailSmallWindow();
});


chrome.windows.onRemoved.addListener((windowId) => {
  if (qqMailWindowId === windowId) qqMailWindowId = null;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === 'REFRESH_NOW') {
    refreshStatus({ forceBackendRefresh: true, notify: false })
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message && message.type === 'OPEN_QQ_MAIL_SMALL_WINDOW') {
    openQqMailSmallWindow()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message && message.type === 'OPEN_RESIZABLE_PANEL') {
    openResizablePanel(message)
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  if (message && message.type === 'GET_BACKGROUND_STATUS') {
    fetchStatus()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }

  return false;
});

ensureAlarm();
refreshStatus({ notify: false });
