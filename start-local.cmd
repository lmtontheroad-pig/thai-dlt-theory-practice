@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。请先安装 Node.js 18 或更高版本。
  pause
  exit /b 1
)
echo 正在启动 SafeDrive DLT 本地题库……
node scripts\local-server.mjs
if errorlevel 1 pause

