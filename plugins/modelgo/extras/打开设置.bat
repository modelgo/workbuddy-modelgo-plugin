@echo off
rem Double-click to open the ModelGo settings page in your browser: paste your key there and tick the models you want.
chcp 65001 >nul
cd /d "%~dp0.."
set "NODE=node"
where node >nul 2>nul || set "NODE=%USERPROFILE%\.workbuddy\binaries\node\versions\current\node.exe"
"%NODE%" scripts\cli.mjs ui >nul
if errorlevel 1 (
  echo Could not open the settings page. Open WorkBuddy once, or install Node 20 or newer.
  pause
)
