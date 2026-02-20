#!/bin/bash

# Check Node.js installation
if ! command -v node &> /dev/null; then
    echo "Node.js not found. Please install Node.js and rerun this script."
    exit 1
fi
echo "Node.js is installed."

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$SCRIPT_DIR/.."
cd "$ROOT_DIR"

# Ensure .env exists
if [ ! -f ".env" ]; then
    echo "Creating .env from .env.example..."
    cp .env.example .env
fi

# Check for environment config
ENVIRONMENT=$(grep '^ENVIRONMENT=' .env | cut -d'=' -f2)
ENVIRONMENT=${ENVIRONMENT:-development}
if [ ! -f ".env.$ENVIRONMENT" ]; then
    echo "ERROR: .env.$ENVIRONMENT not found."
    echo "Copy .env.development and edit it with your settings."
    exit 1
fi

echo "Using environment: $ENVIRONMENT"

# Install all workspace dependencies from root
echo "Installing monorepo dependencies..."
npm install

# Start all services via centralized env loader
echo "Starting Strapi API..."
npm run dev:strapi &
sleep 3

echo "Starting Rutba Web..."
npm run dev:web &

echo "Starting Auth Portal..."
npm run dev:auth &

echo "Starting Stock Management..."
npm run dev:stock &

echo "Starting Point of Sale..."
npm run dev:sale &

echo "Starting Web User..."
npm run dev:web-user &

echo "Starting CRM..."
npm run dev:crm &

echo "Starting HR..."
npm run dev:hr &

echo "Starting Accounts..."
npm run dev:accounts &

echo "Starting Payroll..."
npm run dev:payroll &

echo ""
echo "============================================"
echo "  All services started!"
echo "  Ports configured via .env.$ENVIRONMENT"
echo "============================================"