@echo off
REM This script is kept for backward compatibility.
REM pos-desk is legacy — use dev-start.bat from the repo root instead.
echo.
echo WARNING: pos-desk is no longer actively developed.
echo Use "dev-start.bat" from the repo root to start all services.
echo.
cd "%~dp0..\pos-desk"
npm install
npm run dev