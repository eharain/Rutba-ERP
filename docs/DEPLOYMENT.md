# Rutba ERP — Production Deployment Guide (systemd)

This guide covers every aspect of running Rutba ERP on a Linux server: first-time setup, environment configuration, normal deploys, rollback, log management, and troubleshooting.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Directory Layout](#3-directory-layout)
4. [First-Time Server Setup](#4-first-time-server-setup)
5. [Environment Configuration](#5-environment-configuration)
6. [Deploy](#6-deploy)
7. [Managing Services](#7-managing-services)
8. [Rollback](#8-rollback)
9. [Disk & Log Management](#9-disk--log-management)
10. [Re-create Service Files](#10-re-create-service-files)
11. [Update Environment Variables](#11-update-environment-variables)
12. [Automated Deploys](#12-automated-deploys)
13. [Troubleshooting](#13-troubleshooting)
14. [Script Reference](#14-script-reference)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Repo (eharain/Rutba-ERP)                                    │
└───────────────────────────┬─────────────────────────────────────────┘
                            │  git clone --depth 1
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ~/rutba_builds/                                                    │
│    .env                  ← ENVIRONMENT=production  (master)         │
│    .env.production       ← all secrets & URLs       (master)        │
│    .npm_cache/           ← persistent npm cache (speeds re-deploys) │
│    build_20250115_093000_main/   ← build N-1                        │
│    build_20250120_141500_main/   ← build N    ← active              │
│                                                                     │
│  ~/rutba_active  ──symlink──►  build_20250120_141500_main/          │
└─────────────────────────────────────────────────────────────────────┘
            │
            │  systemd reads WorkingDirectory + ExecStart
            │  from /etc/systemd/system/rutba_*.service
            ▼
┌──────────────────────────────────────────────────────────────────┐
│  13 systemd services  (each runs: node scripts/load-env.js --)   │
│                                                                  │
│  rutba_pos_strapi   :4010  ─── MySQL 8                          │
│  rutba_pos_auth     :4003                                        │
│  rutba_pos_stock    :4001                                        │
│  rutba_pos_sale     :4002                                        │
│  rutba_web          :4000                                        │
│  rutba_web_user     :4004                                        │
│  rutba_crm          :4005                                        │
│  rutba_hr           :4006                                        │
│  rutba_accounts     :4007                                        │
│  rutba_payroll      :4008                                        │
│  rutba_cms          :4009                                        │
│  rutba_social       :4011                                        │
│  rutba_pos_desk     :3000  (legacy)                              │
└──────────────────────────────────────────────────────────────────┘
```

**Key design principles:**

- Each deploy is a **self-contained directory** — no files are overwritten in-place.
- **Rollback** re-points systemd unit files at an older build directory. No rebuild needed.
- **Environment files** (`~/.env`, `.env.production`) live *outside* every build under `~/rutba_builds/` and are copied in automatically. Secrets never enter the repo.
- `scripts/load-env.js` reads the env files and injects per-app variables (e.g. `POS_STRAPI__PORT` → `PORT` for Strapi only) before spawning each service process.

---

## 2. Prerequisites

| Requirement | Minimum |
|---|---|
| Ubuntu / Debian | 20.04 LTS+ |
| Node.js | 18.x+ |
| npm | 9.x+ |
| MySQL | 8.0 (or MariaDB 10.6+) |
| Git | 2.x |
| A sudo-capable user | e.g. `rutba-nvr` |
| Outbound internet (first deploy) | for `git clone` + `npm install` |

---

## 3. Directory Layout

```
/home/rutba-nvr/
├── rutba_builds/                        # versioned builds + master env files
│   ├── .env                             #   ENVIRONMENT=production  (master copy)
│   ├── .env.production                  #   DB creds, ports, secrets  (master copy)
│   ├── .npm_cache/                      #   persistent npm tarball cache
│   ├── build_20250101_120000_main/      #   old build (kept for rollback)
│   ├── build_20250115_093000_main/      #   old build (kept for rollback)
│   └── build_20250120_141500_main/      #   current build
│
├── rutba_active -> rutba_builds/build_20250120_141500_main/
│                                        # symlink → currently running build
│
└── db_dumps/                            # MySQL backups (auto-created before each deploy)
    ├── pos_db_20250114_235900.sql
    └── pos_db_20250120_141458.sql

/etc/systemd/system/
    rutba_pos_strapi.service
    rutba_pos_auth.service
    ... (one per service)

/var/log/
    rutba_deploy.log                     # deploy + rollback activity log
    rutba_log_rotate.log                 # log rotation activity
    rutba_archive/                       # archived deploy logs (30-day retention)
```

---

## 4. First-Time Server Setup

### 4.1 Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+ via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

node -v   # v18.x+
npm -v    # 9.x+

# Git
sudo apt install -y git

# MySQL 8
sudo apt install -y mysql-server
sudo mysql_secure_installation
```

### 4.2 Create the Database

```bash
sudo mysql -u root -p
```

```sql
CREATE DATABASE pos_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'pos_user'@'localhost' IDENTIFIED BY 'your_secure_password';
GRANT ALL PRIVILEGES ON pos_db.* TO 'pos_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

> **Note:** Match `DATABASE_NAME`, `DATABASE_USERNAME`, and `DATABASE_PASSWORD` in your `.env.production` to the values above.

### 4.3 Prepare the Build Directory

```bash
mkdir -p ~/rutba_builds ~/db_dumps
```

The deploy script creates these directories automatically if they don't exist, but creating them manually helps catch permission issues early.

---

## 5. Environment Configuration

### 5.1 How the Env Loader Works

`scripts/load-env.js` runs in one of two modes, detected automatically:

| Mode | Trigger | Source |
|---|---|---|
| **File mode** *(default)* | `.env` exists at repo root | `.env` → selects `ENVIRONMENT`, then `.env.<ENVIRONMENT>` |
| **Env-var mode** | No `.env` file (Docker / CI) | All config from `process.env` |

In **file mode**, `.env.<ENVIRONMENT>` values override anything in `.env`, and both override `process.env`.

Variables are split into two types:

```
GLOBAL          No __ in key     → injected into EVERY app
APP-SPECIFIC    PREFIX__VARNAME  → prefix stripped, injected only into that app

Examples:
  NEXT_PUBLIC_API_URL=https://api.rutba.pk/api/   ← global (all apps)
  POS_STRAPI__PORT=4010                           → PORT=4010 (Strapi only)
  RUTBA_WEB__NEXTAUTH_SECRET=abc                  → NEXTAUTH_SECRET=abc (rutba-web only)
```

**Port resolution order** (first match wins):
1. Explicit `PREFIX__PORT` in env file
2. Port embedded in `NEXT_PUBLIC_<APP>_URL` (e.g. `:4003`)
3. No port in URL → scheme default (`http` → 80, `https` → 443)
4. Multiple apps sharing the same host with no explicit port → incremental from 40000

**Required variables** are declared in `scripts/env-config.js`. The loader validates them at startup:
- `severity: 'error'` → missing variable aborts the service
- `severity: 'warn'`  → missing variable logs a warning but continues

### 5.2 Master Environment Files

The two master files live **outside every build** at `~/rutba_builds/`:

| File | Purpose |
|---|---|
| `~/rutba_builds/.env` | Sets `ENVIRONMENT=production`. Rarely changes. |
| `~/rutba_builds/.env.production` | All configuration: URLs, DB credentials, secrets. |

The deploy script copies both into every new build automatically. **Never edit the files inside a build directory** — changes will be lost on the next deploy.

### 5.3 Setting Up for the First Time

```bash
# Set the active environment
echo "ENVIRONMENT=production" > ~/rutba_builds/.env

# Copy the pre-configured production template (preferred)
# OR copy the sample template and fill it in from scratch
cp /path/to/repo/.env.production ~/rutba_builds/.env.production
# OR
cp /path/to/repo/sample.env.enviromentname.txt ~/rutba_builds/.env.production

# Edit with your actual values
nano ~/rutba_builds/.env.production
```

The deploy script will also do this automatically on first run — it pauses and asks you to edit the file before continuing.

### 5.4 Key Values in `.env.production`

```ini
# ── Public URLs (use your actual domain or server IP) ─────────────
NEXT_PUBLIC_API_URL=https://api.rutba.pk/api/
NEXT_PUBLIC_IMAGE_URL=https://api.rutba.pk

NEXT_PUBLIC_WEB_URL=https://rutba.pk
NEXT_PUBLIC_AUTH_URL=https://auth.rutba.pk
NEXT_PUBLIC_STOCK_URL=https://stock.rutba.pk
NEXT_PUBLIC_SALE_URL=https://sale.rutba.pk
NEXT_PUBLIC_WEB_USER_URL=https://my.rutba.pk
NEXT_PUBLIC_CRM_URL=https://crm.rutba.pk
NEXT_PUBLIC_HR_URL=https://hr.rutba.pk
NEXT_PUBLIC_ACCOUNTS_URL=https://accounts.rutba.pk
NEXT_PUBLIC_PAYROLL_URL=https://payroll.rutba.pk
NEXT_PUBLIC_CMS_URL=https://cms.rutba.pk
NEXT_PUBLIC_SOCIAL_URL=https://social.rutba.pk

# ── Image host (mirrors api.rutba.pk) ──────────────────────────────
NEXT_PUBLIC_IMAGE_HOST_PROTOCOL=https
NEXT_PUBLIC_IMAGE_HOST_NAME=api.rutba.pk
NEXT_PUBLIC_IMAGE_HOST_PORT=443

# ── Database ───────────────────────────────────────────────────────
# Bare-metal: use 127.0.0.1 — Docker Compose: use 'mysql' (service name)
POS_STRAPI__DATABASE_CLIENT=mysql
POS_STRAPI__DATABASE_HOST=127.0.0.1
POS_STRAPI__DATABASE_PORT=3306
POS_STRAPI__DATABASE_NAME=pos_db
POS_STRAPI__DATABASE_USERNAME=pos_user
POS_STRAPI__DATABASE_PASSWORD=your_secure_password
POS_STRAPI__DATABASE_SSL=false

# ── Strapi secrets (generate with: openssl rand -base64 32) ───────
POS_STRAPI__APP_KEYS=key1,key2,key3,key4
POS_STRAPI__API_TOKEN_SALT=<generate>
POS_STRAPI__ADMIN_JWT_SECRET=<generate>
POS_STRAPI__JWT_SECRET=<generate>
POS_STRAPI__TRANSFER_TOKEN_SALT=<generate>
POS_STRAPI__ENCRYPTION_KEY=<generate>

# ── Strapi ports & host ────────────────────────────────────────────
POS_STRAPI__HOST=0.0.0.0
POS_STRAPI__PORT=4010

# ── NextAuth (rutba-web) ───────────────────────────────────────────
RUTBA_WEB__NEXTAUTH_URL=https://rutba.pk
RUTBA_WEB__NEXTAUTH_SECRET=<generate>
RUTBA_WEB__GOOGLE_CLIENT_KEY=<from Google Cloud Console>
RUTBA_WEB__GOOGLE_SECRET_KEY=<from Google Cloud Console>

# ── Per-app ports (optional — loader derives from URL if omitted) ──
POS_AUTH__PORT=4003
POS_STOCK__PORT=4001
POS_SALE__PORT=4002
RUTBA_WEB__PORT=4000
RUTBA_WEB_USER__PORT=4004
RUTBA_CRM__PORT=4005
RUTBA_HR__PORT=4006
RUTBA_ACCOUNTS__PORT=4007
RUTBA_PAYROLL__PORT=4008
RUTBA_CMS__PORT=4009
RUTBA_SOCIAL__PORT=4011
```

> **Generate all Strapi secrets at once:**
> ```bash
> node -e "const c=require('crypto'); ['APP_KEYS','API_TOKEN_SALT','ADMIN_JWT_SECRET','JWT_SECRET','TRANSFER_TOKEN_SALT','ENCRYPTION_KEY'].forEach(k => { const v = k==='APP_KEYS' ? Array.from({length:4},()=>c.randomBytes(24).toString('base64')).join(',') : c.randomBytes(32).toString('base64'); console.log('POS_STRAPI__'+k+'='+v); })"
> ```

---

## 6. Deploy

### 6.1 First Deploy

```bash
# Clone the repo to get the deploy script
rm -rf ~/Rutba-ERP-scripts
git clone https://github.com/eharain/Rutba-ERP.git ~/Rutba-ERP-scripts
cd ~/Rutba-ERP-scripts

# Run the deploy script (requires sudo)
sudo bash scripts/rutba_deploy.sh
```

The script will:

1. Ask which branch to deploy (`main` for stable, `dev` for testing)
2. Compare your running commit against the remote — skip if already up-to-date
3. Clone the repo into `~/rutba_builds/build_<YYYYMMDD>_<HHMMSS>_<branch>/`
4. On first run: create `~/rutba_builds/.env` and `~/rutba_builds/.env.production` from the sample template, then pause for you to edit them
5. Copy `.env` and `.env.production` from `~/rutba_builds/` into the new build
6. Copy `node_modules` from the previous build (speeds up install significantly)
7. `npm install` using a persistent cache at `~/rutba_builds/.npm_cache/`
8. Build Strapi (`npm run build:strapi`)
9. Build all Next.js apps (`npm run build:all`)
10. Back up the MySQL database to `~/db_dumps/`
11. Stop all running services
12. Write new systemd unit files pointing at the new build directory
13. Update the `~/rutba_active` symlink
14. Start all services (Strapi first, 3-second delay, then the rest)
15. Prune old builds — keeps the best build per calendar day, last 5 days total
16. Install/update the nightly log-rotation cron job
17. Display a status summary

### 6.2 Subsequent Deploys

```bash
sudo bash ~/rutba_active/scripts/rutba_deploy.sh
```

The script checks if you're already on the latest commit of the selected branch. If yes, it prompts before doing a force re-deploy.

### 6.3 Deploy Flow Summary

```
git clone (depth 1)
    │
    ├─► Copy .env files from ~/rutba_builds/
    │
    ├─► Copy node_modules from previous build (if available)
    │
    ├─► npm install --prefer-offline --cache ~/rutba_builds/.npm_cache
    │       └─ pos-strapi npm install separately
    │
    ├─► npm run build:strapi
    ├─► npm run build:all
    │
    ├─► mysqldump → ~/db_dumps/<dbname>_<timestamp>.sql
    │
    ├─► systemctl stop  (all services)
    ├─► Write /etc/systemd/system/rutba_*.service  (new build path)
    ├─► ln -sfn <new-build> ~/rutba_active
    ├─► systemctl daemon-reload
    ├─► systemctl start rutba_pos_strapi  (wait 3 s)
    ├─► systemctl start <all other services>
    │
    └─► rutba_prune_builds.sh --protect <new-build>
        rutba_setup_log_cron.sh
```

---

## 7. Managing Services

### Start / Stop / Restart

```bash
# Single service
sudo systemctl start   rutba_pos_strapi
sudo systemctl stop    rutba_pos_sale
sudo systemctl restart rutba_web

# Strapi must be running before other services on a cold start
sudo systemctl start rutba_pos_strapi
sleep 5
sudo systemctl start rutba_pos_auth rutba_pos_stock rutba_pos_sale
sudo systemctl start rutba_web rutba_web_user rutba_crm rutba_hr
sudo systemctl start rutba_accounts rutba_payroll rutba_cms rutba_social
```

### View Logs

```bash
# Live log for a service (Ctrl+C to stop)
sudo journalctl -fu rutba_pos_strapi

# Last 100 lines
sudo journalctl -n 100 -u rutba_pos_auth

# All Rutba services since last boot
sudo journalctl -b -u 'rutba_*'

# Deploy / rollback activity log
tail -f /var/log/rutba_deploy.log
```

### Check Status

```bash
# One service
sudo systemctl status rutba_pos_strapi

# All Rutba services at a glance
sudo systemctl status 'rutba_*'
```

### Service List

| Service Name | Description | App Directory | Default Port |
|---|---|---|---|
| `rutba_pos_strapi` | Strapi API + admin | `pos-strapi/` | 4010 |
| `rutba_pos_auth` | Staff auth portal | `pos-auth/` | 4003 |
| `rutba_pos_stock` | Stock management | `pos-stock/` | 4001 |
| `rutba_pos_sale` | Point of sale | `pos-sale/` | 4002 |
| `rutba_web` | Public storefront | `rutba-web/` | 4000 |
| `rutba_web_user` | Customer orders | `rutba-web-user/` | 4004 |
| `rutba_crm` | CRM | `rutba-crm/` | 4005 |
| `rutba_hr` | Human resources | `rutba-hr/` | 4006 |
| `rutba_accounts` | Accounting | `rutba-accounts/` | 4007 |
| `rutba_payroll` | Payroll | `rutba-payroll/` | 4008 |
| `rutba_cms` | Content editor | `rutba-cms/` | 4009 |
| `rutba_social` | Social media | `rutba-social/` | 4011 |
| `rutba_pos_desk` | Legacy desk | `pos-desk/` | 3000 |

### systemd Unit File Structure

Each service unit looks like this (auto-generated by `write_all_units` in the deploy script):

```ini
[Unit]
Description=Rutba ERP — Auth Portal (pos-auth)
After=network.target

[Service]
Type=simple
User=rutba-nvr
Group=rutba-nvr
WorkingDirectory=/home/rutba-nvr/rutba_builds/build_20250120_141500_main
ExecStart=/usr/bin/node /home/rutba-nvr/rutba_builds/build_20250120_141500_main/scripts/load-env.js \
          -- /usr/bin/npm run start --workspace=pos-auth
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=rutba_pos_auth
LimitNOFILE=65536
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

The `ExecStart` always goes through `scripts/load-env.js`, which reads `.env.production` and injects the correct variables before starting the app. A rollback simply rewrites `WorkingDirectory` and the path in `ExecStart` to point at a different build directory.

---

## 8. Rollback

Rollback is near-instant — no rebuild required. The script re-points systemd unit files at an older build directory.

```bash
sudo bash ~/rutba_active/scripts/rutba_rollback.sh
```

The script will:

1. Show the currently active build
2. List up to 5 available builds with commit info, date, and size
3. Let you select which build to switch to
4. Optionally restore a MySQL backup from `~/db_dumps/`
5. Show a summary and ask for confirmation
6. Stop all services → re-write unit files → update `~/rutba_active` symlink → start services

**Example session:**

```
============================================
  Rutba ERP — Rollback
============================================

  Currently active: build_20250120_141500_main
  Deployed on:      2025-01-20 14:15:00

  Available builds:

    1) build_20250120_141500_main  2025-01-20 14:15:00  [2.1G]  abc1234 Fix sale rounding  (active)
    2) build_20250115_093000_main  2025-01-15 09:30:00  [2.0G]  def5678 Add payroll export
    3) build_20250101_120000_main  2025-01-01 12:00:00  [1.9G]  ghi9012 Initial release

  Select build to rollback to [1-3]:
```

> **Database restore:** Choose a matching dump when rolling back code that changed the DB schema. For code-only fixes, skip the DB restore (option 0).

---

## 9. Disk & Log Management

### 9.1 Automatic Build Pruning

`scripts/rutba_prune_builds.sh` runs automatically at the end of every deploy. It:

- Groups builds by calendar day
- Keeps only the **latest** build per day (earlier same-day builds were superseded)
- Keeps the best build from the last **5 days** (`MAX_BUILDS=5` in config)
- **Never removes** the active build or the just-deployed build

To prune manually:

```bash
sudo bash ~/rutba_active/scripts/rutba_prune_builds.sh
# Or change the retention window:
sudo bash ~/rutba_active/scripts/rutba_prune_builds.sh --max 3
```

### 9.2 Log Rotation

`scripts/rutba_log_rotate.sh` is installed as a **nightly cron job** (02:00) by every deploy:

| Action | Detail |
|---|---|
| Journal vacuum | Keeps last 7 days of journal, caps total at 500 MB |
| Strapi file logs | Deletes `pos-strapi/logs/` entries older than 7 days |
| npm debug logs | Removes stale `npm-debug.log*` from active build |
| Deploy log rotation | Archives `/var/log/rutba_deploy.log` when > 10 MB; keeps archives 30 days |

```bash
# Install or update the cron job
sudo bash ~/rutba_active/scripts/rutba_setup_log_cron.sh

# Run log rotation manually
sudo bash ~/rutba_active/scripts/rutba_log_rotate.sh

# Check rotation activity
tail -f /var/log/rutba_log_rotate.log
```

### 9.3 Interactive Cleanup Tool

`scripts/rutba_build_cleanup.sh` is an interactive disk management tool. It lets you:

- Browse all builds with dates, sizes, branches, and commit info
- Delete selected old builds (the active build is protected)
- Browse all DB dumps with dates and sizes
- Download a dump over SSH (`sz` protocol or base64 fallback)
- Delete selected dumps

```bash
sudo bash ~/rutba_active/scripts/rutba_build_cleanup.sh
```

---

## 10. Re-create Service Files

If systemd service files are missing or corrupted, regenerate them without a full deploy:

```bash
# Auto-detect: uses ~/rutba_active symlink, or most recent build in ~/rutba_builds/
sudo bash ~/rutba_active/scripts/setup-systemd-services.sh

# Explicit build path
sudo bash ~/rutba_active/scripts/setup-systemd-services.sh \
    /home/rutba-nvr/rutba_builds/build_20250120_141500_main
```

After running, reload systemd and start services:

```bash
sudo systemctl daemon-reload
sudo systemctl start rutba_pos_strapi
sleep 5
sudo systemctl start rutba_pos_auth rutba_pos_stock rutba_pos_sale rutba_web \
    rutba_web_user rutba_crm rutba_hr rutba_accounts rutba_payroll rutba_cms \
    rutba_social
```

---

## 11. Update Environment Variables

Master environment files live in `~/rutba_builds/` and are **copied** into each build at deploy time. To update a value without a full redeploy:

```bash
# 1. Edit the master file
sudo nano ~/rutba_builds/.env.production

# 2. Sync it into the currently active build
sudo cp ~/rutba_builds/.env.production ~/rutba_active/.env.production

# 3. Restart only the affected services
#    (Strapi for DB/secret changes, specific apps for their vars)
sudo systemctl restart rutba_pos_strapi
sudo systemctl restart rutba_web
```

> Changes to `NEXT_PUBLIC_*` variables are **baked in at build time** by Next.js. These require a full redeploy — a restart alone will not pick them up.

To apply `NEXT_PUBLIC_*` changes:

```bash
# Update the master file, then redeploy
sudo nano ~/rutba_builds/.env.production
sudo bash ~/rutba_active/scripts/rutba_deploy.sh
```

---

## 12. Automated Deploys

### Branch-Locked Cron Deploy

The deploy script is non-interactive when a branch choice is piped in. It will skip the deploy if already on the latest commit.

```bash
# Add to root's crontab: sudo crontab -e
# Check for updates every 10 minutes, deploy if behind
*/10 * * * * bash /home/rutba-nvr/rutba_active/scripts/rutba_deploy.sh <<< "1" >> /var/log/rutba_deploy.log 2>&1
```

`<<< "1"` selects branch `main`. Use `<<< "2"` for `dev`.

### GitHub Actions / CI

For CI-driven deploys, use **env-var mode** (no `.env` file — the loader reads `process.env`):

```yaml
# .github/workflows/deploy.yml  (example)
- name: Deploy
  run: sudo bash scripts/rutba_deploy.sh <<< "1"
  env:
    ENVIRONMENT: production
    NEXT_PUBLIC_API_URL: ${{ secrets.NEXT_PUBLIC_API_URL }}
    POS_STRAPI__DATABASE_PASSWORD: ${{ secrets.DB_PASSWORD }}
    # ... all other variables from .env.production
```

---

## 13. Troubleshooting

### Service won't start

```bash
# Full error output
sudo journalctl -u rutba_pos_strapi -n 80 --no-pager

# Check the unit file points at a real directory
grep -E 'WorkingDirectory|ExecStart' /etc/systemd/system/rutba_pos_strapi.service

# Verify load-env.js can find its dependencies
ls ~/rutba_active/scripts/env-utils.js ~/rutba_active/scripts/env-config.js

# Verify Node.js is on PATH for the service user
sudo -u rutba-nvr which node
```

### Missing or invalid environment variables

`scripts/load-env.js` logs validation errors to the journal before starting the app:

```bash
sudo journalctl -u rutba_pos_auth -n 20 --no-pager | grep '\[env\]'
# [env] ERROR: Missing global variable: NEXT_PUBLIC_API_URL — Strapi API base URL
# [env] 1 required variable(s) missing — aborting.
```

Fix the value in `~/rutba_builds/.env.production`, copy it to the active build, then restart.

### Port already in use

```bash
sudo lsof -i :4010
sudo kill -9 <PID>
sudo systemctl restart rutba_pos_strapi
```

### Build fails — out of memory

```bash
# Check available memory and disk
free -h
df -h

# Increase Node.js heap for the build
export NODE_OPTIONS="--max-old-space-size=4096"
sudo bash ~/rutba_active/scripts/rutba_deploy.sh
```

### Build fails — disk full

```bash
# Check disk usage
du -sh ~/rutba_builds/build_*/

# Remove old builds interactively
sudo bash ~/rutba_active/scripts/rutba_build_cleanup.sh

# Or prune automatically to last 3 builds
sudo bash ~/rutba_active/scripts/rutba_prune_builds.sh --max 3
```

### Database connection refused

```bash
# Check MySQL is running
sudo systemctl status mysql

# Test connection with the creds from your env file
grep 'POS_STRAPI__DATABASE' ~/rutba_builds/.env.production
mysql -u pos_user -p -h 127.0.0.1 pos_db
```

### Rollback leaves services in failed state

```bash
# The target build may need its node_modules reinstalled
cd /home/rutba-nvr/rutba_builds/build_20250115_093000_main
npm install --production=false
cd pos-strapi && npm install --production=false && cd ..

# Then re-create service files and restart
sudo bash ~/rutba_active/scripts/setup-systemd-services.sh
sudo systemctl daemon-reload
sudo systemctl restart 'rutba_*'
```

### Nightly log rotation not running

```bash
# Check if the cron job exists
sudo crontab -l | grep rutba

# Re-install it
sudo bash ~/rutba_active/scripts/rutba_setup_log_cron.sh

# Run it manually to verify
sudo bash ~/rutba_active/scripts/rutba_log_rotate.sh
cat /var/log/rutba_log_rotate.log
```

---

## 14. Script Reference

| Script | Run As | Purpose |
|---|---|---|
| `scripts/rutba_deploy.sh` | `sudo` | Full deploy: clone → build → backup → swap services |
| `scripts/rutba_rollback.sh` | `sudo` | Rollback to any cached build; optional DB restore |
| `scripts/setup-systemd-services.sh` | `sudo` | Re-create systemd unit files (no rebuild) |
| `scripts/rutba_prune_builds.sh` | `sudo` | Remove old builds, keep last N per-day bests |
| `scripts/rutba_build_cleanup.sh` | `sudo` | Interactive: manage builds + download/delete DB dumps |
| `scripts/rutba_log_rotate.sh` | `sudo` | Vacuum journal, rotate deploy log, clean Strapi logs |
| `scripts/rutba_setup_log_cron.sh` | `sudo` | Install/update nightly log rotation cron (idempotent) |
| `scripts/load-env.js` | service | Env loader: reads `.env.*`, validates, injects per-app vars, spawns app |
| `scripts/generate-docker-env.js` | dev | Generate `.env.docker` for Docker Compose from env files |
| `scripts/env-config.js` | internal | Registry of required variables with severity levels |
| `scripts/env-utils.js` | internal | Shared env utilities: parser, two-mode resolver, validator |

### Config Constants (edit in scripts to match your server)

| Variable | Default | Used In |
|---|---|---|
| `BUILDS_DIR` | `/home/rutba-nvr/rutba_builds` | all deploy scripts |
| `ACTIVE_LINK` | `/home/rutba-nvr/rutba_active` | all deploy scripts |
| `DB_BACKUP_DIR` | `/home/rutba-nvr/db_dumps` | deploy, rollback, cleanup |
| `MAX_BUILDS` | `5` | deploy, prune, rollback |
| `RUN_USER` / `RUN_GROUP` | `rutba-nvr` | deploy, setup-systemd |
| `LOG_FILE` | `/var/log/rutba_deploy.log` | all deploy scripts |
| `REPO_URL` | `https://github.com/eharain/Rutba-ERP.git` | deploy only |
| `JOURNAL_RETAIN_DAYS` | `7` | log rotate |
| `JOURNAL_MAX_SIZE` | `500M` | log rotate |
| `LOG_RETAIN_DAYS` | `30` | log rotate |

