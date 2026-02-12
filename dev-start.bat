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
echo.
echo ============================================
echo.

cd /d "%~dp0"

echo [1/5] Starting Strapi API...
start "Strapi API" cmd /k "cd /d "%~dp0pos-strapi" && npm run develop"

timeout /t 3 /nobreak >nul

echo [2/5] Starting Rutba Web (port 3000)...
start "Rutba Web" cmd /k "cd /d "%~dp0rutba-web" && npm run dev"

echo [3/5] Starting Auth Portal (port 3003)...
start "Auth Portal" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-auth"

echo [4/5] Starting Stock Management (port 3001)...
start "Stock Management" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-stock"

echo [5/5] Starting Point of Sale (port 3002)...
start "Point of Sale" cmd /k "cd /d "%~dp0" && npm run dev --workspace=pos-sale"

echo.
echo ============================================
echo   All services launched!
echo.
echo   Strapi API   : http://localhost:1337
echo   Rutba Web    : http://localhost:3000
echo   Stock Mgmt   : http://localhost:3001
echo   Point of Sale: http://localhost:3002
echo   Auth Portal  : http://localhost:3003
echo.
echo   Close this window or press any key to exit.
echo   (The service windows will keep running.)
echo ============================================
pause >nul
