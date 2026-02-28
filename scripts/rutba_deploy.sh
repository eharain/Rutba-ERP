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
#   1. Ask which branch to pull (master / dev)
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
# CONFIG — edit these to match your server
###########################################

BUILDS_DIR="/home/rutba-nvr/rutba_builds"
ACTIVE_LINK="/home/rutba-nvr/rutba_active"   # symlink → currently active build
DB_BACKUP_DIR="/home/rutba-nvr/db_dumps"
REPO_URL="https://github.com/eharain/Rutba-ERP.git"
MAX_BUILDS=5
LOG_FILE="/var/log/rutba_deploy.log"

RUN_USER="rutba-nvr"
RUN_GROUP="rutba-nvr"
SYSTEMD_DIR="/etc/systemd/system"

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

# Map: service-name → ExecStart suffix (relative to build dir)
# Strapi uses --prefix, everything else uses --workspace
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
    [rutba_pos_desk]="run start --workspace=pos-desk"
)

declare -A SVC_DESC=(
    [rutba_pos_strapi]="Rutba ERP — Strapi API"
    [rutba_pos_auth]="Rutba ERP — Auth Portal (pos-auth)"
    [rutba_pos_stock]="Rutba ERP — Stock Management (pos-stock)"
    [rutba_pos_sale]="Rutba ERP — Point of Sale (pos-sale)"
    [rutba_web]="Rutba ERP — Public Website (rutba-web)"
    [rutba_web_user]="Rutba ERP — My Orders (rutba-web-user)"
    [rutba_crm]="Rutba ERP — CRM (rutba-crm)"
    [rutba_hr]="Rutba ERP — Human Resources (rutba-hr)"
    [rutba_accounts]="Rutba ERP — Accounting (rutba-accounts)"
    [rutba_payroll]="Rutba ERP — Payroll (rutba-payroll)"
    [rutba_cms]="Rutba ERP — Content Management (rutba-cms)"
    [rutba_pos_desk]="Rutba ERP — Legacy Desk (pos-desk)"
)

