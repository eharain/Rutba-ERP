# Rutba ERP — Modular Business Management Platform

An open-source, modular business management system built as an **npm workspaces monorepo**. Each domain (stock, sales, order operations, CRM, HR, accounting, payroll) lives in its own Next.js 16 app, sharing authentication and UI through a common library. Strapi 5 provides the headless API backend.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      services/strapi (Strapi 5)                      │
│                  Headless API — port 4010 (dev)                  │
└──┬───────┬───────┬───────┬───────┬───────┬───────┬───────┬──────┘
   │       │       │       │       │       │       │       │
 pos-    pos-    pos-   rutba-  rutba-  rutba-  rutba-   rutba-
 auth    stock   sale   web     web-    cms     social   order-
 :4003   :4001   :4002  :4000   user    :4009   :4011    mgmt
                                :4004                     :4013

 rutba-  rutba-  rutba-  rutba-  rutba-  rutba-  rutba-  rutba-
 rider   crm     hr      ess     acct    payroll mfg     inventory
 :4012   :4005   :4006   :4015   :4007   :4008   :4014   :4017

 Shared:  packages/shared  (UI + context)
          packages/api-provider (descriptor-driven Strapi clients)
          packages/strapi-api-pro (Strapi plugin: auth + scope enforcement)
```

## Applications

| Directory | App | Port | Description |
|---|---|---|---|
| `services/strapi/` | **Strapi API** | 4010 | Strapi 5.x headless CMS — content types, REST API, lifecycle hooks |
| `services/core/` | **Core API** | 4020 | In-house backend replacing services/strapi: serves the descriptor API from the same database (strangler migration) |
| `packages/shared/` | **Shared Library** | — | Components, context providers, utilities shared by all apps |
| `packages/api-provider/` | **API descriptors** | — | Single source of truth for every Strapi endpoint; scaffolder emits per-app client + server bindings |
| `packages/strapi-api-pro/` | **Strapi RBAC plugin** | — | Replaces api-guard-pro: descriptor-driven auth, role scope, claim caching |
| `apps/admin/auth/` | **Auth Portal** | 4003 | Login, OAuth-style flow, user management, app-access admin |
| `apps/inventory/stock/` | **Stock Management** | 4001 | Products, purchases, stock items, suppliers, brands, categories |
| `apps/sales/pos/` | **Point of Sale** | 4002 | Sales, cart, returns, cash register, reports |
| `apps/content/storefront/` | **Public Website** | 4000 | Storefront — Next.js 16, SSR, sale offers, checkout (express + full address), COD |
| `apps/sales/portal/` | **My Orders** | 4004 | Customer order tracking, returns, account management |
| `apps/content/cms/` | **CMS** | 4009 | Page authoring, product groups, CMS sections, SEO defaults, bulk import/export |
| `apps/content/social/` | **Social** | 4011 | Social-account management, post composer with product preview |
| `apps/sales/orders/` | **Order Management** | 4013 | Stage-based order shell (per-status components funnelled through one state-machine chokepoint), returns inbox + detail, label printing, delivery ops, rider assignment, payment verify, notification templates |
| `apps/sales/rider/` | **Rider App** | 4012 | Rider offers, active deliveries, status updates, buyer messaging |
| `apps/sales/crm/` | **CRM** | 4005 | Contacts, leads, activities, person browse + dedup audit (planned) |
| `apps/people/hr/` | **Human Resources** | 4006 | Employees, departments, attendance, leave requests |
| `apps/people/ess/` | **Employee Self-Service** | 4015 | Employee portal — own profile, attendance, leave requests, payslips |
| `apps/finance/accounts/` | **Accounting** | 4007 | Chart of accounts, journal entries, invoices, expenses |
| `apps/finance/payroll/` | **Payroll** | 4008 | Salary structures, payroll runs, payslips, deduction rules, employee profiles, adjustments |
| `apps/inventory/manufacturing/` | **Manufacturing** | 4014 | Tailoring production — work orders, tasks/piece-rate, BOM (multi-output + auto-consume), bundles, operations, material lots/issues, QC, reusable production templates |
| `apps/inventory/control/` | **Inventory Management** | 4017 | Warehouses/bins, stock levels, transfers, adjustments, cycle counts, batch/expiry, reorder/replenishment, inventory valuation |
| `apps/sales/marketplace/` | **Marketplace** | 4016 | Channel listings, mapping, pricing and account wiring; a background sync worker (portless) runs alongside |
| `apps/admin/seed/` | **Seeding Control** | 4018 | Guarded runner for the seed registry — run history, per-seeder execution |
| `apps/content/campaigns/` | **Campaigns** | 4019 | Audiences, templates, campaign runs and delivery settings |
| `apps/content/mail/` | **Mail** | 4021 | Mail client over live IMAP — shared inboxes, contacts, server settings |
| `apps/admin/console/` | **Admin Console** | 4022 | Central users, app domains, mailboxes, email-server registry, invite flow, social accounts and relay providers |
| `apps/sales/helpdesk/` | **Helpdesk** | 4023 | Tickets, desks and routing — the first Rutba-Core-native module |

> Ports above are the workspace defaults; `process.env.PORT` (set by Hostinger / Passenger / Docker) always overrides. See [.env.example](.env.example) for the `<APP_PREFIX>__PORT=` overrides.

## Tech Stack

- **Frontend:** Next.js 16, React 19, Bootstrap 5 (POS / admin apps), Tailwind CSS (apps/content/storefront storefront)
- **Backend:** Strapi 5.x (MySQL / MariaDB); custom plugin `packages/strapi-api-pro` for descriptor-driven RBAC
- **Auth:** OAuth-style flow via `apps/admin/auth` with JWT + per-app `app_access` rows; `X-Rutba-App` / `X-Rutba-App-Role` headers select the active claim
- **Data API layer:** `packages/api-provider` descriptors are the single source of truth; the scaffolder emits per-app clients and `.d.ts` sidecars
- **Monorepo:** npm workspaces; env loader at `scripts/js/load-env.js` resolves `<APP_PREFIX>__VAR` overrides into bare env vars per child process

## Quick Start

### Prerequisites

- Node.js ≥ 18
- MySQL 8.x (or MariaDB)

### Development

```bash
# 1. Clone the repository
git clone https://github.com/eharain/Rutba-ERP.git
cd Rutba-ERP

