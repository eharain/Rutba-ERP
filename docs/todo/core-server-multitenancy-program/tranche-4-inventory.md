# Tranche 4 — Inventory extras (reorder / alerts / expiry): migration sheet

Status: **ported + smoke-verified** (steps 1–4 of the playbook done against the live
dev DB; goldens, schema handover and the Caddy flip remain).

## What runs in core now

`services/core/src/modules/inventory.js` (same zero-copy model as tranches 1–3).
The stock-item CORE (sale/allocate/transfer) stays in Strapi until tranche 7 —
this module owns only the replenishment + expiry surface.

### Custom routes (8, all selfAuth)

| Route | Notes |
|---|---|
| GET /reorder-policies/suggestions | compute-on-read engine: policy math (ReorderPoint/MinMax + pack rounding) + legacy reorder_level fallback; per-branch serialized/bulk on-hand routing; on-order from open purchases AND open work orders |
| POST /reorder-policies/generate-purchases · generate-work-orders | draft purchase per supplier group / draft WO per product; REORDER-* idempotency skip; isReplenishManager gate (inventory/stock/purchase admin\|manager) |
| POST /stock-alerts/run-now · /:documentId/acknowledge · dismiss | persisted alert lifecycle over the same engine (upsert Open, refresh metrics, preserve Dismissed, auto-resolve cleared) |
| GET /stock-items/expiring · POST /stock-items/sweep-expired | horizon read (`fields`-projected) + coordinated sweep across BOTH ledgers (units + bulk batches); admin-scoped to inventory/stock |

All eight are `auth: false` in Strapi with manual controller gates (ensureUser /
requireAppRole / isReplenishManager) → `selfAuth` in core, exactly like mfg.

### Crons — FIRST CRON MIGRATION

`inventoryExpirySweep` (02:15) and `lowStockAlertSweep` (02:30) are read
zero-copy from services/strapi's own `config/inventory-cron-tasks.js` and registered
with the core scheduler. They stay **dormant** unless `RUTBA_CORE_CRONS=1`.
**At the tranche flip they start in core and must simultaneously be removed
from services/strapi's config/server.js merge — never run in both servers.**

### Lifecycles

None registered here: stock-item + stock-batch lifecycles (the sweeps rely on
them to drop Expired rows out of `product.stock_quantity` /
`bulk_quantity_on_hand`) were already registered by the mfg module; stock-alert,
reorder-policy and purchase have no lifecycle files.

### New platform capability this tranche forced

- **`fields` projection** in the documents shim (rows + populate targets):
  id + documentId always, then only the requested attributes. entityService
  passes `fields` through. REST is unaffected (rest.js never forwarded fields).
- **Datetime normalization on writes**: Strapi accepts ISO-8601 strings for
  datetime attributes; MySQL DATETIME rejects the raw `T…Z` form. Both write
  paths (documents write + db.query scalarWriteValues) now hand knex a Date.
  Found live: stock-alert sync writes `new Date().toISOString()`.

### Known deviation (documented, deliberate)

`db.query` reads on draft-and-publish models return DRAFT rows only (shim
status default), where Strapi's query engine returns raw table rows — BOTH
versions of a published document. For the reorder engine this means live
Strapi can emit duplicate suggestions for a published fallback product (one
per version row) while core emits one. Cache columns are written to all
version rows in lockstep, so the numbers are identical; core's single row is
the saner behavior. Revisit if a ported module ever depends on seeing both.

## Verification

- `node scripts/smoke-inventory.js` — 27 checks, self-cleaning and marker-only:
  fallback + MinMax suggestion math, alert open (Critical) → acknowledge →
  dismiss (notes) → ack-after-dismiss 400 → auto-resolve once on-order covers
  the deficit, generate-purchases/WOs + idempotency skips, expiring horizon +
  fields projection, sweep flips unit AND batch with cache recomputes, sweep
  idempotency, cron registration (dormant, services/strapi rules). Real stock rows
  a sweep could flip are snapshotted and restored (none existed); the run-now
  calls refresh real alert rows' derived metrics — the same convergence the
  daily cron performs.
- All prior suites green; contract sweep vs live services/strapi 113/113
  byte-identical; validate-schema zero mismatches.

## Remaining for this tranche

Same as tranches 1–3 (goldens, baseline migration via `schema-diff.js
--filter`, Caddy flip) **plus the cron cutover**: set `RUTBA_CORE_CRONS=1` on
the core instance and remove `buildInventoryCronTasks` from services/strapi
config/server.js in the same deploy.
