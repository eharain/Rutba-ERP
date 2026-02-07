@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

SET "SCRIPT_DIR=%~dp0"

REM Check Node.js installation
where node >nul 2>nul
IF ERRORLEVEL 1 (
    echo Node.js is not installed. Please install Node.js and rerun this script.
    exit /b 1
) ELSE (
    echo Node.js is installed.
)

REM Run pos-strapi
echo Starting pos-strapi...
cd /d "%SCRIPT_DIR%..\pos-strapi"
start cmd /k "npm run develop"

REM Run pos-desk (Next.js)
echo Starting pos-desk...
cd /d "%SCRIPT_DIR%..\pos-desk"
start cmd /k "npm run dev"

echo Both projects are running. Strapi on port 1337, Next.js on port 3000.
ENDLOCAL
