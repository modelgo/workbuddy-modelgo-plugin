@echo off
rem Double-click to save your ModelGo key. The key is typed in this window and is never shown.
chcp 65001 >nul
cd /d "%~dp0.."
set "NODE=node"
where node >nul 2>nul || set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\current\node.exe"
"%NODE%" scripts\cli.mjs set-key
echo.
pause
