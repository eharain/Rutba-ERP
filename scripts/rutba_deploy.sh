#!/bin/bash

set -euo pipefail

###########################################
# Rutba ERP — Offline Build & Deploy
###########################################
#
# Strategy:
#   Each build lives in its own directory under BUILDS_DIR.
#   Instead of copying files into a fixed production path,
#   we re-write the systemd unit files so WorkingDirectory
#   and ExecStart point directly at the new build directory.
#   Rollback simply re-points the services at an older build.
#   No files are ever copied or moved at deploy/rollback time.
#
# Environment files (.env, .env.<ENVIRONMENT>) are maintained
# once at the root of BUILDS_DIR and copied into every new
# build automatically.
#
# Flow:
#   1. Ask which branch to pull (main / dev)
#   2. Clone the repo into BUILDS_DIR/build_<timestamp>_<branch>
#   3. Copy .env files from BUILDS_DIR root into the new build
#   4. Install npm packages & build everything
#   5. Back up the MySQL database
#   6. Stop services
#   7. Re-write systemd unit files → new build directory
#   8. Start services
#   9. Keep the last N builds; prune the rest
#
# Usage:
#   sudo bash scripts/rutba_deploy.sh
#
###########################################

###########################################
# BOOTSTRAP
###########################################
# Source shared environment (all paths, colours, log functions,
# format_build_date, get_active_build_dir, switch_active_link).
SCRIPT_DIR_DEPLOY="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR_DEPLOY}/rutba_deployed_environment.sh"

# Source service manager (write_all_units, start/stop/status, etc.).
RUTBA_SERVICES_SOURCED=1
source "${SCRIPT_DIR_DEPLOY}/rutba_services.sh"

###########################################
# HELPERS
###########################################

cleanup_legacy_wrapper_scripts() {
    local found=0
    for f in /usr/local/bin/rutba_*.sh; do
        [ -f "$f" ] || continue
        found=1
        break
    done
    if [ "$found" -eq 1 ]; then
        log "Removing legacy wrapper scripts from /usr/local/bin/ ..."
        for f in /usr/local/bin/rutba_*.sh; do
            [ -f "$f" ] || continue
            rm -f "$f"
            log "  Removed $(basename "$f")"
        done
    fi
}

# Install dependencies for one project directory.
#
# `npm ci` is preferred over `npm install` because it installs the exact tree
# recorded in package-lock.json:
#   * no peer-dependency resolution pass  -> ERESOLVE is impossible
#   * no packument lookup for semver ranges -> a stale --prefer-offline cache
#     cannot produce ETARGET for a version that was published after the cache
#     was last warmed
# Both failure modes bit us on the 5.51 dependency bump: the cached metadata
# predated @easypost/api 8.9.0, and the retry then tripped over a
# styled-components/react-native peer graph left behind in the copied
# node_modules by the *previous* build.
#
# `npm ci` wipes node_modules before installing, so callers must not bother
# pre-seeding it (see the copy block below).  It also hard-fails when
# package.json and package-lock.json have drifted, which is what we want on a
# deploy box — but we keep an `npm install` fallback so a lockfile that was
# forgotten in a commit degrades to a slow deploy rather than a failed one.
run_npm_install() {
    local workdir="$1"
    local mode="${2:-offline}"
    local prefer_flag="--prefer-offline"

    if [ "$mode" = "online" ]; then
        prefer_flag="--prefer-online"
    fi

    (
        cd "$workdir"

        if [ -f package-lock.json ]; then
            if npm ci --include=dev "$prefer_flag" --cache "$NPM_CACHE_DIR" --registry "$NPM_REGISTRY"; then
                exit 0
            fi
            log_warn "npm ci failed in ${workdir} — falling back to npm install (lockfile may have drifted from package.json)."
        else
            log_warn "No package-lock.json in ${workdir} — using npm install (non-reproducible)."
        fi

        npm install --production=false "$prefer_flag" --cache "$NPM_CACHE_DIR" --registry "$NPM_REGISTRY"
    )
}

###########################################
# FAILURE HANDLING
###########################################