# 2. Install all dependencies (monorepo-wide)
npm install

# 3. Set up environment — copy the dev template and edit DB creds at minimum.
#    Per-app vars use the APP_PREFIX__NAME convention (e.g. POS_STRAPI__PORT=4010).
#    Workspace .env files (services/strapi/.env, etc.) are intentionally empty —
#    do NOT add vars there; the loader strips prefixes from the root .env.<ENV>
#    See [.env.example](.env.example) for the contract.
cp .env.example .env.development

# 4. Start Strapi via the workspace launcher (NOT `cd services/strapi`).
#    The launcher runs load-env.js so POS_STRAPI__* vars become DATABASE_*, etc.
npm run dev:strapi          # Strapi API      → http://localhost:4010

# 5. In separate terminals, start any app:
npm run dev:auth             # Auth Portal     → http://localhost:4003
npm run dev:stock            # Stock Mgmt      → http://localhost:4001
npm run dev:sale             # Point of Sale   → http://localhost:4002
npm run dev:web              # Public Website  → http://localhost:4000
npm run dev:web-user         # My Orders       → http://localhost:4004
npm run dev:cms              # CMS authoring   → http://localhost:4009
npm run dev:social           # Social composer → http://localhost:4011
npm run dev:order-management # Order Mgmt      → http://localhost:4013
npm run dev:rider            # Rider App       → http://localhost:4012
npm run dev:crm              # CRM             → http://localhost:4005
npm run dev:hr               # HR              → http://localhost:4006
npm run dev:ess              # Employee Self-Service → http://localhost:4015
npm run dev:accounts         # Accounts        → http://localhost:4007
npm run dev:payroll          # Payroll         → http://localhost:4008
npm run dev:manufacturing    # Manufacturing   → http://localhost:4014
npm run dev:inventory        # Inventory Mgmt   → http://localhost:4017
npm run dev:all              # Strapi + every app (Linux/macOS friendly)
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
| Strapi API | http://localhost:4010 |
| Public Website | http://localhost:4000 |
| Stock Management | http://localhost:4001 |
| Point of Sale | http://localhost:4002 |
| Auth Portal | http://localhost:4003 |
| My Orders | http://localhost:4004 |
| CRM | http://localhost:4005 |
| HR | http://localhost:4006 |
| Employee Self-Service | http://localhost:4015 |
| Accounts | http://localhost:4007 |
| Payroll | http://localhost:4008 |
| CMS | http://localhost:4009 |
| Social | http://localhost:4011 |
| Rider App | http://localhost:4012 |
| Order Management | http://localhost:4013 |
| Manufacturing | http://localhost:4014 |
| Marketplace | http://localhost:4016 |
| Inventory Management | http://localhost:4017 |
| Seeding Control | http://localhost:4018 |
| Campaigns | http://localhost:4019 |
| Core API | http://localhost:4020 |
| Mail | http://localhost:4021 |
| User Management | http://localhost:4022 |
| Helpdesk | http://localhost:4023 |

