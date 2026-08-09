#!/bin/bash
set -euo pipefail

###########################################
# Rutba ERP - Service Manager
###########################################
#
# Manage all Rutba ERP systemd services. Can be called directly
# or sourced by other scripts (set RUTBA_SERVICES_SOURCED=1).
#
# Usage:
#   sudo bash scripts/rutba_services.sh <command> [options]
#
# Commands:
#   start   [service]            Start all (or one) service
#   stop    [service]            Stop all (or one) service
#   restart [service]            Restart all (or one) service
#   status                       Show status of all services
#   rebuild [build_dir]          Re-write systemd unit files
#   logs    <service> [lines]    Show recent journal logs
#   tail    [service]            Live-follow logs (Ctrl+C to stop)
#   diagnose                     Detect common problems
#   seed    [seed args]          Wait for Strapi, then run the seed engine
#   help                         Show this usage information
#
###########################################

# Source shared environment
_RUTBA_SVC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_RUTBA_SVC_DIR}/rutba_deployed_environment.sh"

###########################################
# SERVICE DEFINITIONS
###########################################
# The registry lives in rutba_apps.sh - the single source of truth
# shared with setup-systemd-services.sh and rutba_log_rotate.sh.
# To add an app, edit ONLY that file.

source "${_RUTBA_SVC_DIR}/rutba_apps.sh"

SERVICES=("${RUTBA_SERVICES[@]}")
declare -A SVC_CMD;  for _k in "${!RUTBA_SVC_CMD[@]}";  do SVC_CMD[$_k]="${RUTBA_SVC_CMD[$_k]}";   done
declare -A SVC_DESC; for _k in "${!RUTBA_SVC_DESC[@]}"; do SVC_DESC[$_k]="${RUTBA_SVC_DESC[$_k]}"; done
declare -A SVC_PORT; for _k in "${!RUTBA_SVC_PORT[@]}"; do SVC_PORT[$_k]="${RUTBA_SVC_PORT[$_k]}"; done
unset _k

###########################################
# HELPERS
###########################################

# True when a unit is inactive because its process ran and exited 0, rather
# than because it crashed or never started. Distinguishes an intentionally
# disabled worker from a broken service.
_svc_exited_cleanly() {
    local svc="$1"
    local result; result=$(systemctl show "${svc}.service" --property=Result --value 2>/dev/null || echo "")
    local code;   code=$(systemctl show "${svc}.service" --property=ExecMainStatus --value 2>/dev/null || echo "")
    [ "$result" = "success" ] && [ "$code" = "0" ]
}

_validate_svc() {
    local svc="$1"
    for s in "${SERVICES[@]}"; do [ "$s" = "$svc" ] && return 0; done
    echo -e "${RED}Unknown service: ${svc}${NC}"
    echo ""
    echo "  Available services:"
    for s in "${SERVICES[@]}"; do echo "    $s"; done
    exit 1
}

# Project directory a service runs out of, derived from its npm invocation so
# the registry stays a single list instead of two that drift:
#   "run start --workspace=rutba-crm"   -> rutba-crm
#   "--prefix pos-strapi run start"     -> pos-strapi   (not a workspace)
# Empty for anything that matches neither form.
_svc_workspace_dir() {
    local cmd="${SVC_CMD[$1]:-}" rest
    case "$cmd" in
        *--workspace=*) rest="${cmd##*--workspace=}"; echo "${rest%% *}" ;;
        *--prefix\ *)   rest="${cmd#*--prefix }";     echo "${rest%% *}" ;;
        *)              echo "" ;;
    esac
}

###########################################
# UNIT WRITER
###########################################

