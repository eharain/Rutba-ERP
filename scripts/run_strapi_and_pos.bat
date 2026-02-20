@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

SET "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."

REM Check Node.js installation
where node >nul 2>nul
IF ERRORLEVEL 1 (
    echo Node.js is not installed. Please install Node.js and rerun this script.
    exit /b 1
) ELSE (
    echo Node.js is installed.
)

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

echo.
echo All services started:
echo   Strapi API    : http://localhost:1337
echo   Rutba Web     : http://localhost:4000
echo   Stock Mgmt    : http://localhost:4001
echo   Point of Sale : http://localhost:4002
echo   Auth Portal   : http://localhost:4003
echo   Web User      : http://localhost:4004
echo   CRM           : http://localhost:4005
echo   HR            : http://localhost:4006
echo   Accounts      : http://localhost:4007
echo   Payroll       : http://localhost:4008

ENDLOCAL
