import { getSettings, setSettings, getStoredStatus } from '../shared/storage.js';
import { fetchStatus, requestBackendRefresh, updateBackendConfig, fetchBackendConfig, ignoreMail, markMailRead, cleanOldCodeMails, setBackendPolling, fetchDiagnostics } from '../shared/api.js';
import { BACKEND_ADMIN_URL } from '../shared/config.js';
import { applyVisualSettings, safeTheme, safeFontSize, safeDividerThickness, safeDividerStyle } from '../shared/uiSettings.js';
import {
  calcTotalUnread,
  countErrorAccounts,
  countOkAccounts,
  countStoppedAccounts,
  sortAccountEntries,
  isStaleStatus,
  sortMailsByDate,
  getAccountEntries
} from '../shared/status.js';
import { detectCodeMail, filterMailsByMode } from '../shared/codeUtils.js';

const isPanelMode = new URLSearchParams(location.search).get('panel') === '1';
if (isPanelMode) document.body.classList.add('panel-mode');

const appEl = document.querySelector('.app');
const contentEl = document.getElementById('content');
const summaryEl = document.getElementById('summary');
const lastUpdatedEl = document.getElementById('lastUpdated');
const refreshBtn = document.getElementById('refreshBtn');
const pauseBtn = document.getElementById('pauseBtn');
const searchInput = document.getElementById('searchInput');
const accountViewSelect = document.getElementById('accountViewSelect');
const timeRangeSelect = document.getElementById('timeRangeSelect');
const copyVisibleCodesBtn = document.getElementById('copyVisibleCodesBtn');
const ignoreVisibleBtn = document.getElementById('ignoreVisibleBtn');
const panelWindowBtn = document.getElementById('panelWindowBtn');
const smallWindowBtn = document.getElementById('smallWindowBtn');
const settingsBtn = document.getElementById('settingsBtn');
const backendSettingsBtn = document.getElementById('backendSettingsBtn');
const settingsPanel = document.getElementById('settingsPanel');
const privacyToggle = document.getElementById('privacyToggle');
const notifyToggle = document.getElementById('notifyToggle');
const notifySubjectToggle = document.getElementById('notifySubjectToggle');
const bodyPreviewToggle = document.getElementById('bodyPreviewToggle');
const collapseZeroToggle = document.getElementById('collapseZeroToggle');
const reuseWindowToggle = document.getElementById('reuseWindowToggle');
const densitySelect = document.getElementById('densitySelect');
const fontSizeSelect = document.getElementById('fontSizeSelect');
const themeSelect = document.getElementById('themeSelect');
const displayCountSelect = document.getElementById('displayCountSelect');
const mailFilterSelect = document.getElementById('mailFilterSelect');
const sortOrderSelect = document.getElementById('sortOrderSelect');
const bodyPreviewPercentSelect = document.getElementById('bodyPreviewPercentSelect');
const bodyPreviewModeSelect = document.getElementById('bodyPreviewModeSelect');
const openModeSelect = document.getElementById('openModeSelect');
const dividerThicknessSelect = document.getElementById('dividerThicknessSelect');
const dividerStyleSelect = document.getElementById('dividerStyleSelect');
const popupWidthSelect = document.getElementById('popupWidthSelect');
const popupHeightSelect = document.getElementById('popupHeightSelect');
const copyStartCmdBtn = document.getElementById('copyStartCmdBtn');
const openBackendSettingsBtn = document.getElementById('openBackendSettingsBtn');
const cleanOldCodesBtn = document.getElementById('cleanOldCodesBtn');
const optionsBtn = document.getElementById('optionsBtn');
const diagnosticsBtn = document.getElementById('diagnosticsBtn');
const toastEl = document.getElementById('toast');

let currentSettings = await getSettings();
let expandedAccounts = new Set();
let currentStatus = null;
let visibleMailRefs = [];
let toastTimer = null;
let searchDebounceTimer = null;


function renderRuntimeError(error, prefix = '界面脚本异常') {
  const message = error && error.message ? error.message : String(error || '未知错误');
  try {
    clear(contentEl);
    renderSummary(currentStatus || null);
    lastUpdatedEl.textContent = '界面异常';
    const box = document.createElement('div');
    box.className = 'offline';
    box.appendChild(textEl('strong', '', prefix));
    box.appendChild(textEl('div', '', message));
    box.appendChild(textEl('div', 'hint', '可先点击“刷新”；如果仍为空，请打开 chrome://extensions/ → 本扩展 → 检查视图，查看 Popup 控制台错误。'));
    contentEl.appendChild(box);
  } catch (_) {
    // 如果渲染错误本身也失败，至少不继续抛出。
  }
}

window.addEventListener('error', (event) => {
  renderRuntimeError(event.error || event.message, '界面脚本错误');
});

window.addEventListener('unhandledrejection', (event) => {
  renderRuntimeError(event.reason, '异步请求错误');
});

