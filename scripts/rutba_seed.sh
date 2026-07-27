#!/bin/bash

###########################################
# Rutba ERP - Post-deploy Seeding
###########################################
#
# Runs the seed engine against the active build once the Strapi
# service is actually serving requests.
#
# WHY THE WAIT
#   Seeding runs the same registry + engine the rutba-seed control app
#   (:4018) drives, via the standalone runner pos-strapi/scripts/seed.js.
#   That runner boots its own load-only Strapi instance, so it must not
#   start until the rutba_pos_strapi service has finished its own boot -
#   schema sync, migrations and the api-pro descriptor seeder all run
#   there. Starting both at once makes them race on the same tables.
#   So: hold for a grace delay, then poll /_health until the API answers.
#
# USAGE
#   sudo bash scripts/rutba_seed.sh                      # partial run, all entries (default)
#   sudo bash scripts/rutba_seed.sh --essential          # essential entries only
#   sudo bash scripts/rutba_seed.sh --mode=full          # force re-apply where supported
#   sudo bash scripts/rutba_seed.sh --only=accounting,shipping
#   RUTBA_SEED_BUILD_DIR=/path/to/build bash scripts/rutba_seed.sh
#
# TUNING (environment variables)
#   RUTBA_SEED_ENABLED       1 (default) | 0 to skip seeding entirely
#   RUTBA_SEED_DELAY         Grace delay before the first probe (default 20s)
#   RUTBA_SEED_TIMEOUT       Max seconds to wait for Strapi        (default 300)
#   RUTBA_SEED_ARGS          Default seed args when none are passed on the CLI
#   RUTBA_SEED_BUILD_DIR     Build dir to seed (default: the active build)
#
# Called automatically at the end of rutba_deploy.sh and rutba_rollback.sh.
# A seeding failure NEVER fails the deploy - services are already live by
# then - but it is logged loudly and reported in the deploy summary.
###########################################

set -uo pipefail

_RUTBA_SEED_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${_RUTBA_SEED_DIR}/rutba_deployed_environment.sh"

SEED_ENABLED="${RUTBA_SEED_ENABLED:-1}"
SEED_DELAY="${RUTBA_SEED_DELAY:-20}"
SEED_TIMEOUT="${RUTBA_SEED_TIMEOUT:-300}"
SEED_POLL_INTERVAL=5

# CLI args win; otherwise fall back to RUTBA_SEED_ARGS; otherwise a plain
# partial run, which is idempotent across the whole registry and therefore
# picks up seeders added since the last deploy.
SEED_ARGS=("$@")
if [ ${#SEED_ARGS[@]} -eq 0 ] && [ -n "${RUTBA_SEED_ARGS:-}" ]; then
    # shellcheck disable=SC2206  # word splitting is intended here
    SEED_ARGS=(${RUTBA_SEED_ARGS})
fi

###########################################
# RESOLVE BUILD DIRECTORY
###########################################

SEED_BUILD_DIR="${RUTBA_SEED_BUILD_DIR:-}"
if [ -z "$SEED_BUILD_DIR" ]; then
    SEED_BUILD_DIR=$(get_active_build_dir)
fi

###########################################
# RESOLVE STRAPI ORIGIN
###########################################
# Read POS_STRAPI__PORT out of the build's env files (the same files
# load-env.js reads) so the probe follows a non-default port.

resolve_strapi_port() {
    local dir="$1" port="" envfile
    local environment="production"

    if [ -f "${dir}/.env" ]; then
        local from_root
        from_root=$(grep -E '^[[:space:]]*ENVIRONMENT[[:space:]]*=' "${dir}/.env" 2>/dev/null \
            | tail -1 | cut -d'=' -f2- | tr -d ' "'"'" )
        [ -n "$from_root" ] && environment="$from_root"
    fi

    for envfile in "${dir}/.env.${environment}" "${dir}/.env"; do
        [ -f "$envfile" ] || continue
        port=$(grep -E '^[[:space:]]*POS_STRAPI__PORT[[:space:]]*=' "$envfile" 2>/dev/null \
            | tail -1 | cut -d'=' -f2- | tr -d ' "'"'" )
        [ -n "$port" ] && break
    done

    echo "${port:-4010}"
}

###########################################
# HEALTH PROBE
###########################################
# Strapi answers /_health with 204 once the HTTP server is listening and
# bootstrap has completed. Fall back to a raw TCP connect when curl is
# unavailable, which is weaker but still better than a blind sleep.

strapi_is_up() {
    local url="$1" host="$2" port="$3" code

    if command -v curl >/dev/null 2>&1; then
        code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$url" 2>/dev/null || echo "000")
        case "$code" in
            200|204) return 0 ;;
            *)       return 1 ;;
        esac
    fi

    (exec 3<>"/dev/tcp/${host}/${port}") >/dev/null 2>&1 && return 0
    return 1
}

