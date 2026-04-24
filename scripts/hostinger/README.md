# Hostinger Deployment Scripts

Deploy Rutba ERP apps to Hostinger shared hosting via SSH/SFTP + Passenger.

## Why?

Hostinger Business Web Hosting uses **Passenger** to run Node.js apps.
Next.js 16 with Turbopack **cannot build on the server** due to shared-hosting
worker spawn limits (`EAGAIN` / `ERR_WORKER_INIT_FAILED`). These scripts solve
this by building locally as `standalone` output and uploading the result.

Strapi builds fine on the server, so it has its own deployment flow.

## Prerequisites

- Node.js 22+ on your local machine
- `ssh2` npm package installed (`npm install` at repo root)
- `HOSTINGER_SSH_PASSWORD` env var set (SSH password from hPanel)
- `.env.production` at repo root with correct production values
- Website already created in Hostinger hPanel for the target domain

## Quick Start

```bash
# Full deploy — builds locally, uploads, configures Passenger, restarts
node scripts/hostinger/deploy.js web

# Deploy Strapi
node scripts/hostinger/deploy.js strapi

# Re-deploy without rebuilding (e.g. after config change)
node scripts/hostinger/deploy.js web --skip-build

# Just restart an app
node scripts/hostinger/restart.js web

# Restart all apps
node scripts/hostinger/restart.js --all
```

## Available Apps

| Name       | Type    | Workspace        | Domain             |
|------------|---------|------------------|--------------------|
| `strapi`   | strapi  | pos-strapi       | rutba.rutba.pk     |
| `web`      | nextjs  | rutba-web        | rutba.pk           |
| `web-user` | nextjs  | rutba-web-user   | user.rutba.pk      |
| `rider`    | nextjs  | rutba-rider      | rider.rutba.pk     |
| `auth`     | nextjs  | pos-auth         | auth.rutba.pk      |
| `stock`    | nextjs  | pos-stock        | stock.rutba.pk     |
| `sale`     | nextjs  | pos-sale         | sale.rutba.pk      |
| `crm`      | nextjs  | rutba-crm        | crm.rutba.pk       |
| `hr`       | nextjs  | rutba-hr         | hr.rutba.pk        |
| `accounts` | nextjs  | rutba-accounts   | accounts.rutba.pk  |
| `payroll`  | nextjs  | rutba-payroll    | payroll.rutba.pk   |
| `cms`      | nextjs  | rutba-cms        | cms.rutba.pk       |
| `social`   | nextjs  | rutba-social     | social.rutba.pk    |

## Scripts

### `deploy.js` — Main orchestrator

```bash
node scripts/hostinger/deploy.js <app> [options]
```

| Option           | Description                                    |
|------------------|------------------------------------------------|
| `--skip-build`   | Skip local build, re-upload existing output    |
| `--restart-only` | Just touch restart.txt (Next.js apps)          |
| `--env-only`     | Update .env and restart only (Strapi)          |

### `build-local.js` — Local Next.js build

Reads `.env.production`, sets `NEXT_BUILD_OUTPUT=standalone`, runs
`next build` + `flatten-standalone.js`.

```bash
node scripts/hostinger/build-local.js web
```

### `upload.js` — Upload standalone build

Creates a tarball of `.next/standalone` + `.next/static`, uploads via SFTP,
extracts on the server.

```bash
node scripts/hostinger/upload.js web
```

### `setup-passenger.js` — Configure Passenger

Writes `.htaccess` and `app.js` to the remote `public_html` directory.

```bash
node scripts/hostinger/setup-passenger.js web
node scripts/hostinger/setup-passenger.js strapi
```

### `deploy-strapi.js` — Strapi-specific deploy

Uploads Strapi source, writes `.env` with production DB credentials and
CORS origins, runs `npm install` + `strapi build`, sets up Passenger.

```bash
node scripts/hostinger/deploy-strapi.js
node scripts/hostinger/deploy-strapi.js --skip-build
node scripts/hostinger/deploy-strapi.js --env-only
```

### `restart.js` — Restart Passenger

```bash
node scripts/hostinger/restart.js web
node scripts/hostinger/restart.js --all
```

## Configuration

All config lives in `hostinger.config.js`:

- **SSH credentials**: reads `HOSTINGER_SSH_PASSWORD` env var (required, no fallback)
- **App registry**: maps app names → domains, workspace dirs, env prefixes
- **Node path**: `/opt/alt/alt-nodejs22/root/usr/bin/node`

### Adding a new app

1. Create the website/subdomain in Hostinger hPanel
2. Add an entry to `APPS` in `hostinger.config.js`
3. Add env vars in `.env.production` (globals + `PREFIX__*` app-specific)
4. Run `node scripts/hostinger/deploy.js <newApp>`

## How It Works

### Next.js Apps

```
Local Machine                    Hostinger Server
─────────────                    ────────────────
1. build-local.js
   → next build (standalone)
   → flatten-standalone.js

2. upload.js                     
   → tar .next/standalone        → extract to ~/domains/<domain>/public_html/
   → SFTP upload                 → _next/static/ placed alongside

3. setup-passenger.js            → .htaccess (Passenger config)
                                 → app.js (requires server.js)

4. restart.js                    → touch tmp/restart.txt
```

### Strapi

```
Local Machine                    Hostinger Server
─────────────                    ────────────────
1. deploy-strapi.js
   → tar source (excl node_modules)
   → SFTP upload                 → extract to public_html/
                                 → npm install
                                 → npx strapi build
                                 → .env with DB creds + CORS
                                 → .htaccess + app.js
                                 → touch tmp/restart.txt
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `EAGAIN` / `ERR_WORKER_INIT_FAILED` | Don't build on server. Use `build-local.js` |
| `Access denied` MySQL | Reset DB password in hPanel → update `.env.production` → redeploy Strapi |
| CORS errors | CORS origins auto-generated from all app domains. Redeploy Strapi: `deploy.js strapi --env-only` |
| SSH `ECONNRESET` | Hostinger drops long connections. The tar approach avoids this |
| App shows default page | Check `.htaccess` exists: `node scripts/hostinger/setup-passenger.js <app>` |
| `server.js not found` | Run `build-local.js` then `upload.js` |

node scripts/hostinger/restart.js --all        # Restart everything