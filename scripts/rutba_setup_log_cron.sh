#!/bin/bash

set -euo pipefail

###########################################
# Rutba ERP Ã¢â‚¬â€ Setup / Update Log Rotation Cron Job
###########################################
#
# Installs (or updates) a nightly cron job that runs
# rutba_log_rotate.sh to vacuum journal logs and rotate
# the deploy log file.
#
# Idempotent Ã¢â‚¬â€ safe to run multiple times. If the cron
# entry already exists it is replaced with the current
# schedule and path.
#
# Usage:
#   sudo bash scripts/rutba_setup_log_cron.sh
#
###########################################

###########################################
# CONFIG
###########################################

CRON_SCHEDULE="0 2 * * *"   # every night at 02:00
CRON_USER="root"             # journal vacuum requires root

# Marker comment used to identify our cron entry.
CRON_TAG="# rutba-erp-log-rotation"

###########################################
# HELPERS
###########################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()      { echo -e "${CYAN}$(date '+%Y-%m-%d %H:%M:%S') : $1${NC}"; }
log_ok()   { echo -e "${GREEN}$(date '+%Y-%m-%d %H:%M:%S') : Ã¢Å“â€¦ $1${NC}"; }
log_warn() { echo -e "${YELLOW}$(date '+%Y-%m-%d %H:%M:%S') : Ã¢Å¡Â  $1${NC}"; }
abort()    { echo -e "${RED}$(date '+%Y-%m-%d %H:%M:%S') : Ã¢ÂÅ’ $1${NC}" >&2; exit 1; }

###########################################
# PRE-FLIGHT
###########################################

if [ "$(id -u)" -ne 0 ]; then
    abort "This script must be run as root (use sudo)."
fi

# Resolve absolute path to the rotation script, relative to this
# setup script's own location (they live in the same directory).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROTATE_SCRIPT="${SCRIPT_DIR}/rutba_log_rotate.sh"

if [ ! -f "$ROTATE_SCRIPT" ]; then
    abort "Rotation script not found at ${ROTATE_SCRIPT}"
fi

chmod +x "$ROTATE_SCRIPT"

###########################################
# BUILD CRON LINE
###########################################

# The rotation script writes its own log to /var/log/rutba_log_rotate.log
# internally.  We only redirect stderr here to catch unexpected failures
# (e.g. bash itself crashing).  Redirecting stdout as well would cause
# every message to appear twice in the log file.
CRON_LINE="${CRON_SCHEDULE} /bin/bash ${ROTATE_SCRIPT} 2>> /var/log/rutba_log_rotate.log ${CRON_TAG}"

###########################################
# INSTALL / UPDATE CRON ENTRY
###########################################

log "Checking existing crontab for ${CRON_USER}..."

# Read current crontab (suppress "no crontab" warning)
EXISTING_CRONTAB=$(crontab -u "$CRON_USER" -l 2>/dev/null || true)

if echo "$EXISTING_CRONTAB" | grep -qF "$CRON_TAG"; then
    # Entry exists Ã¢â‚¬â€ replace it
    log "Existing cron entry found. Updating..."
    NEW_CRONTAB=$(echo "$EXISTING_CRONTAB" | grep -vF "$CRON_TAG")
    NEW_CRONTAB="${NEW_CRONTAB}
${CRON_LINE}"
    echo "$NEW_CRONTAB" | crontab -u "$CRON_USER" -
    log_ok "Cron entry updated."
else
    # No entry Ã¢â‚¬â€ append
    log "No existing cron entry found. Installing..."
    if [ -n "$EXISTING_CRONTAB" ]; then
        NEW_CRONTAB="${EXISTING_CRONTAB}
${CRON_LINE}"
    else
        NEW_CRONTAB="$CRON_LINE"
    fi
    echo "$NEW_CRONTAB" | crontab -u "$CRON_USER" -
    log_ok "Cron entry installed."
fi

###########################################
# VERIFY
###########################################

echo ""
echo "============================================"
echo -e "  ${GREEN}Ã¢Å“â€¦ Log Rotation Cron Job Configured${NC}"
echo "============================================"
echo ""
echo "  Schedule:  ${CRON_SCHEDULE}  (daily at 02:00)"
echo "  Script:    ${ROTATE_SCRIPT}"
echo "  Cron user: ${CRON_USER}"
echo ""
echo "  Current crontab entry:"
crontab -u "$CRON_USER" -l 2>/dev/null | grep -F "$CRON_TAG" | sed 's/^/    /'
echo ""
echo "  Rotation log:"
echo "    /var/log/rutba_log_rotate.log"
echo ""
echo "  To run manually:"
echo "    sudo bash ${ROTATE_SCRIPT}"
echo ""
echo "  To remove the cron job:"
echo "    sudo crontab -e   # delete the line tagged ${CRON_TAG}"
echo "============================================"