function formatTime(isoString) {
  if (!isoString) return '暂无同步时间';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '暂无同步时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

function formatMailDate(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';

  const now = new Date();
  const options = date.getFullYear() === now.getFullYear()
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };

  return new Intl.DateTimeFormat('zh-CN', options).format(date);
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function textEl(tagName, className, text) {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}


function showToast(message) {
  if (!toastEl) return;
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 1800);
}

function normalizeSearchText(value) {
  return String(value || '').trim().toLowerCase();
}

function getTimeRangeMs(value) {
  if (value === '1h') return 60 * 60 * 1000;
  if (value === '6h') return 6 * 60 * 60 * 1000;
  if (value === '24h') return 24 * 60 * 60 * 1000;
  if (value === '7d') return 7 * 24 * 60 * 60 * 1000;
  return 0;
}

function mailMatchesSearch(mail, keyword) {
  if (!keyword) return true;
  const haystack = [mail && mail.from, mail && mail.subject, mail && mail.bodyPreview, mail && mail.date]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(keyword);
}

function mailMatchesTimeRange(mail, range) {
  const ms = getTimeRangeMs(range);
  if (!ms) return true;
  const t = new Date(mail && mail.date ? mail.date : 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return false;
  return Date.now() - t <= ms;
}

function accountMatchesView(account) {
  const view = currentSettings.accountView || 'all';
  if (view === 'unread') return Number(account && account.unreadCount || 0) > 0;
  if (view === 'problem') return account && (account.status === 'error' || account.status === 'stopped' || account.stopped);
  if (view === 'ok') return account && account.status === 'ok';
  return true;
}

function highlightText(text, keyword) {
  const value = String(text || '');
  if (!keyword) return document.createTextNode(value);
  const lower = value.toLowerCase();
  const index = lower.indexOf(keyword);
  if (index < 0) return document.createTextNode(value);
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createTextNode(value.slice(0, index)));
  const mark = document.createElement('span');
  mark.className = 'search-highlight';
  mark.textContent = value.slice(index, index + keyword.length);
  frag.appendChild(mark);
  frag.appendChild(document.createTextNode(value.slice(index + keyword.length)));
  return frag;
}

function highlightedEl(tagName, className, text, keyword) {
  const el = document.createElement(tagName);
  if (className) el.className = className;
  el.appendChild(highlightText(text, keyword));
  return el;
}

function safeDisplayCount(value) {
  const count = Number(value || 20);
  if ([5, 10, 20, 50].includes(count)) return count;
  return 20;
}

function safeBodyPreviewMode(value) {
  return ['compact', 'normal', 'full'].includes(value) ? value : 'full';
}

function safeBodyPreviewPercent(value) {
  const percent = Math.round(Number(value || 60));
  const allowed = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  return allowed.includes(percent) ? percent : 60;
}

function safePopupWidth(value) {
  const width = Number(value || 760);
  const allowed = [360, 392, 460, 540, 620, 760];
  return allowed.includes(width) ? width : 760;
}

function safePopupHeight(value) {
  const height = Number(value || 820);
  const allowed = [520, 620, 720, 820];
  return allowed.includes(height) ? height : 820;
}

function applyWindowSize() {
  const width = safePopupWidth(currentSettings.popupWidth);
  const height = safePopupHeight(currentSettings.popupHeight);
  document.documentElement.style.setProperty('--popup-width', `${width}px`);
  document.documentElement.style.setProperty('--popup-height', `${height}px`);
}

function applyDensityClasses() {
  applyWindowSize();
  applyVisualSettings(currentSettings);
  appEl.classList.toggle('comfortable', !currentSettings.compactMode);
  appEl.classList.toggle('body-normal', safeBodyPreviewMode(currentSettings.bodyPreviewMode) === 'normal');
  appEl.classList.toggle('body-full', safeBodyPreviewMode(currentSettings.bodyPreviewMode) === 'full');
}

function renderSummary(data) {
  clear(summaryEl);
  const total = data && !data.offline ? calcTotalUnread(data) : 0;
  const okCount = data && !data.offline ? countOkAccounts(data) : 0;
  const errorCount = data && !data.offline ? countErrorAccounts(data) : 0;
  const stoppedCount = data && !data.offline ? countStoppedAccounts(data) : 0;

  const cards = [
    ['未读', total],
    ['正常', okCount],
    ['异常', errorCount],
    ['停止', stoppedCount]
  ];

  for (const [label, value] of cards) {
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.appendChild(textEl('div', 'summary-value', String(value)));
    card.appendChild(textEl('div', 'summary-label', label));
    summaryEl.appendChild(card);
  }
}


function renderLoading(message = '正在连接本地后端，请稍候…') {
  clear(contentEl);
  renderSummary(currentStatus || null);
  const box = document.createElement('div');
  box.className = 'empty loading-box';
  box.appendChild(textEl('div', 'loading-title', message));
  box.appendChild(textEl('div', 'hint', '如果长时间空白，请确认 backend 已启动，或点击“后台”打开管理页。'));
  contentEl.appendChild(box);
}

