#!/bin/bash

set -e

###########################################
# Rutba ERP — systemd Service Installer
###########################################
#
# Creates and enables systemd unit files for every Rutba ERP service
# (Strapi + Next.js apps + legacy desk).
#
# This script auto-detects the build directory to point at:
#   1. An explicit path passed as argument
#   2. The active build (~/rutba_active symlink target)
#   3. The most recent build in ~/rutba_builds/
#
# Environment files (.env, .env.<ENVIRONMENT>) must be placed at
# the root of BUILDS_DIR (~/rutba_builds/) before the first deploy.
# The deploy script copies them into each build automatically.
#
# Usage:
#   sudo bash scripts/setup-systemd-services.sh [optional-build-dir]
#
# After running this script, manage services with:
#   sudo systemctl start|stop|restart|status rutba_pos_strapi
#   sudo journalctl -fu rutba_pos_auth
#
# The deploy script (rutba_deploy.sh) and rollback script
# (rutba_rollback.sh) will re-write these unit files to point
# at whichever build directory is active. This setup script is
# only needed for the initial installation or to re-create
# service files after a system migration.
###########################################

###########################################
# CONFIG — edit these to match your server
###########################################

BUILDS_DIR="/home/rutba-nvr/rutba_builds"
ACTIVE_LINK="/home/rutba-nvr/rutba_active"
RUN_USER="rutba-nvr"
RUN_GROUP="rutba-nvr"
NODE_BIN=$(which node)
NPM_BIN=$(which npm)

SYSTEMD_DIR="/etc/systemd/system"

SERVICES=(
    rutba_pos_strapi
    rutba_pos_auth
    rutba_pos_stock
    rutba_pos_sale
    rutba_web
    rutba_web_user
    rutba_crm
    rutba_hr
    rutba_accounts
    rutba_payroll
    rutba_cms
    rutba_pos_desk
)

declare -A SVC_CMD=(
    [rutba_pos_strapi]="--prefix pos-strapi run start"
    [rutba_pos_auth]="run start --workspace=pos-auth"
    [rutba_pos_stock]="run start --workspace=pos-stock"
    [rutba_pos_sale]="run start --workspace=pos-sale"
    [rutba_web]="run start --workspace=rutba-web"
    [rutba_web_user]="run start --workspace=rutba-web-user"
    [rutba_crm]="run start --workspace=rutba-crm"
    [rutba_hr]="run start --workspace=rutba-hr"
    [rutba_accounts]="run start --workspace=rutba-accounts"
    [rutba_payroll]="run start --workspace=rutba-payroll"
    [rutba_cms]="run start --workspace=rutba-cms"
    [rutba_pos_desk]="run start --workspace=pos-desk"
)

declare -A SVC_DESC=(
    [rutba_pos_strapi]="Rutba ERP — Strapi API"
    [rutba_pos_auth]="Rutba ERP — Auth Portal (pos-auth)"
    [rutba_pos_stock]="Rutba ERP — Stock Management (pos-stock)"
    [rutba_pos_sale]="Rutba ERP — Point of Sale (pos-sale)"
    [rutba_web]="Rutba ERP — Public Website (rutba-web)"
    [rutba_web_user]="Rutba ERP — My Orders (rutba-web-user)"
    [rutba_crm]="Rutba ERP — CRM (rutba-crm)"
    [rutba_hr]="Rutba ERP — Human Resources (rutba-hr)"
    [rutba_accounts]="Rutba ERP — Accounting (rutba-accounts)"
    [rutba_payroll]="Rutba ERP — Payroll (rutba-payroll)"
    [rutba_cms]="Rutba ERP — Content Management (rutba-cms)"
    [rutba_pos_desk]="Rutba ERP — Legacy Desk (pos-desk)"
)

###########################################
# HELPERS
###########################################

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S')  $1"
}

###########################################
# PRE-FLIGHT CHECKS
###########################################

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)."
    exit 1
fi

if [ -z "$NODE_BIN" ]; then
    echo "ERROR: node not found in PATH."
    exit 1
fi

if [ -z "$NPM_BIN" ]; then
    echo "ERROR: npm not found in PATH."
    exit 1
fi

###########################################
# RESOLVE BUILD DIRECTORY
###########################################

APP_DIR=""

