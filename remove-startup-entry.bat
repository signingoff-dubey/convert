@echo off
setlocal
cd /d "%~dp0"
title Convert - remove start-with-Windows entry
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" /v Convert /f
reg delete "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" /v Convert /f
echo.
echo  If an entry existed it has been removed. Your files and settings are untouched.
pause
exit /b 0
