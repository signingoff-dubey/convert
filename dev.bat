@echo off
setlocal
cd /d "%~dp0"
title Convert - development
echo  Starting Convert in development mode. Close this window to stop it.
echo.
where node >nul 2>nul
if errorlevel 1 goto :nonode
for /f "delims=" %%v in ('node -p "parseInt(process.versions.node)"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 goto :oldnode
where npm >nul 2>nul
if errorlevel 1 goto :nonode
call npm run dev
if errorlevel 1 goto :fail
exit /b 0

:nonode
echo.
echo  Node.js was not found.
echo  Install the LTS version from https://nodejs.org and run this file again.
goto :fail

:oldnode
echo.
echo  Node.js %NODE_MAJOR% is too old. Convert needs Node.js 20 or newer.
echo  Install the LTS version from https://nodejs.org and run this file again.
goto :fail

:fail
echo.
pause
exit /b 1
