# Rutba ERP — Strapi 5 API Backend

Headless API for every Rutba ERP front-end app. Built on **Strapi 5.45** (MySQL / MariaDB). Per-request authorization is enforced by the custom **`strapi-api-pro`** plugin — descriptor-driven RBAC running `enforcementMode: hybrid` + `denyByDefault` (so a route with no matching policy is denied). Endpoints are defined as descriptors in `packages/api-provider/api/*.js`; the plugin seeds them into policy rows on boot.

## Content Types

Grouped overview — browse `src/api/*/content-types/*/schema.json` for the authoritative list.

| Domain | API IDs |
|---|---|
| **Catalog** | `product`, `category`, `category-group`, `brand`, `brand-group`, `product-group`, `term`, `term-type`, `seo-meta` |
| **Inventory** | `stock-item` (state machine), `stock-input`, `purchase`, `purchase-item`, `purchase-return`, `purchase-return-item`, `supplier` |
| **Sales (POS)** | `sale`, `sale-item`, `sale-return`, `sale-return-item`, `cash-register`, `cash-register-transaction`, `payment` |
| **Orders (Web)** | `sale-order` (state machine; COD + payment verify; GL posting), `sale-offer`, `order-message`, `sale-audit-log` |
| **Returns** | `return-request` (state machine), `return-method`, `return-policy` |
| **People** | `person` (canonical identity), `address`, `person-dedup-audit`, `customer`, `contact-ticket` |
| **CRM** | `crm-contact`, `crm-lead`, `crm-activity` |
| **HR** | `hr-employee`, `hr-department`, `hr-team`, `hr-attendance`, `hr-leave-request` (leave state machine) |
| **Payroll** | `pay-salary-structure`, `pay-payroll-run` (engine), `pay-payslip`, `pay-adjustment`, `pay-employee-profile`, `pay-deduction-rule` (configurable statutory/contribution engine) |
| **Accounting** | `acc-account`, `acc-account-mapping`, `acc-journal-entry`, `acc-journal-line`, `acc-fiscal-period`, `acc-invoice`, `acc-bill`, `acc-bank-account`, `acc-expense`, `acc-tax-rate` |
| **Manufacturing** | `mfg-work-order` (state machine), `mfg-task` (piece-rate), `mfg-bom`, `mfg-bundle`, `mfg-operation`, `mfg-piece-rate`, `mfg-worker-profile`, `mfg-material-lot`, `mfg-material-issue`, `mfg-production-line`, `mfg-defect-type`, `mfg-qc-inspection` |
| **Delivery** | `rider`, `delivery-offer`, `delivery-method`, `delivery-zone` |
| **CMS** | `cms-page`, `cms-page-group`, `cms-menu`, `cms-menu-item`, `cms-footer` |
| **Social** | `social-account`, `social-post`, `social-reply` |
| **Notifications** | `notification`, `notification-template`, `notification-event`, `notification-log`, `notification-preference` |
| **Workflow** | `workflow` (definable stage workflows consumed by the entity state machines) |
| **Site** | `site-setting`, `branch`, `currency` |

> The RBAC tables (`app-domain`, `app-role`, `api-interface`, `api-interface-method`, `api-method-policy`) are owned by the `strapi-api-pro` plugin. A legacy `employee` content type still exists but is superseded by `hr-employee`.

## Custom endpoints (examples)

Most endpoints are standard CRUD generated from the api-provider descriptors. Notable custom ones:

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api-pro/me/permissions` | The caller's claim — `{ role, appAccess[], app_roles[], permissions[] }` |
| `POST` | `/sale-orders/:documentId/process` | Order state-machine transition (stock + GL side effects) |
| `POST` | `/hr-leave-requests/:documentId/{approve,reject,cancel}` | Leave decisions |
| `POST` | `/pay-payroll-runs/:documentId/{process,cancel}` | Payroll run + GL accrual |
| `GET`  | `/acc-journal-entries/reports/{trial-balance,income-statement,balance-sheet,cash-flow,ar-aging,ap-aging}` | Financial reports |

## Getting started

Run from the **monorepo root** so the env loader injects the `POS_STRAPI__*` vars:

```bash
# from the repo root
npm install
npm run dev:strapi      # Strapi API → http://localhost:4010
```

Running `npm run develop` inside this folder also works, but only if the environment is already populated — the root loader (`scripts/js/load-env.js`) is what strips the `POS_STRAPI__` prefix from the root `.env.<ENVIRONMENT>`. The per-app `.env` is intentionally empty; **do not** add vars there. See the root [README](../README.md) and [DEPLOYMENT guide](../docs/DEPLOYMENT.md).

### Key environment variables (set as `POS_STRAPI__*` in the root env)

```
DATABASE_CLIENT=mysql
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_NAME=pos_db
DATABASE_USERNAME=your_user
DATABASE_PASSWORD=your_password
PORT=4010
APP_KEYS=<generated>
JWT_SECRET=<generated>
API_TOKEN_SALT=<generated>
ADMIN_JWT_SECRET=<generated>
TRANSFER_TOKEN_SALT=<generated>
ENCRYPTION_KEY=<generated>
```

### Seeding

On boot, deferred background seeders (see `src/index.js` + `src/seed/`) write the accounting chart-of-accounts + key mappings, the api-pro policies (from the descriptors), and the users-permissions grants. Generic reference data is loaded via migrations / admin import — not committed seed JSON.

## Learn more

- [Strapi 5 Documentation](https://docs.strapi.io)
- Root [README](../README.md) · [DEPLOYMENT guide](../docs/DEPLOYMENT.md) · [api-pro plugin](../packages/strapi-api-pro)
