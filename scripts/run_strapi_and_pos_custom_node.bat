@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

SET "SCRIPT_DIR=%~dp0"

REM Use local Node and add it to PATH
set "LOCAL_NODE=%SCRIPT_DIR%..\node"
set "PATH=%CD%\%LOCAL_NODE%;%PATH%"

REM Check Node.js installation
if not exist "%LOCAL_NODE%\node.exe" (
    echo Local Node.js executable not found in %LOCAL_NODE%.
    echo Please download Node.js ZIP and place it in %LOCAL_NODE%.
    exit /b 1
) ELSE (
    echo Using local Node.js from %LOCAL_NODE%
    "%LOCAL_NODE%\node.exe" -v
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
