@echo off
chcp 65001 >nul
cd /d %~dp0
echo 正在安装依赖...
npm install
echo 正在构建 Windows 托盘版 EXE...
npm run build:tray
pause