write_all_units() {
    local BUILD_DEST_DIR="${1:-}"

    # If a specific build dir was passed, verify it exists.
    # Otherwise default to the ACTIVE_LINK symlink.
    if [ -n "$BUILD_DEST_DIR" ]; then
        [ -d "$BUILD_DEST_DIR" ] || abort "Build directory does not exist: ${BUILD_DEST_DIR}"
    fi

    # Unit files always reference the ACTIVE_LINK symlink so that
    # switching the symlink + restarting services picks up the new
    # build without rewriting unit files.
    local UNIT_DIR="${ACTIVE_LINK}"
    [ -d "$UNIT_DIR" ] || [ -L "$UNIT_DIR" ] || abort "Active link does not exist: ${UNIT_DIR}"

    local NODE_BIN; NODE_BIN=$(which node)
    local NPM_BIN;  NPM_BIN=$(which npm)

    # Only write units for apps that actually exist in the build being
    # activated. The registry is edited by hand and travels with the repo, so
    # it routinely names an app that is not in the branch yet - either still
    # uncommitted on someone's machine, or not registered in the root
    # `workspaces` array. Both produce a unit that starts, fails
    # ("No workspaces found: --workspace=X"), and restarts forever.
    #
    # Skipping them here also lets the retirement pass below clean up a unit
    # that a previous deploy wrote for an app since removed.
    local -a WRITE_SERVICES=()
    local svc_dir
    for svc in "${SERVICES[@]}"; do
        svc_dir=$(_svc_workspace_dir "$svc")
        if [ -n "$svc_dir" ] && [ ! -d "${UNIT_DIR}/${svc_dir}" ]; then
            log_warn "Skipping ${svc}: ${svc_dir}/ is not in this build."
            continue
        fi
        WRITE_SERVICES+=("$svc")
    done

    for svc in "${WRITE_SERVICES[@]}"; do
        local FILE="${SYSTEMD_DIR}/${svc}.service"
        local DESC="${SVC_DESC[$svc]}"
        local CMD="${SVC_CMD[$svc]}"

        cat > "$FILE" <<UNIT_EOF
[Unit]
Description=${DESC}
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${UNIT_DIR}
ExecStart=${NODE_BIN} ${UNIT_DIR}/scripts/js/load-env.js -- ${NPM_BIN} ${CMD}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${svc}
LimitNOFILE=65536
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
UNIT_EOF
        systemctl enable "${svc}.service" 2>/dev/null || true
    done

    # Retire units for services that were removed from the registry.
    # Without this a renamed/dropped app keeps a stale enabled unit that
    # restarts forever against a workspace that no longer exists.
    local unit_path unit_name known
    for unit_path in "${SYSTEMD_DIR}"/rutba_*.service; do
        [ -f "$unit_path" ] || continue
        unit_name=$(basename "$unit_path" .service)
        known=0
        for svc in "${WRITE_SERVICES[@]}"; do
            [ "$unit_name" = "$svc" ] && { known=1; break; }
        done
        if [ "$known" -eq 0 ]; then
            log_warn "Retiring stale unit (not in registry): ${unit_name}"
            systemctl stop    "${unit_name}.service" 2>/dev/null || true
            systemctl disable "${unit_name}.service" 2>/dev/null || true
            rm -f "$unit_path"
        fi
    done

    systemctl daemon-reload
    log_ok "Systemd units written -> ${UNIT_DIR} (active link) [${#WRITE_SERVICES[@]} services]"
}

###########################################
# START / STOP
###########################################

stop_services() {
    local target="${1:-}"
    if [ -n "$target" ]; then
        _validate_svc "$target"
        log "Stopping ${target}..."
        systemctl stop "${target}.service" 2>/dev/null || true
        log_ok "${target} stopped."
    else
        log "Stopping all Rutba services..."
        for svc in "${SERVICES[@]}"; do
            systemctl stop "${svc}.service" 2>/dev/null || true
        done
        log_ok "All services stopped."
    fi
}

