#!/bin/bash

###########################################
# Rutba ERP — Shared Environment Bootstrap
###########################################
#
# Single source of truth for all directory paths, user/group,
# and shared helper functions used across deploy, services,
# rollback, and prune scripts.
#
# USAGE:
#   Source this file at the top of any Rutba script:
#     SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#     source "${SCRIPT_DIR}/rutba_env.sh"
#
# BEHAVIOUR:
#   • Every variable has a sensible default matching the current
#     production layout.  If the corresponding RUTBA_* environment
#     variable is already set, it takes precedence — the script
#     never overwrites an existing value.
#   • Directories are created automatically when missing.
#   • A warning is emitted for any non-critical variable that
#     falls back to its default.
#   • The script only aborts if something truly unrecoverable is
#     wrong (e.g. no writable log path).
#
###########################################

# ── Guard: only source once ─────────────────────────────────
if [ "${_RUTBA_ENV_LOADED:-0}" = "1" ]; then
    return 0 2>/dev/null || true
fi
_RUTBA_ENV_LOADED=1

###########################################
# DEFAULTS
###########################################
# Each variable:  VAR="${RUTBA_VAR:-default}"
# If the caller (or /etc/environment, systemd, .bashrc, etc.)
# has already exported RUTBA_BUILDS_DIR, that value wins.

BUILDS_DIR="${RUTBA_BUILDS_DIR:-/home/rutba-nvr/rutba_builds}"
ACTIVE_LINK="${RUTBA_ACTIVE_LINK:-/home/rutba-nvr/rutba_active}"
DB_BACKUP_DIR="${RUTBA_DB_BACKUP_DIR:-/home/rutba-nvr/db_dumps}"
REPO_URL="${RUTBA_REPO_URL:-https://github.com/eharain/Rutba-ERP.git}"
MAX_BUILDS="${RUTBA_MAX_BUILDS:-5}"
LOG_FILE="${RUTBA_LOG_FILE:-/var/log/rutba_deploy.log}"

RUN_USER="${RUTBA_RUN_USER:-rutba-nvr}"
RUN_GROUP="${RUTBA_RUN_GROUP:-rutba-nvr}"
SYSTEMD_DIR="${RUTBA_SYSTEMD_DIR:-/etc/systemd/system}"

NPM_CACHE_DIR="${RUTBA_NPM_CACHE_DIR:-${BUILDS_DIR}/.npm_cache}"

# Export so child processes (npm, node, etc.) inherit them.
export BUILDS_DIR ACTIVE_LINK DB_BACKUP_DIR REPO_URL MAX_BUILDS LOG_FILE
export RUN_USER RUN_GROUP SYSTEMD_DIR NPM_CACHE_DIR

###########################################
# COLOURS
###########################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

###########################################
# LOGGING
###########################################

log()      { local m="$(date '+%Y-%m-%d %H:%M:%S') : $1";      echo -e "${CYAN}${m}${NC}";   echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_ok()   { local m="$(date '+%Y-%m-%d %H:%M:%S') : ✅ $1";   echo -e "${GREEN}${m}${NC}";  echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_warn() { local m="$(date '+%Y-%m-%d %H:%M:%S') : ⚠ $1";    echo -e "${YELLOW}${m}${NC}"; echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_err()  { local m="$(date '+%Y-%m-%d %H:%M:%S') : ❌ $1";    echo -e "${RED}${m}${NC}";    echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
abort()    { log_err "$1"; exit 1; }

###########################################
# SHARED HELPERS
###########################################

# Resolve the directory the ACTIVE_LINK symlink currently points to.
# Returns empty string if no active build yet.
get_active_build_dir() {
    if [ -L "$ACTIVE_LINK" ]; then
        readlink -f "$ACTIVE_LINK"
    elif [ -d "$ACTIVE_LINK" ]; then
        echo "$ACTIVE_LINK"
    else
        echo ""
    fi
}

# Switch the ACTIVE_LINK symlink to point at a build directory.
switch_active_link() {
    local target="$1"
    ln -sfn "$target" "$ACTIVE_LINK"
    log "Active link → ${target}"
}

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
    local ts="${name: -15}"
    if [[ "$ts" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
        echo "${ts:0:4}-${ts:4:2}-${ts:6:2} ${ts:9:2}:${ts:11:2}:${ts:13:2}"
    else
        stat -c '%y' "$1" 2>/dev/null | cut -d'.' -f1 || echo "unknown"
    fi
}

###########################################
# DIRECTORY BOOTSTRAP
###########################################
# Create essential directories if they don't exist yet.
# This runs on every source, but mkdir -p is idempotent.

_rutba_ensure_dirs() {
    local dir
    for dir in "$BUILDS_DIR" "$DB_BACKUP_DIR" "$NPM_CACHE_DIR"; do
        if [ ! -d "$dir" ]; then
            mkdir -p "$dir" 2>/dev/null && log "Created directory: ${dir}" || true
        fi
    done

    # Ensure log file is writable
    if [ ! -f "$LOG_FILE" ]; then
        touch "$LOG_FILE" 2>/dev/null || true
    fi
}

# Only bootstrap dirs when running as root (deploy/service context).
# Non-root callers (e.g. status checks) skip to avoid permission errors.
if [ "$(id -u)" -eq 0 ]; then
    _rutba_ensure_dirs
fi

###########################################
# VALIDATION
###########################################
# Warn about variables that fell back to defaults when the env
# variable was not explicitly set.  This helps operators notice
# a missing /etc/environment entry without blocking the script.

_rutba_check_env() {
    local warned=false

    if [ -z "${RUTBA_BUILDS_DIR:-}" ]; then
        log_warn "RUTBA_BUILDS_DIR not set — using default: ${BUILDS_DIR}"
        warned=true
    fi
    if [ -z "${RUTBA_RUN_USER:-}" ]; then
        log_warn "RUTBA_RUN_USER not set — using default: ${RUN_USER}"
        warned=true
    fi

    # Verify the run user exists on this system
    if ! id "$RUN_USER" &>/dev/null; then
        log_warn "System user '${RUN_USER}' does not exist. Services may fail to start."
    fi

    if [ "$warned" = true ] && [ "${RUTBA_ENV_QUIET:-0}" != "1" ]; then
        log "Set RUTBA_* variables in /etc/environment or export them before running."
    fi
}

# Run validation only when NOT being sourced silently
# (e.g. prune script in cron might set RUTBA_ENV_QUIET=1).
if [ "${RUTBA_ENV_QUIET:-0}" != "1" ]; then
    _rutba_check_env
fi
