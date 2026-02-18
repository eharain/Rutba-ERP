#!/bin/bash

# Function to prompt user for input with default value
prompt_with_default() {
  local prompt="$1"
  local default="$2"
  local var
  read -p "$prompt [$default]: " var
  echo "${var:-$default}"
}

# Function to check Node.js installation
check_node() {
  if ! command -v node &> /dev/null; then
    echo "Node.js not found. Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
  else
    echo "Node.js is already installed."
  fi
}

# Setup .env for pos-strapi
setup_strapi_env() {
  STRAPI_ENV="../pos-strapi/.env"
  if [ ! -f "$STRAPI_ENV" ]; then
    echo "Creating .env for pos-strapi..."

    DB_CLIENT=$(prompt_with_default "Database client" "mysql")
    DB_HOST=$(prompt_with_default "Database host" "localhost")
    DB_PORT=$(prompt_with_default "Database port" "3306")
    DB_NAME=$(prompt_with_default "Database name" "pos_db")
    DB_USER=$(prompt_with_default "Database username" "pos_user")
    DB_PASS=$(prompt_with_default "Database password" "pos_password")

    APP_KEYS=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    API_TOKEN_SALT=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    ADMIN_JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    TRANSFER_TOKEN_SALT=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
    ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")

    cat <<EOT > $STRAPI_ENV
DATABASE_CLIENT=$DB_CLIENT
DATABASE_HOST=$DB_HOST
DATABASE_PORT=$DB_PORT
DATABASE_NAME=$DB_NAME
DATABASE_USERNAME=$DB_USER
DATABASE_PASSWORD=$DB_PASS
APP_KEYS=$APP_KEYS
JWT_SECRET=$JWT_SECRET
API_TOKEN_SALT=$API_TOKEN_SALT
ADMIN_JWT_SECRET=$ADMIN_JWT_SECRET
TRANSFER_TOKEN_SALT=$TRANSFER_TOKEN_SALT
ENCRYPTION_KEY=$ENCRYPTION_KEY
EOT
  else
    echo ".env for pos-strapi already exists."
  fi
}

# Main script
check_node
setup_strapi_env

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."

# Install all workspace dependencies from root
echo "Installing monorepo dependencies..."
cd "$ROOT_DIR"
npm install

# Start Strapi
echo "Starting Strapi API (port 1337)..."
cd "$ROOT_DIR/pos-strapi"
npm run develop &
sleep 3

# Start all Next.js apps
cd "$ROOT_DIR"

echo "Starting Rutba Web (port 4000)..."
cd "$ROOT_DIR/rutba-web" && npm run dev &

echo "Starting Auth Portal (port 4003)..."
cd "$ROOT_DIR" && npm run dev --workspace=pos-auth &

echo "Starting Stock Management (port 4001)..."
cd "$ROOT_DIR" && npm run dev --workspace=pos-stock &

echo "Starting Point of Sale (port 4002)..."
cd "$ROOT_DIR" && npm run dev --workspace=pos-sale &

echo "Starting Web User (port 4004)..."
cd "$ROOT_DIR" && npm run dev --workspace=rutba-web-user &

echo "Starting CRM (port 4005)..."
cd "$ROOT_DIR" && npm run dev --workspace=rutba-crm &

echo "Starting HR (port 4006)..."
cd "$ROOT_DIR" && npm run dev --workspace=rutba-hr &

echo "Starting Accounts (port 4007)..."
cd "$ROOT_DIR" && npm run dev --workspace=rutba-accounts &

echo "Starting Payroll (port 4008)..."
cd "$ROOT_DIR" && npm run dev --workspace=rutba-payroll &

echo ""
echo "============================================"
echo "  All services started!"
echo "  Strapi API    : http://localhost:1337"
echo "  Rutba Web     : http://localhost:4000"
echo "  Stock Mgmt    : http://localhost:4001"
echo "  Point of Sale : http://localhost:4002"
echo "  Auth Portal   : http://localhost:4003"
echo "  Web User      : http://localhost:4004"
echo "  CRM           : http://localhost:4005"
echo "  HR            : http://localhost:4006"
echo "  Accounts      : http://localhost:4007"
echo "  Payroll       : http://localhost:4008"
echo "============================================"