## Scripts Directory

| Script | Purpose |
|---|---|
| `scripts/rutba_apps.sh` | **Service registry — single source of truth** for every deployable unit, its npm command and its port |
| `scripts/rutba_deploy.sh` | Production deploy script — clone, build, swap systemd services |
| `scripts/rutba_rollback.sh` | Rollback to a previous build (instant, no rebuild) |
| `scripts/rutba_services.sh` | Service manager: start/stop/restart/status/rebuild/tail/diagnose |
| `scripts/rutba_deployed_environment.sh` | Shared env bootstrap for all deployment scripts |
| `scripts/rutba_seed.sh` | Run the seed engine against a deployed build |
| `scripts/rutba_db_backup.sh` | Database backup |
| `scripts/rutba_log_rotate.sh` | Vacuum journals, rotate the deploy log |
| `scripts/setup-systemd-services.sh` | Standalone systemd unit installer (legacy; prefer `rutba_services.sh rebuild`) |
| `scripts/js/load-env.js` | Centralized env loader — reads `.env.<ENVIRONMENT>`, injects per-app vars |
| `scripts/js/generate-docker-env.js` | Generate `.env.docker` for Docker Compose from the env files |
| `scripts/js/verify-app-wiring.js` | Check every app in the registry is wired into package.json, env, Docker and the dev launcher |
| `scripts/js/verify-docs.js` | Check the documentation against the tree — links, cited paths, line numbers, ports, commits |

