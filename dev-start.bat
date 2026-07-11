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
echo   Seed Control     : http://localhost:4018


echo.

echo [1/20] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0" && npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo [2/20] Starting Rutba Web...
start "Rutba Web" cmd /k "cd /d "%~dp0" && npm run dev:web"

echo [3/20] Starting Auth Portal...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev:auth"

echo [4/20] Starting Stock Management...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev:stock"

echo [5/20] Starting Point of Sale...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev:sale"

echo [6/20] Starting Web User...
start "Web User" cmd /k "cd /d "%~dp0" && npm run dev:web-user"

echo [7/20] Starting Order Management...
start "Order Management" cmd /k "cd /d "%~dp0" && npm run dev:order-management"

echo [8/20] Starting Rider...
start "Rider" cmd /k "cd /d "%~dp0" && npm run dev:rider"

echo [9/20] Starting CRM...
start "CRM" cmd /k "cd /d "%~dp0" && npm run dev:crm"

echo [10/20] Starting HR...
start "HR" cmd /k "cd /d "%~dp0" && npm run dev:hr"

echo [11/20] Starting Employee Self-Service...
start "Employee Self-Service" cmd /k "cd /d "%~dp0" && npm run dev:ess"

echo [12/20] Starting Accounts...
start "Accounts" cmd /k "cd /d "%~dp0" && npm run dev:accounts"

echo [13/20] Starting Payroll...
start "Payroll" cmd /k "cd /d "%~dp0" && npm run dev:payroll"

echo [14/20] Starting CMS...
start "CMS" cmd /k "cd /d "%~dp0" && npm run dev:cms"

echo [15/20] Starting Social...
start "Social" cmd /k "cd /d "%~dp0" && npm run dev:social"

echo [16/20] Starting Manufacturing...
start "Manufacturing" cmd /k "cd /d "%~dp0" && npm run dev:manufacturing"

echo [17/20] Starting Inventory...
start "Inventory" cmd /k "cd /d "%~dp0" && npm run dev:inventory"

echo [18/20] Starting Seed Control...
start "Seed Control" cmd /k "cd /d "%~dp0" && npm run dev:seed"

echo [19/20] Starting Marketplace...
start "Marketplace" cmd /k "cd /d "%~dp0" && npm run dev:marketplace"

echo [20/20] Starting Marketplace Worker...
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
echo   Seed Control : http://localhost:4018
echo   Marketplace Wkr: background worker (no port)
echo.
echo   Close this window
echo   (The service windows will keep running.)
echo ============================================
pause >nul
