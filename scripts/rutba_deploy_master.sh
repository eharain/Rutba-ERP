#!/bin/bash

set -e

###########################################
# CONFIG
###########################################

APP_DIR="/home/rutba-nvr/Rutba-POS-main"
REPO_URL="https://github.com/eharain/Rutba-POS.git"

DESK_SERVICE="rutba_pos_desk.service"
STRAPI_SERVICE="rutba_pos_strapi.service"

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

###########################################
# PULL LATEST
###########################################

log "Pulling latest code..."
run "git reset --hard"
run "git checkout $BRANCH"
run "git pull origin $BRANCH"

###########################################
# BUILD DESK
###########################################

log "Building POS Desk..."
cd $APP_DIR/pos-desk
run "npm install"
run "npm run build"

###########################################
# BUILD STRAPI
###########################################

log "Building POS Strapi..."
cd $APP_DIR/pos-strapi
run "npm install"
run "npm run build"

###########################################
# START SERVICES
###########################################

log "Starting services..."
sudo systemctl daemon-reload
sudo systemctl start $STRAPI_SERVICE
sudo systemctl start $DESK_SERVICE

###########################################
# VERIFY
###########################################

log "Service Status:"
sudo systemctl status $STRAPI_SERVICE --no-pager
sudo systemctl status $DESK_SERVICE --no-pager

log "========== DEPLOY COMPLETE =========="
