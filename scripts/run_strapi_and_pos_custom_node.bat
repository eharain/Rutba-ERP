@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

REM Use local Node and add it to PATH
set "LOCAL_NODE=..\node"
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
