import { fetchHealth, fetchBackendConfig, updateBackendConfig } from '../shared/api.js';
import { BACKEND_ADMIN_URL } from '../shared/config.js';
import { getSettings, setSettings } from '../shared/storage.js';
import { applyVisualSettings, safeTheme, safeFontSize } from '../shared/uiSettings.js';

const healthBox = document.getElementById('healthBox');
const checkBtn = document.getElementById('checkBtn');
const backendAdminBtn = document.getElementById('backendAdminBtn');
const openAdminBtn = document.getElementById('openAdminBtn');
const copyCmdBtn = document.getElementById('copyCmdBtn');
const privacyMode = document.getElementById('privacyMode');
const notificationsEnabled = document.getElementById('notificationsEnabled');
const notificationShowSubjects = document.getElementById('notificationShowSubjects');
const collapseZeroUnread = document.getElementById('collapseZeroUnread');
const displayMailCount = document.getElementById('displayMailCount');
const mailSortOrder = document.getElementById('mailSortOrder');
const mailFilter = document.getElementById('mailFilter');
const showBodyPreview = document.getElementById('showBodyPreview');
const compactMode = document.getElementById('compactMode');
const bodyPreviewPercent = document.getElementById('bodyPreviewPercent');
const bodyPreviewMode = document.getElementById('bodyPreviewMode');
const openQqMailMode = document.getElementById('openQqMailMode');
const popupWidth = document.getElementById('popupWidth');
const popupHeight = document.getElementById('popupHeight');
const fontSize = document.getElementById('fontSize');
const theme = document.getElementById('theme');

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}小时${m}分钟`;
  if (m > 0) return `${m}分钟${sec}秒`;
  return `${sec}秒`;
}

function safeBodyPreviewPercent(value) {
  const percent = Math.round(Number(value || 60));
  return [10,20,30,40,50,60,70,80,90,100].includes(percent) ? percent : 60;
}

async function loadSettings() {
  const settings = await getSettings();
  privacyMode.checked = settings.privacyMode;
  notificationsEnabled.checked = settings.notificationsEnabled;
  notificationShowSubjects.checked = settings.notificationShowSubjects;
  collapseZeroUnread.checked = settings.collapseZeroUnread;
  showBodyPreview.checked = settings.showBodyPreview;
  compactMode.checked = settings.compactMode !== false;
  bodyPreviewPercent.value = String(safeBodyPreviewPercent(settings.bodyPreviewPercent));
  bodyPreviewMode.value = ['compact', 'normal', 'full'].includes(settings.bodyPreviewMode) ? settings.bodyPreviewMode : 'full';
  openQqMailMode.value = settings.openQqMailMode === 'tab' ? 'tab' : 'smallWindow';
  popupWidth.value = String([360, 392, 460, 540, 620, 760].includes(Number(settings.popupWidth)) ? Number(settings.popupWidth) : 760);
  popupHeight.value = String([520, 620, 720, 820].includes(Number(settings.popupHeight)) ? Number(settings.popupHeight) : 820);
  displayMailCount.value = String([5, 10, 20, 50].includes(Number(settings.displayMailCount)) ? Number(settings.displayMailCount) : 20);
  mailSortOrder.value = settings.mailSortOrder === 'asc' ? 'asc' : 'desc';
  mailFilter.value = settings.mailFilter === 'codes' ? 'codes' : 'all';
  fontSize.value = safeFontSize(settings.fontSize);
  theme.value = safeTheme(settings.theme);
  applyVisualSettings(settings);

  try {
    const backend = await fetchBackendConfig();
    const backendPercent = Math.round(Number(backend.config.bodyPreviewRatio || 0.6) * 100);
    if ([10,20,30,40,50,60,70,80,90,100].includes(backendPercent)) {
      bodyPreviewPercent.value = String(backendPercent);
      await setSettings({ bodyPreviewPercent: backendPercent });
    }
  } catch (_) {
    // 后端离线时只加载扩展本地设置。
  }
}

async function saveSettings() {
  const percent = safeBodyPreviewPercent(bodyPreviewPercent.value);
  await setSettings({
    privacyMode: privacyMode.checked,
    notificationsEnabled: notificationsEnabled.checked,
    notificationShowSubjects: notificationShowSubjects.checked,
    collapseZeroUnread: collapseZeroUnread.checked,
    showBodyPreview: showBodyPreview.checked,
    compactMode: compactMode.checked,
    bodyPreviewPercent: percent,
    bodyPreviewMode: ['compact', 'normal', 'full'].includes(bodyPreviewMode.value) ? bodyPreviewMode.value : 'full',
    openQqMailMode: openQqMailMode.value === 'tab' ? 'tab' : 'smallWindow',
    popupWidth: Number(popupWidth.value) || 760,
    popupHeight: Number(popupHeight.value) || 820,
    panelWidth: Number(popupWidth.value) || 760,
    panelHeight: Number(popupHeight.value) || 820,
    displayMailCount: Number(displayMailCount.value) || 20,
    mailSortOrder: mailSortOrder.value === 'asc' ? 'asc' : 'desc',
    mailFilter: mailFilter.value === 'codes' ? 'codes' : 'all',
    fontSize: safeFontSize(fontSize.value),
    theme: safeTheme(theme.value)
  });
  applyVisualSettings({ fontSize: safeFontSize(fontSize.value), theme: safeTheme(theme.value) });

  try {
    await updateBackendConfig({ bodyPreviewRatio: percent / 100 });
  } catch (_) {
    // 后端离线时只保存扩展本地设置。
  }
}

async function checkHealth() {
  healthBox.className = 'health-box';
  healthBox.textContent = '正在检查...';

  try {
    const health = await fetchHealth();
    healthBox.className = 'health-box ok';
    healthBox.textContent = [
      `本地后端运行正常，版本：v${health.version || 'unknown'}`,
      `运行时间：${formatDuration(health.uptimeSeconds)}`,
      `账号数量：${health.accountCount}，正常：${health.okAccountCount}，异常：${health.errorAccountCount}，停止：${health.stoppedAccountCount || 0}`,
      `未读总数：${health.unreadTotal}`,
      `轮询间隔：${health.pollIntervalSeconds} 秒`,
      `后端最多缓存最近未读邮件：${health.maxRecentMails || 20} 封/账号`,
      `正文预览：${health.includeBodyPreview ? `开启，约 ${Math.round(Number(health.bodyPreviewRatio || 0.6) * 100)}%，最多 ${health.maxBodyPreviewChars || 3000} 字/封` : '关闭'}`,
      `失败保护：连续失败 ${health.maxConsecutiveFailures || 15} 次后停止轮询该账号`,
      `后端设置 GUI：${BACKEND_ADMIN_URL}`,
      `最近更新：${health.lastUpdatedAt || '暂无'}`
    ].join('\n');
  } catch (err) {
    healthBox.className = 'health-box error';
    healthBox.textContent = '未检测到本地后端。请先启动 backend 后端，再点击检查。';
  }
}

for (const checkbox of [privacyMode, notificationsEnabled, notificationShowSubjects, collapseZeroUnread, showBodyPreview, compactMode]) {
  checkbox.addEventListener('change', saveSettings);
}

for (const select of [displayMailCount, mailSortOrder, mailFilter, bodyPreviewPercent, bodyPreviewMode, openQqMailMode, popupWidth, popupHeight, fontSize, theme]) {
  select.addEventListener('change', saveSettings);
}

function openBackendAdmin() {
  chrome.tabs.create({ url: BACKEND_ADMIN_URL });
}

checkBtn.addEventListener('click', checkHealth);
backendAdminBtn.addEventListener('click', openBackendAdmin);
openAdminBtn.addEventListener('click', openBackendAdmin);
copyCmdBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText('cd backend && npm install && npm start');
  copyCmdBtn.textContent = '已复制';
  setTimeout(() => { copyCmdBtn.textContent = '复制启动命令'; }, 1200);
});

await loadSettings();
await checkHealth();