function normalizeOfflineError(err, fallback = '刷新失败，请检查本地服务。') {
  if (!err) return fallback;
  if (err.message) return err.message;
  return String(err || fallback);
}

async function refreshStatusDirect(forceBackendRefresh = false) {
  const payload = forceBackendRefresh ? await requestBackendRefresh() : await fetchStatus();
  return { ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload };
}

function renderOffline(message) {
  clear(contentEl);
  renderSummary(null);
  lastUpdatedEl.textContent = '本地服务不可用';

  const box = document.createElement('div');
  box.className = 'offline';
  box.appendChild(textEl('strong', '', '未检测到本地服务'));
  box.appendChild(textEl('div', '', message || '请确认本地后端程序已启动，并监听 http://127.0.0.1:8765。'));
  box.appendChild(textEl('div', 'hint', 'Windows：双击 backend/start-windows.bat。\nmacOS/Linux：运行 backend/start-macos-linux.sh。'));
  contentEl.appendChild(box);
}

function renderEmpty(data) {
  clear(contentEl);
  renderSummary(data);
  const box = document.createElement('div');
  box.className = 'empty';
  box.textContent = '暂无账号数据。请检查本地后端 accounts.json 配置。';
  contentEl.appendChild(box);
}

function shouldExpandAccount(id, account) {
  if (expandedAccounts.has(id)) return true;
  if (account.status === 'stopped' || account.stopped) return true;
  if (account.status === 'error') return true;
  if (Number(account.unreadCount || 0) > 0) return true;
  return !currentSettings.collapseZeroUnread;
}

async function copyToClipboard(text, button) {
  await navigator.clipboard.writeText(text);
  const original = button.textContent;
  button.textContent = '已复制';
  button.classList.add('copied');
  setTimeout(() => {
    button.textContent = original;
    button.classList.remove('copied');
  }, 1200);
}

async function ignoreMailLocally(accountId, mail, button) {
  if (!mail || !mail.uid) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '忽略中';
  try {
    const payload = await ignoreMail(accountId, mail);
    if (payload && payload.status) {
      await chrome.storage.local.set({ qqMailStatus: { ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status } });
      renderStatus({ ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status });
    } else {
      await refreshNow();
    }
  } catch (err) {
    button.textContent = '失败';
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1200);
  }
}

async function markMailReadFromPopup(accountId, mail, button) {
  if (!mail || !mail.uid) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '处理中';
  try {
    const payload = await markMailRead(accountId, mail);
    if (payload && payload.status) {
      await chrome.storage.local.set({ qqMailStatus: { ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status } });
      renderStatus({ ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status });
    } else {
      await refreshNow();
    }
  } catch (err) {
    button.textContent = '失败';
    button.title = err && err.message ? err.message : '标为已读失败';
    setTimeout(() => { button.textContent = original; button.disabled = false; }, 1400);
  }
}

async function openQqMailSmallWindow() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_QQ_MAIL_SMALL_WINDOW' });
    if (!response || !response.ok) throw new Error(response && response.error ? response.error : 'open failed');
  } catch (_) {
    chrome.tabs.create({ url: 'https://mail.qq.com' });
  }
}

async function openResizablePanel() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'OPEN_RESIZABLE_PANEL' });
    if (!response || !response.ok) throw new Error(response && response.error ? response.error : 'open panel failed');
  } catch (_) {
    chrome.runtime.openOptionsPage();
  }
}

function openQqMailNormalTab() {
  chrome.tabs.create({ url: 'https://mail.qq.com' });
}

function openQqMailBySetting() {
  if (currentSettings.openQqMailMode === 'tab') {
    openQqMailNormalTab();
  } else {
    openQqMailSmallWindow();
  }
}

function getDisplayMails(account) {
  const originalMails = Array.isArray(account.recentMails) ? account.recentMails : [];
  const sortedMails = sortMailsByDate(originalMails, currentSettings.mailSortOrder);
  let filteredMails = filterMailsByMode(sortedMails, currentSettings.mailFilter);
  const keyword = normalizeSearchText(currentSettings.mailSearchText);
  filteredMails = filteredMails.filter((mail) => mailMatchesTimeRange(mail, currentSettings.timeRange));
  filteredMails = filteredMails.filter((mail) => mailMatchesSearch(mail, keyword));
  const displayCount = safeDisplayCount(currentSettings.displayMailCount);
  return {
    originalCount: originalMails.length,
    filteredCount: filteredMails.length,
    mails: filteredMails.slice(0, displayCount),
    keyword
  };
}

