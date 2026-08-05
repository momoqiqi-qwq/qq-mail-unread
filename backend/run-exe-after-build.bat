@echo off
chcp 65001 >nul
cd /d "%~dp0"
if exist "dist\QQ邮箱提醒后端.exe" (
  start "QQ邮箱提醒后端" "dist\QQ邮箱提醒后端.exe"
  timeout /t 2 >nul
  start "" "http://127.0.0.1:8765/admin/"
) else (
  echo 未找到 dist\QQ邮箱提醒后端.exe，请先运行 build-windows-exe.bat 构建。
  pause
)
