# Rutba instance as a Marketplace (instance-to-instance sync)

Connect a **second Rutba ERP instance** — typically a public **online store** — to
your primary **in-house** instance and treat it as just another marketplace
channel (like Daraz). The in-house instance stays the source of truth: you
selectively publish a catalog to the online store and pull its web orders back
to process them locally.

- **Status:** P1 shipped (commit `378dc11`, branch `dev`).
- **Code:** in-house side in `rutba-marketplace/`; receiving side in `pos-strapi/`
  (dormant on the source instance, active on the target).
- **Tests:** `rutba-marketplace` → `npm test` (32); online ingest →
  `node pos-strapi/tests/marketplace-catalog-ingest.test.js` (14).

---

## 1. What this feature is

Rutba.pk runs two Rutba ERP installs:

- **In-house / in-store** — heavily used internally; owns products, pricing,
  stock, CMS. **Source of truth.**
- **Online** — the public website install. A **satellite** that displays a
  curated subset and takes web orders.

This feature wires them together over two **independent data planes**:

| Plane | Mechanism | Direction | Notes |
|---|---|---|---|
| **Commerce** (products, prices, stock, orders) | `rutba` marketplace **adapter** | catalog/price/stock **push** in-house→online; orders **pull** online→in-house | This document. |
| **CMS** (pages, menus, page-groups) | `content-sync-pro` (deferred, P3) | in-house→online | Gated by Strapi publish state; not covered here. |

The commerce plane reuses everything the marketplace app already has: the
**product-group publish gate**, per-marketplace **price rules**, order-ingest
dedup, sync logs, and the built-in **cron worker**. A second Rutba instance is
literally a new provider adapter sitting next to Daraz.

### Why "as a marketplace" and not the data-sync plugin?

Commerce needs the selective publish gate, price adjustment, and order-flow
direction that only the marketplace engine has. Content replication (CMS) is a
different problem solved by `content-sync-pro`. We split by data plane instead of
forcing one tool to do both.

---

## 2. How it works

### Identity model (important)

