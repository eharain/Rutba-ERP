@echo off
title Rutba ERP - Development Environment
color 0A

REM ── Which backend serves the API ──────────────────────────────────────────
REM   dev-start.bat          services/strapi on 4010  (default)
REM   dev-start.bat core     services/core on 4020, no Strapi
REM
REM Both serve the same wire contract against the same database, so the apps
REM do not care which is up. They DO need NEXT_PUBLIC_API_URL in
REM .env.development to point at the matching port — file values beat process
REM env in load-env.js, so it cannot be switched from here.
set "API_SCRIPT=dev:strapi"
set "API_TITLE=Strapi API"
set "API_PORT=4010"
if /i "%~1"=="core" set "API_SCRIPT=dev:core" & set "API_TITLE=Core API" & set "API_PORT=4020"

echo ============================================
echo   Rutba ERP - Starting Dev Environment
echo   Backend: %API_TITLE% on port %API_PORT%
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
echo   API backend      : http://localhost:%API_PORT%  (%API_TITLE%)
echo   Social           : http://localhost:4011
echo   Rider            : http://localhost:4012
echo   Order Mgmt       : http://localhost:4013
echo   Manufacturing    : http://localhost:4014
echo   Marketplace      : http://localhost:4016
echo   Inventory        : http://localhost:4017
echo   Seed Control     : http://localhost:4018
echo   Campaigns        : http://localhost:4019
echo   Mail             : http://localhost:4021
echo   Rutba Admin      : http://localhost:4022


echo.

echo [1/24] Starting %API_TITLE%...
start "%API_TITLE%" cmd /k "cd /d "%~dp0" && npm run %API_SCRIPT%"

timeout /t 3 /nobreak >nul

echo [2/24] Starting Rutba Web...
start "Rutba Web" cmd /k "cd /d "%~dp0" && npm run dev:storefront"

echo [3/24] Starting Auth Portal...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev:auth"

echo [4/24] Starting Stock Management...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev:stock"

echo [5/24] Starting Point of Sale...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev:pos"

echo [6/24] Starting Web User...
start "Web User" cmd /k "cd /d "%~dp0" && npm run dev:portal"

echo [7/24] Starting Order Management...
start "Order Management" cmd /k "cd /d "%~dp0" && npm run dev:orders"

echo [8/24] Starting Rider...
start "Rider" cmd /k "cd /d "%~dp0" && npm run dev:rider"

echo [9/24] Starting CRM...
start "CRM" cmd /k "cd /d "%~dp0" && npm run dev:crm"

echo [10/24] Starting HR...
start "HR" cmd /k "cd /d "%~dp0" && npm run dev:hr"

echo [11/24] Starting Employee Self-Service...
start "Employee Self-Service" cmd /k "cd /d "%~dp0" && npm run dev:ess"

echo [12/24] Starting Accounts...
start "Accounts" cmd /k "cd /d "%~dp0" && npm run dev:accounts"

echo [13/24] Starting Payroll...
start "Payroll" cmd /k "cd /d "%~dp0" && npm run dev:payroll"

echo [14/24] Starting CMS...
start "CMS" cmd /k "cd /d "%~dp0" && npm run dev:cms"

echo [15/24] Starting Social...
start "Social" cmd /k "cd /d "%~dp0" && npm run dev:social"

echo [16/24] Starting Manufacturing...
start "Manufacturing" cmd /k "cd /d "%~dp0" && npm run dev:manufacturing"

echo [17/24] Starting Inventory...
start "Inventory" cmd /k "cd /d "%~dp0" && npm run dev:control"

echo [18/24] Starting Seed Control...
start "Seed Control" cmd /k "cd /d "%~dp0" && npm run dev:seed"

echo [19/24] Starting Campaigns...
start "Campaigns" cmd /k "cd /d "%~dp0" && npm run dev:campaigns"

echo [20/24] Starting Mail...
start "Mail" cmd /k "cd /d "%~dp0" && npm run dev:mail"

echo [21/24] Starting Rutba Admin...
start "Rutba Admin" cmd /k "cd /d "%~dp0" && npm run dev:console"

echo [22/24] Starting Helpdesk...
start "Helpdesk" cmd /k "cd /d "%~dp0" && npm run dev:helpdesk"

echo [23/24] Starting Marketplace...
start "Marketplace" cmd /k "cd /d "%~dp0" && npm run dev:marketplace"

echo [24/24] Starting Marketplace Worker...
start "Marketplace Worker" cmd /k "cd /d "%~dp0" && npm run worker:marketplace"

echo.
echo ============================================
echo   All services launched!
echo.
echo   Backend      : http://localhost:%API_PORT% (%API_TITLE%)
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
echo   Campaigns    : http://localhost:4019
echo   Mail         : http://localhost:4021
echo   Rutba Admin  : http://localhost:4022
echo   Helpdesk     : http://localhost:4023
echo   Marketplace Wkr: background worker (no port)
echo.
echo   Seed the database once the backend is up (needs Strapi - the seed
echo   engine runs inside it, so start the default backend for this):
echo     npm run seed              (partial, all entries)
echo     npm run seed:essential    (essential entries only)
echo   Or drive it from the Seed Control app on :4018
echo.
echo   Close this window
echo   (The service windows will keep running.)
echo ============================================
pause >nul