###########################################
# HELPERS
###########################################

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()      { local m="$(date '+%Y-%m-%d %H:%M:%S') : $1";      echo -e "${CYAN}${m}${NC}";   echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_ok()   { local m="$(date '+%Y-%m-%d %H:%M:%S') : ✅ $1";   echo -e "${GREEN}${m}${NC}";  echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_warn() { local m="$(date '+%Y-%m-%d %H:%M:%S') : ⚠ $1";    echo -e "${YELLOW}${m}${NC}"; echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
log_err()  { local m="$(date '+%Y-%m-%d %H:%M:%S') : ❌ $1";    echo -e "${RED}${m}${NC}";    echo "$m" >> "$LOG_FILE" 2>/dev/null || true; }
abort()    { log_err "$1"; exit 1; }

# Resolve the directory the ACTIVE_LINK symlink currently points to.
# Returns empty string if no active build yet.
get_active_build_dir() {
    if [ -L "$ACTIVE_LINK" ]; then
        readlink -f "$ACTIVE_LINK"
    elif [ -d "$ACTIVE_LINK" ]; then
        echo "$ACTIVE_LINK"
    else
        echo ""
    fi
}

# Clean up old /usr/local/bin/rutba_*.sh wrapper scripts from the
# legacy setup. The new approach embeds everything in the systemd
# unit files directly — the wrappers are no longer needed.
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

###########################################
# SYSTEMD UNIT WRITER
###########################################

# write_all_units <build_dir>
# Re-writes every service file so paths point at <build_dir>.
write_all_units() {
    local BUILD_DIR="$1"
    local NODE_BIN
    NODE_BIN=$(which node)
    local NPM_BIN
    NPM_BIN=$(which npm)

    for svc in "${SERVICES[@]}"; do
        local FILE="${SYSTEMD_DIR}/${svc}.service"
        local DESC="${SVC_DESC[$svc]}"
        local CMD="${SVC_CMD[$svc]}"

        cat > "$FILE" <<EOF
[Unit]
Description=${DESC}
After=network.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_GROUP}
WorkingDirectory=${BUILD_DIR}
ExecStart=${NODE_BIN} ${BUILD_DIR}/scripts/load-env.js -- ${NPM_BIN} ${CMD}
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${svc}
LimitNOFILE=65536
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF
        systemctl enable "${svc}.service" 2>/dev/null || true
    done

    log_ok "Systemd units written → ${BUILD_DIR}"
}

stop_services() {
    log "Stopping all Rutba services..."
    for svc in "${SERVICES[@]}"; do
        systemctl stop "${svc}.service" 2>/dev/null || true
    done
    log_ok "All services stopped."
}

start_services() {
    log "Reloading systemd daemon..."
    systemctl daemon-reload

    log "Starting all Rutba services..."
    systemctl start rutba_pos_strapi.service
    sleep 3

    for svc in "${SERVICES[@]}"; do
        if [ "$svc" != "rutba_pos_strapi" ]; then
            systemctl start "${svc}.service" 2>/dev/null || log_warn "Failed to start ${svc}"
        fi
    done
    log_ok "All services started."
}

show_service_status() {
    echo ""
    echo "============================================"
    echo "  Service Status"
    echo "============================================"
    for svc in "${SERVICES[@]}"; do
        local status
        status=$(systemctl is-active "${svc}.service" 2>/dev/null || echo "inactive")
        if [ "$status" = "active" ]; then
            echo -e "  ${GREEN}● ${svc}: active${NC}"
        else
            echo -e "  ${RED}● ${svc}: ${status}${NC}"
        fi
    done
    echo "============================================"
    echo ""
}

# Switch the ACTIVE_LINK symlink to point at a build directory.
switch_active_link() {
    local target="$1"
    ln -sfn "$target" "$ACTIVE_LINK"
    log "Active link → ${target}"
}

###########################################
# DATABASE HELPERS
###########################################

parse_db_creds() {
    local env_file="$1"
    [ ! -f "$env_file" ] && return 1

    DB_HOST=$(grep '^POS_STRAPI__DATABASE_HOST=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_PORT=$(grep '^POS_STRAPI__DATABASE_PORT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_NAME=$(grep '^POS_STRAPI__DATABASE_NAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_USER=$(grep '^POS_STRAPI__DATABASE_USERNAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    DB_PASS=$(grep '^POS_STRAPI__DATABASE_PASSWORD=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')

    # Fallback: legacy flat .env keys
    [ -z "$DB_HOST" ] && DB_HOST=$(grep '^DATABASE_HOST=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_PORT" ] && DB_PORT=$(grep '^DATABASE_PORT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_NAME" ] && DB_NAME=$(grep '^DATABASE_NAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_USER" ] && DB_USER=$(grep '^DATABASE_USERNAME=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
    [ -z "$DB_PASS" ] && DB_PASS=$(grep '^DATABASE_PASSWORD=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')

    DB_HOST="${DB_HOST:-127.0.0.1}"
    DB_PORT="${DB_PORT:-3306}"

    [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] && return 1
    return 0
}

get_environment_name() {
    local env_file="${BUILDS_DIR}/.env"
    if [ -f "$env_file" ]; then
        local v
        v=$(grep '^ENVIRONMENT=' "$env_file" | cut -d'=' -f2 | tr -d '[:space:]')
        echo "${v:-production}"
    else
        echo "production"
    fi
}

# Locate the correct .env.<ENVIRONMENT> from BUILDS_DIR root
resolve_env_file() {
    [ ! -d "$BUILDS_DIR" ] && { echo ""; return; }

    local env_name
    env_name=$(get_environment_name)
    local env_file="${BUILDS_DIR}/.env.${env_name}"
    [ ! -f "$env_file" ] && env_file="${BUILDS_DIR}/.env"
    [ -f "$env_file" ] && echo "$env_file" || echo ""
}

backup_database() {
    local env_file
    env_file=$(resolve_env_file)
    if [ -z "$env_file" ] || ! parse_db_creds "$env_file"; then
        log_warn "Skipping database backup — could not read DB credentials."
        return 0
    fi

    mkdir -p "$DB_BACKUP_DIR"
    local ts
    ts=$(date '+%Y%m%d_%H%M%S')
    local dump_file="${DB_BACKUP_DIR}/${DB_NAME}_${ts}.sql"

    log "Backing up database '${DB_NAME}' → ${dump_file} ..."

    if mysqldump -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$dump_file" 2>/dev/null; then
        log_ok "Database backup saved: ${dump_file}"
    elif command -v docker &>/dev/null; then
        log "Trying mysqldump via docker..."
        local cid
        cid=$(docker ps --filter "ancestor=mysql" --format "{{.ID}}" | head -1)
        if [ -n "$cid" ]; then
            docker exec "$cid" mysqldump -u "$DB_USER" -p"$DB_PASS" "$DB_NAME" > "$dump_file" 2>/dev/null
            log_ok "Database backup saved (via docker): ${dump_file}"
        else
            log_warn "No MySQL container found. Skipping DB backup."
        fi
    else
        log_warn "mysqldump failed and docker not available. Skipping DB backup."
    fi

    # Prune old dumps
    local count
    count=$(ls -1 "${DB_BACKUP_DIR}/${DB_NAME}_"*.sql 2>/dev/null | wc -l)
    if [ "$count" -gt "$MAX_BUILDS" ]; then
        ls -1t "${DB_BACKUP_DIR}/${DB_NAME}_"*.sql | tail -n $((count - MAX_BUILDS)) | xargs rm -f
        log "Pruned old DB backups, keeping last ${MAX_BUILDS}."
    fi
}

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
echo "    1) main    (stable / production)"
echo "    2) dev     (development / testing)"
echo ""

read -rp "  Enter choice [1/2] (default: 1): " branch_choice

case "${branch_choice}" in
    2|dev)  BRANCH="dev"  ;;
    *)      BRANCH="main" ;;
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
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BUILD_DIR="${BUILDS_DIR}/build_${TIMESTAMP}_${BRANCH}"

log "Cloning ${REPO_URL} (branch: ${BRANCH}) → ${BUILD_DIR} ..."
git clone --depth 1 -b "$BRANCH" "$REPO_URL" "$BUILD_DIR"

cd "$BUILD_DIR"
COMMIT_HASH=$(git rev-parse --short HEAD)
log_ok "Cloned commit: ${COMMIT_HASH}"

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

log "Installing monorepo dependencies (npm install)..."
npm install --production=false

log "Installing pos-strapi dependencies..."
cd "$BUILD_DIR/pos-strapi"
npm install --production=false
cd "$BUILD_DIR"

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
    backup_database
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

log "Writing systemd service units → ${BUILD_DIR} ..."
write_all_units "$BUILD_DIR"
switch_active_link "$BUILD_DIR"

start_services
show_service_status

###########################################
# PRUNE OLD BUILDS
###########################################

log "Pruning old builds (keeping last ${MAX_BUILDS})..."

mapfile -t ALL_BUILDS < <(
    find "$BUILDS_DIR" -maxdepth 1 -type d -name "build_*" | sort -r
)

# Never delete the build we just activated
KEEP=0
for b in "${ALL_BUILDS[@]}"; do
    KEEP=$((KEEP + 1))
    if [ "$KEEP" -gt "$MAX_BUILDS" ] && [ "$b" != "$BUILD_DIR" ]; then
        rm -rf "$b"
        log "  Removed $(basename "$b")"
    fi
done

###########################################
# DONE
###########################################

echo ""
echo "============================================"
echo -e "  ${GREEN}✅ Deployment Complete!${NC}"
echo "============================================"
echo "  Branch:  ${BRANCH}"
echo "  Commit:  ${COMMIT_HASH}"
echo "  Build:   ${BUILD_DIR}"
echo "  Active:  ${ACTIVE_LINK} → ${BUILD_DIR}"
echo "  Env:     ${BUILDS_DIR}/.env*"
echo "============================================"
echo ""
echo "  View logs:"
echo "    sudo journalctl -fu rutba_pos_strapi"
echo "    tail -f ${LOG_FILE}"
echo ""
echo "  To edit environment:"
echo "    sudo nano ${BUILDS_DIR}/.env.production"
echo ""
echo "  To rollback:"
echo "    sudo bash ${BUILD_DIR}/scripts/rutba_rollback.sh"
echo "============================================"
