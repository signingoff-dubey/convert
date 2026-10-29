@echo off
setlocal
cd /d "%~dp0"
title Convert
if not exist "node_modules\electron\dist\electron.exe" goto :needsetup
if not exist "out\main\index.js" (
  echo  Building Convert for the first run...
  call npm run build
  if errorlevel 1 goto :fail
)
start "" "node_modules\electron\dist\electron.exe" "%~dp0."
exit /b 0

:needsetup
echo.
echo  Convert is not set up yet. Run setup.bat first.

:fail
echo.
pause
exit /b 1
