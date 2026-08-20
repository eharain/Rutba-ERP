# Rutba ERP — module reference

<!-- GENERATED FILE — do not edit by hand. Run `npm run docs:modules`. -->

Every module in the estate, joined from the three registries that already define
them: [`config/apps.manifest.json`](../config/apps.manifest.json) (identity),
[`packages/shared/lib/roles.js`](../packages/shared/lib/roles.js) (presentation) and
[`packages/api-provider/config/domains.json`](../packages/api-provider/config/domains.json)
(authorization). It is generated so it cannot drift from them — if a fact here is
wrong, the registry is wrong, and `npm run verify:wiring` is what fails.

**Three different questions decide whether a module is usable, and they are not
the same question:**

| Question | Decided by | Failure |
|---|---|---|
| Did the org buy it? | the licence — `entitlement` below | **402** |
| Does this user have access? | api-pro grants on the domain roles | **403** |
| Is the route served at all? | the descriptor contract | **404/405** |

A module can be entitled and still refuse a user, and a user with every role can
still get 402 on a module the org never licensed.

## Every module at a glance

| Module | Port | Category | Entitlement | Workspace |
|---|---|---|---|---|
| **marketplace-worker** | — | _worker_ | — | `apps/sales/marketplace` |
| **Storefront** | 4000 | Content & Channels | `erp.storefront` | `apps/content/storefront` |
| **Stock Management** | 4001 | Inventory & Production | `erp.stock` | `apps/inventory/stock` |
| **Point of Sale** | 4002 | Sales & Customers | `erp.pos` | `apps/sales/pos` |
| **Sign-In & SSO** | 4003 | Administration | — | `apps/admin/auth` |
| **Web Orders** | 4004 | Sales & Customers | `erp.leads`, `erp.quotes` | `apps/sales/portal` |
| **CRM** | 4005 | Sales & Customers | `erp.crm` | `apps/sales/crm` |
| **Human Resources** | 4006 | People | `erp.hr` | `apps/people/hr` |
| **Accounts** | 4007 | Finance & Payroll | `erp.gl`, `erp.ap-ar` | `apps/finance/accounts` |
| **Payroll** | 4008 | Finance & Payroll | `erp.payroll` | `apps/finance/payroll` |
| **Content Management** | 4009 | Content & Channels | `erp.cms` | `apps/content/cms` |
| **strapi** | 4010 | _backend_ | — | `services/strapi` |
| **Social Media** | 4011 | Content & Channels | `erp.social` | `apps/content/social` |
| **Rider App** | 4012 | Sales & Customers | `erp.delivery` | `apps/sales/rider` |
| **Order Management** | 4013 | Sales & Customers | `erp.orders` | `apps/sales/orders` |
| **Manufacturing** | 4014 | Inventory & Production | `erp.mrp` | `apps/inventory/manufacturing` |
| **Employee Self-Service** | 4015 | People | `erp.ess` | `apps/people/ess` |
| **Marketplace** | 4016 | Sales & Customers | — | `apps/sales/marketplace` |
| **Inventory Management** | 4017 | Inventory & Production | `erp.warehousing` | `apps/inventory/control` |
| **Seeding** | 4018 | Administration | — | `apps/admin/seed` |
| **Campaigns** | 4019 | Content & Channels | `erp.campaigns` | `apps/content/campaigns` |
| **core** | 4020 | _backend_ | — | `services/core` |
| **Mail** | 4021 | Content & Channels | — | `apps/content/mail` |
| **Rutba Admin** | 4022 | Administration | — | `apps/admin/console` |
| **Helpdesk** | 4023 | Sales & Customers | `erp.helpdesk` | `apps/sales/helpdesk` |

## Sales & Customers

### Point of Sale — `pos`

Sales, cart, returns, reports.

- **Runs on** port `4002`, from [`apps/sales/pos`](../apps/sales/pos) (npm `@rutba/pos`)
- **systemd unit** `rutba_pos` · **env prefix** `POS` · **URL var** `NEXT_PUBLIC_POS_URL`
- **Licensed by** `erp.pos` — an unlicensed org gets **402**, not an empty screen
- **Domain** `pos` — In-store POS sales, checkout, and the cash register.
  - Roles: `pos_admin`, `pos_manager`, `pos_staff`

### Web Orders — `portal`

Track customer orders, delivery status, and returns.

- **Runs on** port `4004`, from [`apps/sales/portal`](../apps/sales/portal) (npm `@rutba/portal`)
- **systemd unit** `rutba_portal` · **env prefix** `PORTAL` · **URL var** `NEXT_PUBLIC_PORTAL_URL`
- **Licensed by** `erp.leads` or `erp.quotes` — an unlicensed org gets **402**, not an empty screen
- **Domain** `portal` — Management of registered storefront customer accounts and profiles.
  - Roles: `portal_admin`, `portal_manager`, `portal_staff`