BUILD_DIR=""
DEPLOY_SUCCEEDED=0
DEPLOY_STATUS_FILE_NAME=".deploy_status"

write_build_status() {
    local status="$1"
    local message="${2:-}"

    [ -n "${BUILD_DIR:-}" ] || return 0
    [ -d "${BUILD_DIR}" ] || return 0

    local status_file="${BUILD_DIR}/${DEPLOY_STATUS_FILE_NAME}"
    {
        echo "timestamp=$(date '+%Y-%m-%d %H:%M:%S %z')"
        echo "status=${status}"
        echo "branch=${BRANCH:-unknown}"
        echo "commit=${COMMIT_HASH:-unknown}"
        echo "message=${message}"
    } > "$status_file"
}

on_deploy_failure() {
    local exit_code="$?"
    local line_no="${1:-unknown}"

    # Prevent recursive trap execution while we clean up.
    trap - ERR
    set +e

    # Move out of the build directory before any cleanup.
    # This avoids getcwd/chdir errors if the failed build is deleted.
    cd "${SCRIPT_DIR_DEPLOY}" 2>/dev/null || cd /

    log_err "Deployment failed at line ${line_no} (exit=${exit_code})."

    write_build_status "failed" "line=${line_no};exit=${exit_code}"

    # Remove the partially created build directory if deploy did not complete.
    if [ "$DEPLOY_SUCCEEDED" -ne 1 ] && [ -n "${BUILD_DIR:-}" ] && [ -d "${BUILD_DIR}" ]; then
        # Never delete the active build by mistake.
        local active_now
        active_now=$(get_active_build_dir || true)
        if [ -n "$active_now" ] && [ "$BUILD_DIR" = "$active_now" ]; then
            log_warn "Failed build directory is active; skipping delete: ${BUILD_DIR}"
        else
            log_warn "Removing failed build directory: ${BUILD_DIR}"
            rm -rf "$BUILD_DIR"
        fi
    fi

    # Best-effort prune so failed/superseded build dirs stay under control.
    if [ -f "${SCRIPT_DIR_DEPLOY}/rutba_prune_builds.sh" ]; then
        log "Running failure-time build prune..."
        cd "${SCRIPT_DIR_DEPLOY}" 2>/dev/null || cd /
        bash "${SCRIPT_DIR_DEPLOY}/rutba_prune_builds.sh" || true
    fi

    exit "$exit_code"
}

trap 'on_deploy_failure $LINENO' ERR

###########################################
# PRE-FLIGHT CHECKS
###########################################

if [ "$(id -u)" -ne 0 ]; then
    abort "This script must be run as root (use sudo)."
fi

for cmd in git node npm; do
    command -v "$cmd" &>/dev/null || abort "${cmd} is not installed."
done

###########################################
# ASK BRANCH
###########################################

echo ""
echo "============================================"
echo "  Rutba ERP — Deployment Script"
echo "============================================"
echo ""
echo "  Which branch do you want to deploy?"
echo ""
echo "    1) main     (stable / production)"
echo "    2) dev      (development / testing)"
echo "    3) release  (release candidate)"
echo ""

read -rp "  Enter choice [1/2/3] (default: 1): " branch_choice

case "${branch_choice}" in
    2|dev)      BRANCH="dev"     ;;
    3|release)  BRANCH="release" ;;
    *)          BRANCH="main"    ;;
esac

log "Selected branch: ${BRANCH}"

###########################################
# CHECK IF ALREADY UP-TO-DATE
###########################################

CURRENT_ACTIVE=$(get_active_build_dir)
FIRST_TIME_DEPLOY=false

if [ -z "$CURRENT_ACTIVE" ] || [ ! -d "$CURRENT_ACTIVE" ]; then
    FIRST_TIME_DEPLOY=true
    log "No active build found — this is a first-time deploy."
