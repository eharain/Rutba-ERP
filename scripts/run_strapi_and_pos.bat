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
echo Starting Strapi API (port 1337)...
cd /d "%SCRIPT_DIR%..\pos-strapi"
start "Strapi API" cmd /k "npm run develop"

timeout /t 3 /nobreak >nul

REM Run all Next.js apps via workspace scripts
cd /d "%SCRIPT_DIR%.."

echo Starting Rutba Web (port 3000)...
start "Rutba Web" cmd /k "cd /d "%SCRIPT_DIR%..\rutba-web" && npm run dev"

echo Starting Auth Portal (port 3003)...
start "Auth Portal" cmd /k "npm run dev --workspace=pos-auth"

echo Starting Stock Management (port 3001)...
start "Stock Management" cmd /k "npm run dev --workspace=pos-stock"

echo Starting Point of Sale (port 3002)...
start "Point of Sale" cmd /k "npm run dev --workspace=pos-sale"

echo Starting Web User (port 3004)...
start "Web User" cmd /k "npm run dev --workspace=rutba-web-user"

echo Starting CRM (port 3005)...
start "CRM" cmd /k "npm run dev --workspace=rutba-crm"

echo Starting HR (port 3006)...
start "HR" cmd /k "npm run dev --workspace=rutba-hr"

echo Starting Accounts (port 3007)...
start "Accounts" cmd /k "npm run dev --workspace=rutba-accounts"

echo Starting Payroll (port 3008)...
start "Payroll" cmd /k "npm run dev --workspace=rutba-payroll"

echo.
echo All services started:
echo   Strapi API    : http://localhost:1337
echo   Rutba Web     : http://localhost:3000
echo   Stock Mgmt    : http://localhost:3001
echo   Point of Sale : http://localhost:3002
echo   Auth Portal   : http://localhost:3003
echo   Web User      : http://localhost:3004
echo   CRM           : http://localhost:3005
echo   HR            : http://localhost:3006
echo   Accounts      : http://localhost:3007
echo   Payroll       : http://localhost:3008

ENDLOCAL
