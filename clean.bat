@echo off
setlocal
cd /d "%~dp0"
title Convert - clean
echo  Removing build output (out and release folders)...
if exist out rmdir /s /q out
if exist release rmdir /s /q release
if /i "%~1"=="all" (
  echo  Removing node_modules too...
  if exist node_modules rmdir /s /q node_modules
)
echo  Done. Run setup.bat to build again.
pause
exit /b 0
