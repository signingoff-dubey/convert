@echo off
setlocal
cd /d "%~dp0"
title Convert - diagnose
echo.
echo  Convert diagnostics
echo  -------------------
echo  Windows:
ver
echo.
echo  What is installed:
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo   Node.js not found - install the LTS version from https://nodejs.org
) else (
  node scripts\check-env.cjs
)
echo.
echo  Settings and logs live in: %APPDATA%\Convert
if exist "%APPDATA%\Convert\logs" (
  echo  Opening the log folder...
  start "" explorer "%APPDATA%\Convert\logs"
)
echo.
pause
exit /b 0
