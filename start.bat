@echo off
rem One-click launcher for Palette (Windows).
rem Double-click this file to start the local server and open the browser.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Palette needs Node.js 20 or newer, but 'node' was not found on PATH.
  echo Install Node.js from https://nodejs.org/ and run this file again.
  echo.
  pause
  exit /b 1
)

node scripts/serve.mjs --open
if errorlevel 1 (
  echo.
  echo Palette could not start. See the message above.
  pause
)
endlocal
