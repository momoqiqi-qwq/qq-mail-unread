@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在安装依赖并构建 Windows EXE，请稍等...
echo 首次构建需要联网下载 pkg 和 Node 运行时缓存。
npm install
if errorlevel 1 goto failed
npx pkg . --targets node18-win-x64 --output "dist\QQ邮箱提醒后端.exe"
if errorlevel 1 goto failed
echo.
echo 构建完成：backend\dist\QQ邮箱提醒后端.exe
echo 运行 exe 后，浏览器打开 http://127.0.0.1:8765/admin/ 配置账号。
pause
exit /b 0
:failed
echo.
echo 构建失败。请确认当前电脑已安装 Node.js，且网络可以下载 npm 依赖。
pause
exit /b 1