# Priority 1: Explicit argument
if [ -n "${1:-}" ] && [ -d "$1" ]; then
    APP_DIR="$1"
    log "Using build dir from argument: ${APP_DIR}"

# Priority 2: Active symlink
elif [ -L "$ACTIVE_LINK" ]; then
    APP_DIR=$(readlink -f "$ACTIVE_LINK")
    log "Using active build: ${APP_DIR}"

# Priority 3: Most recent build in BUILDS_DIR
elif [ -d "$BUILDS_DIR" ]; then
    APP_DIR=$(find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" | sort -r | head -1)
    if [ -n "$APP_DIR" ]; then
        log "No active link found. Using most recent build: ${APP_DIR}"
        ln -sfn "$APP_DIR" "$ACTIVE_LINK"
        log "Created active link: ${ACTIVE_LINK} → ${APP_DIR}"
    fi
fi

if [ -z "$APP_DIR" ] || [ ! -d "$APP_DIR" ]; then
    echo ""
    echo "ERROR: No build directory found."
    echo ""
    echo "  Run the deploy script first to create a build:"
    echo "    sudo bash scripts/rutba_deploy.sh"
    echo ""
    echo "  Or pass a build directory explicitly:"
    echo "    sudo bash scripts/setup-systemd-services.sh /path/to/build"
    echo ""
    exit 1
fi

# Verify it looks like a Rutba ERP build
if [ ! -f "$APP_DIR/package.json" ]; then
    echo "ERROR: ${APP_DIR} does not contain a package.json."
    echo "Is this a valid Rutba ERP build directory?"
    exit 1
fi

log "Node:      ${NODE_BIN}"
log "npm:       ${NPM_BIN}"
log "Build dir: ${APP_DIR}"
log "User:      ${RUN_USER}"

###########################################
# CLEAN UP LEGACY WRAPPER SCRIPTS
###########################################
# The old setup used /usr/local/bin/rutba_*.sh shell scripts
# that just cd'd into an app directory and ran npm run start.
# The new approach embeds all paths directly in the .service
# file — no wrapper scripts needed.

LEGACY_CLEANED=0
for f in /usr/local/bin/rutba_*.sh; do
    [ -f "$f" ] || continue
    if [ "$LEGACY_CLEANED" -eq 0 ]; then
        log "Removing legacy wrapper scripts from /usr/local/bin/ ..."
        LEGACY_CLEANED=1
    fi
    rm -f "$f"
    log "  Removed $(basename "$f")"
done

###########################################
# CREATE SERVICE FILES
###########################################

for svc in "${SERVICES[@]}"; do
    local_file="${SYSTEMD_DIR}/${svc}.service"
    local_desc="${SVC_DESC[$svc]}"
    local_cmd="${SVC_CMD[$svc]}"

    log "Creating ${local_file} ..."

    cat > "$local_file" <<EOF
[Unit]
Description=${local_desc}
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/scripts/load-env.js -- ${NPM_BIN} ${local_cmd}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${svc}
LimitNOFILE=65536
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
done

###########################################
# RELOAD & ENABLE
###########################################

log "Reloading systemd daemon..."
systemctl daemon-reload

log "Enabling services to start on boot..."
for svc in "${SERVICES[@]}"; do
    systemctl enable "${svc}.service"
done

###########################################
# SUMMARY
###########################################

echo ""
echo "============================================"
echo "  systemd services created & enabled"
echo "============================================"
echo ""
echo "  Build dir: ${APP_DIR}"
echo ""
echo "  Services:"
for svc in "${SERVICES[@]}"; do
    echo "    • ${svc}.service"
done
echo ""
echo "  Manage with:"
echo "    sudo systemctl start|stop|restart|status <service>"
echo "    sudo journalctl -fu <service>"
echo ""
echo "  Start everything:"
echo "    sudo systemctl start rutba_pos_strapi"
echo "    sudo systemctl start rutba_pos_auth rutba_pos_stock rutba_pos_sale"
echo "    sudo systemctl start rutba_web rutba_web_user"
echo "    sudo systemctl start rutba_crm rutba_hr rutba_accounts rutba_payroll"
echo ""
echo "  Deploy / Rollback:"
echo "    sudo bash scripts/rutba_deploy.sh"
echo "    sudo bash scripts/rutba_rollback.sh"
echo "============================================"
