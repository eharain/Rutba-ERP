@echo off
REM Stops only the processes holding Rutba's own dev ports.
REM
REM This used to be `taskkill /f /im node.exe`, which also killed editor
REM language servers, agents and in-flight npm installs. See scripts/js/dev-stop.js.
REM
REM You rarely need this: `dev` runs in one window and Ctrl-C cleans up.
cd /d "%~dp0"
node scripts/js/dev-stop.js
