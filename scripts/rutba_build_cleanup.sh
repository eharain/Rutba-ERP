#!/bin/bash

set -euo pipefail

###########################################
# Rutba ERP — Build & DB Backup Cleanup
###########################################
#
# Interactive tool to manage disk space on the server.
#
# Features:
#   1. List all builds with date, size, branch, commit and active marker
#   2. Remove selected old builds (protects the active build)
#   3. List all database backup dumps with date and size
#   4. Download a dump via the current SSH session (sz / base64 fallback)
#   5. Remove selected database dumps
#
# Usage:
#   sudo bash scripts/rutba_build_cleanup.sh
#
###########################################

###########################################
# CONFIG — must match rutba_deploy.sh
###########################################

BUILDS_DIR="/home/rutba-nvr/rutba_builds"
ACTIVE_LINK="/home/rutba-nvr/rutba_active"
DB_BACKUP_DIR="/home/rutba-nvr/db_dumps"
LOG_FILE="/var/log/rutba_deploy.log"

###########################################
# HELPERS
###########################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()      { local m="$(date '+%Y-%m-%d %H:%M:%S') : $1";      echo -e "${CYAN}${m}${NC}";   echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_ok()   { local m="$(date '+%Y-%m-%d %H:%M:%S') : ✅ $1";   echo -e "${GREEN}${m}${NC}";  echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_warn() { local m="$(date '+%Y-%m-%d %H:%M:%S') : ⚠ $1";    echo -e "${YELLOW}${m}${NC}"; echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_err()  { local m="$(date '+%Y-%m-%d %H:%M:%S') : ❌ $1";    echo -e "${RED}${m}${NC}";    echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
abort()    { log_err "$1"; exit 1; }

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

# dbname_20250115_143022.sql → "2025-01-15 14:30:22"
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

