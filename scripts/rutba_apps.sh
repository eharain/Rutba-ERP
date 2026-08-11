#!/bin/bash

###########################################
# Rutba ERP - App / Service Registry
###########################################
#
# SINGLE SOURCE OF TRUTH for every deployable Rutba ERP service.
#
# Sourced by:
#   scripts/rutba_services.sh          (systemd unit writer + start/stop/status)
#   scripts/setup-systemd-services.sh  (first-time unit installer)
#   scripts/rutba_log_rotate.sh        (journal vacuum per unit)
#
# WHEN YOU ADD A NEW APP, edit ONLY this file:
#   1. Add the unit name to RUTBA_SERVICES (order = start order).
#   2. Add its npm invocation to RUTBA_SVC_CMD.
#   3. Add a human description to RUTBA_SVC_DESC.
#   4. Add its listen port to RUTBA_SVC_PORT ("-" for portless workers).
#
# Also remember the non-shell side of a new app:
#   - package.json          dev:<name> / start:<name> / build:<name>
#   - .env.<environment>    <PREFIX>__PORT + NEXT_PUBLIC_<NAME>_URL
#   - scripts/js/env-config.js  NEXT_PUBLIC_<NAME>_URL in GLOBAL_VARS
#   - Dockerfile + docker-compose.yml  build target + service
#   - dev-start.bat         a dev window
#
# USAGE:
#   _DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
#   source "${_DIR}/rutba_apps.sh"
#
###########################################

# Guard: only source once.
if [ "${_RUTBA_APPS_LOADED:-0}" = "1" ]; then
    return 0 2>/dev/null || true
fi
_RUTBA_APPS_LOADED=1

###########################################
# SERVICE LIST (start order)
###########################################
# Strapi first - every other app talks to its API.

RUTBA_SERVICES=(
    rutba_pos_strapi
    rutba_core
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
    rutba_rider
    rutba_order_management
    rutba_manufacturing
    rutba_ess
    rutba_marketplace
    rutba_marketplace_worker
    rutba_inventory
    rutba_seed
    rutba_campaigns
    rutba_mail
    rutba_users
    rutba_helpdesk
)

###########################################
# npm INVOCATION (appended to `npm`)
###########################################

declare -A RUTBA_SVC_CMD=(
    [rutba_pos_strapi]="--prefix pos-strapi run start"
    # rutba-core is not an npm workspace (own install via --prefix, same as
    # pos-strapi) — see the strangler-migration notes.
    [rutba_core]="--prefix rutba-core run start"
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
    [rutba_rider]="run start --workspace=rutba-rider"
    [rutba_order_management]="run start --workspace=rutba-order-management"
    [rutba_manufacturing]="run start --workspace=rutba-manufacturing"
    [rutba_ess]="run start --workspace=rutba-ess"
    [rutba_marketplace]="run start --workspace=rutba-marketplace"
    [rutba_marketplace_worker]="run worker --workspace=rutba-marketplace"
    [rutba_inventory]="run start --workspace=rutba-inventory"
    [rutba_seed]="run start --workspace=rutba-seed"
    [rutba_campaigns]="run start --workspace=rutba-campaigns"
    [rutba_mail]="run start --workspace=rutba-mail"
    [rutba_users]="run start --workspace=rutba-users"
    [rutba_helpdesk]="run start --workspace=rutba-helpdesk"
)

###########################################
# DESCRIPTIONS (systemd Description=)
###########################################

declare -A RUTBA_SVC_DESC=(
    [rutba_pos_strapi]="Rutba ERP - Strapi API (pos-strapi)"
    [rutba_core]="Rutba ERP - Core API (rutba-core, strangler replacement for Strapi)"
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
    [rutba_rider]="Rutba ERP - Rider App (rutba-rider)"
    [rutba_order_management]="Rutba ERP - Order Management (rutba-order-management)"
    [rutba_manufacturing]="Rutba ERP - Manufacturing (rutba-manufacturing)"
    [rutba_ess]="Rutba ERP - Employee Self-Service (rutba-ess)"
    [rutba_marketplace]="Rutba ERP - Marketplace (rutba-marketplace)"
    [rutba_marketplace_worker]="Rutba ERP - Marketplace Sync Worker (rutba-marketplace)"
    [rutba_inventory]="Rutba ERP - Inventory Management (rutba-inventory)"
    [rutba_seed]="Rutba ERP - Seeding Control (rutba-seed)"
    [rutba_campaigns]="Rutba ERP - Campaigns (rutba-campaigns)"
    [rutba_mail]="Rutba ERP - Mail (rutba-mail)"
    [rutba_users]="Rutba ERP - User Management (rutba-users)"
    [rutba_helpdesk]="Rutba ERP - Helpdesk (rutba-helpdesk)"
)

