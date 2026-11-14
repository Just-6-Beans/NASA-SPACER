@echo off
rem SPACER launcher: installs dependencies once, starts the co-op service and the game, opens the browser.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20.19+ or 22.12+ is required: https://nodejs.org/ & pause & exit /b 1)
if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd ci || (pause & exit /b 1)
)
start "SPACER co-op service (keep open)" cmd /k npm.cmd run server
start "SPACER game server (keep open)" cmd /k npm.cmd run dev
timeout /t 4 /nobreak >nul
start "" http://127.0.0.1:5173/
echo SPACER is running at http://127.0.0.1:5173/ - keep the two server windows open while you play.
