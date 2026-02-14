@echo off
title Rutba POS - Development Environment
color 0A

echo ============================================
echo   Rutba POS - Starting Dev Environment
echo ============================================
echo.
echo   Strapi API   : http://localhost:1337
echo   Rutba Web    : http://localhost:3000
echo   Stock Mgmt   : http://localhost:3001
echo   Point of Sale: http://localhost:3002
echo   Auth Portal  : http://localhost:3003
echo   Web User     : http://localhost:3004
echo   CRM          : http://localhost:3005
echo   HR           : http://localhost:3006
echo   Accounts     : http://localhost:3007
echo   Payroll      : http://localhost:3008
echo.
echo ============================================
echo.

cd /d "%~dp0"

echo [1/10] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0pos-strapi" && npm run develop"

timeout /t 3 /nobreak >nul

echo [2/10] Starting Rutba Web (port 3000)...
start "Rutba Web" cmd /k "cd /d "%~dp0rutba-web" && npm run dev"

echo [3/10] Starting Auth Portal (port 3003)...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-auth"

echo [4/10] Starting Stock Management (port 3001)...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-stock"

echo [5/10] Starting Point of Sale (port 3002)...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-sale"

echo [6/10] Starting Web User (port 3004)...
start "Web User" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-web-user"

echo [7/10] Starting CRM (port 3005)...
start "CRM" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-crm"

echo [8/10] Starting HR (port 3006)...
start "HR" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-hr"

echo [9/10] Starting Accounts (port 3007)...
start "Accounts" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-accounts"

echo [10/10] Starting Payroll (port 3008)...
start "Payroll" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-payroll"

echo.
echo ============================================
echo   All services launched!
echo.
echo   Strapi API   : http://localhost:1337
echo   Rutba Web    : http://localhost:3000
echo   Stock Mgmt   : http://localhost:3001
echo   Point of Sale: http://localhost:3002
echo   Auth Portal  : http://localhost:3003
echo   Web User     : http://localhost:3004
echo   CRM          : http://localhost:3005
echo   HR           : http://localhost:3006
echo   Accounts     : http://localhost:3007
echo   Payroll      : http://localhost:3008
echo.
echo   Close this window or press any key to exit.
echo   (The service windows will keep running.)
echo ============================================
pause >nul
