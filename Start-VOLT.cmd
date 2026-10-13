@echo off
cd /d "%~dp0"
title VOLT Store
if not defined PORT set PORT=3001
echo.
echo   VOLT - Everyday, upgraded.
echo   Open http://localhost:%PORT% in your browser.
echo   Keep this window open while using the store.
echo   Press Ctrl+C to stop.
echo.
node server.js
pause
