# Rutba ERP Build & Deployment Setup (Reference + Reusable Template)

This document explains how this workspace is set up for:
- Monorepo builds
- Strapi build/runtime settings
- Deployment scripts under `scripts/`
- Deployment as **systemd services**
- Deployment as **Docker/Compose**

It also includes a reusable template/checklist for similar products.

---

## 1) Workspace Build Setup (Monorepo)

### 1.1 Repository shape
- Root uses npm workspaces (`package.json`):
  - `packages/*`
  - App workspaces like `pos-auth`, `pos-stock`, `rutba-web`, etc.
  - Strapi app at `pos-strapi` (via `--prefix` scripts)

### 1.2 Root script orchestration
From root `package.json`:
- Dev scripts: `dev:*`
- Start scripts: `start:*`
- Build scripts: `build:*`
- Aggregate scripts:
  - `build:all` → `node scripts/js/run-app.js build`
  - `start:all` → `node scripts/js/run-app.js start`

### 1.3 Central env model
All app scripts are wrapped with:
- `scripts/js/load-env.js`

Behavior:
- **File mode**: reads `.env` + `.env.<ENVIRONMENT>`
- **Env-var mode**: reads from process environment (Docker/CI style)
- Validates required keys via `scripts/js/env-config.js`
- Supports app-scoped vars using prefix convention:
  - `POS_STRAPI__PORT=4010` becomes `PORT=4010` only for Strapi

### 1.4 App runner scripts
- `scripts/js/run-app.js`
  - Supports single-app and all-app build/start
  - Supports `RUTBA_APP` fallback and `.rutba-app` fallback file
- `scripts/js/run-all.js`
  - Parallel multi-app start/dev execution
  - Excludes self-referential scripts and handles single-app mode

---

## 2) Strapi Build Settings & Runtime Setup

Primary Strapi package: `pos-strapi/package.json`

### 2.1 Strapi scripts
- `build`: `strapi build`
- `develop` / `dev`: `strapi develop`
- `start`: `strapi start`
- `build-start`: `strapi build && strapi start`
- `deploy`: `strapi deploy`

### 2.2 Core Strapi config files
- `pos-strapi/config/server.js`
  - Host from `HOST` (default `0.0.0.0`)
  - Port from `PORT` (default `1337`)
  - App keys from `APP_KEYS`
  - Public directory configurable with `PUBLIC_DIR`

- `pos-strapi/config/database.js`
  - Supports mysql/postgres/sqlite based on `DATABASE_CLIENT`
  - Uses `DATABASE_*` variables
  - Connection pool and timeout configurable

- `pos-strapi/config/admin.js`
  - Admin JWT and token salts from env vars
  - Session lifespan configured
  - Encryption key required

- `pos-strapi/config/plugins.js`
  - Enables `api-guard-pro` and `strapi-content-sync-pro`
  - Configures users-permissions session token lifespans
  - Configures email provider (nodemailer)
  - Configures upload size limits

- `pos-strapi/config/middlewares.js`
  - CORS origins from `CORS_ORIGINS`
  - Allows custom Rutba headers (`X-Rutba-App`, `X-Rutba-App-Admin`)

- `pos-strapi/config/api.js`
  - API pagination defaults (`defaultLimit`, `maxLimit`, `withCount`)

### 2.3 Strapi bootstrap and seeding
- `pos-strapi/src/index.js`
  - Bootstraps role/permission structures
  - Seeds data and synchronizes access/permission structures

### 2.4 Strapi plugin helper scripts
- `pos-strapi/scripts/setup-data-sync-plugin.js`
- `pos-strapi/scripts/sync-data-sync-plugin.js`

Used to switch plugin mode (local/package) and sync local plugin source into Strapi.

---

## 3) Deployment Scripts under `scripts/` (systemd flow)

### 3.1 Shared deployment environment
- `scripts/rutba_deployed_environment.sh`
  - Single source for deploy paths and defaults:
    - `BUILDS_DIR`, `ACTIVE_LINK`, `DB_BACKUP_DIR`, `REPO_URL`, `MAX_BUILDS`
    - `RUN_USER`, `RUN_GROUP`, `SYSTEMD_DIR`
  - Provides shared helper/logging functions

### 3.2 Service unit setup
- `scripts/setup-systemd-services.sh`
  - Creates all `rutba_*.service` units
  - Units run apps through `scripts/js/load-env.js`
  - Uses active symlink model (`rutba_active`) for zero-copy switching

### 3.3 Service lifecycle manager
- `scripts/rutba_services.sh`
  - Commands: `start`, `stop`, `restart`, `status`, `rebuild`, `logs`, `tail`, `diagnose`
  - Writes/rebuilds units and validates service health
  - Starts Strapi first in full start mode

### 3.4 Deployment pipeline
- `scripts/rutba_deploy.sh`
  - Clones selected branch into timestamped build dir
  - Copies master env files from build root
  - Installs/builds apps
  - Backs up database
  - Re-points active build + restarts services
  - Prunes old builds

### 3.5 Other related ops scripts
- `scripts/rutba_rollback.sh` (rollback flow)
- `scripts/rutba_prune_builds.sh` (retention cleanup)
- `scripts/rutba_log_rotate.sh` / `scripts/rutba_setup_log_cron.sh` (logs)

---

## 4) Deploying as systemd Services (How this repo is designed)

### 4.1 Service model
Each service unit uses:
- `WorkingDirectory` => active symlink (`rutba_active`)
- `ExecStart` => `node scripts/js/load-env.js -- npm run start ...`