function createBodyPreviewArea(mail) {
  const originalPreview = String(mail && mail.bodyPreview ? mail.bodyPreview : '').trim();
  if (!currentSettings.showBodyPreview || !originalPreview) return null;

  const requestedPercent = safeBodyPreviewPercent(currentSettings.bodyPreviewPercent);
  const cachedPercent = Number(mail.bodyPreviewPercent || Math.round(Number(mail.bodyPreviewRatio || 0.6) * 100)) || 60;
  const bodyTextLength = Number(mail.bodyTextLength || 0);
  let preview = originalPreview;

  // 如果本地设置的显示比例低于后端当前缓存比例，前端先截断显示，避免必须等待下一轮轮询。
  if (bodyTextLength > 0) {
    const wantedLength = Math.max(1, Math.ceil(bodyTextLength * requestedPercent / 100));
    preview = originalPreview.slice(0, Math.min(originalPreview.length, wantedLength));
  }

  const box = document.createElement('div');
  box.className = 'body-preview';

  const head = document.createElement('div');
  head.className = 'body-preview-head';
  head.appendChild(textEl('span', '', '正文预览'));

  const note = cachedPercent < requestedPercent
    ? `目标 ${requestedPercent}%，当前缓存约 ${cachedPercent}%；刷新后生效`
    : `显示约 ${Math.min(requestedPercent, cachedPercent)}%${mail.bodyPreviewTruncated ? '，后端已截断' : ''}`;
  head.appendChild(textEl('span', 'body-preview-note', note));

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'body-expand-btn';
  expandBtn.textContent = '展开正文';
  expandBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    const expanded = !box.classList.contains('expanded');
    box.classList.toggle('expanded', expanded);
    expandBtn.textContent = expanded ? '收起正文' : '展开正文';
  });
  head.appendChild(expandBtn);

  const content = textEl('div', 'body-preview-text', preview);
  box.appendChild(head);
  box.appendChild(content);
  return box;
}

function createCodeArea(mail) {
  const info = detectCodeMail(mail);
  if (!info.isCodeMail) return null;

  const area = document.createElement('div');
  area.className = 'code-area';

  const label = info.primaryCode
    ? `验证码：${info.primaryCode}${info.codeCandidates.length > 1 ? `（候选 ${info.codeCandidates.length} 个）` : ''}`
    : '疑似验证码邮件，未识别到可复制的码';
  area.appendChild(textEl('span', 'code-label', label));

  if (info.primaryCode) {
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'copy-code-btn';
    copyBtn.textContent = '复制验证码';
    copyBtn.addEventListener('click', async (event) => {
      event.stopPropagation();
      await copyToClipboard(info.primaryCode, copyBtn);
    });
    area.appendChild(copyBtn);
  }

  return area;
}

function renderMailList(accountId, account, body) {
  const unread = Number(account.unreadCount || 0);

  if (currentSettings.privacyMode) {
    body.appendChild(textEl('div', 'privacy-box', `隐私模式已开启：已隐藏发件人、主题和正文预览。当前未读 ${unread} 封。`));
    return;
  }

  const { originalCount, filteredCount, mails, keyword } = getDisplayMails(account);

  if (currentSettings.mailFilter === 'codes') {
    body.appendChild(textEl('div', 'filter-tip', '仅显示验证码、激活码、登录码、邀请码等相关未读邮件。'));
  }

  if (mails.length > 0) {
    const meta = textEl(
      'div',
      'list-meta',
      `${currentSettings.mailSortOrder === 'asc' ? '从旧到新' : '从新到旧'}，显示 ${mails.length}/${filteredCount} 封${originalCount > filteredCount ? `，从 ${originalCount} 封中筛选` : ''}${Number(account.ignoredUnreadCount || 0) ? `，已本地忽略 ${account.ignoredUnreadCount} 封` : ''}`
    );
    body.appendChild(meta);

    const list = document.createElement('ul');
    list.className = 'mail-list';
    for (const mail of mails) {
      const item = document.createElement('li');
      item.className = 'mail-item';
      visibleMailRefs.push({ accountId, mail });
      item.appendChild(highlightedEl('div', 'mail-from', mail.from || '未知发件人', keyword));
      item.appendChild(highlightedEl('div', 'mail-subject', mail.subject || '(无主题)', keyword));
      const dateText = formatMailDate(mail.date);
      if (dateText) item.appendChild(textEl('div', 'mail-date', dateText));
      const mailActions = document.createElement('div');
      mailActions.className = 'mail-actions';
      const readBtn = document.createElement('button');
      readBtn.type = 'button';
      readBtn.className = 'mark-read-btn';
      readBtn.textContent = '标为已读';
      readBtn.title = '把 QQ 邮箱服务器上的这封邮件标为已读，随后未读数会同步减少';
      readBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await markMailReadFromPopup(accountId, mail, readBtn);
      });
      mailActions.appendChild(readBtn);

      const ignoreBtn = document.createElement('button');
      ignoreBtn.type = 'button';
      ignoreBtn.className = 'ignore-mail-btn';
      ignoreBtn.textContent = '本地忽略';
      ignoreBtn.title = '只在本工具里隐藏这封未读邮件，不会把 QQ 邮箱服务器上的邮件标为已读';
      ignoreBtn.addEventListener('click', async (event) => {
        event.stopPropagation();
        await ignoreMailLocally(accountId, mail, ignoreBtn);
      });
      mailActions.appendChild(ignoreBtn);
      item.appendChild(mailActions);
      const codeArea = createCodeArea(mail);
      if (codeArea) item.appendChild(codeArea);
      const bodyPreview = createBodyPreviewArea(mail);
      if (bodyPreview) item.appendChild(bodyPreview);
      list.appendChild(item);
    }
    body.appendChild(list);
  } else if (currentSettings.mailFilter === 'codes') {
    body.appendChild(textEl('div', 'privacy-box', '最近未读邮件中暂未筛选到验证码、激活码、登录码或邀请码相关邮件。'));
  } else {
    body.appendChild(textEl('div', 'privacy-box', '暂无未读邮件摘要。'));
  }
}

