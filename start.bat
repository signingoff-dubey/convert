@echo off
setlocal
cd /d "%~dp0"
title Convert
if not exist "node_modules\electron\dist\electron.exe" goto :needsetup
node scripts\check-env.cjs --quiet
set /a "NEED_PKG=%ERRORLEVEL% & 1"
set /a "NEED_BUILD=%ERRORLEVEL% & 4"
if not "%NEED_PKG%"=="0" goto :needsetup
if not "%NEED_BUILD%"=="0" (
  echo  Building Convert, because the code changed since the last build...
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
