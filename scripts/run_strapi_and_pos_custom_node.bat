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
echo Starting Strapi API (port 1337)...
cd /d "%SCRIPT_DIR%..\pos-strapi"
start "Strapi API" cmd /k "npm run develop"

timeout /t 3 /nobreak >nul

REM Run all Next.js apps via workspace scripts
cd /d "%SCRIPT_DIR%.."

echo Starting Rutba Web (port 4000)...
start "Rutba Web" cmd /k "cd /d "%SCRIPT_DIR%..\rutba-web" && npm run dev"

echo Starting Auth Portal (port 4003)...
start "Auth Portal" cmd /k "npm run dev --workspace=pos-auth"

echo Starting Stock Management (port 4001)...
start "Stock Management" cmd /k "npm run dev --workspace=pos-stock"

echo Starting Point of Sale (port 4002)...
start "Point of Sale" cmd /k "npm run dev --workspace=pos-sale"

echo Starting Web User (port 4004)...
start "Web User" cmd /k "npm run dev --workspace=rutba-web-user"

echo Starting CRM (port 4005)...
start "CRM" cmd /k "npm run dev --workspace=rutba-crm"

echo Starting HR (port 4006)...
start "HR" cmd /k "npm run dev --workspace=rutba-hr"

echo Starting Accounts (port 4007)...
start "Accounts" cmd /k "npm run dev --workspace=rutba-accounts"

echo Starting Payroll (port 4008)...
start "Payroll" cmd /k "npm run dev --workspace=rutba-payroll"

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