- **Identity = the origin `documentId`** (the in-house product's `documentId`),
  stored on the online product in `external_ids.rutba_origin` (+
  `rutba_origin_account`). All matching keys off this, **never the barcode**.
- **SKU** is the practical lookup key on the target (assumed unique + stable).
- **Barcode** is a display attribute, not identity. If an incoming barcode
  collides with a **different** product on the target, it is **index-suffixed**
  (`CODE-2`, `CODE-3`, …) so the unique-barcode index is satisfied; the same
  product keeps its barcode on re-sync.
- **Media** is synced **by reference** — the online instance registers an
  `upload.file` row pointing at the same URL on the shared media host
  (images.rutba.pk). No binaries are re-uploaded.
- **Variants** are their own product rows. A selected variant resolves to its
  **parent** (so it is never orphaned); the parent is pushed with its full set of
  **published** variants nested underneath.

### Data flow

```
        IN-HOUSE (source of truth)                         ONLINE (satellite store)
  ┌─────────────────────────────────────┐          ┌────────────────────────────────────┐
  │ rutba-marketplace (app + worker)     │          │ pos-strapi (online install)         │
  │                                      │          │                                     │
  │ product-groups ─► syncCatalog ──POST─┼────────► │ POST /products/integration/         │
  │ (publish gate)   (full product,      │  catalog │   ingest-catalog  → upsert by SKU   │
  │                   variants, media)   │          │   (create/update + publish)         │
  │                                      │          │                                     │
  │ price rules ────► syncInventory ─POST┼────────► │ POST /products/integration/         │
  │                   (price + stock)    │          │   update-inventory                  │
  │                                      │          │                                     │
  │ ingestOrders ◄─── fetchOrders ──GET──┼────────► │ GET  /sale-orders/integration/      │
  │ (local sale-order)                   │  orders  │   export  (channel='web' since ts)  │
  └─────────────────────────────────────┘          └────────────────────────────────────┘
      auth: Strapi API token (Bearer) issued by the ONLINE instance
```

All three online endpoints are gated to a **Strapi API token with no logged-in
user** (`isServiceToken`) — a browser session can never reach them.

### File map

**In-house (`rutba-marketplace/`)**

| File | Role |
|---|---|
| `lib/providers/rutba.js` | The adapter: `validateConnection`, `pushCatalog`, `pushInventory`, `fetchOrders`. No OAuth. |
| `lib/providers/index.js` | Registers `rutba` in the adapter map. |
| `lib/engine.js` | `syncCatalogForAccount` / `syncAllCatalog`; parent-resolution + variant nesting + price adjustment. |
| `lib/strapi.js` | `getCatalogProducts`, `getPublishedVariants`. |
| `lib/config.js` | `providers.rutba` fallback config + `worker.catalogRule`. |
| `worker.js` | Adds the `catalog` cron job. |
| `pages/api/accounts/[id]/sync-catalog.js` | Manual "push catalog now" endpoint. |

**Online (`pos-strapi/`, dormant on the source install)**

| File | Role |
|---|---|
| `src/utils/marketplace-catalog-ingest.js` | Upsert engine: products/variants/categories/brands/media, barcode index-on-collision. |
| `src/utils/is-service-token.js` | Shared service-token gate. |
| `src/api/product/controllers/product.js` + `routes/01-custom-product.js` | `integrationPing` / `ingestCatalog` / `updateInventory` at `/products/integration/*`. |
| `src/api/sale-order/controllers/sale-order.js` + `routes/01-custom-sale-order.js` | `exportMarketplace` at `/sale-orders/integration/export`. |
| schema enums | `marketplace-account.platform` += `rutba`; `sale-order.channel` += `rutba`; `marketplace-sync-log.kind` += `catalog`. |

---

## 3. Setup

### Prerequisites

- Both instances run this codebase and **must be restarted** after pulling — the
  three enum additions are schema changes.
- Both instances point their upload provider at the **same media host**
  (images.rutba.pk) so media-by-reference URLs resolve on the online store.
- The `rutba-marketplace` **worker** process must be running for automatic
  cron (orders + catalog): `npm run worker:marketplace` from the repo root.

### Step 1 — Create an API token on the ONLINE instance

On the **online** Strapi admin: **Settings → API Tokens → Create new API Token**.

- **Name:** `in-house-marketplace-sync`
- **Token type:** Full access (or a custom token with access to
  `product` + `sale-order` custom routes and read/write on products, categories,
  brands, upload).
- Copy the token value now (shown once).

### Step 2 — Create the marketplace account on the IN-HOUSE instance

Marketplace accounts are admin-managed. In the marketplace app (or via the
in-house Strapi admin), create a **Marketplace Account**:

| Field | Value |
|---|---|
| `platform` | `rutba` |
| `account_name` | e.g. `rutba.pk online store` |
| `api_key` | the API token from Step 1 (stored **private**) |
| `extra_config` | `{ "base_url": "https://api.rutba.pk/api" }` — the online instance's API base (…/api) |
| `is_active` | `true` |
| `sync_inventory_enabled` | `true` (also the master switch for the catalog cron) |
| `sync_orders_enabled` | `true` |
| `price_adjust_pct` | `0` unless the online store should mark up/down vs in-house |

Then attach the **product-groups** whose products should appear online (or
individually select listings). Only **published + active** products with a SKU
are ever pushed — this is your selective-publishing gate.

> No OAuth "Connect" step applies to `rutba` — the API token **is** the
> connection. The Connect button will report "OAuth not supported"; that's
> expected.

### Step 3 — Validate the connection

Use the account's **Validate** button (or `POST /api/accounts/:id/validate`). For
a `rutba` account this calls the target's `/products/integration/ping` with the
token and reports `ok: true` on success. A failure here means a wrong
`base_url`, a bad/again-expired token, or the online instance being unreachable.

### Step 4 — Push the catalog

- **Manually:** `POST /api/accounts/:id/sync-catalog` (wire a button in the
  relevant app, or call it directly). This pushes the full publish set
  (products + variants + media + taxonomy) and stamps each listing with the
  online `documentId`.
- **Automatically:** the worker's `catalog` job runs every `CRON_CATALOG_RULE`
  (default 6h). The lighter `inventory` job keeps price+stock fresh hourly.

### Step 5 — Pull orders

- **Manually:** `POST /api/accounts/:id/sync-orders`.
- **Automatically:** the worker's `orders` job (default every 15 min) pulls the
  online store's `channel='web'` orders since the last watermark and ingests
  them as local sale-orders (`channel='rutba'`, deduped on the online
  `documentId`). **Verify the worker is up before relying on the cron.**

### Environment variables (`rutba-marketplace`, prefix `RUTBA_MARKETPLACE__`)

| Var | Purpose | Default |
|---|---|---|
| `STRAPI_API_URL` | in-house Strapi API base the engine reads from | `http://127.0.0.1:4010/api` |
| `STRAPI_SERVICE_TOKEN` | in-house API token for the engine | — |
| `CRON_CATALOG_RULE` | catalog push schedule | `0 */6 * * *` |
| `CRON_ORDERS_RULE` | order pull schedule | `*/15 * * * *` |
| `CRON_INVENTORY_RULE` | price/stock push schedule | `*/60 * * * *` |
| `WORKER_ENABLED` | set `false` to disable the built-in worker on a replica | `true` |
| `RUTBA_TARGET_API_URL` / `RUTBA_TARGET_TOKEN` | optional app-level fallback when there is a single target (per-account `extra_config.base_url` + `api_key` win) | — |

---

## 4. Operating & observability

- Every run writes a **Marketplace Sync Log** (`kind`: `orders` | `inventory` |
  `catalog`) with counts (`fetched/created/updated/skipped/failed`), a `detail`
  array of per-SKU errors, and `status` (`success` | `partial` | `error`). View
  them in the marketplace app's sync-runs screen.
- The account's `last_orders_synced_at` / `last_inventory_synced_at` are the
  watermarks; the catalog push also advances the inventory watermark.
- **Dead-worker check:** the cron only runs if `worker:marketplace` is up. Treat
  a stale `last_*_synced_at` as the signal to check the worker before trusting
  "auto-sync".

---

## 5. Can this be set up with the seeder app?

**Yes, partially — and it's the recommended way to make target config
reproducible.** The in-house **marketplace-account row** (and its product-group
attachment) is ordinary content and fits the seeding control system
(`pos-strapi/src/seed/registry.js`, run via `npm run seed` or the `rutba-seed`
control app on :4018). The one thing that should **not** be baked into a seed is
the **secret token** — read it from the environment.

### What the seeder can do

- Create/ensure the `rutba` marketplace-account (idempotent on `account_name` or
  `platform`+`base_url`).
- Read `base_url` and the API token from **env** rather than hardcoding.
- Attach named product-groups (resolved by slug/name) to the account.

### What the seeder should NOT do

- **Mint the online instance's API token.** That is created on the *online*
  install (Step 1) — a different database. Seed the *reference* to it (via env),
  not the value.
- Store the token literal in source. Keep it in `.env` / the deployment secret
  store; the seeder reads `process.env`.

### Example seeder

Create `pos-strapi/src/seed/seeders/rutba-marketplace-target.js`:

```js
'use strict';

// Idempotent: ensure the `rutba` marketplace-account for the online store.
// Secrets come from env — never hardcode the token.
//   RUTBA_ONLINE_BASE_URL   e.g. https://api.rutba.pk/api
//   RUTBA_ONLINE_TOKEN      the API token issued by the ONLINE instance
//   RUTBA_ONLINE_GROUPS     comma-separated product-group slugs to publish
const ACCOUNT_UID = 'api::marketplace-account.marketplace-account';

async function seedRutbaTarget(strapi) {
  const baseUrl = process.env.RUTBA_ONLINE_BASE_URL;
  const token = process.env.RUTBA_ONLINE_TOKEN;
  if (!baseUrl || !token) return { skipped: 1, reason: 'RUTBA_ONLINE_* env not set' };

  const accountName = 'rutba.pk online store';
  const existing = await strapi.db.query(ACCOUNT_UID).findOne({ where: { account_name: accountName }, select: ['id', 'documentId'] });

  // Resolve product-groups by slug → documentIds.
  const slugs = String(process.env.RUTBA_ONLINE_GROUPS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const groups = slugs.length
    ? await strapi.db.query('api::product-group.product-group').findMany({ where: { slug: { $in: slugs } }, select: ['documentId'] })
    : [];
  const product_groups = groups.map((g) => g.documentId);

  const data = {
    platform: 'rutba',
    account_name: accountName,
    api_key: token,
    extra_config: { base_url: baseUrl.replace(/\/+$/, '') },
    is_active: true,
    sync_inventory_enabled: true,
    sync_orders_enabled: true,
    price_adjust_pct: 0,
    product_groups,
  };

  if (existing) {
    await strapi.documents(ACCOUNT_UID).update({ documentId: existing.documentId, data });
    return { updated: 1 };
  }
  await strapi.documents(ACCOUNT_UID).create({ data });
  return { created: 1 };
}

module.exports = { seedRutbaTarget };
```

Register it in `pos-strapi/src/seed/registry.js`:

```js
const { seedRutbaTarget } = require('./seeders/rutba-marketplace-target');
// …add to the REGISTRY array:
{
  key: 'rutba-marketplace-target',
  title: 'Marketplace account — Rutba online store',
  category: 'reference',
  essential: false,        // tenant-specific; run explicitly
  supportsPartial: true,
  supportsFull: true,
  hasMigration: false,
  run: (strapi) => seedRutbaTarget(strapi),
},
```

Run it:

```bash
# from pos-strapi/
RUTBA_ONLINE_BASE_URL=https://api.rutba.pk/api \
RUTBA_ONLINE_TOKEN=xxxxx \
RUTBA_ONLINE_GROUPS=online-store,new-arrivals \
node scripts/seed.js --only=rutba-marketplace-target
```

Or from the **rutba-seed** control app (:4018) / `POST /seed/run` with
`{ only: 'rutba-marketplace-target' }`.

> This seeder is **not committed** — it's a template. Ask if you want it added as
> a real, tenant-agnostic registry entry.

### Rule of thumb (per repo convention)

The ERP repo is the **product**; rutba.pk is one **tenant**
(`project_erp_generic_vs_rutba_pk_implementation`). Keep tenant-specific values
(the actual base_url, token, group slugs) in **env**, and keep the seeder generic
so it works for any tenant that sets those env vars.

---

## 6. Testing

```bash
# In-house adapter + catalog assembly + variant fallback (32 tests)
cd rutba-marketplace && npm test

# Online upsert / barcode collision / variants / media-by-ref / batch isolation (14 tests)
cd pos-strapi && node tests/marketplace-catalog-ingest.test.js
```

Both are dependency-free (mocked `fetch` / in-memory `strapi`), safe to run in CI
without a live database.

---

## 7. Gotchas & limits

- **Restart both instances** after deploy (enum schema changes).
- **Route ordering:** the integration routes use two-segment `/integration/*`
  paths so they never collide with `/products/:id` or `/sale-orders/:documentId`
  (koa first-match — see `feedback_koa_router_literal_prefix_order`).
- **Draft leakage avoided:** variants are fetched via a direct published query,
  not a nested populate (which would leak drafts onto the store).
- **Not reconciled:** the catalog push is an **upsert**, not a mirror — a product
  removed from a group is not automatically delisted online (P-later).
- **Currency** on exported orders defaults to `PKR`.
- **Not yet verified on live instances:** that media-by-reference `upload.file`
  rows render on the online storefront — smoke-check on the first real sync.

---

## 8. Roadmap

- **P3 — CMS sync** via `content-sync-pro` (pages/menus/page-groups, publish-gated).
- **P4 — Fulfillment status push-back** (order status → storefront).
- UI wiring of the sync-catalog / order-pull buttons into the relevant apps.
- Delisting/reconciliation when a product leaves the publish set.

See memory `project_rutba_instance_as_marketplace` and
`project_marketplace_integration_daraz` for the broader marketplace context.
