@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

REM Check Node.js installation
where node >nul 2>nul
IF ERRORLEVEL 1 (
	echo Node.js is not installed. Please install Node.js and rerun this script.
	exit /b 1
) ELSE (
	echo Node.js is installed.
)

cd /d "%~dp0.."

REM Ensure .env exists
IF NOT EXIST ".env" (
	echo Creating .env from .env.example...
	copy ".env.example" ".env"
)

REM Check for environment config
for /f "tokens=1,* delims==" %%A in ('findstr /R "^ENVIRONMENT=" .env') do set "ENVIRONMENT=%%B"
if "!ENVIRONMENT!"=="" set "ENVIRONMENT=development"
IF NOT EXIST ".env.!ENVIRONMENT!" (
	echo ERROR: .env.!ENVIRONMENT! not found.
	echo Copy .env.development and edit it with your settings.
	exit /b 1
)

echo Using environment: !ENVIRONMENT!

REM Install all workspace dependencies from root
echo Installing monorepo dependencies...
call npm install

REM Start all services via centralized env loader
echo Starting Strapi API...
start "Strapi API" cmd /k "npm run dev:strapi"

timeout /t 3 /nobreak >nul

echo Starting Rutba Web...
start "Rutba Web" cmd /k "npm run dev:web"

echo Starting Auth Portal...
start "Auth Portal" cmd /k "npm run dev:auth"

echo Starting Stock Management...
start "Stock Management" cmd /k "npm run dev:stock"

echo Starting Point of Sale...
start "Point of Sale" cmd /k "npm run dev:sale"

echo Starting Web User...
start "Web User" cmd /k "npm run dev:web-user"

echo Starting CRM...
start "CRM" cmd /k "npm run dev:crm"

echo Starting HR...
start "HR" cmd /k "npm run dev:hr"

echo Starting Accounts...
start "Accounts" cmd /k "npm run dev:accounts"

echo Starting Payroll...
start "Payroll" cmd /k "npm run dev:payroll"

echo Starting CMS...
start "CMS" cmd /k "npm run dev:cms"

echo.
echo ============================================
echo   All services started!
echo   Ports configured via .env.!ENVIRONMENT!
echo ============================================

ENDLOCAL