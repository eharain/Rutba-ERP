# API Guard Migration Knowledge Base

This document captures the **current endpoint + permission model** used in Rutba ERP so it can be migrated safely to `strapi-api-guard-pro` (independent plugin repo, symlinked into `pos-strapi/node_modules`).

---

## 1) Scope and Goal

Current runtime authorization is a hybrid of:

1. Strapi users-permissions role actions (wide gate)
2. `app-access-guard` middleware (domain/app-aware enforcement)
3. `strapi-api-guard-pro` request interceptor (`denyByDefault` + resource matching)

Migration goal: make `strapi-api-guard-pro` the authoritative route/resource guard while preserving existing app-access behavior and permission boundaries.

---

## 2) Current Source-of-Truth Files

### Core permission metadata
- `packages/pos-shared/lib/endpoints/access-metadata.js`
  - `APP_ENTRIES` (app domains)
  - `APP_PERMISSION_DEFS_ALL` (full declared grants)
  - `ENDPOINT_COVERAGE` (implemented endpoint/actions)
  - `APP_PERMISSION_DEFS` (filtered by coverage)
  - `PLUGIN_PERMISSION_ENTRIES`, `PUBLIC_PERMISSION_ENTRIES`

### Shared endpoint registry
- `packages/pos-shared/lib/endpoints/index.js`
- Endpoint modules in `packages/pos-shared/lib/endpoints/*.js`

### Runtime middleware and bootstrap
- `pos-strapi/src/middlewares/app-access-guard.js`
- `pos-strapi/src/index.js`
  - role creation/sync
  - users-permissions action sync
  - bootstrap data seeds

### Validation scripts
- `scripts/permission-smoke.ps1`
- `scripts/permission-matrix.ps1`

---

## 3) Current App Domains

From `APP_ENTRIES`:

- `stock`
- `order-management`
- `sale`
- `accounts`
- `accounts-ap`
- `accounts-ar`
- `accounts-viewer`
- `delivery`
- `rider`
- `crm`
- `auth`
- `web-user`
- `hr`
- `payroll`
- `cms`
- `social`

Domain aliases currently used by middleware/metadata:

- `rider` -> `delivery`
- `order-management` -> `delivery`, `cms`
- `web-orders` -> `web-user`

---

## 4) Permission Group Model

Permission groups:

- `staff`
- `manager`
- `admin`
- `user` (alias of `staff`)

Defaults per app:

- `staff: true`
- `manager: false`
- `admin: true`

Special role types:

- `rutba_app_user`
- `rutba_web_user`
- `public`

---

## 5) Current Endpoint Coverage (Implemented Actions)

`ENDPOINT_COVERAGE` currently includes these UIDs (actions vary per UID):

- `api::branch.branch`
- `api::brand.brand`
- `api::cash-register-transaction.cash-register-transaction`
- `api::cash-register.cash-register`
- `api::category.category`
- `api::cms-page.cms-page`
- `api::crm-lead.crm-lead`
- `api::customer.customer`
- `api::notification-log.notification-log`
- `api::notification-template.notification-template`
- `api::payment.payment`
- `api::product.product`
- `api::purchase-item.purchase-item`
- `api::purchase.purchase`
- `api::sale-item.sale-item`
- `api::sale-return-item.sale-return-item`
- `api::sale-return.sale-return`
- `api::sale.sale`
- `api::stock-input.stock-input`
- `api::stock-item.stock-item`
- `api::supplier.supplier`
- `api::term-type.term-type`
- `api::term.term`

Important: `APP_PERMISSION_DEFS_ALL` is filtered through this coverage map to produce active runtime grants (`APP_PERMISSION_DEFS`).

---

## 6) Current Enforcement Flow (Request)

1. User authenticates via users-permissions JWT.
2. `app-access-guard` reads:
   - `X-Rutba-App`
   - `X-Rutba-App-Admin` (optional elevation)
3. Middleware resolves effective app/admin keys from:
   - direct app assignments
   - `permission_roles`-derived domain keys
4. It computes permission defs by app + group and checks action-level access.
5. If model has `owners` relation and request is non-elevated, owner scoping is applied.
6. In parallel, `strapi-api-guard-pro` interceptor matches request path+method against plugin resources and denies when no match (`denyByDefault=true`).

---

## 7) Known Migration Constraint

`strapi-api-guard-pro` currently matches resources from its own DB table (`plugin::api-guard-pro.resource`).

With `denyByDefault: true`, any route missing in resource table returns:

- `403 Forbidden`
- `No matching permission resource`

Therefore migration requires **resource seeding/sync** from endpoint metadata (or equivalent source) before turning off temporary bypasses.

---

## 8) Resource Modeling Conventions for `strapi-api-guard-pro`

Use consistent records per route:

- `method`: `GET|POST|PUT|PATCH|DELETE`
- `pathPattern`: include `/api/...` and use `:id` placeholders
- `content_type_uid`: Strapi UID (e.g. `api::notification-template.notification-template`)
- `type`: `standard` for regular content API routes
- `isActive`: `true`
- `isPublic`: only true for explicit public routes
- `key`: stable unique key (`camelCase` recommended)
- `route-name`: normalized method+route identifier

---

## 9) Migration Plan (Recommended)

1. Keep `access-metadata.js` as domain/action source of truth.
2. Ensure every endpoint module in shared registry has `*EndpointsMeta` with UID + methodActions.
3. Add bootstrap sync that upserts `api-guard-pro` resources for required routes.
4. Map app/group grants to api-guard policies+grants.
5. Run smoke + matrix scripts after each migration batch.
6. Remove bypass paths only after resource coverage is complete.

---

## 10) Validation Checklist

- `scripts/permission-smoke.ps1` passes
- `scripts/permission-matrix.ps1` passes
- No `No matching permission resource` for protected app routes
- Admin elevation still works with `X-Rutba-App-Admin`
- Owner scoping behavior remains unchanged for non-elevated users

---

## 11) Plugin Development Context

Current local setup noted by project owner:

- Independent plugin repo: `D:\Rutba\strapi-plugins\strapi-api-guard-pro`
- Symlinked package used by app runtime under `pos-strapi/node_modules`

When changing plugin internals, validate both:

1. plugin package behavior (resource matching, policy evaluation), and
2. app integration assumptions in `app-access-guard` + metadata registry.

---

