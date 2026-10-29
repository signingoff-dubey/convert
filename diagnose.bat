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
echo  Node.js:
where node >nul 2>nul && node -v || echo   not found
echo  npm:
where npm >nul 2>nul && call npm -v || echo   not found
echo.
if exist "node_modules\electron\dist\electron.exe" (echo  Packages: installed) else (echo  Packages: NOT installed - run setup.bat)
if exist "out\main\index.js" (echo  Build: present) else (echo  Build: missing - run build.bat)
if exist "node_modules\ffmpeg-static\ffmpeg.exe" (echo  ffmpeg: found) else (echo  ffmpeg: MISSING - run setup.bat)
node -e "require('uiohook-napi');require('koffi');console.log('  Input hook and Windows bridge: OK')" 2>nul || echo   Input hook or Windows bridge: FAILED TO LOAD
echo.
echo  Optional engines:
if exist "%ProgramFiles%\LibreOffice\program\soffice.exe" (echo   LibreOffice: found) else (echo   LibreOffice: not found - PDF export from documents, slides and spreadsheets stays hidden)
echo.
echo  Settings and logs live in: %APPDATA%\Convert
if exist "%APPDATA%\Convert\logs" (
  echo  Opening the log folder...
  start "" explorer "%APPDATA%\Convert\logs"
)
echo.
pause
exit /b 0