wait_for_strapi() {
    local host="$1" port="$2"
    local url="http://${host}:${port}/_health"
    local waited=0

    log "Waiting ${SEED_DELAY}s for rutba_pos_strapi to settle before probing ${url} ..."
    sleep "$SEED_DELAY"

    while [ "$waited" -lt "$SEED_TIMEOUT" ]; do
        if strapi_is_up "$url" "$host" "$port"; then
            log_ok "Strapi is answering on ${host}:${port} (after ${waited}s of polling)."
            return 0
        fi

        # A dead unit will never come up - fail fast instead of burning the
        # full timeout.
        local unit_state
        unit_state=$(systemctl is-active rutba_pos_strapi.service 2>/dev/null || echo "unknown")
        if [ "$unit_state" = "failed" ]; then
            log_err "rutba_pos_strapi.service is in 'failed' state - aborting the wait."
            return 1
        fi

        sleep "$SEED_POLL_INTERVAL"
        waited=$((waited + SEED_POLL_INTERVAL))
    done

    log_err "Strapi did not answer on ${host}:${port} within ${SEED_TIMEOUT}s."
    return 1
}

###########################################
# MAIN
###########################################

echo ""
echo "============================================"
echo "  Rutba ERP - Post-deploy Seeding"
echo "============================================"

if [ "$SEED_ENABLED" != "1" ]; then
    log_warn "RUTBA_SEED_ENABLED=${SEED_ENABLED} - skipping seeding."
    exit 0
fi

if [ -z "$SEED_BUILD_DIR" ] || [ ! -d "$SEED_BUILD_DIR" ]; then
    log_err "No build directory to seed (active link: ${ACTIVE_LINK})."
    exit 1
fi

if [ ! -f "${SEED_BUILD_DIR}/pos-strapi/scripts/seed.js" ]; then
    log_err "Seed runner not found: ${SEED_BUILD_DIR}/pos-strapi/scripts/seed.js"
    exit 1
fi

STRAPI_PORT=$(resolve_strapi_port "$SEED_BUILD_DIR")
STRAPI_HOST="127.0.0.1"

log "Build:  ${SEED_BUILD_DIR}"
log "Strapi: ${STRAPI_HOST}:${STRAPI_PORT}"
if [ ${#SEED_ARGS[@]} -gt 0 ]; then
    log "Args:   ${SEED_ARGS[*]}"
else
    log "Args:   (none - partial idempotent run of every registry entry)"
fi

if ! wait_for_strapi "$STRAPI_HOST" "$STRAPI_PORT"; then
    log_err "Skipping seeding - Strapi never became ready."
    log "  Check:  sudo bash ${_RUTBA_SEED_DIR}/rutba_services.sh logs rutba_pos_strapi 100"
    log "  Re-run: sudo bash ${_RUTBA_SEED_DIR}/rutba_seed.sh"
    exit 1
fi

log "Running the seed engine ..."

SEED_EXIT=0
(
    cd "$SEED_BUILD_DIR" || exit 1
    if [ ${#SEED_ARGS[@]} -gt 0 ]; then
        npm run seed -- "${SEED_ARGS[@]}"
    else
        npm run seed
    fi
) || SEED_EXIT=$?

if [ "$SEED_EXIT" -eq 0 ]; then
    log_ok "Seeding completed."
else
    log_err "Seeding failed (exit=${SEED_EXIT}). The deployment itself is unaffected."
    log "  Inspect the report above, or re-run:"
    log "    sudo bash ${_RUTBA_SEED_DIR}/rutba_seed.sh"
    log "  Or drive it from the seeding control app: ${NEXT_PUBLIC_SEED_URL:-http://<host>:4018}"
fi

echo "============================================"
echo ""

exit "$SEED_EXIT"
