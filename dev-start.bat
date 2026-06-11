@echo off
title Rutba POS - Development Environment
color 0A

echo ============================================
echo   Rutba POS - Starting Dev Environment
echo ============================================
echo.
echo   Rutba Web        : http://localhost:4000
echo   Stock Mgmt       : http://localhost:4001
echo   Point of Sale    : http://localhost:4002
echo   Auth Portal      : http://localhost:4003
echo   Web User         : http://localhost:4004
echo   CRM              : http://localhost:4005
echo   HR               : http://localhost:4006
echo   Accounts         : http://localhost:4007
echo   Payroll          : http://localhost:4008
echo   CMS              : http://localhost:4009
echo   Strapi API       : http://localhost:4010
echo   Social           : http://localhost:4011
echo   Rider            : http://localhost:4012
echo   Order Mgmt       : http://localhost:4013
echo   Manufacturing    : http://localhost:4014


echo.

echo [1/15] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0" && npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo [2/15] Starting Rutba Web...
start "Rutba Web" cmd /k "cd /d "%~dp0" && npm run dev:web"

echo [3/15] Starting Auth Portal...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev:auth"

echo [4/15] Starting Stock Management...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev:stock"

echo [5/15] Starting Point of Sale...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev:sale"

echo [6/15] Starting Web User...
start "Web User" cmd /k "cd /d "%~dp0" && npm run dev:web-user"

echo [7/15] Starting Order Management...
start "Order Management" cmd /k "cd /d "%~dp0" && npm run dev:order-management"

echo [8/15] Starting Rider...
start "Rider" cmd /k "cd /d "%~dp0" && npm run dev:rider"

echo [9/15] Starting CRM...
start "CRM" cmd /k "cd /d "%~dp0" && npm run dev:crm"

echo [10/15] Starting HR...
start "HR" cmd /k "cd /d "%~dp0" && npm run dev:hr"

echo [11/15] Starting Accounts...
start "Accounts" cmd /k "cd /d "%~dp0" && npm run dev:accounts"

echo [12/15] Starting Payroll...
start "Payroll" cmd /k "cd /d "%~dp0" && npm run dev:payroll"

echo [13/15] Starting CMS...
start "CMS" cmd /k "cd /d "%~dp0" && npm run dev:cms"

echo [14/15] Starting Social...
start "Social" cmd /k "cd /d "%~dp0" && npm run dev:social"

echo [15/15] Starting Manufacturing...
start "Manufacturing" cmd /k "cd /d "%~dp0" && npm run dev:manufacturing"

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
echo   Order Mgmt   : http://localhost:4013
echo   Rider        : http://localhost:4012
echo   CRM          : http://localhost:4005
echo   HR           : http://localhost:4006
echo   Accounts     : http://localhost:4007
echo   Payroll      : http://localhost:4008
echo   CMS          : http://localhost:4009
echo   Social       : http://localhost:4011
echo   Manufacturing: http://localhost:4014
echo.
echo   Close this window
echo   (The service windows will keep running.)
echo ============================================
pause >nul
