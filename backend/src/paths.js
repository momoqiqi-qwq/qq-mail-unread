'use strict';

const path = require('path');

// RESOURCE_DIR：代码和静态资源目录；pkg 打包时位于 snapshot 内；Electron 开发模式下位于 backend 目录。
const RESOURCE_DIR = path.resolve(__dirname, '..');

const isPkg = Boolean(process.pkg);
const isElectron = Boolean(process.versions && process.versions.electron);
const isPackagedElectron = isElectron && !process.defaultApp;

// DATA_DIR：可写配置目录。
// - 普通 node 运行：backend 目录。
// - pkg exe：exe 所在目录。
// - Electron 打包后：托盘程序 exe 所在目录，方便和 accounts.json/config.json 放在一起。
const DATA_DIR = isPkg || isPackagedElectron ? path.dirname(process.execPath) : RESOURCE_DIR;

module.exports = {
  BACKEND_DIR: DATA_DIR,
  RESOURCE_DIR,
  DATA_DIR,
  CONFIG_FILE: path.join(DATA_DIR, 'config.json'),
  ACCOUNTS_FILE: path.join(DATA_DIR, 'accounts.json'),
  ACCOUNTS_EXAMPLE_FILE: path.join(RESOURCE_DIR, 'accounts.example.json'),
  IGNORED_MAILS_FILE: path.join(DATA_DIR, 'ignored-mails.json'),
  ADMIN_DIR: path.join(RESOURCE_DIR, 'admin')
};
