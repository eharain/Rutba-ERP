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
echo   Accounts         : http://localhost:4007
echo   Payroll          : http://localhost:4008
echo   CMS              : http://localhost:4009
echo   Strapi API       : http://localhost:4010
echo   Social           : http://localhost:4011
echo   Rider            : http://localhost:4012
echo   Order Mgmt       : http://localhost:4013
echo   Manufacturing    : http://localhost:4014
echo   Employee Self-Svc: http://localhost:4015
echo   Marketplace      : http://localhost:4016
echo   Inventory        : http://localhost:4017
echo   Seed Control     : http://localhost:4018
echo   Campaigns        : http://localhost:4019
echo   Mail             : http://localhost:4021
echo   User Management  : http://localhost:4022
echo.

echo [1/3] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0" && npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo [2/3] Starting all apps (dev:all - every dev:* workspace script)...
start "Rutba All" cmd /k "cd /d "%~dp0" && npm run dev:all"

REM dev:all only spawns dev:* scripts, so the marketplace sync worker
REM (worker:marketplace) needs its own window.
echo [3/3] Starting Marketplace Worker...
start "Marketplace Worker" cmd /k "cd /d "%~dp0" && npm run worker:marketplace"

echo.
echo ============================================
echo   All services launched!
echo.
echo   Strapi API     : http://localhost:4010
echo   Rutba Web      : http://localhost:4000
echo   Stock Mgmt     : http://localhost:4001
echo   Point of Sale  : http://localhost:4002
echo   Auth Portal    : http://localhost:4003
echo   Web User       : http://localhost:4004
echo   CRM            : http://localhost:4005
echo   HR             : http://localhost:4006
echo   Accounts       : http://localhost:4007
echo   Payroll        : http://localhost:4008
echo   CMS            : http://localhost:4009
echo   Social         : http://localhost:4011
echo   Rider          : http://localhost:4012
echo   Order Mgmt     : http://localhost:4013
echo   Manufacturing  : http://localhost:4014
echo   Employee SS    : http://localhost:4015
echo   Marketplace    : http://localhost:4016
echo   Inventory      : http://localhost:4017
echo   Seed Control   : http://localhost:4018
echo   Campaigns      : http://localhost:4019
echo   Mail           : http://localhost:4021
echo   User Mgmt      : http://localhost:4022
echo   Marketplace Wkr: background worker (no port)
echo.
echo   Seed the database once Strapi is up:
echo     npm run seed              (partial, all entries)
echo     npm run seed:essential    (essential entries only)
echo   Or drive it from the Seed Control app on :4018
echo.
echo   Close this window
echo   (The service windows will keep running.)
echo ============================================
pause >nul