# build_20250115_143022_main → "main"
extract_branch() {
    local name
    name=$(basename "$1")
    echo "$name" | sed -n 's/^build_[0-9]\{8\}_[0-9]\{6\}_//p'
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

# Parse a comma-separated list like "1,3,5" or a range "2-4" or "all"
# into an array of 0-based indices.  Validates against $max.
parse_selection() {
    local input="$1"
    local max="$2"
    local -n _out="$3"
    _out=()

    if [ "$input" = "all" ]; then
        for ((i = 0; i < max; i++)); do _out+=("$i"); done
        return 0
    fi

    IFS=',' read -ra tokens <<< "$input"
    for token in "${tokens[@]}"; do
        token=$(echo "$token" | tr -d '[:space:]')
        if [[ "$token" =~ ^([0-9]+)-([0-9]+)$ ]]; then
            local from="${BASH_REMATCH[1]}"
            local to="${BASH_REMATCH[2]}"
            if [ "$from" -ge 1 ] && [ "$to" -le "$max" ] && [ "$from" -le "$to" ]; then
                for ((i = from; i <= to; i++)); do _out+=("$((i - 1))"); done
            else
                return 1
            fi
        elif [[ "$token" =~ ^[0-9]+$ ]]; then
            if [ "$token" -ge 1 ] && [ "$token" -le "$max" ]; then
                _out+=("$((token - 1))")
            else
                return 1
            fi
        else
            return 1
        fi
    done
    return 0
}

###########################################
# PRE-FLIGHT
###########################################

if [ "$(id -u)" -ne 0 ]; then
    abort "This script must be run as root (use sudo)."
fi

CURRENT_ACTIVE=$(get_active_build_dir)

###########################################
# DISK USAGE OVERVIEW
###########################################

show_overview() {
    echo ""
    echo -e "${BOLD}============================================${NC}"
    echo -e "${BOLD}  Rutba ERP — Build & Backup Cleanup${NC}"
    echo -e "${BOLD}============================================${NC}"

    if [ -n "$CURRENT_ACTIVE" ]; then
        echo -e "  Active build: ${GREEN}$(basename "$CURRENT_ACTIVE")${NC}"
        echo -e "  Deployed on:  ${CYAN}$(format_build_date "$CURRENT_ACTIVE")${NC}"
    fi

    local builds_size="0"
    local dumps_size="0"
    local cache_size="0"

    [ -d "$BUILDS_DIR" ] && builds_size=$(du -sh "$BUILDS_DIR" 2>/dev/null | cut -f1)
    [ -d "$DB_BACKUP_DIR" ] && dumps_size=$(du -sh "$DB_BACKUP_DIR" 2>/dev/null | cut -f1)
    [ -d "$BUILDS_DIR/.npm_cache" ] && cache_size=$(du -sh "$BUILDS_DIR/.npm_cache" 2>/dev/null | cut -f1)

    echo ""
    echo "  Disk usage:"
    echo "    Builds total:   ${builds_size}"
    echo "    DB backups:     ${dumps_size}"
    echo "    npm cache:      ${cache_size}"
    echo ""
}

###########################################
# 1. MANAGE BUILDS
###########################################

manage_builds() {
    echo ""
    echo -e "${BOLD}  ── Old Builds ────────────────────────────${NC}"
    echo ""

    mapfile -t BUILDS < <(
        find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" 2>/dev/null | sort -r
    )

    if [ ${#BUILDS[@]} -eq 0 ]; then
        echo "  No builds found."
        return
    fi

    for i in "${!BUILDS[@]}"; do
        local dir="${BUILDS[$i]}"
        local name
        name=$(basename "$dir")
        local date
        date=$(format_build_date "$dir")
        local branch
        branch=$(extract_branch "$dir")
        local size
        size=$(du -sh "$dir" 2>/dev/null | cut -f1)

        local commit=""
        if [ -d "${dir}/.git" ]; then
            commit=$(cd "$dir" && git log --oneline -1 2>/dev/null || echo "")
        fi

        local marker=""
        if [ "$dir" = "$CURRENT_ACTIVE" ]; then
            marker=" ${GREEN}(active — protected)${NC}"
        fi

        echo -e "    ${CYAN}$((i + 1)))${NC} ${name}  ${CYAN}${date}${NC}  [${branch}]  [${size}]  ${commit}${marker}"
    done

    echo ""
    echo "  Enter build numbers to remove."
    echo "  Examples:  2  |  1,3,5  |  2-4  |  all  |  0 to skip"
    echo ""
    read -rp "  Remove builds: " selection

    if [ -z "$selection" ] || [ "$selection" = "0" ]; then
        echo "  Skipped."
        return
    fi

    local indices
    if ! parse_selection "$selection" "${#BUILDS[@]}" indices; then
        log_err "Invalid selection."
        return
    fi

    # Filter out the active build
    local to_delete=()
    for idx in "${indices[@]}"; do
        local dir="${BUILDS[$idx]}"
        if [ "$dir" = "$CURRENT_ACTIVE" ]; then
            log_warn "Skipping $(basename "$dir") — it is the active build."
        else
            to_delete+=("$dir")
        fi
    done

    if [ ${#to_delete[@]} -eq 0 ]; then
        echo "  Nothing to remove."
        return
    fi

    echo ""
    echo "  Will remove ${#to_delete[@]} build(s):"
    for dir in "${to_delete[@]}"; do
        echo -e "    ${RED}✕${NC} $(basename "$dir")  ($(format_build_date "$dir"))"
    done
    echo ""
    read -rp "  Confirm? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "  Cancelled."
        return
    fi

    for dir in "${to_delete[@]}"; do
        rm -rf "$dir"
        log_ok "Removed build: $(basename "$dir")"
    done

    local freed
    freed=$(echo "${to_delete[@]}" | wc -w)
    log_ok "Removed ${freed} build(s)."
}

###########################################
# 2. MANAGE DATABASE BACKUPS
###########################################

load_dumps() {
    DUMPS=()
    mapfile -t DUMPS < <(
        find "$DB_BACKUP_DIR" -maxdepth 1 -type f -name "*.sql" 2>/dev/null | sort -r
    )
}

list_dumps() {
    echo ""
    echo -e "${BOLD}  ── Database Backups ──────────────────────${NC}"
    echo ""

    if [ ${#DUMPS[@]} -eq 0 ]; then
        echo "  No database backups found in ${DB_BACKUP_DIR}."
        return 1
    fi

    for i in "${!DUMPS[@]}"; do
        local file="${DUMPS[$i]}"
        local name
        name=$(basename "$file")
        local date
        date=$(format_dump_date "$file")
        local size
        size=$(du -sh "$file" 2>/dev/null | cut -f1)

        echo -e "    ${CYAN}$((i + 1)))${NC} ${name}  ${CYAN}${date}${NC}  [${size}]"
    done

    return 0
}

download_dump() {
    load_dumps
    if ! list_dumps; then return; fi

    echo ""
    echo "  Enter the dump number to download (0 to skip):"
    read -rp "  Download: " choice

    if [ -z "$choice" ] || [ "$choice" = "0" ]; then
        echo "  Skipped."
        return
    fi

    if ! [[ "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#DUMPS[@]}" ]; then
        log_err "Invalid selection."
        return
    fi

    local file="${DUMPS[$((choice - 1))]}"
    local filename
    filename=$(basename "$file")
    local size
    size=$(du -sh "$file" 2>/dev/null | cut -f1)

    echo ""
    echo -e "  Selected: ${CYAN}${filename}${NC}  [${size}]"
    echo ""
    echo "  Download method:"
    echo "    1) sz (ZMODEM — works in terminals that support it)"
    echo "    2) base64 (copy-paste the encoded output)"
    echo "    3) scp command (prints the command to run from your local machine)"
    echo "    0) Cancel"
    echo ""
    read -rp "  Method [1/2/3]: " method

    case "$method" in
        1)
            if command -v sz &>/dev/null; then
                log "Starting ZMODEM transfer for ${filename} ..."
                sz "$file"
                log_ok "ZMODEM transfer initiated."
            else
                log_err "sz (lrzsz) is not installed.  Install with:  sudo apt install lrzsz"
            fi
            ;;
        2)
            echo ""
            echo "============================================"
            echo "  base64-encoded dump: ${filename}"
            echo "  Decode on your local machine with:"
            echo "    base64 -d < encoded.txt > ${filename}"
            echo "============================================"
            echo ""
            echo "--- BEGIN BASE64 ---"
            base64 "$file"
            echo "--- END BASE64 ---"
            echo ""
            log_ok "base64 output complete for ${filename}."
            ;;
        3)
            local ssh_user
            ssh_user=$(logname 2>/dev/null || echo "$SUDO_USER" 2>/dev/null || echo "rutba-nvr")
            local hostname
            hostname=$(hostname -f 2>/dev/null || hostname)

            echo ""
            echo "  Run this on your LOCAL machine to download:"
            echo ""
            echo -e "    ${GREEN}scp ${ssh_user}@${hostname}:${file} ./${filename}${NC}"
            echo ""
            echo "  Or with a custom SSH port (e.g. 2222):"
            echo ""
            echo -e "    ${GREEN}scp -P 2222 ${ssh_user}@${hostname}:${file} ./${filename}${NC}"
            echo ""
            ;;
        *)
            echo "  Cancelled."
            ;;
    esac
}

remove_dumps() {
    load_dumps
    if ! list_dumps; then return; fi

    echo ""
    echo "  Enter dump numbers to remove."
    echo "  Examples:  2  |  1,3,5  |  2-4  |  all  |  0 to skip"
    echo ""
    read -rp "  Remove dumps: " selection

    if [ -z "$selection" ] || [ "$selection" = "0" ]; then
        echo "  Skipped."
        return
    fi

    local indices
    if ! parse_selection "$selection" "${#DUMPS[@]}" indices; then
        log_err "Invalid selection."
        return
    fi

    local to_delete=()
    for idx in "${indices[@]}"; do
        to_delete+=("${DUMPS[$idx]}")
    done

    if [ ${#to_delete[@]} -eq 0 ]; then
        echo "  Nothing to remove."
        return
    fi

    echo ""
    echo "  Will remove ${#to_delete[@]} dump(s):"
    for f in "${to_delete[@]}"; do
        echo -e "    ${RED}✕${NC} $(basename "$f")  ($(format_dump_date "$f"))"
    done
    echo ""
    read -rp "  Confirm? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "  Cancelled."
        return
    fi

    for f in "${to_delete[@]}"; do
        rm -f "$f"
        log_ok "Removed dump: $(basename "$f")"
    done

    log_ok "Removed ${#to_delete[@]} dump(s)."
}

###########################################
# 3. CLEAR NPM CACHE
###########################################

clear_npm_cache() {
    local cache_dir="${BUILDS_DIR}/.npm_cache"
    if [ ! -d "$cache_dir" ]; then
        echo "  No npm cache directory found."
        return
    fi

    local size
    size=$(du -sh "$cache_dir" 2>/dev/null | cut -f1)

    echo ""
    echo -e "  npm cache: ${CYAN}${cache_dir}${NC}  [${size}]"
    echo ""
    read -rp "  Clear npm cache? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "  Skipped."
        return
    fi

    rm -rf "$cache_dir"
    mkdir -p "$cache_dir"
    log_ok "npm cache cleared (was ${size})."
}

###########################################
# 4. AUTO-PRUNE BUILDS
###########################################

auto_prune_builds() {
    local script_dir
    script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local prune_script="${script_dir}/rutba_prune_builds.sh"

    if [ ! -f "$prune_script" ]; then
        log_err "Prune script not found at ${prune_script}"
        return
    fi

    echo ""
    echo -e "  Auto-prune keeps the ${CYAN}latest build per day${NC} and"
    echo -e "  retains the last ${CYAN}${MAX_BUILDS:-5} days${NC}. The active build"
    echo "  is always protected."
    echo ""
    read -rp "  Run auto-prune now? [y/N]: " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "  Skipped."
        return
    fi

    bash "$prune_script"
}

###########################################
# MAIN MENU
###########################################

while true; do
    show_overview

    echo "  What would you like to do?"
    echo ""
    echo "    1) Manage old builds       (list / pick / remove)"
    echo "    2) Auto-prune builds       (keep latest per day, last ${MAX_BUILDS:-5} days)"
    echo "    3) Download a DB backup    (sz / base64 / scp)"
    echo "    4) Remove DB backups       (list / pick / remove)"
    echo "    5) Clear npm cache"
    echo "    0) Exit"
    echo ""
    read -rp "  Choice [0-5]: " action

    case "$action" in
        1) manage_builds ;;
        2) auto_prune_builds ;;
        3) download_dump ;;
        4) remove_dumps ;;
        5) clear_npm_cache ;;
        0|"")
            echo ""
            log_ok "Cleanup session finished."
            echo ""
            exit 0
            ;;
        *)
            log_err "Invalid choice."
            ;;
    esac

    echo ""
    echo -e "  ${CYAN}────────────────────────────────────────${NC}"
    read -rp "  Press ENTER to return to the menu... "
done
