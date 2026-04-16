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
# CONFIG — source shared environment & services
###########################################

_RUTBA_RB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_RUTBA_RB_DIR}/rutba_deployed_environment.sh"
RUTBA_SERVICES_SOURCED=1
source "${_RUTBA_RB_DIR}/rutba_services.sh"
###########################################
# HELPERS
###########################################
# Colours, log functions, format_build_date, get_active_build_dir,
# switch_active_link are provided by rutba_env.sh.
# Service functions (write_all_units, stop/start/status) are
# provided by rutba_services.sh.

# Extract a human-readable date from a DB dump filename.
# rutba_erp_20250115_143022.sql -> "2025-01-15 14:30:22"
format_dump_date() {
    local name
    name=$(basename "$1" .sql)
    local ts="${name: -15}"
    if [[ "$ts" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
        echo "${ts:0:4}-${ts:4:2}-${ts:6:2} ${ts:9:2}:${ts:11:2}:${ts:13:2}"
    else
        stat -c '%y' "$1" 2>/dev/null | cut -d'.' -f1 || echo "unknown"
    fi
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