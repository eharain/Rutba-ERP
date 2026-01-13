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

REM Prompt for pos-strapi .env variables
set "DATABASE_CLIENT_DEFAULT=mysql"
set "DATABASE_HOST_DEFAULT=localhost"
set "DATABASE_PORT_DEFAULT=3306"
set "DATABASE_NAME_DEFAULT=pos_db"
set "DATABASE_USERNAME_DEFAULT=pos_user"
set "DATABASE_PASSWORD_DEFAULT=pos_password"
set "APP_KEYS_DEFAULT=your_app_key"

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

REM Generate secure keys for pos-strapi using Node.js (multiple set lines)
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

REM Prompt for pos-desk .env.local variable
set "NEXT_PUBLIC_API_URL=http://localhost:1337"
set /p NEXT_PUBLIC_API_URL="Enter NEXT_PUBLIC_API_URL [!NEXT_PUBLIC_API_URL!]: "
if "!NEXT_PUBLIC_API_URL!"=="" (
    set "NEXT_PUBLIC_API_URL=!NEXT_PUBLIC_API_URL!"
)

set "NEXT_PUBLIC_API_URL=!NEXT_PUBLIC_API_URL!/api"

REM Setup .env for pos-desk (Next.js)
IF NOT EXIST "..\pos-desk\.env.local" (
    echo Creating .env.local for pos-desk...
    (
        echo NEXT_PUBLIC_API_URL=!NEXT_PUBLIC_API_URL!
    ) > "..\pos-desk\.env.local"
) ELSE (
    echo .env.local for pos-desk already exists.
)

REM Install dependencies and start Strapi
echo Setting up pos-strapi...
cd ..\pos-strapi
call npm install
call forever start -c "npm run start" .
cd ..\scripts

REM Install dependencies and start Next.js
echo Setting up pos-desk...
cd ..\pos-desk
call npm install
start cmd /k "npm run dev"
cd ..\scripts

echo Both projects are running. Strapi on port 1337, Next.js on port 3000.
ENDLOCAL