### CRM — `crm`

Contacts, leads, activities.

- **Runs on** port `4005`, from [`apps/sales/crm`](../apps/sales/crm) (npm `@rutba/crm`)
- **systemd unit** `rutba_crm` · **env prefix** `CRM` · **URL var** `NEXT_PUBLIC_CRM_URL`
- **Licensed by** `erp.crm` — an unlicensed org gets **402**, not an empty screen
- **Domain** `crm` — Contacts, leads, and customer relationship management.
  - Roles: `crm_admin`, `crm_manager`, `crm_staff`

### Rider App — `rider`

Delivery offers, active deliveries, history, and profile.

- **Runs on** port `4012`, from [`apps/sales/rider`](../apps/sales/rider) (npm `@rutba/rider`)
- **systemd unit** `rutba_rider` · **env prefix** `RIDER` · **URL var** `NEXT_PUBLIC_RIDER_URL`
- **Licensed by** `erp.delivery` — an unlicensed org gets **402**, not an empty screen
- **Domain** `rider` — Delivery rider assignments and cash-on-delivery collection.
  - Roles: `rider_admin`, `rider_manager`, `rider_staff`

### Order Management — `orders`

Customer orders, delivery offers, riders, and notifications.

- **Runs on** port `4013`, from [`apps/sales/orders`](../apps/sales/orders) (npm `@rutba/orders`)
- **systemd unit** `rutba_orders` · **env prefix** `ORDERS` · **URL var** `NEXT_PUBLIC_ORDERS_URL`
- **Licensed by** `erp.orders` — an unlicensed org gets **402**, not an empty screen
- **Domain** `orders` — Sales order processing, status tracking, and fulfillment.
  - Roles: `orders_admin`, `orders_manager`, `orders_staff`

### Marketplace — `marketplace`

Daraz & channel accounts, order/inventory sync.

- **Runs on** port `4016`, from [`apps/sales/marketplace`](../apps/sales/marketplace) (npm `@rutba/marketplace`)
- **systemd unit** `rutba_marketplace` · **env prefix** `MARKETPLACE` · **URL var** `NEXT_PUBLIC_MARKETPLACE_URL`
- **Not licence-gated.** instance-internal
- **Domain** `marketplace` — Third-party marketplace integrations: catalog, stock, and orders.
  - Roles: `marketplace_admin`, `marketplace_manager`, `marketplace_staff`

### Helpdesk — `helpdesk`

Support desks, tickets, SLAs, service catalog, knowledge base.

- **Runs on** port `4023`, from [`apps/sales/helpdesk`](../apps/sales/helpdesk) (npm `@rutba/helpdesk`)
- **systemd unit** `rutba_helpdesk` · **env prefix** `HELPDESK` · **URL var** `NEXT_PUBLIC_HELPDESK_URL`
- **Licensed by** `erp.helpdesk` — an unlicensed org gets **402**, not an empty screen
- **Domain** `helpdesk` — Support desks, tickets, SLAs, service catalog, and the knowledge base.
  - Roles: `helpdesk_admin`, `helpdesk_manager`, `helpdesk_staff`

## Inventory & Production

### Stock Management — `stock`

Products, purchases, inventory.

- **Runs on** port `4001`, from [`apps/inventory/stock`](../apps/inventory/stock) (npm `@rutba/stock`)
- **systemd unit** `rutba_stock` · **env prefix** `STOCK` · **URL var** `NEXT_PUBLIC_STOCK_URL`
- **Licensed by** `erp.stock` — an unlicensed org gets **402**, not an empty screen
- **Domain** `stock` — Product stock items, barcodes, and stock movement.
  - Roles: `stock_admin`, `stock_manager`, `stock_staff`

### Manufacturing — `manufacturing`

Work orders, bundles, production, piece-rate payroll.

- **Runs on** port `4014`, from [`apps/inventory/manufacturing`](../apps/inventory/manufacturing) (npm `@rutba/manufacturing`)
- **systemd unit** `rutba_manufacturing` · **env prefix** `MANUFACTURING` · **URL var** `NEXT_PUBLIC_MANUFACTURING_URL`
- **Licensed by** `erp.mrp` — an unlicensed org gets **402**, not an empty screen
- **Domain** `manufacturing` — Production work orders, recipes, and shop-floor operations.
  - Roles: `manufacturing_admin`, `manufacturing_manager`, `manufacturing_staff`

### Inventory Management — `control`

Warehouses, bins, stock levels, transfers, counts, reordering.

