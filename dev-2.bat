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

echo [1/13] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0" && npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo [2/13] Starting Rutba Web...
start "Rutba All" cmd /k "cd /d "%~dp0" && npm run dev:all"



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
