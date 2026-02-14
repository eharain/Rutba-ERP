@echo off
SETLOCAL ENABLEDELAYEDEXPANSION

REM Use local Node and add it to PATH
set "LOCAL_NODE=..\node"
set "PATH=%CD%\%LOCAL_NODE%;%PATH%"

REM Check Node.js installation
if not exist "%LOCAL_NODE%\node.exe" (
	echo Local Node.js executable not found in %LOCAL_NODE%.
	echo Please download Node.js ZIP and place it in %LOCAL_NODE%.
	exit /b 1
) ELSE (
	echo Using local Node.js from %LOCAL_NODE%
	"%LOCAL_NODE%\node.exe" -v
)

REM Prompt for pos-strapi .env variables
set "DATABASE_CLIENT_DEFAULT=mysql"
set "DATABASE_HOST_DEFAULT=localhost"
set "DATABASE_PORT_DEFAULT=3306"
set "DATABASE_NAME_DEFAULT=pos_db"
set "DATABASE_USERNAME_DEFAULT=pos_user"
set "DATABASE_PASSWORD_DEFAULT=pos_password"

set /p DATABASE_CLIENT="Enter DATABASE_CLIENT [!DATABASE_CLIENT_DEFAULT!]: "
if "!DATABASE_CLIENT!"=="" set DATABASE_CLIENT=!DATABASE_CLIENT_DEFAULT!
set /p DATABASE_HOST="Enter DATABASE_HOST [!DATABASE_HOST_DEFAULT!]: "
if "!DATABASE_HOST!"=="" set DATABASE_HOST=!DATABASE_HOST_DEFAULT!
set /p DATABASE_PORT="Enter DATABASE_PORT [!DATABASE_PORT_DEFAULT!]: "
if "!DATABASE_PORT!"=="" set DATABASE_PORT=!DATABASE_PORT_DEFAULT!
set /p DATABASE_NAME="Enter DATABASE_NAME [!DATABASE_NAME_DEFAULT!]: "
if "!DATABASE_NAME!"=="" set DATABASE_NAME=!DATABASE_NAME_DEFAULT!
set /p DATABASE_USERNAME="Enter DATABASE_USERNAME [!DATABASE_USERNAME_DEFAULT!]: "
if "!DATABASE_USERNAME!"=="" set DATABASE_USERNAME=!DATABASE_USERNAME_DEFAULT!
set /p DATABASE_PASSWORD="Enter DATABASE_PASSWORD [!DATABASE_PASSWORD_DEFAULT!]: "
if "!DATABASE_PASSWORD!"=="" set DATABASE_PASSWORD=!DATABASE_PASSWORD_DEFAULT!

REM Generate secure keys for pos-strapi using Node.js
set "APP_KEYS="
for /f "delims=" %%A in ('node -e "const crypto=require('crypto'); console.log(crypto.randomBytes(64).toString('hex'));"') do set "APP_KEYS=%%A"

set "JWT_SECRET="
for /f "delims=" %%A in ('node -e "const crypto=require('crypto'); console.log(crypto.randomBytes(32).toString('base64'));"') do set "JWT_SECRET=%%A"

set "API_TOKEN_SALT="
for /f "delims=" %%A in ('node -e "const crypto=require('crypto'); console.log(crypto.randomBytes(32).toString('base64'));"') do set "API_TOKEN_SALT=%%A"

set "ADMIN_JWT_SECRET="
for /f "delims=" %%A in ('node -e "const crypto=require('crypto'); console.log(crypto.randomBytes(32).toString('base64'));"') do set "ADMIN_JWT_SECRET=%%A"

set "TRANSFER_TOKEN_SALT="
for /f "delims=" %%A in ('node -e "const crypto=require('crypto'); console.log(crypto.randomBytes(32).toString('base64'));"') do set "TRANSFER_TOKEN_SALT=%%A"

set "ENCRYPTION_KEY="
for /f "delims=" %%A in ('node -e "const crypto=require('crypto'); console.log(crypto.randomBytes(32).toString('base64'));"') do set "ENCRYPTION_KEY=%%A"

REM Setup .env for pos-strapi
IF NOT EXIST "..\pos-strapi\.env" (
	echo Creating .env for pos-strapi...
	(
		echo DATABASE_CLIENT=!DATABASE_CLIENT!
		echo DATABASE_HOST=!DATABASE_HOST!
		echo DATABASE_PORT=!DATABASE_PORT!
		echo DATABASE_NAME=!DATABASE_NAME!
		echo DATABASE_USERNAME=!DATABASE_USERNAME!
		echo DATABASE_PASSWORD=!DATABASE_PASSWORD!
		echo APP_KEYS=!APP_KEYS!
		echo JWT_SECRET=!JWT_SECRET!
		echo API_TOKEN_SALT=!API_TOKEN_SALT!
		echo ADMIN_JWT_SECRET=!ADMIN_JWT_SECRET!
		echo TRANSFER_TOKEN_SALT=!TRANSFER_TOKEN_SALT!
		echo ENCRYPTION_KEY=!ENCRYPTION_KEY!
	) > "..\pos-strapi\.env"
) ELSE (
	echo .env for pos-strapi already exists.
)

REM Install all workspace dependencies from root
echo Installing monorepo dependencies...
cd /d "%~dp0.."
call npm install

REM Start Strapi
echo Starting Strapi API (port 1337)...
cd /d "%~dp0..\pos-strapi"
call npm run build
start "Strapi API" cmd /k "npm run develop"

timeout /t 3 /nobreak >nul

REM Start all Next.js apps
cd /d "%~dp0.."

echo Starting Rutba Web (port 3000)...
start "Rutba Web" cmd /k "cd /d "%~dp0..\rutba-web" && npm run dev"

echo Starting Auth Portal (port 3003)...
start "Auth Portal" cmd /k "npm run dev --workspace=pos-auth"

echo Starting Stock Management (port 3001)...
start "Stock Management" cmd /k "npm run dev --workspace=pos-stock"

echo Starting Point of Sale (port 3002)...
start "Point of Sale" cmd /k "npm run dev --workspace=pos-sale"

echo Starting Web User (port 3004)...
start "Web User" cmd /k "npm run dev --workspace=rutba-web-user"

echo Starting CRM (port 3005)...
start "CRM" cmd /k "npm run dev --workspace=rutba-crm"

echo Starting HR (port 3006)...
start "HR" cmd /k "npm run dev --workspace=rutba-hr"

echo Starting Accounts (port 3007)...
start "Accounts" cmd /k "npm run dev --workspace=rutba-accounts"

echo Starting Payroll (port 3008)...
start "Payroll" cmd /k "npm run dev --workspace=rutba-payroll"

echo.
echo ============================================
echo   All services started!
echo   Strapi API    : http://localhost:1337
echo   Rutba Web     : http://localhost:3000
echo   Stock Mgmt    : http://localhost:3001
echo   Point of Sale : http://localhost:3002
echo   Auth Portal   : http://localhost:3003
echo   Web User      : http://localhost:3004
echo   CRM           : http://localhost:3005
echo   HR            : http://localhost:3006
echo   Accounts      : http://localhost:3007
echo   Payroll       : http://localhost:3008
echo ============================================

ENDLOCAL
