# Rutba POS — Modular Business Management Platform

An open-source, modular business management system built as an **npm workspaces monorepo**. Each domain (stock, sales, CRM, HR, accounting, payroll) lives in its own Next.js 15 app, sharing authentication and UI through a common library. Strapi 5 provides the headless API backend.

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
| `rutba-crm/` | **CRM** | 3005 | Contacts, leads, activities, customer relationship management |
| `rutba-hr/` | **Human Resources** | 3006 | Employees, departments, attendance, leave requests |
| `rutba-accounts/` | **Accounting** | 3007 | Chart of accounts, journal entries, invoices, expenses |
| `rutba-payroll/` | **Payroll** | 3008 | Salary structures, payroll runs, payslips |
| `pos-desk/` | Legacy App | 3000 | Original combined app — kept for reference, not actively developed |

## Tech Stack

- **Frontend:** Next.js 15, React 19, Bootstrap 5 (POS apps), Tailwind CSS (rutba-web)
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
git clone https://github.com/eharain/Rutba-POS.git
cd Rutba-POS

# 2. Install all dependencies (monorepo-wide)
npm install

# 3. Set up Strapi .env (copy and edit)
cp pos-strapi/.env.example pos-strapi/.env

# 4. Start Strapi API
cd pos-strapi && npm run develop

# 5. In separate terminals, start any app:
npm run dev:auth       # Auth Portal   → http://localhost:3003
npm run dev:stock      # Stock Mgmt    → http://localhost:3001
npm run dev:sale       # Point of Sale → http://localhost:3002
npm run dev:web        # Public Website→ http://localhost:3000
npm run dev:web-user   # My Orders     → http://localhost:3004
npm run dev:crm        # CRM           → http://localhost:3005
npm run dev:hr         # HR            → http://localhost:3006
npm run dev:accounts   # Accounts      → http://localhost:3007
npm run dev:payroll    # Payroll       → http://localhost:3008
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

# 2. Build and start all services (MySQL + Strapi + 9 Next.js apps)
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
| Public Website | http://localhost:3000 |
| Stock Management | http://localhost:3001 |
| Point of Sale | http://localhost:3002 |
| Auth Portal | http://localhost:3003 |
| My Orders | http://localhost:3004 |
| CRM | http://localhost:3005 |
| HR | http://localhost:3006 |
| Accounts | http://localhost:3007 |
| Payroll | http://localhost:3008 |

## Scripts Directory

| Script | Purpose |
|---|---|
| `scripts/setup-and-start-all.bat` | Interactive first-time setup (env config, install, start) — Windows |
| `scripts/setup-and-start-all.sh` | Same as above — Linux/macOS |
| `scripts/setup-and-start-all_custom_node.bat` | Same setup using a local Node.js binary |
| `scripts/run_strapi_and_pos.bat` | Quick start Strapi + all Next.js apps — Windows |
| `scripts/run_strapi_and_pos_custom_node.bat` | Same using local Node.js binary |
| `scripts/start-pos-strapi-forever.sh` | Start Strapi with `forever` (production) |
| `scripts/rutba_deploy_master.sh` | CI/CD deploy script (pull, build, restart systemd services) |

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