- **Runs on** port `4017`, from [`apps/inventory/control`](../apps/inventory/control) (npm `@rutba/control`)
- **systemd unit** `rutba_control` · **env prefix** `CONTROL` · **URL var** `NEXT_PUBLIC_CONTROL_URL`
- **Licensed by** `erp.warehousing` — an unlicensed org gets **402**, not an empty screen
- **Domain** `control` — Warehouse stock, bins, batches, expiry, and reconciliation.
  - Roles: `control_admin`, `control_manager`, `control_staff`

## People

### Human Resources — `hr`

Employees, departments, attendance, leave.

- **Runs on** port `4006`, from [`apps/people/hr`](../apps/people/hr) (npm `@rutba/hr`)
- **systemd unit** `rutba_hr` · **env prefix** `HR` · **URL var** `NEXT_PUBLIC_HR_URL`
- **Licensed by** `erp.hr` — an unlicensed org gets **402**, not an empty screen
- **Domain** `hr` — Employees, leave approvals, and HR administration.
  - Roles: `hr_admin`, `hr_manager`, `hr_staff`

### Employee Self-Service — `ess`

My profile, attendance, leave requests, payslips.

- **Runs on** port `4015`, from [`apps/people/ess`](../apps/people/ess) (npm `@rutba/ess`)
- **systemd unit** `rutba_ess` · **env prefix** `ESS` · **URL var** `NEXT_PUBLIC_ESS_URL`
- **Licensed by** `erp.ess` — an unlicensed org gets **402**, not an empty screen
- **Domain** `ess` — Employee self-service: leave requests, attendance, and personal records.
  - Roles: `ess_employee`, `ess_manager`

## Finance & Payroll

### Accounts — `accounts`

Chart of accounts, journals, invoices.

- **Runs on** port `4007`, from [`apps/finance/accounts`](../apps/finance/accounts) (npm `@rutba/accounts`)
- **systemd unit** `rutba_accounts` · **env prefix** `ACCOUNTS` · **URL var** `NEXT_PUBLIC_ACCOUNTS_URL`
- **Licensed by** `erp.gl` or `erp.ap-ar` — an unlicensed org gets **402**, not an empty screen
- **Domain** `accounts` — General accounting: the finance ledger, journals, and financial reports.
  - Roles: `accounts_admin`, `accounts_manager`, `accounts_staff`
- **Domain** `accounts-ap` — Supplier bills, purchase invoices, and outgoing payments.
  - Roles: `ap_admin`, `ap_manager`, `ap_staff`
- **Domain** `accounts-ar` — Customer invoices, receipts, and incoming payments.
  - Roles: `ar_admin`, `ar_manager`, `ar_staff`
- **Domain** `accounts-viewer` — Read-only access to financial records and accounting reports.
  - Roles: `accounts_viewer_admin`, `accounts_viewer_manager`, `accounts_viewer_staff`

### Payroll — `payroll`

Salary structures, payroll runs, payslips.

- **Runs on** port `4008`, from [`apps/finance/payroll`](../apps/finance/payroll) (npm `@rutba/payroll`)
- **systemd unit** `rutba_payroll` · **env prefix** `PAYROLL` · **URL var** `NEXT_PUBLIC_PAYROLL_URL`
- **Licensed by** `erp.payroll` — an unlicensed org gets **402**, not an empty screen
- **Domain** `payroll` — Salary runs, payslips, and payroll processing.
  - Roles: `payroll_admin`, `payroll_manager`, `payroll_staff`

## Content & Channels

### Storefront — `storefront`

Public customer-facing website.

- **Runs on** port `4000`, from [`apps/content/storefront`](../apps/content/storefront) (npm `@rutba/storefront`)
- **systemd unit** `rutba_storefront` · **env prefix** `STOREFRONT` · **URL var** `NEXT_PUBLIC_STOREFRONT_URL`
- **Licensed by** `erp.storefront` — an unlicensed org gets **402**, not an empty screen
- **Domain** `storefront` — Public online storefront browsing and checkout.
  - Roles: `storefront_public`, `storefront_user`

### Content Management — `cms`

Website content, pages, banners, and sales offers.

- **Runs on** port `4009`, from [`apps/content/cms`](../apps/content/cms) (npm `@rutba/cms`)
- **systemd unit** `rutba_cms` · **env prefix** `CMS` · **URL var** `NEXT_PUBLIC_CMS_URL`
- **Licensed by** `erp.cms` — an unlicensed org gets **402**, not an empty screen
- **Domain** `cms` — Storefront pages, navigation menus, and marketing content.
  - Roles: `cms_admin`, `cms_manager`, `cms_staff`

### Social Media — `social`

Posts, replies, multi-platform publishing.

