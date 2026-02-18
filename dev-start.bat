@echo off
title Rutba POS - Development Environment
color 0A

echo ============================================
echo   Rutba POS - Starting Dev Environment
echo ============================================
echo.
echo   Strapi API   : http://localhost:4010
echo   Rutba Web    : http://localhost:4000
echo   Stock Mgmt   : http://localhost:4001
echo   Point of Sale: http://localhost:4002
echo   Auth Portal  : http://localhost:4003
echo   Web User     : http://localhost:4004
echo   CRM          : http://localhost:4005
echo   HR           : http://localhost:4006
echo   Accounts     : http://localhost:4007
echo   Payroll      : http://localhost:4008

echo [1/10] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0pos-strapi" && npm run develop"

timeout /t 3 /nobreak >nul

echo [2/10] Starting Rutba Web (port 4000)...
start "Rutba Web" cmd /k "cd /d "%~dp0rutba-web" && npm run dev"

echo [3/10] Starting Auth Portal (port 4003)...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-auth"

echo [4/10] Starting Stock Management (port 4001)...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-stock"

echo [5/10] Starting Point of Sale (port 4002)...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-sale"

echo [6/10] Starting Web User (port 4004)...
start "Web User" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-web-user"

echo [7/10] Starting CRM (port 4005)...
start "CRM" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-crm"

echo [8/10] Starting HR (port 4006)...
start "HR" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-hr"

echo [9/10] Starting Accounts (port 4007)...
start "Accounts" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-accounts"

echo [10/10] Starting Payroll (port 4008)...
start "Payroll" cmd /k "cd /d "%~dp0" && npm run dev --workspace=rutba-payroll"

echo.
echo ============================================
echo   All services launched!
echo.
echo   Strapi API   : http://localhost:4010
echo   Rutba Web    : http://localhost:4000
echo   Stock Mgmt   : http://localhost:4001
echo   Point of Sale: http://localhost:4002
echo   Auth Portal  : http://localhost:4003
echo   Web User     : http://localhost:4004
echo   CRM          : http://localhost:4005
echo   HR           : http://localhost:4006
echo   Accounts     : http://localhost:4007
echo   Payroll      : http://localhost:4008
echo.
echo   Close this window or press any key to exit.
echo   (The service windows will keep running.)
echo ============================================
pause >nul
