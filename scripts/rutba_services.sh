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
#   help                         Show this usage information
#
###########################################

# Source shared environment
_RUTBA_SVC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_RUTBA_SVC_DIR}/rutba_deployed_environment.sh"

###########################################
# SERVICE DEFINITIONS
###########################################

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
    [rutba_pos_strapi]="Rutba ERP - Strapi API"
    [rutba_pos_auth]="Rutba ERP - Auth Portal (pos-auth)"
    [rutba_pos_stock]="Rutba ERP - Stock Management (pos-stock)"
    [rutba_pos_sale]="Rutba ERP - Point of Sale (pos-sale)"
    [rutba_web]="Rutba ERP - Public Website (rutba-web)"
    [rutba_web_user]="Rutba ERP - My Orders (rutba-web-user)"
    [rutba_crm]="Rutba ERP - CRM (rutba-crm)"
    [rutba_hr]="Rutba ERP - Human Resources (rutba-hr)"
    [rutba_accounts]="Rutba ERP - Accounting (rutba-accounts)"
    [rutba_payroll]="Rutba ERP - Payroll (rutba-payroll)"
    [rutba_cms]="Rutba ERP - Content Management (rutba-cms)"
    [rutba_social]="Rutba ERP - Social Media (rutba-social)"
    [rutba_pos_desk]="Rutba ERP - Legacy Desk (pos-desk)"
)

###########################################
# HELPERS
###########################################

_validate_svc() {
    local svc="$1"
    for s in "${SERVICES[@]}"; do [ "$s" = "$svc" ] && return 0; done
    echo -e "${RED}Unknown service: ${svc}${NC}"
    echo ""
    echo "  Available services:"
    for s in "${SERVICES[@]}"; do echo "    $s"; done
    exit 1
}

###########################################
# UNIT WRITER
###########################################

write_all_units() {
    local BUILD_DEST_DIR="$1"
    [ -d "$BUILD_DEST_DIR" ] || abort "Build directory does not exist: ${BUILD_DEST_DIR}"

    local NODE_BIN; NODE_BIN=$(which node)
    local NPM_BIN;  NPM_BIN=$(which npm)

    for svc in "${SERVICES[@]}"; do
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
WorkingDirectory=${BUILD_DEST_DIR}
ExecStart=${NODE_BIN} ${BUILD_DEST_DIR}/scripts/js/load-env.js -- ${NPM_BIN} ${CMD}
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

    systemctl daemon-reload
    log_ok "Systemd units written -> ${BUILD_DEST_DIR}"
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
        # Start Strapi first (other apps may depend on its API)
        systemctl start rutba_pos_strapi.service
        sleep 3
        for svc in "${SERVICES[@]}"; do
            if [ "$svc" != "rutba_pos_strapi" ]; then
                systemctl start "${svc}.service" 2>/dev/null || log_warn "Failed to start ${svc}"
            fi
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
        local status; status=$(systemctl is-active "${svc}.service" 2>/dev/null || echo "inactive")
        local mem=""
        if [ "$status" = "active" ]; then
            local pid; pid=$(systemctl show "${svc}.service" --property=MainPID --value 2>/dev/null || echo "")
            if [ -n "$pid" ] && [ "$pid" != "0" ]; then
                local rss; rss=$(ps -o rss= -p "$pid" 2>/dev/null || echo "")
                [ -n "$rss" ] && mem="  $(( rss / 1024 ))MB"
            fi
        fi
        if [ "$status" = "active" ]; then
            echo -e "  ${GREEN}* ${svc}: active${NC}${mem}"
        elif [ "$status" = "activating" ]; then
            echo -e "  ${YELLOW}~ ${svc}: activating${NC}"
        else
            echo -e "  ${RED}x ${svc}: ${status}${NC}"
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
        local status; status=$(systemctl is-active "${svc}.service" 2>/dev/null || echo "inactive")
        if [ "$status" = "active" ]; then
            echo -e "  ${GREEN}[OK] ${svc}${NC}"
        elif [ "$status" = "activating" ]; then
            echo -e "  ${YELLOW}[..] ${svc}: activating${NC}"
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
            if [ -n "$wd" ] && [ "$wd" != "$active_dir" ]; then
                echo -e "  ${YELLOW}[WARN] ${svc}: unit -> ${wd} but active is ${active_dir}${NC}"
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
    echo "  Services:"
    for svc in "${SERVICES[@]}"; do echo "    ${svc}"; done
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
        BUILD_TARGET="${2:-}"
        if [ -z "$BUILD_TARGET" ]; then
            BUILD_TARGET=$(get_active_build_dir)
            [ -z "$BUILD_TARGET" ] && abort "No active build found and no build directory specified."
            log "Using active build: ${BUILD_TARGET}"
        fi
        write_all_units "$BUILD_TARGET"
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