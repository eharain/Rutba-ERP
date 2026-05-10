#!/bin/bash

set -euo pipefail

###########################################
# Rutba ERP -- Log Rotation & Trimming
###########################################
#
# Runs nightly via cron (see rutba_setup_log_cron.sh).
#
# What it does:
#   1. Rotate the systemd journal then vacuum globally, keeping
#      only the last JOURNAL_RETAIN_DAYS days and capping total
#      size at JOURNAL_MAX_SIZE.  (journalctl vacuum and
#      disk-usage are global -- per-unit filtering is not
#      supported by these operations.)
#   2. Clean up Strapi file-based logs (pos-strapi/logs/) in the
#      active build directory.
#   3. Remove stale npm-debug.log* files from the active build.
#   4. Rotate and trim the deploy log file. The current log is
#      moved to a dated archive and a fresh file is started.
#      Archives older than LOG_RETAIN_DAYS days are deleted.
#
# Usage:
#   sudo bash scripts/rutba_log_rotate.sh          # manual run
#   (normally invoked by the cron job)
#
###########################################

###########################################
# CONFIG
###########################################

JOURNAL_RETAIN_DAYS=7           # keep 7 days of journal entries
JOURNAL_MAX_SIZE="500M"         # global journal disk cap

ACTIVE_LINK="/home/rutba-nvr/rutba_active"
STRAPI_LOG_RETAIN_DAYS=7        # keep 7 days of Strapi file logs

LOG_FILE="/var/log/rutba_deploy.log"
LOG_ARCHIVE_DIR="/var/log/rutba_archive"
LOG_RETAIN_DAYS=30              # keep archived deploy logs for 30 days
LOG_MAX_BYTES=$((10 * 1024 * 1024))  # rotate deploy log when > 10 MB

ROTATION_LOG="/var/log/rutba_log_rotate.log"

# All Rutba systemd services (must match rutba_deploy.sh)
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

###########################################
# HELPERS
###########################################

ts() { date '+%Y-%m-%d %H:%M:%S'; }

log() {
    local msg="$(ts) : $1"
    echo "$msg"
    echo "$msg" >> "$ROTATION_LOG" 2>/dev/null || true
}

log_ok() {
    local msg="$(ts) : [OK] $1"
    echo "$msg"
    echo "$msg" >> "$ROTATION_LOG" 2>/dev/null || true
}

log_warn() {
    local msg="$(ts) : [WARN] $1"
    echo "$msg"
    echo "$msg" >> "$ROTATION_LOG" 2>/dev/null || true
}

###########################################
# PRE-FLIGHT
###########################################

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: This script must be run as root (use sudo)." >&2
    exit 1
fi

log "=== Rutba log rotation started ==="

###########################################
# 1. VACUUM SYSTEMD JOURNAL (GLOBAL)
###########################################
# journalctl --vacuum-time and --vacuum-size are global
# operations -- the -u (unit) filter is silently ignored.
# We rotate first so the current active journal file is
# archived and eligible for vacuuming.

log "Rotating active journal files..."
journalctl --rotate --quiet 2>/dev/null || true

before=$(journalctl --disk-usage 2>/dev/null || echo "unknown")
log "Journal disk usage before vacuum: ${before}"

log "Vacuuming journal entries older than ${JOURNAL_RETAIN_DAYS} days (cap: ${JOURNAL_MAX_SIZE})..."
journalctl --vacuum-time="${JOURNAL_RETAIN_DAYS}d" --vacuum-size="${JOURNAL_MAX_SIZE}" --quiet 2>/dev/null || true

after=$(journalctl --disk-usage 2>/dev/null || echo "unknown")
log "Journal disk usage after vacuum:  ${after}"

# Log per-service sizes for visibility (informational only).
log "Per-service journal sizes (approximate):"
for svc in "${SERVICES[@]}"; do
    unit="${svc}.service"
    if systemctl cat "$unit" &>/dev/null; then
        # Count bytes in the last JOURNAL_RETAIN_DAYS of entries.
        # --output=export includes metadata so this is an upper bound.
        svc_bytes=$(journalctl -u "$unit" --since="-${JOURNAL_RETAIN_DAYS}d" --output=export 2>/dev/null | wc -c || echo 0)
        svc_human=$(numfmt --to=iec "$svc_bytes" 2>/dev/null || echo "${svc_bytes}B")
        log "  ${svc}: ~${svc_human}"
    fi
done

log_ok "Journal vacuum complete."

###########################################
# 2. CLEAN STRAPI FILE-BASED LOGS
###########################################
# Strapi writes runtime logs to pos-strapi/logs/ inside the
# build directory.  Old log files are removed; the current one
# is truncated if it exceeds 50 MB to avoid breaking a running
# Strapi instance that holds the file descriptor open.

ACTIVE_BUILD=""
if [ -L "$ACTIVE_LINK" ]; then
    ACTIVE_BUILD=$(readlink -f "$ACTIVE_LINK")