else
    # Compare local active commit with remote HEAD for the branch
    if [ -d "${CURRENT_ACTIVE}/.git" ]; then
        ACTIVE_COMMIT=$(cd "$CURRENT_ACTIVE" && git rev-parse HEAD 2>/dev/null || echo "")
        REMOTE_COMMIT=$(git ls-remote --heads "$REPO_URL" "refs/heads/${BRANCH}" 2>/dev/null | awk '{print $1}')

        if [ -n "$ACTIVE_COMMIT" ] && [ -n "$REMOTE_COMMIT" ] && [ "$ACTIVE_COMMIT" = "$REMOTE_COMMIT" ]; then
            log_ok "Already running the latest commit on ${BRANCH} (${ACTIVE_COMMIT:0:7}). No deploy needed."
            echo ""
            read -rp "  Force re-deploy anyway? [y/N]: " force_deploy
            if [[ ! "$force_deploy" =~ ^[Yy]$ ]]; then
                exit 0
            fi
            log "Force re-deploy requested."
        fi
    fi
fi

###########################################
# PREPARE BUILD DIRECTORY
###########################################

mkdir -p "$BUILDS_DIR"

# Pre-deploy prune: clean old/superseded builds before cloning a new one
# to reduce disk pressure during install/build steps.
log "Running pre-deploy build prune..."
bash "${SCRIPT_DIR_DEPLOY}/rutba_prune_builds.sh"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BUILD_DIR="${BUILDS_DIR}/build_${TIMESTAMP}_${BRANCH}"

log "Cloning ${REPO_URL} (branch: ${BRANCH}) → ${BUILD_DIR} ..."
git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$BUILD_DIR"

cd "$BUILD_DIR"
COMMIT_HASH=$(git rev-parse --short HEAD)
log_ok "Cloned commit: ${COMMIT_HASH}"
write_build_status "in_progress" "clone complete"

###########################################
# COPY ENV FILES FROM BUILDS_DIR ROOT
###########################################
# Master .env and .env.<ENVIRONMENT> files live at the root of
# BUILDS_DIR (alongside the build_* directories). They are
# copied into every new build so secrets stay out of the repo.

if [ ! -f "$BUILDS_DIR/.env" ]; then
    log_warn "No master .env found at ${BUILDS_DIR}/.env"
    log "Setting up environment files for the first time..."

    # Seed .env with ENVIRONMENT=production
    echo "ENVIRONMENT=production" > "$BUILDS_DIR/.env"
    log "  Created ${BUILDS_DIR}/.env"

    # Seed .env.production from the sample template
    if [ -f "$BUILD_DIR/sample.env.enviromentname.txt" ]; then
        cp "$BUILD_DIR/sample.env.enviromentname.txt" "$BUILDS_DIR/.env.production"
        log "  Created ${BUILDS_DIR}/.env.production from sample template"
    elif [ -f "$BUILD_DIR/.env.example" ]; then
        cp "$BUILD_DIR/.env.example" "$BUILDS_DIR/.env.production"
        log "  Created ${BUILDS_DIR}/.env.production from .env.example"
    else
        touch "$BUILDS_DIR/.env.production"
        log_warn "  No sample env file found — created empty .env.production"
    fi

    echo ""
    echo "============================================"
    echo -e "  ${YELLOW}⚠  FIRST-TIME SETUP${NC}"
    echo "============================================"
    echo ""
    echo "  Environment files have been created at:"
    echo "    ${BUILDS_DIR}/.env"
    echo "    ${BUILDS_DIR}/.env.production"
    echo ""
    echo "  You MUST edit .env.production with your"
    echo "  database credentials, ports, URLs, and"
    echo "  secret keys before continuing."
    echo ""
    echo "  See sample.env.enviromentname.txt for the"
    echo "  PREFIX__VARNAME format."
    echo ""
    echo "  Open another terminal and run:"
    echo "    sudo nano ${BUILDS_DIR}/.env.production"
    echo ""
    read -rp "  Press ENTER when you have finished editing (or Ctrl+C to abort)... "
    log "User confirmed env file setup."
fi

log "Copying environment files from ${BUILDS_DIR}/ ..."
for envfile in "$BUILDS_DIR"/.env "$BUILDS_DIR"/.env.*; do
    if [ -f "$envfile" ]; then
        cp "$envfile" "$BUILD_DIR/"
        log "  Copied $(basename "$envfile")"
    fi
