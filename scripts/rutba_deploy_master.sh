#!/bin/bash

set -e

###########################################
# CONFIG
###########################################

APP_DIR="/home/rutba-nvr/Rutba-POS-main"
REPO_URL="https://github.com/eharain/Rutba-POS.git"

DESK_SERVICE="rutba_pos_desk.service"
STRAPI_SERVICE="rutba_pos_strapi.service"
AUTH_SERVICE="rutba_pos_auth.service"
STOCK_SERVICE="rutba_pos_stock.service"
SALE_SERVICE="rutba_pos_sale.service"
WEB_SERVICE="rutba_web.service"
WEB_USER_SERVICE="rutba_web_user.service"
CRM_SERVICE="rutba_crm.service"
HR_SERVICE="rutba_hr.service"
ACCOUNTS_SERVICE="rutba_accounts.service"
PAYROLL_SERVICE="rutba_payroll.service"

BRANCH="master"

LOG_FILE="/var/log/rutba_deploy.log"

###########################################
# LOG FUNCTION
###########################################

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') : $1" | tee -a $LOG_FILE
}

run() {
    log "RUN: $1"
    eval "$1"
}

###########################################
# START
###########################################

log "========== DEPLOY CHECK START =========="

###########################################
# ENSURE REPO EXISTS
###########################################

if [ ! -d "$APP_DIR/.git" ]; then
    log "Repo not found. Cloning fresh repo..."

    sudo rm -rf $APP_DIR
    git clone -b $BRANCH $REPO_URL $APP_DIR
fi

cd $APP_DIR

###########################################
# FETCH LATEST
###########################################

log "Fetching latest code..."
run "git fetch origin"

LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/$BRANCH)

log "Local Commit:  $LOCAL_COMMIT"
log "Remote Commit: $REMOTE_COMMIT"

###########################################
# COMPARE
###########################################

if [ "$LOCAL_COMMIT" = "$REMOTE_COMMIT" ]; then
    log "✅ Already running latest version. No deploy needed."
    exit 0
fi

log "⚠ New version detected. Starting deploy..."

###########################################
# STOP SERVICES
###########################################

log "Stopping services..."
sudo systemctl stop $DESK_SERVICE || true
sudo systemctl stop $STRAPI_SERVICE || true
sudo systemctl stop $AUTH_SERVICE || true
sudo systemctl stop $STOCK_SERVICE || true
sudo systemctl stop $SALE_SERVICE || true
sudo systemctl stop $WEB_SERVICE || true
sudo systemctl stop $WEB_USER_SERVICE || true
sudo systemctl stop $CRM_SERVICE || true
sudo systemctl stop $HR_SERVICE || true
sudo systemctl stop $ACCOUNTS_SERVICE || true
sudo systemctl stop $PAYROLL_SERVICE || true

###########################################
# PULL LATEST
###########################################

log "Pulling latest code..."
run "git reset --hard"
run "git checkout $BRANCH"
run "git pull origin $BRANCH"

###########################################
# INSTALL DEPENDENCIES
###########################################

log "Installing monorepo dependencies..."
cd $APP_DIR
run "npm install"

###########################################
# BUILD STRAPI
###########################################

log "Building Strapi..."
cd $APP_DIR
run "npm run build:strapi"

###########################################
# BUILD ALL NEXT.JS APPS
###########################################

log "Building all Next.js apps..."
cd $APP_DIR
run "npm run build:all"

###########################################
# START SERVICES
###########################################

log "Starting services..."
sudo systemctl daemon-reload
sudo systemctl start $STRAPI_SERVICE
sudo systemctl start $AUTH_SERVICE
sudo systemctl start $STOCK_SERVICE
sudo systemctl start $SALE_SERVICE
sudo systemctl start $WEB_SERVICE
sudo systemctl start $WEB_USER_SERVICE
sudo systemctl start $CRM_SERVICE
sudo systemctl start $HR_SERVICE
sudo systemctl start $ACCOUNTS_SERVICE
sudo systemctl start $PAYROLL_SERVICE
sudo systemctl start $DESK_SERVICE

###########################################
# VERIFY
###########################################

log "Service Status:"
sudo systemctl status $STRAPI_SERVICE --no-pager
sudo systemctl status $AUTH_SERVICE --no-pager
sudo systemctl status $STOCK_SERVICE --no-pager
sudo systemctl status $SALE_SERVICE --no-pager
sudo systemctl status $WEB_SERVICE --no-pager
sudo systemctl status $WEB_USER_SERVICE --no-pager
sudo systemctl status $CRM_SERVICE --no-pager
sudo systemctl status $HR_SERVICE --no-pager
sudo systemctl status $ACCOUNTS_SERVICE --no-pager
sudo systemctl status $PAYROLL_SERVICE --no-pager

log "========== DEPLOY COMPLETE =========="
