# Rutba ERP — Modular Business Management Platform

An open-source, modular business management system built as an **npm workspaces monorepo**. Each domain (stock, sales, order operations, CRM, HR, accounting, payroll) lives in its own Next.js 16 app, sharing authentication and UI through a common library. Strapi 5 provides the headless API backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      pos-strapi (Strapi 5)                      │
│                     Headless API — port 1337                     │
└───────────┬──────────┬──────────┬──────────┬──────────┬─────────┘
            │          │          │          │          │
  ┌─────────┴──┐ ┌─────┴────┐ ┌──┴───┐ ┌───┴──┐ ┌────┴─────┐
  │ pos-auth   │ │ pos-stock│ │pos-  │ │rutba-│ │rutba-web │
  │ :3003      │ │ :3001    │ │sale  │ │web-  │ │ :3000    │
  │ Auth Portal│ │ Stock    │ │:3002 │ │user  │ │ Public   │
  └────────────┘ └──────────┘ └──────┘ │:3004 │ │ Website  │
                                       └──────┘ └──────────┘
             ┌────────────┐
             │rutba-order-│
             │management  │
             │ :3013      │
             └────────────┘
             ┌────────────┐
             │rutba-rider │
             │ :3012      │
             │ Rider App  │
             └────────────┘
  ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐
  │ rutba-crm│ │ rutba-hr │ │ rutba-     │ │ rutba-     │
  │ :3005    │ │ :3006    │ │ accounts   │ │ payroll    │
  │ CRM      │ │ HR       │ │ :3007      │ │ :3008      │
  └──────────┘ └──────────┘ └────────────┘ └────────────┘
```

## Applications

| Directory | App | Port | Description |
|---|---|---|---|
| `pos-strapi/` | **Strapi API** | 1337 | Strapi 5.x headless CMS — all content types, REST API |
| `packages/pos-shared/` | **Shared Library** | — | Components, context providers, utilities shared by all apps |
| `pos-auth/` | **Auth Portal** | 3003 | Login, OAuth flow, user management, app-access admin |
| `pos-stock/` | **Stock Management** | 3001 | Products, purchases, stock items, suppliers, brands, categories |
| `pos-sale/` | **Point of Sale** | 3002 | Sales, cart, returns, cash register, reports |
| `rutba-web/` | **Public Website** | 3000 | Customer-facing store (Next.js 15, TypeScript, Tailwind CSS) |
| `rutba-web-user/` | **My Orders** | 3004 | Customer order tracking, returns, account management |
| `rutba-order-management/` | **Order Management** | 3013 | Delivery operations, rider assignment, order status workflows, notification templates |
| `rutba-rider/` | **Rider App** | 3012 | Rider offers, active deliveries, status updates, buyer messaging |
| `rutba-crm/` | **CRM** | 3005 | Contacts, leads, activities, customer relationship management |
| `rutba-hr/` | **Human Resources** | 3006 | Employees, departments, attendance, leave requests |
| `rutba-accounts/` | **Accounting** | 3007 | Chart of accounts, journal entries, invoices, expenses |
| `rutba-payroll/` | **Payroll** | 3008 | Salary structures, payroll runs, payslips |
| `pos-desk/` | Legacy App | 3000 | Original combined app — kept for reference, not actively developed |

## Tech Stack

- **Frontend:** Next.js 16, React 19, Bootstrap 5 (POS apps), Tailwind CSS (rutba-web)
- **Backend:** Strapi 5.x (MySQL)
- **Auth:** OAuth-like flow via `pos-auth` with JWT, per-app localStorage
- **Monorepo:** npm workspaces

## Quick Start

### Prerequisites

- Node.js ≥ 18
- MySQL 8.x (or MariaDB)

### Development

```bash
# 1. Clone the repository
git clone https://github.com/eharain/Rutba-ERP.git
cd Rutba-POS

# 2. Install all dependencies (monorepo-wide)
npm install

# 3. Set up Strapi .env (copy and edit)
cp pos-strapi/.env.example pos-strapi/.env

# 4. Start Strapi API
cd pos-strapi && npm run develop

# 5. In separate terminals, start any app:
npm run dev:auth       # Auth Portal   → http://localhost:4003
npm run dev:stock      # Stock Mgmt    → http://localhost:4001
npm run dev:sale       # Point of Sale → http://localhost:4002
npm run dev:web        # Public Website→ http://localhost:4000
npm run dev:web-user   # My Orders     → http://localhost:4004
npm run dev:order-management # Order Mgmt   → http://localhost:4013
npm run dev:rider      # Rider App     → http://localhost:4012
npm run dev:crm        # CRM           → http://localhost:4005
npm run dev:hr         # HR            → http://localhost:4006
npm run dev:accounts   # Accounts      → http://localhost:4007
npm run dev:payroll    # Payroll       → http://localhost:4008
```

Or use the convenience batch files:

```bash
dev-start.bat          # Start ALL services (Windows)
dev-stop.bat           # Stop ALL Node.js processes (Windows)
```

### Build All Apps

```bash
npm run build:all
```

### Docker (Production)

```bash
# 1. Copy and fill in environment variables
cp .env.example .env