done

###########################################
# INSTALL DEPENDENCIES
###########################################

# Use a persistent npm cache under BUILDS_DIR so tarballs survive
# across deploys.  Combined with --prefer-offline, npm will skip
# network fetches for anything already cached.
NPM_CACHE_DIR="${BUILDS_DIR}/.npm_cache"
NPM_REGISTRY="${RUTBA_NPM_REGISTRY:-https://registry.npmjs.org/}"
mkdir -p "$NPM_CACHE_DIR"

# Seed node_modules from the previous active build so npm only has to
# reconcile the diff instead of extracting everything from scratch.
#
# This is only worth doing for a project that will go down the `npm install`
# path.  `npm ci` deletes node_modules before it installs, so pre-copying a
# tree it is about to throw away costs minutes of `cp -a` for nothing — and,
# worse, a stale copy is exactly what fed npm the phantom react-native /
# styled-components peer graph that produced ERESOLVE on the 5.51 bump.
seed_node_modules() {
    local label="$1" src="$2" dest="$3" project="$4"

    [ -d "$src" ] || return 0
    if [ -f "$project/package-lock.json" ]; then
        log "Skipping ${label} node_modules copy (npm ci installs from the lockfile)."
        return 0
    fi

    log "Copying node_modules from previous build (${label})..."
    cp -a "$src" "$dest"
    log_ok "Copied ${label} node_modules."
}

if [ -n "$CURRENT_ACTIVE" ] && [ -d "$CURRENT_ACTIVE" ]; then
    seed_node_modules "monorepo root" \
        "$CURRENT_ACTIVE/node_modules" "$BUILD_DIR/node_modules" "$BUILD_DIR"
    seed_node_modules "pos-strapi" \
        "$CURRENT_ACTIVE/pos-strapi/node_modules" "$BUILD_DIR/pos-strapi/node_modules" "$BUILD_DIR/pos-strapi"
fi

# A cache warmed before a dependency bump has no tarball for the new version,
# so an offline install can legitimately fail.  Retry online before giving up —
# for both projects, not just pos-strapi.
install_project_deps() {
    local label="$1" dir="$2"

    log "Installing ${label} dependencies..."
    if ! run_npm_install "$dir" offline; then
        log_warn "${label} install failed in offline mode. Retrying with online metadata refresh from ${NPM_REGISTRY} ..."
        npm cache verify >/dev/null 2>&1 || true
        run_npm_install "$dir" online
    fi
}

# RUTBA_POSTINSTALL=1 makes the root postinstall hook (scripts/js/postinstall.js)
# skip pos-strapi — we install it explicitly below with the same cache settings.
export RUTBA_POSTINSTALL=1
install_project_deps "monorepo" "$BUILD_DIR"
unset RUTBA_POSTINSTALL

install_project_deps "pos-strapi" "$BUILD_DIR/pos-strapi"

###########################################
# BUILD EVERYTHING
###########################################

log "Building Strapi..."
npm run build:strapi

log "Building all Next.js apps..."
npm run build:all

log_ok "Build completed successfully."

###########################################
# BACKUP DATABASE (skip on first deploy)
###########################################

if [ "$FIRST_TIME_DEPLOY" = true ]; then
    log "First-time deploy — skipping database backup."
else
    bash "${SCRIPT_DIR_DEPLOY}/rutba_db_backup.sh"
fi

###########################################
# STOP → RE-POINT → START
###########################################

if [ "$FIRST_TIME_DEPLOY" != true ]; then
    stop_services
fi

# Clean up legacy /usr/local/bin/rutba_*.sh wrapper scripts.
# The old setup had one shell script per service that just did
# cd + npm run start.  The new setup embeds paths directly in
# the systemd unit file — no wrapper scripts needed.
cleanup_legacy_wrapper_scripts

log "Switching active link to new build..."
switch_active_link "$BUILD_DIR"

log "Writing systemd service units → ${ACTIVE_LINK} ..."
write_all_units