###########################################
# DEFAULT LISTEN PORTS
###########################################
# Informational only - the real port comes from <PREFIX>__PORT in
# .env.<environment> via scripts/js/load-env.js. Used by `status`
# and `diagnose` to spot a unit that never bound its port.
# "-" = background worker with no HTTP surface.

declare -A RUTBA_SVC_PORT=(
    [rutba_pos_strapi]="4010"
    [rutba_core]="4020"
    [rutba_pos_auth]="4003"
    [rutba_pos_stock]="4001"
    [rutba_pos_sale]="4002"
    [rutba_web]="4000"
    [rutba_web_user]="4004"
    [rutba_crm]="4005"
    [rutba_hr]="4006"
    [rutba_accounts]="4007"
    [rutba_payroll]="4008"
    [rutba_cms]="4009"
    [rutba_social]="4011"
    [rutba_rider]="4012"
    [rutba_order_management]="4013"
    [rutba_manufacturing]="4014"
    [rutba_ess]="4015"
    [rutba_marketplace]="4016"
    [rutba_marketplace_worker]="-"
    [rutba_inventory]="4017"
    [rutba_seed]="4018"
    [rutba_campaigns]="4019"
    [rutba_mail]="4021"
    [rutba_users]="4022"
    # 4019 was in the helpdesk spec but rutba_campaigns already owns it; moved to
    # 4023 here, in roles.js APP_URLS, and in .env.* (RUTBA_HELPDESK__PORT +
    # NEXT_PUBLIC_HELPDESK_URL).
    [rutba_helpdesk]="4023"
)

###########################################
# BACKEND SELECTION
###########################################
# Which API server this deployment runs. pos-strapi and rutba-core speak the
# same wire contract against the same database, so this is the only switch that
# decides which process serves the apps:
#
#   strapi  pos-strapi only                    (default — unchanged behaviour)
#   both    both up, apps still on Strapi      (bake: core runs, serves nobody)
#   core    rutba-core only
#
# Set RUTBA_BACKEND in the master .env at the builds root, or inline for a
# single run:   RUTBA_BACKEND=both sudo bash scripts/rutba_deploy.sh
#
# Filtering here rather than in rutba_deploy.sh keeps the registry the single
# source: rutba_services.sh, rutba_rollback.sh, setup-systemd-services.sh and
# rutba_log_rotate.sh all read RUTBA_SERVICES, and all of them must agree about
# which units exist. A unit dropped here is never written, started or rotated.

# Read a value out of the deployment's env files, newest environment first —
# the same two files load-env.js reads, and the same lookup rutba_seed.sh
# already does for the Strapi port.
rutba_env_value() {
    local key="$1" dir="${2:-${BUILDS_DIR:-}}" environment="production" value="" envfile from_root
    [ -n "$dir" ] || return 0
    if [ -f "${dir}/.env" ]; then
        from_root=$(grep -E "^[[:space:]]*ENVIRONMENT[[:space:]]*=" "${dir}/.env" 2>/dev/null \
            | tail -1 | cut -d'=' -f2- | tr -d " \"'")
        [ -n "$from_root" ] && environment="$from_root"
    fi
    for envfile in "${dir}/.env.${environment}" "${dir}/.env"; do
        [ -f "$envfile" ] || continue
        value=$(grep -E "^[[:space:]]*${key}[[:space:]]*=" "$envfile" 2>/dev/null \
            | tail -1 | cut -d'=' -f2- | tr -d " \"'")
        [ -n "$value" ] && break
    done
    echo "$value"
}

RUTBA_BACKEND="${RUTBA_BACKEND:-$(rutba_env_value RUTBA_BACKEND)}"
RUTBA_BACKEND="${RUTBA_BACKEND:-strapi}"
# Exported so child scripts the deploy shells out to (rutba_seed.sh above all)
# inherit the same answer instead of re-deriving it — or worse, defaulting.
export RUTBA_BACKEND

case "$RUTBA_BACKEND" in
    strapi|core|both) ;;
    *)
        echo "rutba_apps.sh: RUTBA_BACKEND='${RUTBA_BACKEND}' is not one of strapi|core|both" >&2
        return 1 2>/dev/null || exit 1
        ;;