elif [ -d "$ACTIVE_LINK" ]; then
    ACTIVE_BUILD="$ACTIVE_LINK"
fi

STRAPI_LOGS_DIR="${ACTIVE_BUILD}/pos-strapi/logs"

if [ -n "$ACTIVE_BUILD" ] && [ -d "$STRAPI_LOGS_DIR" ]; then
    log "Cleaning Strapi file logs in ${STRAPI_LOGS_DIR} ..."

    # Remove log files older than STRAPI_LOG_RETAIN_DAYS
    strapi_pruned=0
    while IFS= read -r old_file; do
        rm -f "$old_file"
        strapi_pruned=$((strapi_pruned + 1))
    done < <(find "$STRAPI_LOGS_DIR" -type f -name "*.log" -mtime "+${STRAPI_LOG_RETAIN_DAYS}" 2>/dev/null)

    if [ "$strapi_pruned" -gt 0 ]; then
        log "  Removed ${strapi_pruned} Strapi log file(s) older than ${STRAPI_LOG_RETAIN_DAYS} days."
    fi

    # Truncate any remaining log file that exceeds 50 MB.
    # Truncate (not delete) because Strapi may hold the fd open.
    STRAPI_LOG_MAX=$((50 * 1024 * 1024))
    for lf in "$STRAPI_LOGS_DIR"/*.log; do
        [ -f "$lf" ] || continue
        lf_size=$(stat -c%s "$lf" 2>/dev/null || echo 0)
        if [ "$lf_size" -gt "$STRAPI_LOG_MAX" ]; then
            log "  Truncating $(basename "$lf") ($(numfmt --to=iec "$lf_size"))..."
            truncate -s 0 "$lf"
        fi
    done

    log_ok "Strapi file logs cleaned."
else
    log "No Strapi logs directory found -- skipping."
fi

###########################################
# 3. CLEAN STALE NPM DEBUG LOGS
###########################################
# npm-debug.log* and similar files can accumulate in the active
# build directory when npm commands fail.

if [ -n "$ACTIVE_BUILD" ] && [ -d "$ACTIVE_BUILD" ]; then
    npm_cleaned=0
    while IFS= read -r dbg_log; do
        rm -f "$dbg_log"
        npm_cleaned=$((npm_cleaned + 1))
    done < <(find "$ACTIVE_BUILD" -maxdepth 3 -type f \( -name "npm-debug.log*" -o -name "yarn-debug.log*" -o -name "yarn-error.log*" \) 2>/dev/null)

    if [ "$npm_cleaned" -gt 0 ]; then
        log "Removed ${npm_cleaned} stale npm/yarn debug log(s)."
    fi
fi

###########################################
# 4. ROTATE DEPLOY LOG FILE
###########################################

mkdir -p "$LOG_ARCHIVE_DIR"

if [ -f "$LOG_FILE" ]; then
    file_size=$(stat -c%s "$LOG_FILE" 2>/dev/null || echo 0)

    if [ "$file_size" -gt "$LOG_MAX_BYTES" ]; then
        archive_name="rutba_deploy_$(date '+%Y%m%d_%H%M%S').log"
        mv "$LOG_FILE" "${LOG_ARCHIVE_DIR}/${archive_name}"
        touch "$LOG_FILE"
        chmod 644 "$LOG_FILE"
        log "Deploy log rotated -> ${LOG_ARCHIVE_DIR}/${archive_name} (was $(numfmt --to=iec "$file_size"))"
    else
        log "Deploy log size $(numfmt --to=iec "$file_size") -- below threshold, skipping rotation."
    fi
else
    log "No deploy log found at ${LOG_FILE} -- nothing to rotate."
fi

# Prune old archived deploy logs
pruned=0
while IFS= read -r old_log; do
    rm -f "$old_log"
    pruned=$((pruned + 1))
done < <(find "$LOG_ARCHIVE_DIR" -name "rutba_deploy_*.log" -type f -mtime "+${LOG_RETAIN_DAYS}" 2>/dev/null)

if [ "$pruned" -gt 0 ]; then
    log "Pruned ${pruned} archived deploy log(s) older than ${LOG_RETAIN_DAYS} days."
fi

###########################################
# 5. TRIM ROTATION LOG ITSELF
###########################################

# Keep the rotation log itself from growing unbounded.
# Retain only the last 1000 lines.
if [ -f "$ROTATION_LOG" ]; then
    line_count=$(wc -l < "$ROTATION_LOG")
    if [ "$line_count" -gt 1000 ]; then
        tail -n 1000 "$ROTATION_LOG" > "${ROTATION_LOG}.tmp"
        mv "${ROTATION_LOG}.tmp" "$ROTATION_LOG"
    fi
fi

###########################################
# DONE
###########################################

log_ok "=== Rutba log rotation finished ==="