start_services() {
    local target="${1:-}"
    if [ -n "$target" ]; then
        _validate_svc "$target"
        log "Starting ${target}..."
        systemctl daemon-reload
        systemctl start "${target}.service" 2>/dev/null || log_warn "Failed to start ${target}"
        log_ok "${target} started."
    else
        log "Reloading systemd daemon..."
        systemctl daemon-reload
        log "Starting all Rutba services..."
        # Start the API backend first - every other app talks to it. WHICH unit
        # that is depends on RUTBA_BACKEND, so it cannot be named literally:
        # under RUTBA_BACKEND=core write_all_units has just retired the
        # rutba_pos_strapi unit, and `systemctl start` on a unit that no longer
        # exists is a hard failure that aborts the whole deploy (set -e).
        local backend_started=0 known
        for backend_svc in rutba_pos_strapi rutba_core; do
            known=0
            for svc in "${SERVICES[@]}"; do
                [ "$svc" = "$backend_svc" ] && { known=1; break; }
            done
            [ "$known" -eq 1 ] || continue
            [ -f "${SYSTEMD_DIR}/${backend_svc}.service" ] || continue
            systemctl start "${backend_svc}.service" 2>/dev/null \
                || log_warn "Failed to start ${backend_svc}"
            backend_started=1
        done
        if [ "$backend_started" -eq 1 ]; then
            sleep 3
        fi
        for svc in "${SERVICES[@]}"; do
            case "$svc" in
                rutba_pos_strapi|rutba_core) continue ;;
            esac
            # No unit = write_all_units skipped it (app not in this build).
            # Starting it anyway would just log a warning per deploy forever.
            [ -f "${SYSTEMD_DIR}/${svc}.service" ] || continue
            systemctl start "${svc}.service" 2>/dev/null || log_warn "Failed to start ${svc}"
        done
        log_ok "All services started."
    fi
}

###########################################
# STATUS
###########################################

show_service_status() {
    echo ""
    echo "============================================"
    echo "  Service Status"
    echo "============================================"

    local active_dir; active_dir=$(get_active_build_dir)
    if [ -n "$active_dir" ]; then
        echo -e "  Build: ${CYAN}$(basename "$active_dir")${NC}"
        echo "============================================"
    fi

    for svc in "${SERVICES[@]}"; do
        # `is-active` exits non-zero for anything but "active" while still
        # printing the real state, so `|| echo inactive` would append a second
        # line and turn "activating" into "activating\ninactive".
        local status; status=$(systemctl is-active "${svc}.service" 2>/dev/null || true); status="${status:-inactive}"
        local port="${SVC_PORT[$svc]:--}"
        local label; label=$(printf '%-26s %5s' "$svc" "$port")
        local mem=""
        if [ "$status" = "active" ]; then
            local pid; pid=$(systemctl show "${svc}.service" --property=MainPID --value 2>/dev/null || echo "")
            if [ -n "$pid" ] && [ "$pid" != "0" ]; then
                local rss; rss=$(ps -o rss= -p "$pid" 2>/dev/null || echo "")
                [ -n "$rss" ] && mem="  $(( rss / 1024 ))MB"
            fi
        fi
        if [ "$status" = "active" ]; then
            echo -e "  ${GREEN}* ${label}  active${NC}${mem}"
        elif [ "$status" != "activating" ] && _svc_exited_cleanly "$svc"; then
            echo -e "  ${CYAN}- ${label}  stopped (clean exit)${NC}"
        elif [ "$status" = "activating" ]; then
            echo -e "  ${YELLOW}~ ${label}  activating${NC}"
        else
            echo -e "  ${RED}x ${label}  ${status}${NC}"
        fi
    done
    echo "============================================"
    echo ""
}

###########################################
# LOGS - static view
###########################################

show_logs() {
    local svc="$1"; local lines="${2:-40}"
    _validate_svc "$svc"
    journalctl -u "${svc}.service" --no-pager -n "$lines"
}

###########################################
# TAIL - live follow
###########################################

tail_logs() {
    local target="${1:-}"
    if [ -n "$target" ]; then
        _validate_svc "$target"
        echo -e "${CYAN}Following logs for ${target} (Ctrl+C to stop)${NC}"
        echo ""
        journalctl -fu "${target}.service"
    else
        local units=""
        for svc in "${SERVICES[@]}"; do
            units="${units} -u ${svc}.service"
        done
        echo -e "${CYAN}Following logs for all Rutba services (Ctrl+C to stop)${NC}"
        echo ""
        eval journalctl -f $units
    fi
}

###########################################
# DIAGNOSE - problem detection
###########################################