function statusText(account) {
  if (account.status === 'stopped' || account.stopped) {
    return `已停止轮询：连续失败 ${account.failureCount || account.maxConsecutiveFailures || 15} 次`;
  }
  if (account.status === 'error') {
    return `连接异常 ${account.failureCount ? `${account.failureCount}/${account.maxConsecutiveFailures || 15}` : ''}`.trim();
  }
  return `同步：${formatTime(account.updatedAt)}${Number(account.ignoredUnreadCount || 0) ? `｜忽略 ${account.ignoredUnreadCount} 封` : ''}`;
}

function renderAccountCard(id, account) {
  const card = document.createElement('section');
  card.className = 'account-card';

  const expanded = shouldExpandAccount(id, account);
  if (expanded) card.classList.add('expanded');

  const head = document.createElement('button');
  head.className = 'account-head';
  head.type = 'button';

  const arrow = textEl('span', 'arrow', expanded ? '▼' : '▶');

  const title = document.createElement('div');
  title.className = 'account-title';
  title.appendChild(textEl('div', 'nickname', account.nickname || id || '未命名账号'));
  title.appendChild(textEl('div', 'status-line', statusText(account)));

  const right = document.createElement('div');
  right.className = 'account-right';
  const unread = Number(account.unreadCount || 0);
  let badgeClass = `badge ${unread === 0 ? 'zero' : ''}`;
  let badgeText = String(unread);
  if (account.status === 'error') {
    badgeClass = 'badge error';
    badgeText = '!';
  }
  if (account.status === 'stopped' || account.stopped) {
    badgeClass = 'badge stopped';
    badgeText = '停';
  }
  right.appendChild(textEl('div', badgeClass, badgeText));

  head.appendChild(arrow);
  head.appendChild(title);
  head.appendChild(right);
  head.addEventListener('click', () => {
    const nextExpanded = !card.classList.contains('expanded');
    card.classList.toggle('expanded', nextExpanded);
    arrow.textContent = nextExpanded ? '▼' : '▶';
    if (nextExpanded) expandedAccounts.add(id);
    else expandedAccounts.delete(id);
  });

  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'account-body';

  if (account.status === 'error' || account.status === 'stopped' || account.stopped) {
    const errorBox = document.createElement('div');
    errorBox.className = 'error-box';
    errorBox.appendChild(textEl('div', '', account.error || '连接失败，请检查授权码、网络或 IMAP 服务状态。'));
    if (Array.isArray(account.troubleshooting) && account.troubleshooting.length > 0) {
      const list = document.createElement('ul');
      for (const item of account.troubleshooting) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }
      errorBox.appendChild(list);
    }
    body.appendChild(errorBox);
  } else {
    renderMailList(id, account, body);
  }

  const openRow = document.createElement('div');
  openRow.className = 'open-row';

  const defaultBtn = document.createElement('button');
  defaultBtn.className = 'open-btn open-small-btn';
  defaultBtn.type = 'button';
  defaultBtn.textContent = currentSettings.openQqMailMode === 'tab' ? '按设置打开：新标签' : '按设置打开：官方';
  defaultBtn.addEventListener('click', openQqMailBySetting);

  const otherBtn = document.createElement('button');
  otherBtn.className = 'open-btn';
  otherBtn.type = 'button';
  otherBtn.textContent = currentSettings.openQqMailMode === 'tab' ? '官方' : '新标签';
  otherBtn.addEventListener('click', currentSettings.openQqMailMode === 'tab' ? openQqMailSmallWindow : openQqMailNormalTab);

  openRow.appendChild(defaultBtn);
  openRow.appendChild(otherBtn);
  body.appendChild(openRow);

  card.appendChild(body);
  return card;
}

