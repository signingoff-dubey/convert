@echo off
setlocal
cd /d "%~dp0"
title Convert - setup
echo.
echo  Convert setup
echo  -------------
echo  This installs everything Convert needs, once. It downloads a few hundred
echo  megabytes (the app shell and the bundled converters), so it needs internet
echo  now. Convert itself never uses the network.
echo.
where node >nul 2>nul
if errorlevel 1 goto :nonode
for /f "delims=" %%v in ('node -p "parseInt(process.versions.node)"') do set NODE_MAJOR=%%v
if %NODE_MAJOR% LSS 20 goto :oldnode
where npm >nul 2>nul
if errorlevel 1 goto :nonode

echo  [1/4] Installing packages...
if exist package-lock.json (
  call npm ci
) else (
  call npm install
)
if errorlevel 1 goto :npmfail

echo.
echo  [2/4] Checking the bundled converters...
rem Newer npm versions may skip install scripts, so fetch the two downloads by hand if they are missing.
if not exist "node_modules\ffmpeg-static\ffmpeg.exe" (
  echo  Downloading ffmpeg...
  node node_modules\ffmpeg-static\install.js
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo  Downloading Electron...
  node node_modules\electron\install.js
)
if not exist "node_modules\ffmpeg-static\ffmpeg.exe" goto :ffmpegfail
if not exist "node_modules\electron\dist\electron.exe" goto :electronfail
node -e "require('uiohook-napi');require('koffi');console.log('  Input hook and Windows bridge: OK')"
if errorlevel 1 goto :nativefail

echo.
echo  [3/4] Building the app...
call npm run build
if errorlevel 1 goto :buildfail

echo.
echo  [4/4] Done.
echo.
echo  Start Convert with start.bat
echo  Build an installer with package.bat
echo.
pause
exit /b 0

:npmfail
echo.
echo  Installing packages failed. Check your internet connection, then run setup.bat again.
goto :fail

:ffmpegfail
echo.
echo  ffmpeg.exe could not be downloaded. Audio and video conversion needs it.
echo  Check your internet connection or firewall, then run setup.bat again.
goto :fail

:electronfail
echo.
echo  Electron could not be downloaded. Check your internet connection, then run setup.bat again.
goto :fail

:nativefail
echo.
echo  The global input hook or the Windows bridge could not load. Convert cannot open its wheel without them.
echo  Run diagnose.bat and send me the output.
goto :fail

:buildfail
echo.
echo  The build failed. The messages above say why.
goto :fail

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
