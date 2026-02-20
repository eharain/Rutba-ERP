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
echo   CMS          : http://localhost:4009
echo.

echo [1/11] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0" && npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo [2/11] Starting Rutba Web...
start "Rutba Web" cmd /k "cd /d "%~dp0" && npm run dev:web"

echo [3/11] Starting Auth Portal...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev:auth"

echo [4/11] Starting Stock Management...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev:stock"

echo [5/11] Starting Point of Sale...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev:sale"

echo [6/11] Starting Web User...
start "Web User" cmd /k "cd /d "%~dp0" && npm run dev:web-user"

echo [7/11] Starting CRM...
start "CRM" cmd /k "cd /d "%~dp0" && npm run dev:crm"

echo [8/11] Starting HR...
start "HR" cmd /k "cd /d "%~dp0" && npm run dev:hr"

echo [9/11] Starting Accounts...
start "Accounts" cmd /k "cd /d "%~dp0" && npm run dev:accounts"

echo [10/11] Starting Payroll...
start "Payroll" cmd /k "cd /d "%~dp0" && npm run dev:payroll"

echo [11/11] Starting CMS...
start "CMS" cmd /k "cd /d "%~dp0" && npm run dev:cms"

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
echo   CMS          : http://localhost:4009
echo.
echo   Close this window or press any key to exit.
echo   (The service windows will keep running.)
echo ============================================
pause >nul