function renderStatus(data) {
  currentStatus = data || null;
  visibleMailRefs = [];
  if (!data || data.offline) {
    renderOffline(data && data.error);
    return;
  }

  renderSummary(data);
  if (pauseBtn) pauseBtn.textContent = data.pollingEnabled === false ? '恢复' : '暂停';
  if (pauseBtn) pauseBtn.title = data.pollingEnabled === false ? '恢复后台 IMAP 轮询' : '暂停后台 IMAP 轮询';
  lastUpdatedEl.textContent = `同步：${formatTime(data.fetchedAt || data.updatedAt)}`;

  const entries = sortAccountEntries(data).filter(([, account]) => accountMatchesView(account));
  if (entries.length === 0) {
    renderEmpty(data);
    return;
  }

  clear(contentEl);
  if (data.pollingEnabled === false) {
    contentEl.appendChild(textEl('div', 'paused-tip', '后台 IMAP 轮询已暂停：当前仅显示缓存结果，点击顶部“恢复”可继续同步。'));
  }
  if (isStaleStatus(data)) {
    contentEl.appendChild(textEl('div', 'stale-tip', '当前显示较早缓存。如果长时间不更新，请确认后端仍在运行。'));
  }

  for (const [id, account] of entries) {
    contentEl.appendChild(renderAccountCard(id, account));
  }
}

function syncControlsFromSettings() {
  applyDensityClasses();
  privacyToggle.checked = Boolean(currentSettings.privacyMode);
  notifyToggle.checked = Boolean(currentSettings.notificationsEnabled);
  notifySubjectToggle.checked = Boolean(currentSettings.notificationShowSubjects);
  bodyPreviewToggle.checked = Boolean(currentSettings.showBodyPreview);
  collapseZeroToggle.checked = Boolean(currentSettings.collapseZeroUnread);
  if (reuseWindowToggle) reuseWindowToggle.checked = currentSettings.reuseQqMailWindow !== false;
  densitySelect.value = currentSettings.compactMode ? 'compact' : 'comfortable';
  fontSizeSelect.value = safeFontSize(currentSettings.fontSize);
  themeSelect.value = safeTheme(currentSettings.theme);
  displayCountSelect.value = String(safeDisplayCount(currentSettings.displayMailCount));
  mailFilterSelect.value = currentSettings.mailFilter === 'codes' ? 'codes' : 'all';
  sortOrderSelect.value = currentSettings.mailSortOrder === 'asc' ? 'asc' : 'desc';
  bodyPreviewPercentSelect.value = String(safeBodyPreviewPercent(currentSettings.bodyPreviewPercent));
  bodyPreviewModeSelect.value = safeBodyPreviewMode(currentSettings.bodyPreviewMode);
  if (dividerThicknessSelect) dividerThicknessSelect.value = String(safeDividerThickness(currentSettings.mailDividerThickness));
  if (dividerStyleSelect) dividerStyleSelect.value = safeDividerStyle(currentSettings.mailDividerStyle);
  openModeSelect.value = currentSettings.openQqMailMode === 'tab' ? 'tab' : 'smallWindow';
  if (searchInput) searchInput.value = currentSettings.mailSearchText || '';
  if (accountViewSelect) accountViewSelect.value = currentSettings.accountView || 'all';
  if (timeRangeSelect) timeRangeSelect.value = currentSettings.timeRange || 'all';
  popupWidthSelect.value = String(safePopupWidth(currentSettings.popupWidth));
  popupHeightSelect.value = String(safePopupHeight(currentSettings.popupHeight));
  if (panelWindowBtn) panelWindowBtn.style.display = isPanelMode ? 'none' : '';
  if (smallWindowBtn && isPanelMode) smallWindowBtn.title = '官方打开 QQ 邮箱';
}

async function loadAndRender() {
  currentSettings = await getSettings();
  syncControlsFromSettings();

  const cached = await getStoredStatus();
  if (cached) {
    renderStatus(cached);
  } else {
    renderLoading('暂无缓存，正在获取本地后端状态…');
  }

  // 后端配置同步不要阻塞界面首屏，否则后端慢/离线时会出现“等待同步”和空白区域。
  fetchBackendConfig()
    .then(async (backend) => {
      const percent = Math.round(Number(backend && backend.config ? backend.config.bodyPreviewRatio : 0.6) * 100);
      if ([10,20,30,40,50,60,70,80,90,100].includes(percent) && percent !== currentSettings.bodyPreviewPercent) {
        currentSettings = await setSettings({ bodyPreviewPercent: percent });
        syncControlsFromSettings();
      }
    })
    .catch(() => {
      // 后端离线时使用扩展本地设置，不影响按钮和缓存显示。
    });
}

async function refreshNow() {
  refreshBtn.disabled = true;
  const originalText = refreshBtn.textContent;
  refreshBtn.textContent = '刷新中';

  // 没有缓存时立即显示加载提示，避免看起来像“点击没反应”。
  if (!currentStatus) renderLoading('正在刷新本地后端状态…');

  try {
    let fresh = null;
    try {
      const response = await chrome.runtime.sendMessage({ type: 'REFRESH_NOW' });
      if (response && response.ok) fresh = response.data;
      else throw new Error(response && response.error ? response.error : '后台脚本未返回有效结果');
    } catch (messageErr) {
      // Service Worker 偶发未唤醒或消息失败时，Popup 直接请求本地接口作为兜底。
      fresh = await refreshStatusDirect(true);
    }

    currentStatus = fresh;
    await chrome.storage.local.set({ qqMailStatus: fresh });
    renderStatus(fresh);
    showToast('刷新完成');
  } catch (err) {
    const message = normalizeOfflineError(err, '刷新失败，请确认本地后端已启动。');
    const offline = {
      ok: false,
      offline: true,
      fetchedAt: new Date().toISOString(),
      error: '未检测到本地服务，请确认本地后端程序已启动',
      detail: message,
      accounts: {}
    };
    currentStatus = offline;
    await chrome.storage.local.set({ qqMailStatus: offline });
    renderOffline(`${offline.error}：${message}`);
    showToast('后端不可用');
  } finally {
    refreshBtn.disabled = false;
    refreshBtn.textContent = originalText || '刷新';
  }
}