diagnose_services() {
    local problems=0

    echo ""
    echo -e "${BOLD}============================================${NC}"
    echo -e "${BOLD}  Rutba ERP - Service Diagnostics${NC}"
    echo -e "${BOLD}============================================${NC}"
    echo ""

    # -- 1. Active build ---
    echo -e "${BOLD}[1/7] Active Build${NC}"
    local active_dir; active_dir=$(get_active_build_dir)
    if [ -z "$active_dir" ]; then
        echo -e "  ${RED}[FAIL] No active build (${ACTIVE_LINK} missing/broken)${NC}"
        problems=$((problems + 1))
    elif [ ! -d "$active_dir" ]; then
        echo -e "  ${RED}[FAIL] Active link -> missing dir: ${active_dir}${NC}"
        problems=$((problems + 1))
    else
        echo -e "  ${GREEN}[OK] ${active_dir}${NC}"
        if [ ! -f "${active_dir}/package.json" ]; then
            echo -e "  ${RED}[FAIL] package.json missing${NC}"; problems=$((problems + 1))
        fi
        if [ ! -f "${active_dir}/scripts/js/load-env.js" ]; then
            echo -e "  ${RED}[FAIL] scripts/js/load-env.js missing${NC}"; problems=$((problems + 1))
        fi
        if [ ! -d "${active_dir}/node_modules" ]; then
            echo -e "  ${RED}[FAIL] node_modules missing${NC}"; problems=$((problems + 1))
        fi
    fi
    echo ""

    # -- 2. Service status ---
    echo -e "${BOLD}[2/7] Service Status${NC}"
    local failed_svcs=()
    for svc in "${SERVICES[@]}"; do
        # `is-active` exits non-zero for anything but "active" while still
        # printing the real state, so `|| echo inactive` would append a second
        # line and turn "activating" into "activating\ninactive".
        local status; status=$(systemctl is-active "${svc}.service" 2>/dev/null || true); status="${status:-inactive}"
        if [ "$status" = "active" ]; then
            echo -e "  ${GREEN}[OK] ${svc}${NC}"
        elif [ "$status" = "activating" ]; then
            echo -e "  ${YELLOW}[..] ${svc}: activating${NC}"
        elif _svc_exited_cleanly "$svc"; then
            # Not every unit is meant to stay up. The marketplace worker exits 0
            # on purpose when WORKER_ENABLED=false; flagging that as a failure
            # trains people to ignore this whole report.
            echo -e "  ${CYAN}[--] ${svc}: stopped (clean exit)${NC}"
        else
            echo -e "  ${RED}[FAIL] ${svc}: ${status}${NC}"
            failed_svcs+=("$svc")
            problems=$((problems + 1))
        fi
    done
    echo ""

    # -- 3. Crash loops ---
    echo -e "${BOLD}[3/7] Crash Loop Detection${NC}"
    local crash_found=false
    for svc in "${SERVICES[@]}"; do
        local restarts; restarts=$(systemctl show "${svc}.service" --property=NRestarts --value 2>/dev/null || echo "0")
        if [ "${restarts:-0}" -gt 3 ]; then
            echo -e "  ${RED}[FAIL] ${svc}: restarted ${restarts} times${NC}"
            problems=$((problems + 1)); crash_found=true
        fi
    done
    [ "$crash_found" = false ] && echo -e "  ${GREEN}[OK] No crash loops detected${NC}"
    echo ""

    # -- 4. Recent errors ---
    echo -e "${BOLD}[4/7] Recent Errors (last 10 min)${NC}"
    local error_found=false
    if [ ${#failed_svcs[@]} -gt 0 ]; then
        for svc in "${failed_svcs[@]}"; do
            echo -e "  ${YELLOW}-- ${svc} --${NC}"
            local errs; errs=$(journalctl -u "${svc}.service" --since "10 min ago" --no-pager -p err 2>/dev/null | tail -5)
            if [ -n "$errs" ]; then
                echo "$errs" | sed 's/^/    /'
                error_found=true
            else
                journalctl -u "${svc}.service" --no-pager -n 3 2>/dev/null | sed 's/^/    /'
            fi
            echo ""
        done
    fi
    if [ "$error_found" = false ] && [ ${#failed_svcs[@]} -eq 0 ]; then
        echo -e "  ${GREEN}[OK] No recent errors${NC}"
        echo ""
    fi

    # -- 5. Disk space ---
    echo -e "${BOLD}[5/7] Disk Space${NC}"
    local usage; usage=$(df -h "$BUILDS_DIR" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%')
    local disk_info; disk_info=$(df -h "$BUILDS_DIR" 2>/dev/null | tail -1 | awk '{printf "%s used of %s (%s)", $3, $2, $5}')
    if [ -n "${usage:-}" ]; then
        if [ "$usage" -gt 90 ]; then
            echo -e "  ${RED}[FAIL] Disk nearly full: ${disk_info}${NC}"; problems=$((problems + 1))
        elif [ "$usage" -gt 80 ]; then
            echo -e "  ${YELLOW}[WARN] Disk usage high: ${disk_info}${NC}"
        else
            echo -e "  ${GREEN}[OK] ${disk_info}${NC}"
        fi
    else
        echo -e "  ${YELLOW}[WARN] Could not determine disk usage${NC}"
    fi
    echo ""

    # -- 6. Memory ---
    echo -e "${BOLD}[6/7] Memory${NC}"
    local mem_info; mem_info=$(free -h 2>/dev/null | awk '/^Mem:/{printf "Used: %s / Total: %s (Available: %s)", $3, $2, $7}')
    if [ -n "${mem_info:-}" ]; then
        local avail_mb; avail_mb=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}')
        if [ -n "$avail_mb" ] && [ "$avail_mb" -lt 256 ]; then
            echo -e "  ${RED}[FAIL] Low memory - ${mem_info}${NC}"; problems=$((problems + 1))
        elif [ -n "$avail_mb" ] && [ "$avail_mb" -lt 512 ]; then
            echo -e "  ${YELLOW}[WARN] ${mem_info}${NC}"
        else
            echo -e "  ${GREEN}[OK] ${mem_info}${NC}"
        fi
    else
        echo -e "  ${YELLOW}[WARN] Could not determine memory usage${NC}"
    fi
    echo ""

    # -- 7. Unit file integrity ---
    echo -e "${BOLD}[7/7] Unit File Integrity${NC}"
    local unit_ok=true
    for svc in "${SERVICES[@]}"; do
        local unit_file="${SYSTEMD_DIR}/${svc}.service"
        if [ ! -f "$unit_file" ]; then
            echo -e "  ${RED}[FAIL] Missing: ${unit_file}${NC}"
            problems=$((problems + 1)); unit_ok=false; continue
        fi
        if [ -n "${active_dir:-}" ]; then
            local wd; wd=$(grep '^WorkingDirectory=' "$unit_file" 2>/dev/null | cut -d'=' -f2)
            # write_all_units deliberately points WorkingDirectory at the
            # ACTIVE_LINK symlink so a rollback is just a symlink flip.
            # get_active_build_dir returns the RESOLVED path, so compare
            # resolved-to-resolved or every healthy unit warns.
            local wd_real; wd_real=$(readlink -f "$wd" 2>/dev/null || echo "$wd")
            if [ -n "$wd" ] && [ "$wd_real" != "$active_dir" ]; then
                echo -e "  ${YELLOW}[WARN] ${svc}: unit -> ${wd} (${wd_real}) but active is ${active_dir}${NC}"
            fi
        fi
        if ! grep -q 'scripts/js/load-env.js' "$unit_file" 2>/dev/null; then
            echo -e "  ${RED}[FAIL] ${svc}: ExecStart missing scripts/js/load-env.js${NC}"
            problems=$((problems + 1)); unit_ok=false
        fi
    done
    [ "$unit_ok" = true ] && echo -e "  ${GREEN}[OK] All unit files present and valid${NC}"
    echo ""

    # -- Summary ---
    echo "============================================"
    if [ "$problems" -eq 0 ]; then
        echo -e "  ${GREEN}All checks passed - no problems detected${NC}"
    else
        echo -e "  ${RED}${problems} problem(s) detected${NC}"
        echo ""
        echo "  Suggested actions:"
        if [ ${#failed_svcs[@]} -gt 0 ]; then
            echo "    - Check logs:      sudo bash $0 logs <service>"
            echo "    - Restart:         sudo bash $0 restart"
            echo "    - Rebuild units:   sudo bash $0 rebuild"
        fi
    fi
    echo "============================================"
    echo ""
}

###########################################
# USAGE
###########################################

show_usage() {
    echo ""
    echo "============================================"
    echo "  Rutba ERP - Service Manager"
    echo "============================================"
    echo ""
    echo "  Usage:"
    echo "    sudo bash $0 <command> [options]"
    echo ""
    echo "  Commands:"
    echo "    start   [service]           Start all or one service"
    echo "    stop    [service]           Stop all or one service"
    echo "    restart [service]           Restart all or one service"
    echo "    status                      Show status of all services"
    echo "    rebuild [build_dir]         Re-write systemd unit files"
    echo "                                (defaults to current active build)"
    echo "    logs    <service> [lines]   Show recent journal logs (default: 40)"
    echo "    tail    [service]           Live-follow logs (Ctrl+C to stop)"
    echo "                                (omit service to follow all)"
    echo "    diagnose                    Detect common problems"
    echo "    seed    [seed args]         Wait for Strapi to answer /_health,"
    echo "                                then run the seed engine (see"
    echo "                                scripts/rutba_seed.sh for tuning vars)"
    echo "    help                        Show this usage information"
    echo ""
    echo "  Environment variables (set in /etc/environment or export):"
    echo "    RUTBA_BUILDS_DIR    Build storage       (default: ${BUILDS_DIR})"
    echo "    RUTBA_ACTIVE_LINK   Active symlink       (default: ${ACTIVE_LINK})"
    echo "    RUTBA_RUN_USER      Service user         (default: ${RUN_USER})"
    echo "    RUTBA_RUN_GROUP     Service group        (default: ${RUN_GROUP})"
    echo "    RUTBA_SYSTEMD_DIR   Unit file directory   (default: ${SYSTEMD_DIR})"
    echo "    RUTBA_LOG_FILE      Deploy log path       (default: ${LOG_FILE})"
    echo ""
    echo "  Services (${#SERVICES[@]}):"
    for svc in "${SERVICES[@]}"; do
        printf '    %-28s port %s\n' "$svc" "${SVC_PORT[$svc]:--}"
    done
    echo ""
    echo "  Examples:"
    echo "    sudo bash $0 status"
    echo "    sudo bash $0 restart"
    echo "    sudo bash $0 restart rutba_web"
    echo "    sudo bash $0 rebuild"
    echo "    sudo bash $0 logs rutba_pos_strapi 100"
    echo "    sudo bash $0 tail rutba_pos_strapi"
    echo "    sudo bash $0 tail"
    echo "    sudo bash $0 diagnose"
    echo ""
}

###########################################
# CLI DISPATCHER
###########################################

# When sourced, skip the dispatcher.
if [ "${RUTBA_SERVICES_SOURCED:-0}" = "1" ]; then
    return 0 2>/dev/null || true
fi

# Direct invocation - require root
if [ "$(id -u)" -ne 0 ]; then
    abort "This script must be run as root (use sudo)."
fi

COMMAND="${1:-}"

case "$COMMAND" in
    start)
        start_services "${2:-}"
        show_service_status
        ;;
    stop)
        stop_services "${2:-}"
        show_service_status
        ;;
    restart)
        stop_services "${2:-}"
        start_services "${2:-}"
        show_service_status
        ;;
    status)
        show_service_status
        ;;
    rebuild)
        write_all_units "${2:-}"
        show_service_status
        ;;
    logs)
        SVC_NAME="${2:-}"
        [ -z "$SVC_NAME" ] && { echo -e "${RED}Error: service name required${NC}"; show_usage; exit 1; }
        show_logs "$SVC_NAME" "${3:-40}"
        ;;
    tail)
        tail_logs "${2:-}"
        ;;
    diagnose|diag)
        diagnose_services
        ;;
    seed)
        shift
        bash "${_RUTBA_SVC_DIR}/rutba_seed.sh" "$@"
        ;;
    help|--help|-h)
        show_usage
        ;;
    "")
        echo -e "${RED}Error: no command specified${NC}"
        show_usage
        exit 1
        ;;
    *)
        echo -e "${RED}Error: unknown command '${COMMAND}'${NC}"
        show_usage
        exit 1
        ;;
esac