#!/bin/bash

set -euo pipefail

###########################################
# Rutba ERP — Database Backup
###########################################
#
# Dumps the MySQL/MariaDB database referenced by the active
# environment file into DB_BACKUP_DIR, then prunes old dumps so
# only the most recent MAX_BUILDS remain.
#
# DB credentials are read from the .env.<ENVIRONMENT> (or .env)
# file at the root of BUILDS_DIR, falling back to legacy flat
# DATABASE_* keys.  If credentials cannot be found the backup is
# skipped (never fatal) so it is safe to wire into the deploy flow.
#
# Can be called:
#   • Standalone:  sudo bash scripts/rutba_db_backup.sh
#                  sudo bash scripts/rutba_db_backup.sh --env-file /path/.env.production
#   • From deploy: bash scripts/rutba_db_backup.sh   (env vars inherited)
#   • Sourced:     source scripts/rutba_db_backup.sh
#                  (defines the functions without running a backup)
#
###########################################

###########################################
# CONFIG — source shared environment
###########################################
# Colours, log functions, BUILDS_DIR, DB_BACKUP_DIR, MAX_BUILDS,
# and LOG_FILE all come from rutba_deployed_environment.sh.

RUTBA_ENV_QUIET=1
_RUTBA_DB_BACKUP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_RUTBA_DB_BACKUP_DIR}/rutba_deployed_environment.sh"

###########################################
# DATABASE HELPERS
###########################################

# Read DB connection details out of an env file into DB_* globals.
# Tries POS_STRAPI__DATABASE_* first, then legacy flat DATABASE_*
# keys.  Returns non-zero if name/user could not be determined.
parse_db_creds() {
    local env_file="$1"
    [ ! -f "$env_file" ] && return 1

    DB_HOST=$(grep '^POS_STRAPI__DATABASE_HOST=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_PORT=$(grep '^POS_STRAPI__DATABASE_PORT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_NAME=$(grep '^POS_STRAPI__DATABASE_NAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_USER=$(grep '^POS_STRAPI__DATABASE_USERNAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_PASS=$(grep '^POS_STRAPI__DATABASE_PASSWORD=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')

    # Fallback: legacy flat .env keys
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

get_environment_name() {
    local env_file="${BUILDS_DIR}/.env"
    if [ -f "$env_file" ]; then
        local v
        v=$(grep '^ENVIRONMENT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
        echo "${v:-production}"
    else
        echo "production"
    fi
}

# Locate the correct .env.<ENVIRONMENT> from BUILDS_DIR root
resolve_env_file() {
    [ ! -d "$BUILDS_DIR" ] && { echo ""; return; }

    local env_name
    env_name=$(get_environment_name)
    local env_file="${BUILDS_DIR}/.env.${env_name}"
    [ ! -f "$env_file" ] && env_file="${BUILDS_DIR}/.env"
    [ -f "$env_file" ] && echo "$env_file" || echo ""
}

# Dump the database into DB_BACKUP_DIR and prune old dumps.
# Accepts an optional explicit env-file path; otherwise resolves
# it from BUILDS_DIR.  A missing/unreadable creds file is treated
# as a skip (returns 0) so callers never fail just because there
# is nothing to back up.
backup_database() {
    local env_file="${1:-}"
    [ -z "$env_file" ] && env_file=$(resolve_env_file)

    if [ -z "$env_file" ] || ! parse_db_creds "$env_file"; then
        log_warn "Skipping database backup — could not read DB credentials."
        return 0
    fi

    mkdir -p "$DB_BACKUP_DIR"
    local ts
    ts=$(date '+%Y%m%d_%H%M%S')
    local dump_file="${DB_BACKUP_DIR}/${DB_NAME}_${ts}.sql"

    log "Backing up database '${DB_NAME}' → ${dump_file} ..."

    if mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$dump_file" 2>/dev/null; then
        log_ok "Database backup saved: ${dump_file}"
    elif command -v docker &>/dev/null; then
        log "Trying mysqldump via docker..."
        local cid
        cid=$(docker ps --filter "ancestor=mysql" --format "{{.ID}}" | head -1)
        if [ -n "$cid" ]; then
            docker exec "$cid" mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$dump_file" 2>/dev/null
            log_ok "Database backup saved (via docker): ${dump_file}"
        else
            log_warn "No MySQL container found. Skipping DB backup."
        fi
    else
        log_warn "mysqldump failed and docker not available. Skipping DB backup."
    fi

    # Prune old dumps
    local count
    count=$(ls -1 "${DB_BACKUP_DIR}/${DB_NAME}_"*.sql 2>/dev/null | wc -l)
    if [ "$count" -gt "$MAX_BUILDS" ]; then
        ls -1t "${DB_BACKUP_DIR}/${DB_NAME}_"*.sql | tail -n $((count - MAX_BUILDS)) | xargs rm -f
        log "Pruned old DB backups, keeping last ${MAX_BUILDS}."
    fi
}

###########################################
# STANDALONE ENTRYPOINT
###########################################
# Only runs when executed directly (bash rutba_db_backup.sh),
# not when this file is sourced for its functions.

if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
    ENV_FILE_OVERRIDE=""

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --env-file)
                ENV_FILE_OVERRIDE="$2"
                shift 2
                ;;
            -h|--help)
                echo "Usage: $(basename "$0") [--env-file <path>]"
                echo ""
                echo "Backs up the MySQL database referenced by the active"
                echo "environment file into ${DB_BACKUP_DIR} and prunes old"
                echo "dumps (keeping the last ${MAX_BUILDS})."
                exit 0
                ;;
            *)
                shift
                ;;
        esac
    done

    if [ "$(id -u)" -ne 0 ]; then
        log_err "This script must be run as root (use sudo)."
        exit 1
    fi

    backup_database "$ENV_FILE_OVERRIDE"
fi