- **Runs on** port `4011`, from [`apps/content/social`](../apps/content/social) (npm `@rutba/social`)
- **systemd unit** `rutba_social` · **env prefix** `SOCIAL` · **URL var** `NEXT_PUBLIC_SOCIAL_URL`
- **Licensed by** `erp.social` — an unlicensed org gets **402**, not an empty screen
- **Domain** `social` — Social media publishing, syncing, and engagement.
  - Roles: `social_admin`, `social_manager`, `social_staff`

### Campaigns — `campaigns`

Email templates, audiences, campaigns, delivery reporting.

- **Runs on** port `4019`, from [`apps/content/campaigns`](../apps/content/campaigns) (npm `@rutba/campaigns`)
- **systemd unit** `rutba_campaigns` · **env prefix** `CAMPAIGNS` · **URL var** `NEXT_PUBLIC_CAMPAIGNS_URL`
- **Licensed by** `erp.campaigns` — an unlicensed org gets **402**, not an empty screen
- **Domain** `campaigns` — Email marketing: templates, audiences, campaigns, and delivery reporting over Rutba-MTA.
  - Roles: `campaigns_admin`, `campaigns_manager`, `campaigns_staff`

### Mail — `mail`

Personal and shared inboxes over live IMAP.

- **Runs on** port `4021`, from [`apps/content/mail`](../apps/content/mail) (npm `@rutba/mail`)
- **systemd unit** `rutba_mail` · **env prefix** `MAIL` · **URL var** `NEXT_PUBLIC_MAIL_URL`
- **Not licence-gated.** Wave-2 comm.mail product, not an erp.* module — must not grow here
- **Domain** `mail` — Personal and shared email over live IMAP: inboxes, compose, and CRM-linked correspondence.
  - Roles: `mail_admin`, `mail_manager`, `mail_staff`

## Administration

### Sign-In & SSO — `auth`

Single sign-on, login and session portal.

- **Runs on** port `4003`, from [`apps/admin/auth`](../apps/admin/auth) (npm `@rutba/auth`)
- **systemd unit** `rutba_auth` · **env prefix** `AUTH` · **URL var** `NEXT_PUBLIC_AUTH_URL`
- **Not licence-gated.** the OIDC client shell (E3) — gating the way in on a licence you check after logging in is a lockout
- **Domain** `auth` — User accounts, roles, and access assignment across all apps.
  - Roles: `auth_admin`, `auth_manager`, `auth_staff`

### Seeding — `seed`

Run system, reference and backfill seeds.

- **Runs on** port `4018`, from [`apps/admin/seed`](../apps/admin/seed) (npm `@rutba/seed`)
- **systemd unit** `rutba_seed` · **env prefix** `SEED` · **URL var** `NEXT_PUBLIC_SEED_URL`
- **Not licence-gated.** instance-internal tooling
- **Domain** `seed` — Data seeding and reference-data setup controls.
  - Roles: `seed_admin`, `seed_manager`, `seed_staff`

### Rutba Admin — `console`

Users, roles, app access, app domains, mailbox and notification administration.

- **Runs on** port `4022`, from [`apps/admin/console`](../apps/admin/console) (npm `@rutba/console`)
- **systemd unit** `rutba_console` · **env prefix** `CONSOLE` · **URL var** `NEXT_PUBLIC_CONSOLE_URL`
- **Not licence-gated.** instance-internal; org admin, licensing and billing views live in the portal
- **Domain** `console` — This instance's admin console: user accounts, app access, app domains, mailbox and notification administration.
  - Roles: `console_admin`, `console_manager`, `console_staff`

## Backends

### `strapi` — port 4010

Legacy Strapi backend. Retires in ERP 2.0 phase P2; every frontend reaches it via NEXT_PUBLIC_API_URL, not a per-app URL var.

- [`services/strapi`](../services/strapi) · unit `rutba_strapi` · env prefix `POS_STRAPI`

### `core` — port 4020

Koa/Knex backend serving the same descriptor contract. Plain Node — no bundling step, hence build:false. Shares NEXT_PUBLIC_API_URL with strapi because RUTBA_BACKEND picks which one listens.

- [`services/core`](../services/core) · unit `rutba_core` · env prefix `CORE`

## Workers and other units

- **`marketplace-worker`** (worker) — [`apps/sales/marketplace`](../apps/sales/marketplace), unit `rutba_marketplace_worker`, no port
  - Background sync worker sharing the apps/sales/marketplace workspace. No HTTP surface, so no port and no URL var; the registry records its port as '-'.

## Domains with no app

Authorization domains that exist in `domains.json` without a module to launch.
Each one is a decision that is owed, not a module you can use.

- **`delivery`** — _undecided_. Present in domains.json with no app, no workspace and no catalogue entry. Either a planned domain or vestigial — flagged in the registry drift report (A3) as a decision that is still owed.