async function updateSettings(patch) {
  currentSettings = await setSettings(patch);
  await loadAndRender();
}

settingsBtn.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsBtn.classList.toggle('active', !settingsPanel.hidden);
});

privacyToggle.addEventListener('change', async () => updateSettings({ privacyMode: privacyToggle.checked }));
notifyToggle.addEventListener('change', async () => updateSettings({ notificationsEnabled: notifyToggle.checked }));
notifySubjectToggle.addEventListener('change', async () => updateSettings({ notificationShowSubjects: notifySubjectToggle.checked }));
bodyPreviewToggle.addEventListener('change', async () => updateSettings({ showBodyPreview: bodyPreviewToggle.checked }));
bodyPreviewPercentSelect.addEventListener('change', async () => {
  const percent = safeBodyPreviewPercent(bodyPreviewPercentSelect.value);
  currentSettings = await setSettings({ bodyPreviewPercent: percent });
  syncControlsFromSettings();
  try {
    await updateBackendConfig({ bodyPreviewRatio: percent / 100 });
  } catch (_) {
    // 后端未启动时仍保存扩展本地显示比例，稍后可在“后台”GUI 中调整。
  }
  const data = await getStoredStatus();
  renderStatus(data);
});
collapseZeroToggle.addEventListener('change', async () => updateSettings({ collapseZeroUnread: collapseZeroToggle.checked }));
if (reuseWindowToggle) reuseWindowToggle.addEventListener('change', async () => updateSettings({ reuseQqMailWindow: reuseWindowToggle.checked }));
densitySelect.addEventListener('change', async () => updateSettings({ compactMode: densitySelect.value === 'compact' }));
fontSizeSelect.addEventListener('change', async () => updateSettings({ fontSize: safeFontSize(fontSizeSelect.value) }));
themeSelect.addEventListener('change', async () => updateSettings({ theme: safeTheme(themeSelect.value) }));
displayCountSelect.addEventListener('change', async () => updateSettings({ displayMailCount: safeDisplayCount(displayCountSelect.value) }));
mailFilterSelect.addEventListener('change', async () => updateSettings({ mailFilter: mailFilterSelect.value === 'codes' ? 'codes' : 'all' }));
sortOrderSelect.addEventListener('change', async () => updateSettings({ mailSortOrder: sortOrderSelect.value === 'asc' ? 'asc' : 'desc' }));
bodyPreviewModeSelect.addEventListener('change', async () => updateSettings({ bodyPreviewMode: safeBodyPreviewMode(bodyPreviewModeSelect.value) }));
openModeSelect.addEventListener('change', async () => updateSettings({ openQqMailMode: openModeSelect.value === 'tab' ? 'tab' : 'smallWindow' }));
if (dividerThicknessSelect) dividerThicknessSelect.addEventListener('change', async () => updateSettings({ mailDividerThickness: safeDividerThickness(dividerThicknessSelect.value) }));
if (dividerStyleSelect) dividerStyleSelect.addEventListener('change', async () => updateSettings({ mailDividerStyle: safeDividerStyle(dividerStyleSelect.value) }));
popupWidthSelect.addEventListener('change', async () => updateSettings({ popupWidth: safePopupWidth(popupWidthSelect.value), panelWidth: safePopupWidth(popupWidthSelect.value) }));
popupHeightSelect.addEventListener('change', async () => updateSettings({ popupHeight: safePopupHeight(popupHeightSelect.value), panelHeight: safePopupHeight(popupHeightSelect.value) }));

if (searchInput) searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(async () => {
    currentSettings = await setSettings({ mailSearchText: searchInput.value });
    syncControlsFromSettings();
    renderStatus(currentStatus || await getStoredStatus());
  }, 180);
});
if (accountViewSelect) accountViewSelect.addEventListener('change', async () => updateSettings({ accountView: accountViewSelect.value || 'all' }));
if (timeRangeSelect) timeRangeSelect.addEventListener('change', async () => updateSettings({ timeRange: timeRangeSelect.value || 'all' }));

