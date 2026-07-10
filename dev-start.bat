@echo off
title Rutba ERP - Development Environment
color 0A

echo ============================================
echo   Rutba ERP - Starting Dev Environment
echo ============================================
echo.
echo   Rutba Web        : http://localhost:4000
echo   Stock Mgmt       : http://localhost:4001
echo   Point of Sale    : http://localhost:4002
echo   Auth Portal      : http://localhost:4003
echo   Web User         : http://localhost:4004
echo   CRM              : http://localhost:4005
echo   HR               : http://localhost:4006
echo   Employee Self-Svc: http://localhost:4015
echo   Accounts         : http://localhost:4007
echo   Payroll          : http://localhost:4008
echo   CMS              : http://localhost:4009
echo   Strapi API       : http://localhost:4010
echo   Social           : http://localhost:4011
echo   Rider            : http://localhost:4012
echo   Order Mgmt       : http://localhost:4013
echo   Manufacturing    : http://localhost:4014
echo   Marketplace      : http://localhost:4016
echo   Inventory        : http://localhost:4017


echo.

echo [1/19] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0" && npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo [2/19] Starting Rutba Web...
start "Rutba Web" cmd /k "cd /d "%~dp0" && npm run dev:web"

echo [3/19] Starting Auth Portal...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev:auth"

echo [4/19] Starting Stock Management...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev:stock"

echo [5/19] Starting Point of Sale...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev:sale"

echo [6/19] Starting Web User...
start "Web User" cmd /k "cd /d "%~dp0" && npm run dev:web-user"

echo [7/19] Starting Order Management...
start "Order Management" cmd /k "cd /d "%~dp0" && npm run dev:order-management"

echo [8/19] Starting Rider...
start "Rider" cmd /k "cd /d "%~dp0" && npm run dev:rider"

echo [9/19] Starting CRM...
start "CRM" cmd /k "cd /d "%~dp0" && npm run dev:crm"

echo [10/19] Starting HR...
start "HR" cmd /k "cd /d "%~dp0" && npm run dev:hr"

echo [11/19] Starting Employee Self-Service...
start "Employee Self-Service" cmd /k "cd /d "%~dp0" && npm run dev:ess"

echo [12/19] Starting Accounts...
start "Accounts" cmd /k "cd /d "%~dp0" && npm run dev:accounts"

echo [13/19] Starting Payroll...
start "Payroll" cmd /k "cd /d "%~dp0" && npm run dev:payroll"

echo [14/19] Starting CMS...
start "CMS" cmd /k "cd /d "%~dp0" && npm run dev:cms"

echo [15/19] Starting Social...
start "Social" cmd /k "cd /d "%~dp0" && npm run dev:social"

echo [16/19] Starting Manufacturing...
start "Manufacturing" cmd /k "cd /d "%~dp0" && npm run dev:manufacturing"

echo [17/19] Starting Inventory...
start "Inventory" cmd /k "cd /d "%~dp0" && npm run dev:inventory"

echo [18/19] Starting Marketplace...
start "Marketplace" cmd /k "cd /d "%~dp0" && npm run dev:marketplace"

echo [19/19] Starting Marketplace Worker...
start "Marketplace Worker" cmd /k "cd /d "%~dp0" && npm run worker:marketplace"

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
echo   Employee SS  : http://localhost:4015
echo   Accounts     : http://localhost:4007
echo   Payroll      : http://localhost:4008
echo   CMS          : http://localhost:4009
echo   Social       : http://localhost:4011
echo   Manufacturing: http://localhost:4014
echo   Marketplace  : http://localhost:4016
echo   Inventory    : http://localhost:4017
echo   Marketplace Wkr: background worker (no port)
echo.
echo   Close this window
echo   (The service windows will keep running.)
echo ============================================
pause >nul