esac

_rutba_drop_service() {
    local drop="$1" svc
    local kept=()
    for svc in "${RUTBA_SERVICES[@]}"; do
        [ "$svc" = "$drop" ] || kept+=("$svc")
    done
    RUTBA_SERVICES=("${kept[@]}")
}

case "$RUTBA_BACKEND" in
    strapi) _rutba_drop_service rutba_core ;;
    core)   _rutba_drop_service rutba_pos_strapi ;;
esac

###########################################
# SELF-CHECK
###########################################
# Catch a half-finished registry edit (unit added to RUTBA_SERVICES
# but no command/description) before it becomes a broken unit file.

rutba_apps_validate() {
    local svc missing=0
    for svc in "${RUTBA_SERVICES[@]}"; do
        [ -n "${RUTBA_SVC_CMD[$svc]:-}"  ] || { echo "rutba_apps.sh: missing RUTBA_SVC_CMD[$svc]"  >&2; missing=1; }
        [ -n "${RUTBA_SVC_DESC[$svc]:-}" ] || { echo "rutba_apps.sh: missing RUTBA_SVC_DESC[$svc]" >&2; missing=1; }
        [ -n "${RUTBA_SVC_PORT[$svc]:-}" ] || { echo "rutba_apps.sh: missing RUTBA_SVC_PORT[$svc]" >&2; missing=1; }
    done
    return $missing
}

rutba_apps_validate || {
    echo "rutba_apps.sh: registry is incomplete - fix the entries above before deploying." >&2
    return 1 2>/dev/null || exit 1
}

# Two mistakes the backend switch makes possible, both of which cost a whole
# deploy cycle to discover by hand.
rutba_backend_validate() {
    local crons api_url api_port want_port strapi_port bad=0

    # 1. Crons must never fire in both servers. Core keeps them dormant unless
    #    RUTBA_CORE_CRONS=1, so `both` plus that flag is the dangerous pair —
    #    two processes running the same expiry sweep against one database.
    crons="$(rutba_env_value RUTBA_CORE__RUTBA_CORE_CRONS)"
    [ -n "$crons" ] || crons="$(rutba_env_value RUTBA_CORE_CRONS)"
    if [ "$RUTBA_BACKEND" = "both" ] && [ "$crons" = "1" ]; then
        echo "rutba_apps.sh: RUTBA_BACKEND=both with RUTBA_CORE_CRONS=1 — both servers would" >&2
        echo "  schedule the same jobs. Leave crons with Strapi while core bakes." >&2
        bad=1
    fi
    if [ "$RUTBA_BACKEND" = "core" ] && [ "$crons" != "1" ]; then
        echo "rutba_apps.sh: warning — core is the only backend but RUTBA_CORE_CRONS is not 1," >&2
        echo "  so nothing will run the scheduled jobs (expiry sweep, low-stock, social, SLA)." >&2
    fi

    # 2. The apps bake NEXT_PUBLIC_API_URL in at build time, so a mismatch here
    #    ships nineteen apps pointing at a server this deploy does not start —
    #    and fixing it means another full rebuild, not an env edit.
    api_url="$(rutba_env_value NEXT_PUBLIC_API_URL)"
    api_port=$(printf '%s' "$api_url" | sed -n 's#.*://[^/:]*:\([0-9]\{1,\}\).*#\1#p')
    if [ -n "$api_port" ]; then
        strapi_port="$(rutba_env_value POS_STRAPI__PORT)"; strapi_port="${strapi_port:-4010}"
        case "$RUTBA_BACKEND" in
            core)   want_port="${RUTBA_SVC_PORT[rutba_core]}" ;;
            strapi) want_port="$strapi_port" ;;
            both)   want_port="" ;;
        esac
        if [ -n "$want_port" ] && [ "$api_port" != "$want_port" ]; then
            echo "rutba_apps.sh: NEXT_PUBLIC_API_URL points at port ${api_port}, but RUTBA_BACKEND=${RUTBA_BACKEND}" >&2
            echo "  serves on ${want_port}. The apps would be built against a server this deploy does not run." >&2
            bad=1
        fi
    fi
    return $bad
}

rutba_backend_validate || {
    echo "rutba_apps.sh: backend selection is inconsistent - fix the above before deploying." >&2
    return 1 2>/dev/null || exit 1
}
