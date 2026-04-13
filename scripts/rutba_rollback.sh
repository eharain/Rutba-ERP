#!/bin/bash

set -euo pipefail

###########################################
# Rutba ERP — Rollback Script
###########################################
#
# Strategy:
#   Lists all available builds in BUILDS_DIR, lets you pick one,
#   then simply re-writes the systemd unit files to point at the
#   selected build directory and restarts the services.
#   No files are copied or moved — rollback is near-instant.
#
#   Optionally restores a database backup from DB_BACKUP_DIR.
#
# Usage:
#   sudo bash scripts/rutba_rollback.sh
#
###########################################

###########################################
# CONFIG — must match rutba_deploy.sh
###########################################

BUILDS_DIR="/home/rutba-nvr/rutba_builds"
ACTIVE_LINK="/home/rutba-nvr/rutba_active"
DB_BACKUP_DIR="/home/rutba-nvr/db_dumps"
MAX_BUILDS=5
LOG_FILE="/var/log/rutba_deploy.log"

RUN_USER="rutba-nvr"
RUN_GROUP="rutba-nvr"
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
    rutba_social
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
    [rutba_social]="run start --workspace=rutba-social"
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
    [rutba_social]="Rutba ERP — Social Media (rutba-social)"
    [rutba_pos_desk]="Rutba ERP — Legacy Desk (pos-desk)"
)
###########################################
# HELPERS
###########################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()      { local m="$(date '+%Y-%m-%d %H:%M:%S') : $1";      echo -e "${CYAN}${m}${NC}";   echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_ok()   { local m="$(date '+%Y-%m-%d %H:%M:%S') : ✅ $1";   echo -e "${GREEN}${m}${NC}";  echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_warn() { local m="$(date '+%Y-%m-%d %H:%M:%S') : ⚠ $1";    echo -e "${YELLOW}${m}${NC}"; echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_err()  { local m="$(date '+%Y-%m-%d %H:%M:%S') : ❌ $1";    echo -e "${RED}${m}${NC}";    echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
abort()    { log_err "$1"; exit 1; }

# Extract a human-readable date from a build directory name.
# build_20250115_143022_main → "2025-01-15 14:30:22"
format_build_date() {
    local name
    name=$(basename "$1")
    local ts
    ts=$(echo "$name" | sed -n 's/^build_\([0-9]\{8\}_[0-9]\{6\}\)_.*/\1/p')
    if [ -n "$ts" ]; then
        echo "${ts:0:4}-${ts:4:2}-${ts:6:2} ${ts:9:2}:${ts:11:2}:${ts:13:2}"
    else
        stat -c '%y' "$1" 2>/dev/null | cut -d'.' -f1 || echo "unknown"
    fi
}

