import { STATUS_URL, HEALTH_URL, REFRESH_URL, BACKEND_CONFIG_URL, IGNORE_MAIL_URL, CLEAR_IGNORED_URL, CLEAN_OLD_CODE_MAILS_URL, MARK_MAIL_READ_URL, POLLING_URL, DIAGNOSTICS_URL, FETCH_TIMEOUT_MS } from './config.js';

async function requestJson(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
      ...options
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchStatus() {
  return requestJson(STATUS_URL, { method: 'GET' });
}

export async function fetchHealth() {
  return requestJson(HEALTH_URL, { method: 'GET' });
}

export async function requestBackendRefresh() {
  return requestJson(REFRESH_URL, { method: 'POST' }, Math.max(FETCH_TIMEOUT_MS, 30000));
}

export async function fetchBackendConfig() {
  return requestJson(BACKEND_CONFIG_URL, { method: 'GET' });
}

export async function updateBackendConfig(patch) {
  return requestJson(BACKEND_CONFIG_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch || {})
  }, Math.max(FETCH_TIMEOUT_MS, 30000));
}


export async function ignoreMail(accountId, mail) {
  return requestJson(IGNORE_MAIL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      uid: mail && mail.uid,
      subject: mail && mail.subject,
      from: mail && mail.from,
      date: mail && mail.date,
      reason: 'popup-local-ignore'
    })
  }, Math.max(FETCH_TIMEOUT_MS, 30000));
}

export async function clearIgnoredMails(accountId = null) {
  return requestJson(CLEAR_IGNORED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(accountId ? { accountId } : {})
  }, Math.max(FETCH_TIMEOUT_MS, 30000));
}


export async function markMailRead(accountId, mail) {
  return requestJson(MARK_MAIL_READ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      accountId,
      uid: mail && mail.uid
    })
  }, Math.max(FETCH_TIMEOUT_MS, 30000));
}

export async function cleanOldCodeMails(olderThanHours = 24) {
  return requestJson(CLEAN_OLD_CODE_MAILS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ olderThanHours })
  }, Math.max(FETCH_TIMEOUT_MS, 30000));
}


export async function setBackendPolling(enabled) {
  return requestJson(POLLING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabled !== false })
  }, Math.max(FETCH_TIMEOUT_MS, 30000));
}

export async function fetchDiagnostics() {
  return requestJson(DIAGNOSTICS_URL, { method: 'GET' }, Math.max(FETCH_TIMEOUT_MS, 30000));
}
