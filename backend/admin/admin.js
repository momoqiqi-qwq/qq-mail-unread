const $ = (id) => document.getElementById(id);

const controls = {
  pollIntervalSeconds: $('pollIntervalSeconds'),
  requestTimeoutMs: $('requestTimeoutMs'),
  maxRecentMails: $('maxRecentMails'),
  includeBodyPreview: $('includeBodyPreview'),
  bodyPreviewPercent: $('bodyPreviewPercent'),
  maxBodyPreviewChars: $('maxBodyPreviewChars'),
  maxConsecutiveFailures: $('maxConsecutiveFailures'),
  verboseLog: $('verboseLog'),
  pollingEnabled: $('pollingEnabled')
};

const labels = {
  pollIntervalSeconds: $('pollIntervalLabel'),
  requestTimeoutMs: $('timeoutLabel'),
  maxRecentMails: $('maxRecentLabel'),
  bodyPreviewPercent: $('bodyPercentLabel'),
  maxBodyPreviewChars: $('maxBodyCharsLabel'),
  maxConsecutiveFailures: $('failureLabel')
};

const healthBox = $('healthBox');
const healthSummary = $('healthSummary');
const message = $('message');
const accountList = $('accountList');
const ignoredList = $('ignoredList');
const logsList = $('logsList');
const logLevelSelect = $('logLevelSelect');
const importAccountsInput = $('importAccountsInput');
const cleanOldHoursSelect = $('cleanOldHoursSelect');
const adminTheme = $('adminTheme');
const adminFontSize = $('adminFontSize');
const adminDensity = $('adminDensity');
const importBackupInput = $('importBackupInput');
let accountsDraft = [];
let activeTestButtons = new Set();

const ADMIN_UI_PREFS_KEY = 'qqMailAdminUiPrefs';
const ADMIN_UI_DEFAULT = { theme: 'default-blue', fontSize: 'normal', density: 'normal' };

function loadAdminUiPrefs() {
  try {
    return { ...ADMIN_UI_DEFAULT, ...(JSON.parse(localStorage.getItem(ADMIN_UI_PREFS_KEY) || '{}') || {}) };
  } catch (_) {
    return { ...ADMIN_UI_DEFAULT };
  }
}

function saveAdminUiPrefs(prefs) {
  localStorage.setItem(ADMIN_UI_PREFS_KEY, JSON.stringify({ ...ADMIN_UI_DEFAULT, ...prefs }));
}

function applyAdminUiPrefs() {
  const prefs = loadAdminUiPrefs();
  if (adminTheme) adminTheme.value = prefs.theme;
  if (adminFontSize) adminFontSize.value = prefs.fontSize;
  if (adminDensity) adminDensity.value = prefs.density;
  document.body.className = [
    `theme-${prefs.theme}`,
    `admin-font-${prefs.fontSize}`,
    `admin-density-${prefs.density}`
  ].join(' ');
}

function updateAdminUiPref(key, value) {
  const prefs = loadAdminUiPrefs();
  prefs[key] = value;
  saveAdminUiPrefs(prefs);
  applyAdminUiPrefs();
}


function setMessage(text, type = 'ok') {
  message.textContent = text || '';
  message.className = `message ${type}`;
}

function updateLabels() {
  labels.pollIntervalSeconds.textContent = controls.pollIntervalSeconds.value;
  labels.requestTimeoutMs.textContent = controls.requestTimeoutMs.value;
  labels.maxRecentMails.textContent = controls.maxRecentMails.value;
  labels.bodyPreviewPercent.textContent = controls.bodyPreviewPercent.value;
  labels.maxBodyPreviewChars.textContent = controls.maxBodyPreviewChars.value;
  labels.maxConsecutiveFailures.textContent = controls.maxConsecutiveFailures.value;
}

