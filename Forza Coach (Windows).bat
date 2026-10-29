@echo off
rem Double-click to start Forza! Coach on Windows.
cd /d "%~dp0coach"
where node >nul 2>nul
if errorlevel 1 (
  echo Forza! Coach needs Node.js ^(free^). Opening https://nodejs.org ...
  start "" "https://nodejs.org/en/download"
  echo Install the LTS version, then double-click this file again.
  pause
  exit /b 1
)
rem Install the few libraries Coach needs ^(only the first time^).
if not exist node_modules (
  call npm ci --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
node server.mjs
pause
