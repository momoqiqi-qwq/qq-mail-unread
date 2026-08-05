'use strict';

/**
 * Windows 托盘入口。
 * 用 Electron 主进程直接启动本地后端，并在系统托盘显示菜单。
 * 普通命令行后端仍然使用 server.js；托盘模式使用 npm run tray 或构建后的托盘 exe。
 */

const path = require('path');
const { app, Tray, Menu, shell, nativeImage, dialog } = require('electron');
const { createApp } = require('./src/app');

let tray = null;
let backendRuntime = null;
let startingPromise = null;

async function startBackend() {
  if (backendRuntime) return backendRuntime;
  if (startingPromise) return startingPromise;
  startingPromise = createApp()
    .then((runtime) => {
      backendRuntime = runtime;
      startingPromise = null;
      return runtime;
    })
    .catch((err) => {
      startingPromise = null;
      dialog.showErrorBox('QQ邮箱提醒后端启动失败', err && err.stack ? err.stack : String(err));
      throw err;
    });
  return startingPromise;
}

async function stopBackend() {
  if (!backendRuntime) return;
  const runtime = backendRuntime;
  backendRuntime = null;
  try {
    if (runtime.server) runtime.server.close();
    if (runtime.pollerManager) await runtime.pollerManager.stop();
  } catch (err) {
    console.error('[tray] 停止后端失败：', err);
  }
}

async function restartBackend() {
  await stopBackend();
  await startBackend();
}

function openUrl(url) {
  shell.openExternal(url).catch((err) => console.error('[tray] 打开链接失败：', err));
}

function createTray() {
  const iconPath = path.join(__dirname, 'tray-icon.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) image = nativeImage.createEmpty();
  tray = new Tray(image);
  tray.setToolTip('QQ邮箱提醒后端正在运行');

  const menu = Menu.buildFromTemplate([
    { label: '打开后端设置', click: () => openUrl('http://127.0.0.1:8765/admin/') },
    { label: '查看状态接口', click: () => openUrl('http://127.0.0.1:8765/status') },
    { label: '打开 QQ 邮箱', click: () => openUrl('https://mail.qq.com') },
    { type: 'separator' },
    { label: '重启后端', click: () => restartBackend() },
    { type: 'separator' },
    {
      label: '退出',
      click: async () => {
        await stopBackend();
        app.quit();
      }
    }
  ]);
  tray.setContextMenu(menu);
  tray.on('double-click', () => openUrl('http://127.0.0.1:8765/admin/'));
}

app.setName('QQ邮箱提醒后端');
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  await startBackend();
  createTray();
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('before-quit', async () => {
  await stopBackend();
});
