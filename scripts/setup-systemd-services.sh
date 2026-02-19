#!/bin/bash

set -e

###########################################
# Rutba POS — systemd Service Installer
###########################################
#
# Creates and enables systemd unit files for every Rutba POS service
# (Strapi + 9 Next.js apps + legacy desk).
#
# Usage:
#   sudo bash scripts/setup-systemd-services.sh
#
# After running this script, manage services with:
#   sudo systemctl start|stop|restart|status rutba_pos_strapi
#   sudo journalctl -fu rutba_pos_auth
#
# The deploy script (rutba_deploy_master.sh) references the same
# service names and will work out of the box after this setup.
###########################################

###########################################
# CONFIG — edit these to match your server
###########################################

APP_DIR="/home/rutba-nvr/Rutba-POS-main"
RUN_USER="rutba-nvr"
RUN_GROUP="rutba-nvr"
NODE_BIN=$(which node)

# Resolve npm — may be a shell script wrapper; find the real path
NPM_BIN=$(which npm)

SYSTEMD_DIR="/etc/systemd/system"

###########################################
# HELPERS
###########################################

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S')  $1"
}

# write_service <unit-name> <description> <working-dir> <exec-start> [env-file]
write_service() {
    local UNIT_NAME="$1"
    local DESCRIPTION="$2"
    local WORK_DIR="$3"
    local EXEC_START="$4"
    local ENV_FILE="$5"

    local FILE="${SYSTEMD_DIR}/${UNIT_NAME}.service"

    log "Creating ${FILE} ..."

    local ENV_LINE=""
    if [ -n "$ENV_FILE" ] && [ -f "$ENV_FILE" ]; then
        ENV_LINE="EnvironmentFile=${ENV_FILE}"
    fi

    cat > "$FILE" <<EOF
[Unit]
Description=${DESCRIPTION}
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${WORK_DIR}
ExecStart=${EXEC_START}
${ENV_LINE}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${UNIT_NAME}

# Generous limits for Node.js apps
LimitNOFILE=65536
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
}

###########################################
# PRE-FLIGHT CHECKS
###########################################

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)."
    exit 1
fi

if [ ! -d "$APP_DIR" ]; then
    echo "ERROR: APP_DIR not found: $APP_DIR"
    echo "Clone the repo first or update APP_DIR in this script."
    exit 1
fi

if [ -z "$NODE_BIN" ]; then
    echo "ERROR: node not found in PATH."
    exit 1
fi

log "Node:    ${NODE_BIN}"
log "npm:     ${NPM_BIN}"
log "App dir: ${APP_DIR}"
log "User:    ${RUN_USER}"

###########################################
# CREATE SERVICE FILES
###########################################

# ── Strapi API ───────────────────────────
write_service "rutba_pos_strapi" \
    "Rutba POS — Strapi API" \
    "${APP_DIR}/pos-strapi" \
    "${NPM_BIN} run start" \
    "${APP_DIR}/pos-strapi/.env"

# ── Auth Portal ──────────────────────────
write_service "rutba_pos_auth" \
    "Rutba POS — Auth Portal (pos-auth)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=pos-auth" \
    "${APP_DIR}/pos-auth/.env"

# ── Stock Management ─────────────────────
write_service "rutba_pos_stock" \
    "Rutba POS — Stock Management (pos-stock)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=pos-stock" \
    "${APP_DIR}/pos-stock/.env"

# ── Point of Sale ────────────────────────
write_service "rutba_pos_sale" \
    "Rutba POS — Point of Sale (pos-sale)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=pos-sale" \
    "${APP_DIR}/pos-sale/.env"

# ── Public Website ───────────────────────
write_service "rutba_web" \
    "Rutba POS — Public Website (rutba-web)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=rutba-web" \
    "${APP_DIR}/rutba-web/.env"

# ── My Orders / Web User ────────────────
write_service "rutba_web_user" \
    "Rutba POS — My Orders (rutba-web-user)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=rutba-web-user" \
    "${APP_DIR}/rutba-web-user/.env"

# ── CRM ──────────────────────────────────
write_service "rutba_crm" \
    "Rutba POS — CRM (rutba-crm)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=rutba-crm" \
    "${APP_DIR}/rutba-crm/.env"

# ── HR ───────────────────────────────────
write_service "rutba_hr" \
    "Rutba POS — Human Resources (rutba-hr)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=rutba-hr" \
    "${APP_DIR}/rutba-hr/.env"

# ── Accounting ───────────────────────────
write_service "rutba_accounts" \
    "Rutba POS — Accounting (rutba-accounts)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=rutba-accounts" \
    "${APP_DIR}/rutba-accounts/.env"

# ── Payroll ──────────────────────────────
write_service "rutba_payroll" \
    "Rutba POS — Payroll (rutba-payroll)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=rutba-payroll" \
    "${APP_DIR}/rutba-payroll/.env"

# ── Legacy Desk (optional) ──────────────
write_service "rutba_pos_desk" \
    "Rutba POS — Legacy Desk (pos-desk)" \
    "${APP_DIR}" \
    "${NPM_BIN} run start --workspace=pos-desk" \
    "${APP_DIR}/pos-desk/.env"

###########################################
# RELOAD & ENABLE
###########################################

log "Reloading systemd daemon..."
systemctl daemon-reload

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
    rutba_pos_desk
)

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
echo "  Or use the deploy script:"
echo "    sudo bash scripts/rutba_deploy_master.sh"
echo "============================================"
