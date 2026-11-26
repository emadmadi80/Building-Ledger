@echo off
setlocal
cd /d "%~dp0"

title Building Ledger
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo Building Ledger needs Node.js 18 or newer.
  echo Download it from: https://nodejs.org/
  echo After installing Node.js, double-click this file again.
  echo.
  pause
  exit /b 1
)

if not exist "server.js" (
  echo The application files are incomplete. Please extract the full ZIP package first.
  pause
  exit /b 1
)

start "Building Ledger Server" cmd /k "cd /d "%~dp0" && node server.js"
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:3000/"

echo Building Ledger is running at http://127.0.0.1:3000/
echo Keep the server window open while using the application.
echo Close that server window to stop the application.
pause