# 2. Build and start all services (MySQL + Strapi + all configured Next.js apps)
docker compose up -d --build

# 3. View logs
docker compose logs -f strapi auth stock

# 4. Rebuild a single service
docker compose up -d --build auth

# 5. Stop everything
docker compose down
```

| Service | URL |
|---|---|
| MySQL | `localhost:3306` |
| Strapi API | http://localhost:1337 |
| Public Website | http://localhost:4000 |
| Stock Management | http://localhost:4001 |
| Point of Sale | http://localhost:4002 |
| Auth Portal | http://localhost:4003 |
| My Orders | http://localhost:4004 |
| Order Management | http://localhost:4013 |
| Rider App | http://localhost:4012 |
| CRM | http://localhost:4005 |
| HR | http://localhost:4006 |
| Accounts | http://localhost:4007 |
| Payroll | http://localhost:4008 |
| CMS | http://localhost:4009 |
| Social | http://localhost:4011 |

## Scripts Directory

| Script | Purpose |
|---|---|
| `scripts/setup-and-start-all.bat` | Interactive first-time setup (env config, install, start) — Windows |
| `scripts/setup-and-start-all.sh` | Same as above — Linux/macOS |
| `scripts/setup-and-start-all_custom_node.bat` | Same setup using a local Node.js binary |
| `scripts/run_strapi_and_pos.bat` | Quick start Strapi + all Next.js apps — Windows |
| `scripts/run_strapi_and_pos_custom_node.bat` | Same using local Node.js binary |
| `scripts/rutba_deploy.sh` | Production deploy script — clone, build, swap systemd services |
| `scripts/rutba_rollback.sh` | Rollback to a previous build (instant, no rebuild) |
| `scripts/rutba_services.sh` | Service manager: start/stop/restart/status/rebuild/tail/diagnose |
| `scripts/rutba_deployed_environment.sh` | Shared env bootstrap for all deployment scripts |
| `scripts/setup-systemd-services.sh` | Standalone systemd unit installer (legacy; prefer `rutba_services.sh rebuild`) |
| `scripts/js/load-env.js` | Centralized env loader — reads `.env.<ENVIRONMENT>`, injects per-app vars |
| `scripts/hostinger/deploy.js` | One-command Hostinger deploy orchestrator (build, upload, Passenger setup, restart) |
| `scripts/hostinger/restart.js` | Restart Passenger for one or all Hostinger apps |

> **📖 Full deployment guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Hostinger Deployment (Shared Hosting)

The `scripts/hostinger/` directory contains a full deployment toolkit for
Hostinger Business Web Hosting (Passenger + Node.js 22). See
[scripts/hostinger/README.md](scripts/hostinger/README.md) for details.

### Setup Steps

1. **Create domains** — In Hostinger hPanel, create the website/subdomain for each app (e.g. `rutba.pk`, `rutba.rutba.pk`, `stock.rutba.pk`, etc.)
2. **Create MySQL database** — In hPanel → Databases, create a MySQL database and user for Strapi
3. **Configure environment** — Copy `.env.example` to `.env.production` at the repo root and fill in all `NEXT_PUBLIC_*` URLs, Strapi DB credentials, and `NEXTAUTH_SECRET` values
4. **Set SSH password** — Export the Hostinger SSH password: `set HOSTINGER_SSH_PASSWORD=<password>`
5. **Deploy Strapi** — `node scripts/hostinger/deploy.js strapi` (uploads source, installs deps, builds, configures Passenger)
6. **Deploy web apps** — `node scripts/hostinger/deploy.js web` (builds locally as standalone, uploads, configures Passenger)
7. **Verify** — Visit `https://rutba.rutba.pk` (Strapi API) and `https://rutba.pk` (web app)

### Common Commands

```bash
node scripts/hostinger/deploy.js web                # Full deploy (build + upload + restart)
node scripts/hostinger/deploy.js strapi              # Full Strapi deploy
node scripts/hostinger/deploy.js web --skip-build    # Re-upload existing build
node scripts/hostinger/deploy.js strapi --env-only   # Update Strapi .env + restart
node scripts/hostinger/restart.js web                # Restart single app
node scripts/hostinger/restart.js --all              # Restart all apps
```

## Strapi Content Types

| Domain | Content Types |
|---|---|
| **Core** | Product, Category, Brand, Supplier, Purchase, Stock Item, Sale, Sale Item, Return |
| **Auth** | App Access (linked to users for per-app access control) |
| **CRM** | CRM Contact, CRM Lead, CRM Activity |
| **HR** | HR Employee, HR Department, HR Attendance, HR Leave Request |
| **Payroll** | Salary Structure, Payroll Run, Payslip |
| **Accounting** | Account (chart of accounts), Journal Entry, Invoice, Expense |

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Contact: Ejaz Arain — https://www.linkedin.com/in/ejazarain/