start_services
show_service_status

###########################################
# SEED THE DATABASE
###########################################
# Runs after the services are up. rutba_seed.sh holds for a grace delay
# and then polls Strapi's /_health before invoking the seed engine, so it
# never races Strapi's own boot (schema sync + api-pro descriptor seeder).
# Seeding failures are reported but never fail the deploy — the apps are
# already live at this point.

SEED_STATUS="skipped"
if [ -f "${SCRIPT_DIR_DEPLOY}/rutba_seed.sh" ]; then
    if bash "${SCRIPT_DIR_DEPLOY}/rutba_seed.sh"; then
        SEED_STATUS="ok"
    else
        SEED_STATUS="failed"
        log_warn "Seeding did not complete — deployment continues. Re-run: sudo bash ${SCRIPT_DIR_DEPLOY}/rutba_seed.sh"
    fi
else
    log_warn "rutba_seed.sh not found — skipping post-deploy seeding."
fi

###########################################
# PRUNE OLD BUILDS
###########################################

bash "${SCRIPT_DIR_DEPLOY}/rutba_prune_builds.sh" --protect "$BUILD_DIR"

# Re-read remaining builds for the summary
mapfile -t REMAINING_BUILDS < <(
    find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" | sort -r
)

###########################################
# SETUP LOG ROTATION CRON JOB
###########################################
# Ensure the nightly log rotation cron job is installed.
# The setup script is idempotent -- safe to run every deploy.

if [ -f "${SCRIPT_DIR_DEPLOY}/rutba_setup_log_cron.sh" ]; then
    log "Setting up log rotation cron job..."
    bash "${SCRIPT_DIR_DEPLOY}/rutba_setup_log_cron.sh"
else
    log_warn "rutba_setup_log_cron.sh not found -- skipping log rotation setup."
fi

###########################################
# DONE
###########################################

DEPLOY_DATE=$(format_build_date "$BUILD_DIR")

echo ""
echo "============================================"
echo -e "  ${GREEN}✅ Deployment Complete!${NC}"
echo "============================================"
echo "  Date:    ${DEPLOY_DATE}"
echo "  Branch:  ${BRANCH}"
echo "  Commit:  ${COMMIT_HASH}"
echo "  Build:   $(basename "$BUILD_DIR")"
echo "  Active:  ${ACTIVE_LINK} → ${BUILD_DIR}"
echo "  Env:     ${BUILDS_DIR}/.env*"
case "$SEED_STATUS" in
    ok)      echo -e "  Seeding: ${GREEN}completed${NC}" ;;
    failed)  echo -e "  Seeding: ${RED}FAILED${NC} — sudo bash ${BUILD_DIR}/scripts/rutba_seed.sh" ;;
    *)       echo -e "  Seeding: ${YELLOW}skipped${NC}" ;;
esac
echo "============================================"
echo ""
echo "  Available builds:"
for b in "${REMAINING_BUILDS[@]}"; do
    local_date=$(format_build_date "$b")
    local_marker=""
    if [ "$b" = "$BUILD_DIR" ]; then
        local_marker=" ${GREEN}← active${NC}"
    fi
    echo -e "    $(basename "$b")  ${CYAN}${local_date}${NC}${local_marker}"
done
echo ""
echo "  View logs:"
echo "    sudo journalctl -fu rutba_pos_strapi"
echo "    tail -f ${LOG_FILE}"
echo ""
echo "  Log rotation:"
echo "    Cron: nightly at 02:00 (vacuums journal + rotates deploy log)"
echo "    Log:  /var/log/rutba_log_rotate.log"
echo "    Run:  sudo bash ${BUILD_DIR}/scripts/rutba_log_rotate.sh"
echo ""
echo "  To edit environment:"
echo "    sudo nano ${BUILDS_DIR}/.env.production"
echo ""
echo "  To rollback:"
echo "    sudo bash ${BUILD_DIR}/scripts/rutba_rollback.sh"
echo "============================================"

DEPLOY_SUCCEEDED=1
write_build_status "success" "deployment completed"
