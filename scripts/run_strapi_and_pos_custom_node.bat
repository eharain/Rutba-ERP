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

cd /d "%SCRIPT_DIR%.."

echo Starting Strapi API...
start "Strapi API" cmd /k "npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo Starting Rutba Web...
start "Rutba Web" cmd /k "npm run dev:web"

echo Starting Auth Portal...
start "Auth Portal" cmd /k "npm run dev:auth"

echo Starting Stock Management...
start "Stock Management" cmd /k "npm run dev:stock"

echo Starting Point of Sale...
start "Point of Sale" cmd /k "npm run dev:sale"

echo Starting Web User...
start "Web User" cmd /k "npm run dev:web-user"

echo Starting CRM...
start "CRM" cmd /k "npm run dev:crm"

echo Starting HR...
start "HR" cmd /k "npm run dev:hr"

echo Starting Accounts...
start "Accounts" cmd /k "npm run dev:accounts"

echo Starting Payroll...
start "Payroll" cmd /k "npm run dev:payroll"

echo Starting CMS...
start "CMS" cmd /k "npm run dev:cms"

echo.
echo All services started. Ports configured via .env.development.

ENDLOCAL
