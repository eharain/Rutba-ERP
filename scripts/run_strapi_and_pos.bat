@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

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
cd ..\pos-strapi
start cmd /k "npm run develop"
cd ..\scripts

REM Run pos-desk (Next.js)
echo Starting pos-desk...
cd ..\pos-desk
start cmd /k "npm run dev"
cd ..\scripts

echo Both projects are running. Strapi on port 1337, Next.js on port 3000.
ENDLOCAL
