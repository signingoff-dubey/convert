@echo off
setlocal
cd /d "%~dp0"
title Convert - installer
echo.
echo  Building the installer. This takes a few minutes.
echo.
where node >nul 2>nul
if errorlevel 1 goto :nonode
for /f "delims=" %%v in ('node -p "parseInt(process.versions.node)"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 goto :oldnode
where npm >nul 2>nul
if errorlevel 1 goto :nonode
call npm run licenses
if errorlevel 1 goto :fail
call npm run dist
if errorlevel 1 goto :fail
echo.
echo  Done. The installer is in the release folder:
dir /b release\*.exe
echo.
echo  It installs for the current user only and needs no administrator rights.
echo  It is not code-signed, so Windows SmartScreen may ask you to confirm.
start "" explorer "%~dp0release"
pause
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