> **📖 Full deployment guide:** [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Managed hosting (Hostinger / PaaS)

To run a single app (typically `apps/content/storefront`) on managed Node.js hosting rather
than the systemd estate, see
[§13 of the deployment guide](docs/DEPLOYMENT.md#13-deploying-a-single-app-on-hostinger--paas).
The platform sets `PORT` and the env loader respects it, so no per-app port
configuration is needed.

## Strapi Content Types

Browse `services/strapi/src/api/*/content-types/*/schema.json` for the full list.
Key domain groupings:

| Domain | Content Types |
|---|---|
| **Catalog** | Product (with `slug` as canonical URL key), Variant, Category, Category Group, Brand, Brand Group, Product Group |
| **Inventory** | Stock Item (state machine: Received → InStock → Reserved → Sold/Returned/Expired/…; three stock models — **serialized**, **bulk** via `track_mode`, **divisible** via `sellable_units`/`units_sold`), Purchase, Purchase Item, Supplier |
| **Warehousing** | Warehouse (branch → warehouse; type warehouse/store/transit/virtual/supplier/customer), Storage Location (self-referential bin tree: zone → aisle → rack → shelf → bin), Stock Level (per product/warehouse/location on-hand cache) |
| **Batch / Expiry** | Stock Batch (batch_code, manufacture/expiry dates, status Active/Expired/Quarantined/Depleted/Recalled, quantity ledger for bulk); per-unit `stock_item.expiry_date`; FEFO at sale + daily expiry sweep |
| **Reordering** | Reorder Policy (per product/warehouse; method MinMax/ReorderPoint/ParLevel/Manual; min/max/safety stock; source Purchase/Manufacture/Transfer; suggestion engine + generate-purchases/work-orders) |
| **Sales (POS)** | Sale, Sale Item (+ `sellable_qty`/`allocations` for divisible portions), Sale Return, Sale Return Item, Cash Register, Cash Register Transaction |
| **Orders (Web)** | Sale Order (state machine with returns detour, COD + payment verification, stock-item attach, label cache), Sale Offer, Delivery Method, Delivery Zone, Order Message, Order Parcel (planned) |
| **Returns** | Return Request (state machine with restock-decision walk), Return Method (own_rider_pickup / courier_dropoff / walk_in), Return Policy (window + scope), Return Line component |
| **People** | Person (canonical contact identity), Address, Person Dedup Audit, Customer, Customer Address (legacy), Contact Ticket |
| **CRM** | CRM Contact, CRM Lead, CRM Activity |
| **HR** | HR Employee, HR Department, HR Team, HR Attendance, HR Leave Request |
| **Payroll** | Salary Structure, Payroll Run, Payslip, Pay Adjustment, Pay Employee Profile, Pay Deduction Rule (configurable statutory engine) |
| **Manufacturing** | Mfg Work Order (auto-consume inputs + finished-goods receipt on completion), Mfg BOM (versioned; **multi-output** co/by-products via `outputs[]`), Mfg Production Template (reusable product-type recipe → instantiates versioned BOMs), Mfg Task (piece-rate), Mfg Bundle, Mfg Operation, Mfg Piece Rate, Mfg Material Lot, Mfg Material Issue, Mfg QC Inspection, Mfg Production Line, Mfg Worker Profile, Mfg Defect Type (tailoring) |
| **Accounting** | Acc Account (CoA), Acc Account Mapping, Acc Journal Entry, Acc Journal Line, Acc Fiscal Period, Acc Invoice, Acc Bill, Acc Bank Account, Acc Expense, Acc Tax Rate |
| **Delivery** | Rider, Delivery Offer, Delivery Method, Delivery Zone |
| **CMS** | CMS Page, CMS Page Group, CMS Menu, CMS Menu Item, CMS Footer |
| **Notifications** | Notification Template, Notification Event, Notification Log, Notification Preference |
| **Auth / RBAC** | via `strapi-api-pro` plugin: App Domain, App Role, API Interface, API Interface Method, API Method Policy |
| **Site** | Site Setting, Branch, Currency |

## Documentation

### Operational

- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — full deployment guide
- [docs/BUILD-DEPLOYMENT-SETUP-TEMPLATE.md](docs/BUILD-DEPLOYMENT-SETUP-TEMPLATE.md) — per-app build template
- [docs/pre-deployment-test-plan.md](docs/pre-deployment-test-plan.md) — Tier 1–5 test plan
- [docs/SHOP-PAGE-REDESIGN-PLAN.md](docs/SHOP-PAGE-REDESIGN-PLAN.md) — storefront redesign reference

### Architecture & design

- [docs/accounting-architecture.md](docs/accounting-architecture.md) — accounting overview (paired with the engine implementation guide below)
- [docs/rutba-notification-system-design.md](docs/rutba-notification-system-design.md) — template-driven notifications

### Features

- [docs/features/divisible-stock.md](docs/features/divisible-stock.md) — sell one physical item in many sellable sub-units (tablet box, lace roll); allocation/release engine, FEFO, POS wiring on both sale surfaces.
- [docs/todo/inventory-manufacturing-program/](docs/todo/inventory-manufacturing-program/00-overview-and-roadmap.md) — 5-epic inventory & manufacturing program (warehouses/bins, batch/expiry/FEFO, reconciliation, reordering, mfg recipes + multi-output). See the overview's **Implementation status (as-built)** section for what has shipped.

### Strategy & roadmap

- [docs/todo/ROADMAP.md](docs/todo/ROADMAP.md) — product roadmap.
- [docs/todo/market-strategy/](docs/todo/market-strategy/README.md) — productization strategy (SME commerce ERP SaaS), competitor benchmark, phased roadmap.
- [docs/todo/rightapp-gap-analysis/](docs/todo/rightapp-gap-analysis/README.md) — legacy RightApp ERP vs. current Rutba gap analysis + carry-over plan.

### Active planning docs (`docs/todo/`)

Forward-looking work, organised by surface. Items marked ✓ have shipped. Cross-cutting cleanup / tech-debt (dead code, stale scripts, config drift) is tracked in [tech-debt-cleanup.md](docs/todo/tech-debt-cleanup.md).

- [order-lifecycle-plan.md](docs/todo/order-lifecycle-plan.md) — payment / packaging / delivery / refund / returns / audit-log roadmap. **Recently shipped (2026-05-21):** stock-item state-machine closed on CANCELLED + DELIVERED (E.1/B.0); returns workflow end-to-end (F.1/F.2/F.3/F.5) — customer self-serve, staff console, restock-decision walk, return-policy window; label-provider registry + print pages (C.5). **Next up:** A.0 (tighten `verifyPayment`), then A.4 (pre-dispatch confirmation queue), with G.1 (audit log + buyer timeline) flagged priority.
- [accounting-engine-implementation.md](docs/todo/accounting-engine-implementation.md) — 19-phase accounting engine spec. The accounting engine + double-entry posting + reports are **built** (see [accounting-completion-spec.md](docs/todo/accounting-completion-spec.md) for the actual build state vs. spec); remaining work is frontend polish and the wider COA/reporting surface.
- [payroll-module-implementation.md](docs/todo/payroll-module-implementation.md) — payroll module spec. **Built:** the `pay-payroll-run` engine, configurable deduction engine (`pay-deduction-rule`), employee profiles, and adjustments; posts into the accounting ledger.
- [contact-entity-unification.md](docs/todo/contact-entity-unification.md) — Phase 1A (person + address + sale-order rewire) and 1C.5 (contact-ticket), 3.3 (UP signup promotion) ✓. Phase 1B (customer backfill) is next.
- [contact-unification-launch-test-plan.md](docs/todo/contact-unification-launch-test-plan.md) — Tier P0/P1/P2 test plan for the unification work.
- [storefront-launch-backlog.md](docs/todo/storefront-launch-backlog.md) — storefront pre/post-launch backlog.
- [storefront-readable-slug-urls.md](docs/todo/storefront-readable-slug-urls.md) — ✓ shipped (commit `4bb1dd7`).
- [address-book-server-side.md](docs/todo/address-book-server-side.md) — ✓ server-side address book shipped (`/me/addresses` on the person/address model); only fold-anonymous-on-login + a checkout multi-address picker remain.
- [barcode-qr-deep-link.md](docs/todo/barcode-qr-deep-link.md) — storefront-URL QR + POS scanner strip. Blocked on the slug pass (now done).
- [cms-preview-from-storefront.md](docs/todo/cms-preview-from-storefront.md) — draft-mode preview from CMS to storefront.
- [site-settings-multi-tenant.md](docs/todo/site-settings-multi-tenant.md) — singleType → collectionType per app, with SEO follow-ups.
- [project_api_provider_named_policy_architecture.md](docs/todo/project_api_provider_named_policy_architecture.md) — target architecture for descriptor-driven Strapi policies.
- [project_api_provider_wire_codec.md](docs/todo/project_api_provider_wire_codec.md) — short-name URL codec for public `api/web/*` traffic; closes schema-enumeration vector.
- [feedback_generated_code_verbosity.md](docs/todo/feedback_generated_code_verbosity.md), [feedback_scaffolder_inline_generation.md](docs/todo/feedback_scaffolder_inline_generation.md), [feedback_strict_rollout_no_warn_phase.md](docs/todo/feedback_strict_rollout_no_warn_phase.md) — design-rule notes used by the scaffolder and validator work.

## Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

Contact: Ejaz Arain — https://www.linkedin.com/in/ejazarain/
