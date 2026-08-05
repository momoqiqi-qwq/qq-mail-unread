'use strict';

const fs = require('fs');
const path = require('path');

function readJsonFile(filePath, fallbackValue) {
  try {
    if (!fs.existsSync(filePath)) return fallbackValue;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] 读取 JSON 文件失败：${filePath}`);
    console.error(err);
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureFileFromExample(targetFile, exampleFile) {
  if (fs.existsSync(targetFile)) return false;
  if (!fs.existsSync(exampleFile)) return false;
  fs.copyFileSync(exampleFile, targetFile);
  return true;
}

module.exports = {
  readJsonFile,
  writeJsonFile,
  ensureFileFromExample
};