function formatDuration(seconds) {
  const s = Number(seconds) || 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${h}小时${m}分钟`;
  if (m) return `${m}分钟${sec}秒`;
  return `${sec}秒`;
}

function formatTime(isoString) {
  if (!isoString) return '暂无';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return String(isoString);
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).format(date);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function fillConfig(config) {
  controls.pollingEnabled.checked = config.pollingEnabled !== false;
  controls.pollIntervalSeconds.value = config.pollIntervalSeconds || 60;
  controls.requestTimeoutMs.value = config.requestTimeoutMs || 20000;
  controls.maxRecentMails.value = config.maxRecentMails || 20;
  controls.includeBodyPreview.checked = Boolean(config.includeBodyPreview);
  controls.bodyPreviewPercent.value = Math.round(Number(config.bodyPreviewRatio || 0.6) * 100);
  controls.maxBodyPreviewChars.value = config.maxBodyPreviewChars || 3000;
  controls.maxConsecutiveFailures.value = config.maxConsecutiveFailures || 15;
  controls.verboseLog.checked = Boolean(config.verboseLog);
  updateLabels();
}

function renderHealth(health) {
  health = health || {};
  if (healthSummary) {
    healthSummary.innerHTML = [
      ['未读显示', health.unreadTotal || 0],
      ['账号状态', `${health.okAccountCount || 0} 正常 / ${health.errorAccountCount || 0} 异常 / ${health.stoppedAccountCount || 0} 停止`],
      ['轮询', health.pollingEnabled === false ? '已暂停' : '运行中'],
      ['运行时间', formatDuration(health.uptimeSeconds || 0)]
    ].map(([label, value]) => `<div class="summary-card"><div class="summary-label">${escapeHtml(label)}</div><div class="summary-value">${escapeHtml(value)}</div></div>`).join('');
  }
  healthBox.className = 'health-box ok';
  healthBox.textContent = [
    `后端运行正常，版本：v${health.version || 'unknown'}`,
    `运行时间：${formatDuration(health.uptimeSeconds)}`,
    `账号：${health.accountCount} 个，正常 ${health.okAccountCount}，异常 ${health.errorAccountCount}，停止 ${health.stoppedAccountCount || 0}`,
    `未读显示：${health.unreadTotal}，服务器原始未读 ${health.rawUnreadTotal || health.unreadTotal}，本地忽略 ${health.ignoredUnreadTotal || 0}`,
    `轮询状态：${health.pollingEnabled === false ? '已暂停' : '运行中'}`,
    `轮询间隔：${health.pollIntervalSeconds} 秒`,
    `最近未读缓存：${health.maxRecentMails} 封/账号`,
    `默认正文预览：${health.includeBodyPreview ? `开启，约 ${Math.round(Number(health.bodyPreviewRatio || 0.6) * 100)}%，最多 ${health.maxBodyPreviewChars} 字/封` : '关闭'}`,
    `失败保护：连续失败 ${health.maxConsecutiveFailures} 次后停止该账号`,
    `最近更新：${health.lastUpdatedAt || '暂无'}`
  ].join('\n');
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  if (!response.ok) {
    let errText = `HTTP ${response.status}`;
    try {
      const payload = await response.json();
      errText = payload.error || payload.message || errText;
    } catch (_) {}
    throw new Error(errText);
  }
  return await response.json();
}

async function loadConfig() {
  try {
    const payload = await requestJson('/backend-config');
    fillConfig(payload.config || {});
    renderHealth(payload.health || {});
    setMessage('');
  } catch (err) {
    healthBox.className = 'health-box error';
    healthBox.textContent = `读取后端设置失败：${err.message || err}`;
  }
}

function buildPatch() {
  return {
    pollIntervalSeconds: Number(controls.pollIntervalSeconds.value),
    requestTimeoutMs: Number(controls.requestTimeoutMs.value),
    maxRecentMails: Number(controls.maxRecentMails.value),
    includeBodyPreview: controls.includeBodyPreview.checked,
    bodyPreviewRatio: Number(controls.bodyPreviewPercent.value) / 100,
    maxBodyPreviewChars: Number(controls.maxBodyPreviewChars.value),
    maxConsecutiveFailures: Number(controls.maxConsecutiveFailures.value),
    verboseLog: controls.verboseLog.checked,
    pollingEnabled: controls.pollingEnabled.checked
  };
}

async function saveConfig() {
  try {
    const payload = await requestJson('/backend-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildPatch())
    });
    fillConfig(payload.config || {});
    renderHealth(payload.health || {});
    setMessage(`已保存后台设置。变更项：${(payload.changed || []).join('、') || '无'}`);
  } catch (err) {
    setMessage(`保存失败：${err.message || err}`, 'error');
  }
}

async function refreshBackend() {
  try {
    setMessage('正在立即轮询，请稍等...');
    const payload = await requestJson('/refresh', { method: 'POST' });
    renderHealth((payload && payload.health) || {});
    setMessage('已触发立即轮询。');
  } catch (err) { setMessage(`立即轮询失败：${err.message || err}`, 'error'); }
}

async function resetStopped() {
  try {
    const payload = await requestJson('/reset-stopped', { method: 'POST' });
    setMessage(`已重置 ${payload.resetCount || 0} 个停止账号。`);
    await applyAdminUiPrefs();
loadConfig();
  } catch (err) { setMessage(`重置失败：${err.message || err}`, 'error'); }
}

function readAccountRow(row, index) {
  const next = { ...accountsDraft[index] };
  row.querySelectorAll('input,select').forEach((input) => {
    const field = input.dataset.field;
    if (!field) return;
    if (field === 'includeBodyPreview') next[field] = input.value === 'inherit' ? null : input.value === 'true';
    else next[field] = input.value;
  });
  accountsDraft[index] = next;
  return next;
}

function renderTestResult(el, result) {
  if (!el) return;
  el.hidden = false;
  el.className = `test-result ${result && result.ok ? 'ok' : 'error'}`;
  el.textContent = result && result.ok
    ? `${result.message || '连接成功'}，耗时 ${result.latencyMs || 0} ms`
    : `测试失败：${(result && (result.message || result.error)) || '未知错误'}`;
}

async function testAccountAt(index, button) {
  const row = button.closest('.account-editor');
  const resultEl = row.querySelector('.test-result');
  const account = readAccountRow(row, index);
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '测试中';
  activeTestButtons.add(button);
  try {
    const result = await requestJson('/test-account', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ account })
    });
    renderTestResult(resultEl, result);
  } catch (err) {
    renderTestResult(resultEl, { ok: false, message: err.message || String(err) });
  } finally {
    activeTestButtons.delete(button);
    button.disabled = false;
    button.textContent = original;
  }
}

async function testAllAccounts() {
  const buttons = Array.from(accountList.querySelectorAll('.test-account'));
  if (!buttons.length) return setMessage('暂无可测试账号。', 'error');
  setMessage(`正在测试 ${buttons.length} 个账号，请稍等...`);
  for (const btn of buttons) {
    const index = Number(btn.dataset.index);
    await testAccountAt(index, btn);
  }
  setMessage('账号测试完成。');
}

function renderAccounts() {
  accountList.innerHTML = '';
  if (!accountsDraft.length) {
    const empty = document.createElement('div');
    empty.className = 'simple-item';
    empty.textContent = '暂无账号，点击“新增账号”。';
    accountList.appendChild(empty);
    return;
  }

  accountsDraft.forEach((acc, index) => {
    const row = document.createElement('div');
    row.className = 'account-editor';
    row.innerHTML = `
      <label class="field"><span>ID</span><input data-field="id" type="text" value="${escapeHtml(acc.id || '')}" /></label>
      <label class="field"><span>邮箱</span><input data-field="email" type="email" value="${escapeHtml(acc.email || '')}" /></label>
      <label class="field"><span>授权码${acc.hasAuthCode ? '（留空保留）' : ''}</span><input data-field="authCode" type="password" placeholder="QQ邮箱IMAP授权码，不是QQ密码" /></label>
      <label class="field"><span>备注名</span><input data-field="nickname" type="text" value="${escapeHtml(acc.nickname || '')}" /></label>
      <label class="field"><span>正文读取</span><select data-field="includeBodyPreview">
        <option value="inherit">跟随全局</option>
        <option value="true">读取正文</option>
        <option value="false">只读标题</option>
      </select></label>
      <div class="account-actions">
        <button class="test-account" data-index="${index}" type="button">测试</button>
        <button class="remove-account" type="button">删除</button>
      </div>
      <div class="test-result" hidden></div>
    `;
    row.querySelector('[data-field="includeBodyPreview"]').value = acc.includeBodyPreview === true ? 'true' : (acc.includeBodyPreview === false ? 'false' : 'inherit');
    row.querySelectorAll('input,select').forEach((input) => {
      input.addEventListener('input', () => readAccountRow(row, index));
    });
    row.querySelector('.test-account').addEventListener('click', () => testAccountAt(index, row.querySelector('.test-account')));
    row.querySelector('.remove-account').addEventListener('click', () => {
      accountsDraft.splice(index, 1);
      renderAccounts();
    });
    accountList.appendChild(row);
  });
}

async function loadAccounts() {
  try {
    const payload = await requestJson('/accounts');
    accountsDraft = (payload.accounts || []).map((acc) => ({ ...acc, authCode: '' }));
    renderAccounts();
  } catch (err) { setMessage(`读取账号失败：${err.message || err}`, 'error'); }
}

async function saveAccounts() {
  try {
    const payload = await requestJson('/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts: accountsDraft })
    });
    accountsDraft = (payload.accounts || []).map((acc) => ({ ...acc, authCode: '' }));
    renderAccounts();
    renderHealth((payload.status && payload.status.health) || {});
    setMessage('账号已保存，后端已自动重载并开始轮询。');
  } catch (err) { setMessage(`保存账号失败：${err.message || err}`, 'error'); }
}

function addAccount() {
  const n = accountsDraft.length + 1;
  accountsDraft.push({ id: `acc${n}`, email: '', authCode: '', nickname: `账号${n}`, includeBodyPreview: null, hasAuthCode: false });
  renderAccounts();
}

function exportAccounts() {
  if (!confirm('导出的 JSON 会包含 QQ 邮箱 IMAP/SMTP 授权码。请只保存在自己的可信设备上，确认继续导出吗？')) return;
  window.location.href = '/accounts/export';
}

function importAccounts() {
  importAccountsInput.value = '';
  importAccountsInput.click();
}

async function handleImportFile() {
  const file = importAccountsInput.files && importAccountsInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const accounts = Array.isArray(payload) ? payload : payload.accounts;
    if (!Array.isArray(accounts)) throw new Error('导入文件中没有 accounts 数组');
    if (!confirm(`将导入 ${accounts.length} 个账号并替换当前 accounts.json，确认继续吗？`)) return;
    const result = await requestJson('/accounts/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accounts })
    });
    accountsDraft = (result.accounts || []).map((acc) => ({ ...acc, authCode: '' }));
    renderAccounts();
    renderHealth((result.status && result.status.health) || {});
    setMessage(`已导入 ${result.imported || accounts.length} 个账号并重载后端。`);
  } catch (err) {
    setMessage(`导入账号失败：${err.message || err}`, 'error');
  }
}

async function cleanOldCodes() {
  const hours = Number(cleanOldHoursSelect.value || 24);
  if (!confirm(`确认把超过 ${hours} 小时的验证码/激活码/登录码/邀请码类邮件加入本地忽略吗？\n这不会修改 QQ 邮箱服务器上的已读状态。`)) return;
  try {
    const payload = await requestJson('/clean-old-code-mails', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ olderThanHours: hours })
    });
    renderHealth((payload.status && payload.status.health) || {});
    setMessage(`已清理旧验证码邮件 ${payload.cleaned || 0} 封。`);
    await loadIgnored();
  } catch (err) {
    setMessage(`清理旧验证码失败：${err.message || err}`, 'error');
  }
}

async function loadIgnored() {
  try {
    const payload = await requestJson('/ignored-mails');
    const rows = payload.ignoredMails || [];
    if (!rows.length) {
      ignoredList.innerHTML = '<div class="simple-item">暂无本地忽略记录。</div>';
      return;
    }
    ignoredList.innerHTML = rows.map((row) => `
      <div class="simple-item">
        <div class="simple-title"><span>${escapeHtml(row.accountId)} · UID ${escapeHtml(row.uid)}</span><span>${formatTime(row.ignoredAt)}</span></div>
        <div class="simple-meta">${escapeHtml(row.from || '')}<br />${escapeHtml(row.subject || '(无主题)')}<br /><span class="reason">${escapeHtml(row.reason || '')}</span></div>
      </div>
    `).join('');
  } catch (err) { ignoredList.textContent = `读取忽略记录失败：${err.message || err}`; }
}

async function clearIgnored() {
  if (!confirm('确认清空全部本地忽略记录吗？旧验证码邮件可能会重新显示。')) return;
  try {
    const payload = await requestJson('/clear-ignored-mails', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
    });
    setMessage(`已清除 ${payload.cleared || 0} 条本地忽略记录。`);
    await loadIgnored();
    await applyAdminUiPrefs();
loadConfig();
  } catch (err) { setMessage(`清空忽略失败：${err.message || err}`, 'error'); }
}

async function loadLogs() {
  try {
    const level = logLevelSelect.value || 'all';
    const payload = await requestJson(`/logs?level=${encodeURIComponent(level)}&limit=300`);
    const rows = payload.logs || [];
    if (!rows.length) {
      logsList.innerHTML = '<div class="simple-item">暂无日志。</div>';
      return;
    }
    logsList.innerHTML = rows.map((row) => `
      <div class="log-item ${escapeHtml(row.level)}">
        <div class="log-title"><span><span class="badge ${escapeHtml(row.level)}">${escapeHtml(row.level)}</span> ${formatTime(row.time)}</span></div>
        <div class="log-message">${escapeHtml(row.message)}</div>
      </div>
    `).join('');
  } catch (err) { logsList.textContent = `读取日志失败：${err.message || err}`; }
}

async function clearLogs() {
  try {
    await requestJson('/logs', { method: 'DELETE' });
    await loadLogs();
    setMessage('日志已清空。');
  } catch (err) { setMessage(`清空日志失败：${err.message || err}`, 'error'); }
}


async function quickRepair() {
  try {
    setMessage('正在执行一键修复：恢复轮询、重置停止账号并立即轮询...');
    const payload = await requestJson('/repair-and-refresh', { method: 'POST' });
    renderHealth((payload.status && payload.status.health) || payload.health || {});
    setMessage(`一键修复完成：重置 ${payload.resetCount || 0} 个停止账号，已触发轮询。`);
  } catch (err) { setMessage(`一键修复失败：${err.message || err}`, 'error'); }
}

function buildDiagnosticsText(payload) {
  const health = payload.health || {};
  const suggestions = payload.suggestions || [];
  const errors = payload.recentErrors || [];
  return [
    `QQ邮箱提醒后端自检报告`,
    `生成时间：${payload.generatedAt || new Date().toISOString()}`,
    `版本：v${health.version || 'unknown'}`,
    `轮询：${health.pollingEnabled === false ? '已暂停' : '运行中'}`,
    `账号：${health.accountCount || 0} 个，正常 ${health.okAccountCount || 0}，异常 ${health.errorAccountCount || 0}，停止 ${health.stoppedAccountCount || 0}`,
    `未读显示：${health.unreadTotal || 0}，服务器原始未读：${health.rawUnreadTotal || 0}，本地忽略：${health.ignoredUnreadTotal || 0}`,
    `建议：`,
    ...suggestions.map((item) => `- ${item}`),
    `最近错误：`,
    ...(errors.length ? errors.map((row) => `- ${row.time || ''} ${row.message || ''}`) : ['- 无'])
  ].join('\n');
}

async function copyDiagnostics() {
  try {
    const payload = await requestJson('/diagnostics');
    const text = buildDiagnosticsText(payload);
    $('diagnosticsBox').textContent = text;
    await navigator.clipboard.writeText(text);
    setMessage('自检报告已复制到剪贴板。');
  } catch (err) { setMessage(`复制自检报告失败：${err.message || err}`, 'error'); }
}

function exportBackup() {
  if (!confirm('完整备份会包含 QQ 邮箱授权码和本地忽略记录。请只保存在自己的可信设备上，确认导出吗？')) return;
  window.location.href = '/backend-backup/export';
}

function importBackup() {
  importBackupInput.value = '';
  importBackupInput.click();
}

async function handleImportBackupFile() {
  const file = importBackupInput.files && importBackupInput.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!confirm('导入完整备份会覆盖当前后端设置、账号和本地忽略记录，确认继续吗？')) return;
    const result = await requestJson('/backend-backup/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    accountsDraft = (result.accounts || []).map((acc) => ({ ...acc, authCode: '' }));
    renderAccounts();
    fillConfig(result.config || {});
    renderHealth((result.status && result.status.health) || {});
    setMessage(`完整备份已导入：账号 ${result.importedAccounts || 0} 个，忽略记录 ${result.importedIgnored || 0} 条。`);
    await loadIgnored();
    await loadLogs();
  } catch (err) { setMessage(`导入完整备份失败：${err.message || err}`, 'error'); }
}

for (const control of Object.values(controls)) control.addEventListener('input', updateLabels);
if (adminTheme) adminTheme.addEventListener('change', () => updateAdminUiPref('theme', adminTheme.value));
if (adminFontSize) adminFontSize.addEventListener('change', () => updateAdminUiPref('fontSize', adminFontSize.value));
if (adminDensity) adminDensity.addEventListener('change', () => updateAdminUiPref('density', adminDensity.value));

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', async () => {
    document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
    document.querySelectorAll('.tab-page').forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    $(`tab-${tab.dataset.tab}`).classList.add('active');
    if (tab.dataset.tab === 'accounts') await loadAccounts();
    if (tab.dataset.tab === 'ignored') await loadIgnored();
    if (tab.dataset.tab === 'logs') await loadLogs();
  });
});

$('refreshBtn').addEventListener('click', async () => { await loadConfig(); await loadAccounts(); await loadIgnored(); });
$('saveBtn').addEventListener('click', saveConfig);
$('refreshBackendBtn').addEventListener('click', refreshBackend);
$('resetStoppedBtn').addEventListener('click', resetStopped);
$('addAccountBtn').addEventListener('click', addAccount);
$('testAllAccountsBtn').addEventListener('click', testAllAccounts);
$('exportAccountsBtn').addEventListener('click', exportAccounts);
$('importAccountsBtn').addEventListener('click', importAccounts);
importAccountsInput.addEventListener('change', handleImportFile);
$('saveAccountsBtn').addEventListener('click', saveAccounts);
$('cleanOldCodesBtn').addEventListener('click', cleanOldCodes);
$('reloadIgnoredBtn').addEventListener('click', loadIgnored);
$('clearIgnoredBtn').addEventListener('click', clearIgnored);
$('reloadLogsBtn').addEventListener('click', loadLogs);
$('clearLogsBtn').addEventListener('click', clearLogs);
if ($('quickRepairBtn')) $('quickRepairBtn').addEventListener('click', quickRepair);
if ($('copyDiagnosticsBtn')) $('copyDiagnosticsBtn').addEventListener('click', copyDiagnostics);
if ($('exportBackupBtn')) $('exportBackupBtn').addEventListener('click', exportBackup);
if ($('importBackupBtn')) $('importBackupBtn').addEventListener('click', importBackup);
if (importBackupInput) importBackupInput.addEventListener('change', handleImportBackupFile);
if ($('openStatusBtn')) $('openStatusBtn').addEventListener('click', () => window.open('/status', '_blank'));
if ($('openQQMailBtn')) $('openQQMailBtn').addEventListener('click', () => window.open('https://mail.qq.com', '_blank'));
logLevelSelect.addEventListener('change', loadLogs);

applyAdminUiPrefs();
loadConfig();
loadAccounts();
loadIgnored();
loadLogs();