This keeps environment loading and app startup behavior consistent with local scripts.

### 4.2 Release model
- New deploy = new immutable build folder
- `rutba_active` points to current release
- Rollback = switch pointer + restart services

### 4.3 Typical commands
- Initial unit creation:
  - `sudo bash scripts/setup-systemd-services.sh`
- Deploy:
  - `sudo bash scripts/rutba_deploy.sh`
- Manage:
  - `sudo bash scripts/rutba_services.sh status`
  - `sudo bash scripts/rutba_services.sh restart`

---

## 5) Deploying as Docker/Compose

### 5.1 Docker build design
- `Dockerfile` is multi-stage and monorepo-aware
- Includes build targets for:
  - `strapi`
  - each Next.js app (`auth`, `stock`, `sale`, `web`, etc.)
- Strapi target builds and starts Strapi in production mode
- Next.js targets use standalone output layout in runtime stages

### 5.2 Compose service graph
- `docker-compose.yml` defines:
  - `mysql` + healthcheck
  - `strapi` depending on healthy mysql
  - frontend services depending on strapi
- Uses env file values for build args and runtime vars

### 5.3 Docker env generation
- `scripts/js/generate-docker-env.js`
  - Converts workspace env model into `.env.docker`
  - Maps app-specific keys:
    - `POS_STRAPI__*` → `STRAPI_*`
    - `RUTBA_WEB__*` → `WEB_*`
  - Produces `PORT_*` values and computed `CORS_ORIGINS`

### 5.4 Typical Docker commands
- Generate env:
  - `node scripts/js/generate-docker-env.js`
- Up:
  - `docker compose --env-file .env.docker up -d --build`
- Logs:
  - `docker compose logs -f strapi auth stock`

---

## 6) Reusable Template for Similar Products

Use this as a baseline when building another multi-app + Strapi product.

## 6.1 Folder convention template
- `package.json` (root workspaces + orchestration scripts)
- `scripts/js/load-env.js` (shared env injector)
- `scripts/js/env-config.js` (required env registry)
- `scripts/js/run-app.js`, `scripts/js/run-all.js`
- `apps/<frontend-apps>` and `apps/<strapi-app>` or equivalent
- `scripts/setup-systemd-services.sh`
- `scripts/<product>_deployed_environment.sh`
- `scripts/<product>_services.sh`
- `scripts/<product>_deploy.sh`
- `Dockerfile`, `docker-compose.yml`, `scripts/js/generate-docker-env.js`

## 6.2 Root script template
Define per-app scripts in root:
- `dev:<app>`
- `start:<app>`
- `build:<app>`

Then add:
- `dev:all`
- `start:all`
- `build:all`

All should run through shared env loader.

## 6.3 Env key strategy template
- Global values: no prefix (shared)
- App-specific values: `APPPREFIX__KEY`
- Keep a required key registry and validate at runtime
- For Docker, generate flattened env file from the same source

## 6.4 systemd template
For each service:
- Service name: `<product>_<app>.service`
- `WorkingDirectory`: active release symlink
- `ExecStart`: `node scripts/js/load-env.js -- npm run start --workspace=<app>`
- `Restart=on-failure`

Add a service-manager script with:
- start/stop/restart/status
- logs/tail/diagnose
- rebuild unit files

## 6.5 Deployment template
- Create timestamped build directory
- Clone selected branch
- Copy env files from stable external location
- Install/build
- Optional DB backup
- Switch active symlink
- Restart services
- Keep last N builds

## 6.6 Docker template
- Multi-stage Dockerfile with one target per app
- Compose file with explicit dependencies and healthchecks
- Generated `.env.docker` from same env source used by local/systemd

## 6.7 Minimal rollout checklist
1. Confirm all required env variables pass validation.
2. Build all targets successfully.
3. Verify Strapi first, then dependent apps.
4. Verify reverse proxy/ports and CORS.
5. Confirm logs and health checks are green.
6. Validate rollback path before production cutover.

---

## 7) Product Adaptation Matrix (fill this for new product)

Copy this section and replace values.

- Product name:
- Repo URL:
- Build root dir:
- Active symlink path:
- Service user/group:
- systemd dir:
- Max retained builds:
- App list (workspace names):
- Strapi workspace name:
- Database type and backup command:
- Public URL map (all apps):
- Env file strategy (`.env` + `.env.<env>` or env-only):
- Docker image/compose naming:
- Observability (logs/metrics):
- Rollback command:

---

## 8) File Reference Index

- `package.json`
- `scripts/js/load-env.js`
- `scripts/js/env-config.js`
- `scripts/js/run-app.js`
- `scripts/js/run-all.js`
- `pos-strapi/package.json`
- `pos-strapi/config/server.js`
- `pos-strapi/config/database.js`
- `pos-strapi/config/admin.js`
- `pos-strapi/config/plugins.js`
- `pos-strapi/config/middlewares.js`
- `pos-strapi/config/api.js`
- `pos-strapi/src/index.js`
- `scripts/setup-systemd-services.sh`
- `scripts/rutba_deployed_environment.sh`
- `scripts/rutba_services.sh`
- `scripts/rutba_deploy.sh`
- `Dockerfile`
- `docker-compose.yml`
- `scripts/js/generate-docker-env.js`
- `docs/DEPLOYMENT.md`

---

If you want, this can be split next into:
1) an operations runbook, and
2) a scaffold generator checklist for onboarding future products automatically.
