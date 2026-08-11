@echo off
setlocal
cd /d "%~dp0"
where.exe node.exe >nul 2>nul
if errorlevel 1 goto missing_node

echo Starting SafeDrive DLT local practice...
node.exe scripts\local-server.mjs %*
set "sdlt_exit_code=%errorlevel%"
if not "%sdlt_exit_code%"=="0" pause
exit /b %sdlt_exit_code%

:missing_node
echo Node.js 18 or newer is required.
echo Download it from https://nodejs.org/ and run this file again.
pause
exit /b 1
