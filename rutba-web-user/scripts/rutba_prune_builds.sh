#!/bin/bash

set -euo pipefail

###########################################
# Rutba ERP — Prune Old Builds
###########################################
#
# Strategy:
#   1. Group builds by calendar day (YYYYMMDD).
#   2. Within each day keep only the LATEST build — earlier
#      same-day builds were superseded (likely broken/incomplete).
#   3. From the remaining "best per day" builds, keep the last
#      MAX_BUILDS days.
#   4. The active build and an optionally protected build are
#      NEVER removed.
#
# Can be called:
#   • Standalone:  sudo bash scripts/rutba_prune_builds.sh
#   • From deploy: sudo bash scripts/rutba_prune_builds.sh --protect /path/to/build
#
# When called standalone it reads its own CONFIG.
# When called from deploy, env vars BUILDS_DIR, ACTIVE_LINK,
# MAX_BUILDS, and LOG_FILE are inherited if already set.
#
###########################################

###########################################
# CONFIG — source shared environment
###########################################

RUTBA_ENV_QUIET=1
_RUTBA_PRUNE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_RUTBA_PRUNE_DIR}/rutba_deployed_environment.sh"

# An extra build directory to protect (the just-deployed build
# when called from the deploy script).
PROTECT_BUILD=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --protect)
            PROTECT_BUILD="$2"
            shift 2
            ;;
        --max)
            MAX_BUILDS="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

###########################################
# HELPERS
###########################################
# Colours, log functions, format_build_date, get_active_build_dir
# are provided by rutba_env.sh (sourced above).

# Returns true if a build is protected from deletion.
is_protected() {
    local dir="$1"
    [ "$dir" = "$ACTIVE_BUILD" ] && return 0
    [ -n "$PROTECT_BUILD" ] && [ "$dir" = "$PROTECT_BUILD" ] && return 0
    return 1
}

###########################################
# PRE-FLIGHT
###########################################

if [ "$(id -u)" -ne 0 ]; then
    log_err "This script must be run as root (use sudo)."
    exit 1
fi

if [ ! -d "$BUILDS_DIR" ]; then
    log_warn "No builds directory at ${BUILDS_DIR}. Nothing to prune."
    exit 0
fi

ACTIVE_BUILD=$(get_active_build_dir)

###########################################
# PRUNE
###########################################

log "Pruning old builds (keeping latest per day, last ${MAX_BUILDS} days)..."

mapfile -t ALL_BUILDS < <(
    find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" | sort -r
)

if [ ${#ALL_BUILDS[@]} -eq 0 ]; then
    log "No builds found. Nothing to prune."
    exit 0
fi

# ── Pass 1: same-day dedup ───────────────────────────────────
# Sorted newest-first, so the first build seen for a given day
# is the latest.  All earlier same-day builds are superseded.

declare -A SEEN_DAY
SAME_DAY_REMOVE=()

for b in "${ALL_BUILDS[@]}"; do
    local_name=$(basename "$b")
    day=$(echo "$local_name" | sed -n 's/^build_\([0-9]\{8\}\)_.*/\1/p')
    day="${day:-unknown}"

    if [ -z "${SEEN_DAY[$day]+x}" ]; then
        SEEN_DAY[$day]="$b"
    else
        if ! is_protected "$b"; then
            SAME_DAY_REMOVE+=("$b")
        fi
    fi
done

for b in "${SAME_DAY_REMOVE[@]}"; do
    rm -rf "$b"
    log "  Removed same-day superseded: $(basename "$b") ($(format_build_date "$b"))"
done

# ── Pass 2: keep last MAX_BUILDS daily builds ────────────────

mapfile -t DAILY_BUILDS < <(
    find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" | sort -r
)

KEEP=0
OLD_REMOVE=()
for b in "${DAILY_BUILDS[@]}"; do
    KEEP=$((KEEP + 1))
    if [ "$KEEP" -gt "$MAX_BUILDS" ] && ! is_protected "$b"; then
        OLD_REMOVE+=("$b")
    fi
done

for b in "${OLD_REMOVE[@]}"; do
    rm -rf "$b"
    log "  Removed old build: $(basename "$b") ($(format_build_date "$b"))"
done

# ── Summary ──────────────────────────────────────────────────

TOTAL_REMOVED=$(( ${#SAME_DAY_REMOVE[@]} + ${#OLD_REMOVE[@]} ))

if [ "$TOTAL_REMOVED" -eq 0 ]; then
    log_ok "No builds needed pruning."
else
    log_ok "Pruned ${TOTAL_REMOVED} build(s)."
fi

# List what remains
mapfile -t REMAINING < <(
    find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" | sort -r
)

echo ""
echo "  Remaining builds (${#REMAINING[@]}):"
for b in "${REMAINING[@]}"; do
    local_date=$(format_build_date "$b")
    marker=""
    if [ "$b" = "$ACTIVE_BUILD" ]; then
        marker=" ${GREEN}← active${NC}"
    fi
    echo -e "    $(basename "$b")  ${CYAN}${local_date}${NC}${marker}"
done
echo ""
