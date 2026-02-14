@echo off
title Rutba POS - Stop All
echo Stopping all Node.js processes...
taskkill /f /im node.exe >nul 2>&1
echo Done. All dev servers stopped.
timeout /t 2 /nobreak >nul
exit
