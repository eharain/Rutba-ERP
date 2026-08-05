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
)

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