panelWindowBtn.addEventListener('click', openResizablePanel);
smallWindowBtn.addEventListener('click', openQqMailSmallWindow);
refreshBtn.addEventListener('click', refreshNow);
if (pauseBtn) pauseBtn.addEventListener('click', async () => {
  const nextEnabled = currentStatus && currentStatus.pollingEnabled === false;
  pauseBtn.disabled = true;
  try {
    const payload = await setBackendPolling(nextEnabled);
    if (payload && payload.status) {
      await chrome.storage.local.set({ qqMailStatus: { ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status } });
      renderStatus({ ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status });
    } else {
      await refreshNow();
    }
    showToast(nextEnabled ? '已恢复后台轮询' : '已暂停后台轮询');
  } catch (err) {
    showToast('操作失败：请确认后端已启动');
  } finally {
    pauseBtn.disabled = false;
  }
});

copyStartCmdBtn.addEventListener('click', async () => {
  const command = 'cd backend && npm install && npm start';
  await copyToClipboard(command, copyStartCmdBtn);
});



async function copyVisibleCodes() {
  const codes = [];
  for (const ref of visibleMailRefs) {
    const info = detectCodeMail(ref.mail);
    if (info.primaryCode && !codes.includes(info.primaryCode)) codes.push(info.primaryCode);
  }
  if (codes.length === 0) {
    showToast('当前可见邮件没有识别到验证码');
    return;
  }
  await navigator.clipboard.writeText(codes.join('\n'));
  showToast(`已复制 ${codes.length} 个验证码`);
}

async function ignoreVisibleMails() {
  const targets = visibleMailRefs.filter((ref) => ref.mail && ref.mail.uid);
  if (targets.length === 0) {
    showToast('当前没有可忽略的可见邮件');
    return;
  }
  if (!confirm(`确认把当前可见的 ${targets.length} 封邮件加入本地忽略吗？这不会修改 QQ 邮箱服务器上的已读状态。`)) return;
  ignoreVisibleBtn.disabled = true;
  try {
    let latestStatus = null;
    for (const ref of targets) {
      const payload = await ignoreMail(ref.accountId, ref.mail);
      if (payload && payload.status) latestStatus = payload.status;
    }
    if (latestStatus) {
      const stored = { ok: true, offline: false, fetchedAt: new Date().toISOString(), ...latestStatus };
      await chrome.storage.local.set({ qqMailStatus: stored });
      renderStatus(stored);
    } else {
      await refreshNow();
    }
    showToast(`已本地忽略 ${targets.length} 封`);
  } catch (err) {
    showToast('批量忽略失败');
  } finally {
    ignoreVisibleBtn.disabled = false;
  }
}

async function cleanOldCodesFromPopup() {
  if (!confirm('确认把超过 24 小时的验证码/激活码/登录码/邀请码类邮件加入本地忽略吗？这不会修改 QQ 邮箱服务器上的已读状态。')) return;
  const original = cleanOldCodesBtn.textContent;
  cleanOldCodesBtn.disabled = true;
  cleanOldCodesBtn.textContent = '清理中';
  try {
    const payload = await cleanOldCodeMails(24);
    if (payload && payload.status) {
      await chrome.storage.local.set({ qqMailStatus: { ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status } });
      renderStatus({ ok: true, offline: false, fetchedAt: new Date().toISOString(), ...payload.status });
    }
    cleanOldCodesBtn.textContent = `已清理${payload.cleaned || 0}封`;
    setTimeout(() => { cleanOldCodesBtn.textContent = original; cleanOldCodesBtn.disabled = false; }, 1400);
  } catch (err) {
    cleanOldCodesBtn.textContent = '清理失败';
    setTimeout(() => { cleanOldCodesBtn.textContent = original; cleanOldCodesBtn.disabled = false; }, 1400);
  }
}

function openBackendSettings() {
  chrome.tabs.create({ url: BACKEND_ADMIN_URL });
}

backendSettingsBtn.addEventListener('click', openBackendSettings);
openBackendSettingsBtn.addEventListener('click', openBackendSettings);
if (cleanOldCodesBtn) cleanOldCodesBtn.addEventListener('click', cleanOldCodesFromPopup);
if (copyVisibleCodesBtn) copyVisibleCodesBtn.addEventListener('click', copyVisibleCodes);
if (ignoreVisibleBtn) ignoreVisibleBtn.addEventListener('click', ignoreVisibleMails);
if (diagnosticsBtn) diagnosticsBtn.addEventListener('click', async () => {
  try {
    const report = await fetchDiagnostics();
    const text = JSON.stringify(report, null, 2);
    await navigator.clipboard.writeText(text);
    showToast('已复制后端自检报告');
  } catch (_) {
    showToast('复制失败：请确认后端已启动');
  }
});

optionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

await loadAndRender();
setTimeout(() => { refreshNow(); }, 0);

if (isPanelMode) {
  let resizeSaveTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeSaveTimer);
    resizeSaveTimer = setTimeout(async () => {
      const width = Math.max(360, Math.min(900, Math.round(window.outerWidth || window.innerWidth || 520)));
      const height = Math.max(420, Math.min(900, Math.round(window.outerHeight || window.innerHeight || 720)));
      await setSettings({ panelWidth: width, panelHeight: height });
    }, 600);
  });
}