# Extract a human-readable date from a DB dump filename.
# rutba_erp_20250115_143022.sql → "2025-01-15 14:30:22"
format_dump_date() {
    local name
    name=$(basename "$1" .sql)
    # The timestamp is the last 15 chars: YYYYMMDD_HHMMSS
    local ts="${name: -15}"
    if [[ "$ts" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
        echo "${ts:0:4}-${ts:4:2}-${ts:6:2} ${ts:9:2}:${ts:11:2}:${ts:13:2}"
    else
        stat -c '%y' "$1" 2>/dev/null | cut -d'.' -f1 || echo "unknown"
    fi
}

get_active_build_dir() {
    if [ -L "$ACTIVE_LINK" ]; then
        readlink -f "$ACTIVE_LINK"
    elif [ -d "$ACTIVE_LINK" ]; then
        echo "$ACTIVE_LINK"
    else
        echo ""
    fi
}

###########################################
# SYSTEMD UNIT WRITER
###########################################

write_all_units() {
    local BUILD_DIR="$1"
    local NODE_BIN
    NODE_BIN=$(which node)
    local NPM_BIN
    NPM_BIN=$(which npm)

    for svc in "${SERVICES[@]}"; do
        local FILE="${SYSTEMD_DIR}/${svc}.service"
        local DESC="${SVC_DESC[$svc]}"
        local CMD="${SVC_CMD[$svc]}"

        cat > "$FILE" <<EOF
[Unit]
Description=${DESC}
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${BUILD_DIR}
ExecStart=${NODE_BIN} ${BUILD_DIR}/scripts/load-env.js -- ${NPM_BIN} ${CMD}
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
        systemctl enable "${svc}.service" 2>/dev/null || true
    done

    log_ok "Systemd units re-written → ${BUILD_DIR}"
}

stop_services() {
    log "Stopping all Rutba services..."
    for svc in "${SERVICES[@]}"; do
        systemctl stop "${svc}.service" 2>/dev/null || true
    done
    log_ok "All services stopped."
}

start_services() {
    log "Reloading systemd daemon..."
    systemctl daemon-reload

    log "Starting all Rutba services..."
    systemctl start rutba_pos_strapi.service
    sleep 3

    for svc in "${SERVICES[@]}"; do
        if [ "$svc" != "rutba_pos_strapi" ]; then
            systemctl start "${svc}.service" 2>/dev/null || log_warn "Failed to start ${svc}"
        fi
    done
    log_ok "All services started."
}

show_service_status() {
    echo ""
    echo "============================================"
    echo "  Service Status"
    echo "============================================"
    for svc in "${SERVICES[@]}"; do
        local status
        status=$(systemctl is-active "${svc}.service" 2>/dev/null || echo "inactive")
        if [ "$status" = "active" ]; then
            echo -e "  ${GREEN}● ${svc}: active${NC}"
        else
            echo -e "  ${RED}● ${svc}: ${status}${NC}"
        fi
    done
    echo "============================================"
    echo ""
}

switch_active_link() {
    ln -sfn "$1" "$ACTIVE_LINK"
    log "Active link → $1"
}
###########################################
# DATABASE HELPERS
###########################################

parse_db_creds() {
    local env_file="$1"
    [ ! -f "$env_file" ] && return 1

    DB_HOST=$(grep '^POS_STRAPI__DATABASE_HOST=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_PORT=$(grep '^POS_STRAPI__DATABASE_PORT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_NAME=$(grep '^POS_STRAPI__DATABASE_NAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_USER=$(grep '^POS_STRAPI__DATABASE_USERNAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_PASS=$(grep '^POS_STRAPI__DATABASE_PASSWORD=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')

    [ -z "$DB_HOST" ] && DB_HOST=$(grep '^DATABASE_HOST=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_PORT" ] && DB_PORT=$(grep '^DATABASE_PORT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_NAME" ] && DB_NAME=$(grep '^DATABASE_NAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_USER" ] && DB_USER=$(grep '^DATABASE_USERNAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_PASS" ] && DB_PASS=$(grep '^DATABASE_PASSWORD=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')

    DB_HOST="${DB_HOST:-127.0.0.1}"
    DB_PORT="${DB_PORT:-3306}"

    [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] && return 1
    return 0
}

restore_database() {
    local dump_file="$1"

    local env_name="production"
    if [ -f "${BUILDS_DIR}/.env" ]; then
        env_name=$(grep '^ENVIRONMENT=' "${BUILDS_DIR}/.env" | cut -d'=' -f2 | tr -d '[:space:]')
        env_name="${env_name:-production}"
    fi
    local env_file="${BUILDS_DIR}/.env.${env_name}"
    [ ! -f "$env_file" ] && env_file="${BUILDS_DIR}/.env"

    if ! parse_db_creds "$env_file"; then
        log_err "Cannot read DB credentials from ${BUILDS_DIR}/.env*. Skipping DB restore."
        return 1
    fi

    log "Restoring database '${DB_NAME}' from $(basename "$dump_file") ..."

    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" < "$dump_file" 2>/dev/null; then
        log_ok "Database restored successfully."
    elif command -v docker &>/dev/null; then
        local cid
        cid=$(docker ps --filter "ancestor=mysql" --format "{{.ID}}" | head -1)
        if [ -n "$cid" ]; then
            cat "$dump_file" | docker exec -i "$cid" mysql -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" 2>/dev/null
            log_ok "Database restored (via docker)."
        else
            log_err "No MySQL container found. DB restore failed."
            return 1
        fi
    else
        log_err "mysql client failed and docker not available. DB restore failed."
        return 1
    fi
}
###########################################
# PRE-FLIGHT CHECKS
###########################################

if [ "$(id -u)" -ne 0 ]; then
    abort "This script must be run as root (use sudo)."
fi

if [ ! -d "$BUILDS_DIR" ]; then
    abort "No builds directory found at ${BUILDS_DIR}. Have you deployed at least once?"
fi

###########################################
# IDENTIFY CURRENT ACTIVE BUILD
###########################################

CURRENT_ACTIVE=$(get_active_build_dir)

echo ""
echo "============================================"
echo "  Rutba ERP — Rollback"
echo "============================================"

if [ -n "$CURRENT_ACTIVE" ]; then
    echo ""
    echo -e "  Currently active: ${CYAN}$(basename "$CURRENT_ACTIVE")${NC}"
    echo -e "  Deployed on:      ${CYAN}$(format_build_date "$CURRENT_ACTIVE")${NC}"
fi

###########################################
# LIST AVAILABLE BUILDS
###########################################

mapfile -t AVAILABLE_BUILDS < <(
    find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" | sort -r | head -n "$MAX_BUILDS"
)

if [ ${#AVAILABLE_BUILDS[@]} -eq 0 ]; then
    abort "No cached builds found in ${BUILDS_DIR}."
fi

echo ""
echo "  Available builds:"
echo ""

for i in "${!AVAILABLE_BUILDS[@]}"; do
    build_dir="${AVAILABLE_BUILDS[$i]}"
    build_name=$(basename "$build_dir")
    build_date=$(format_build_date "$build_dir")

    marker=""
    if [ "$build_dir" = "$CURRENT_ACTIVE" ]; then
        marker=" ${GREEN}(active)${NC}"
    fi

    commit_info=""
    if [ -d "${build_dir}/.git" ]; then
        commit_info=$(cd "$build_dir" && git log --oneline -1 2>/dev/null || echo "")
    fi

    dir_size=$(du -sh "$build_dir" 2>/dev/null | cut -f1)

    echo -e "    ${CYAN}$((i + 1)))${NC} ${build_name}  ${CYAN}${build_date}${NC}  [${dir_size}]  ${commit_info}${marker}"
done

echo ""
read -rp "  Select build to rollback to [1-${#AVAILABLE_BUILDS[@]}]: " build_choice

if ! [[ "$build_choice" =~ ^[0-9]+$ ]] || [ "$build_choice" -lt 1 ] || [ "$build_choice" -gt "${#AVAILABLE_BUILDS[@]}" ]; then
    abort "Invalid selection."
fi

SELECTED_BUILD="${AVAILABLE_BUILDS[$((build_choice - 1))]}"

if [ "$SELECTED_BUILD" = "$CURRENT_ACTIVE" ]; then
    log_warn "That build is already active. Nothing to do."
    exit 0
fi

log "Selected rollback target: $(basename "$SELECTED_BUILD")"
###########################################
# ASK ABOUT DATABASE RESTORE
###########################################

RESTORE_DB=false
SELECTED_DUMP=""

mapfile -t AVAILABLE_DUMPS < <(
    find "$DB_BACKUP_DIR" -maxdepth 1 -type f -name "*.sql" 2>/dev/null | sort -r | head -n "$MAX_BUILDS"
)

if [ ${#AVAILABLE_DUMPS[@]} -gt 0 ]; then
    echo ""
    echo "  Database backups available:"
    echo ""

    for i in "${!AVAILABLE_DUMPS[@]}"; do
        dump_name=$(basename "${AVAILABLE_DUMPS[$i]}")
        dump_date=$(format_dump_date "${AVAILABLE_DUMPS[$i]}")
        dump_size=$(du -sh "${AVAILABLE_DUMPS[$i]}" 2>/dev/null | cut -f1)
        echo -e "    ${CYAN}$((i + 1)))${NC} ${dump_name}  ${CYAN}${dump_date}${NC}  [${dump_size}]"
    done

    echo -e "    ${CYAN}0)${NC} Skip database restore"
    echo ""
    read -rp "  Restore a database backup? [0-${#AVAILABLE_DUMPS[@]}] (default: 0): " db_choice
    db_choice="${db_choice:-0}"

    if [[ "$db_choice" =~ ^[0-9]+$ ]] && [ "$db_choice" -ge 1 ] && [ "$db_choice" -le "${#AVAILABLE_DUMPS[@]}" ]; then
        RESTORE_DB=true
        SELECTED_DUMP="${AVAILABLE_DUMPS[$((db_choice - 1))]}"
        log "Will restore DB from: $(basename "$SELECTED_DUMP")"
    fi
else
    log "No database backups found in ${DB_BACKUP_DIR}."
fi

###########################################
# CONFIRM
###########################################

echo ""
echo "============================================"
echo "  Rollback Summary"
echo "============================================"
if [ -n "$CURRENT_ACTIVE" ]; then
    echo "  From:     $(basename "${CURRENT_ACTIVE}")  ($(format_build_date "$CURRENT_ACTIVE"))"
else
    echo "  From:     <none>"
fi
echo "  To:       $(basename "$SELECTED_BUILD")  ($(format_build_date "$SELECTED_BUILD"))"
if [ "$RESTORE_DB" = true ]; then
    echo "  DB Dump:  $(basename "$SELECTED_DUMP")  ($(format_dump_date "$SELECTED_DUMP"))"
else
    echo "  DB Dump:  (skip)"
fi
echo "============================================"
echo ""
read -rp "  Proceed with rollback? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    log "Rollback cancelled by user."
    exit 0
fi

###########################################
# EXECUTE ROLLBACK
###########################################

log "========== ROLLBACK START =========="

# 1. Stop services
stop_services

# 2. Re-write systemd units → selected build
log "Re-pointing systemd services → $(basename "$SELECTED_BUILD") ..."
write_all_units "$SELECTED_BUILD"
switch_active_link "$SELECTED_BUILD"

# 3. Restore database if requested
if [ "$RESTORE_DB" = true ]; then
    restore_database "$SELECTED_DUMP"
fi

# 4. Start services
start_services
show_service_status

###########################################
# DONE
###########################################

echo ""
echo "============================================"
echo -e "  ${GREEN}✅ Rollback Complete!${NC}"
echo "============================================"
echo "  Now running: $(basename "$SELECTED_BUILD")"
echo "  Build date:  $(format_build_date "$SELECTED_BUILD")"
if [ "$RESTORE_DB" = true ]; then
    echo "  DB restored: $(basename "$SELECTED_DUMP")  ($(format_dump_date "$SELECTED_DUMP"))"
fi
echo "============================================"
echo ""
echo "  View logs:"
echo "    sudo journalctl -fu rutba_pos_strapi"
echo "    tail -f ${LOG_FILE}"
echo ""
echo "  To deploy again:"
echo "    sudo bash $(get_active_build_dir)/scripts/rutba_deploy.sh"
echo "============================================"

log "========== ROLLBACK COMPLETE =========="