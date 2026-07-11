# Epic 5 — Product Expiry, Batch/Lot & FEFO

> ✅ **Status: BUILT** — branch `inventory-mfg-foundation`. `stock-batch` CT + per-unit
> `stock_item.expiry_date`/`batch` + product `is_perishable`/`shelf_life_days`/`expiry_alert_days`;
> FEFO in `stock-item.allocateSellableUnits` (opened-first → earliest expiry, nulls last); daily
> `inventoryExpirySweep` cron + `POST /stock-items/sweep-expired` (flips past-expiry InStock units
> and Active batches to `Expired`); `GET /stock-items/expiring`; and the expiry + batches screens.
> **Gap:** no independent hard checkout block-expired guard beyond the sweep having flipped units
> out of `InStock`. See the overview's
> [as-built status](00-overview-and-roadmap.md#implementation-status-as-built).

> Make products manageable with expiry dates: introduce batch/lot tracking with expiry,
> denormalise expiry onto stock units for fast querying, allocate stock **first-expiry-
> first-out** at sale, alert on expiring stock, and block selling expired units.

Owning app: `pos-strapi` (schema + lifecycle + allocation) with UI in `rutba-inventory`
(batch management, expiry dashboard) and behaviour changes in `pos-sale` / `rutba-web`
(FEFO + block-expired). Depends on: Foundation F3 (batch/expiry fields) — small once that
lands. Converges with Epic 1's material-lot concept.

See [00-overview-and-roadmap.md](00-overview-and-roadmap.md) F3.

---

## Goals

1. Support products **with and without** expiry — expiry is optional per product and per
   unit, never forced. Most products carry no expiry at all.
2. **Per-unit expiry** — `expiry_date` lives on each stock unit as the source of truth; two
   units of the same product (same intake or not) can have **different** expiries. Optional
   **batch/lot** grouping (`manufacture_date`, supplier) is available but not required.
3. **FEFO allocation** — POS scan-to-sell and web-order picking consume the earliest-
   expiring InStock unit first.
4. **Block-expired** — expired units cannot be sold; a job/lifecycle flips them to the
   existing `Expired` status.
5. **Expiry alerts & dashboard** — expiring-soon and expired reports; shelf-life config on
   product.

---

## Data model

### stock-batch (Foundation F3 — the single, *optional* batch/lot concept)

> Batch is **optional**. It only groups units that share a supplier/manufacture/expiry so you
> can enter/manage them together. A unit's own `expiry_date` (below) is always the truth —
> you can add units with an expiry and **no batch**, and units within a batch may still carry
> individually overridden expiries.

`pos-strapi/src/api/stock-batch/…`:
| field | type | notes |
|-------|------|-------|
| `batch_code` | string | unique per product (validate in lifecycle) |
| `product` | relation m:1 → product | |
| `supplier` | relation m:1 → supplier | nullable |
| `manufacture_date` | date | |
| `expiry_date` | date | the FEFO key |
| `received_at` | datetime | |
| `status` | enum | `Active` \| `Expired` \| `Quarantined` \| `Depleted` \| `Recalled` |
| `unit_cost` | decimal | |
| `quantity_received` / `quantity_remaining` / `quantity_reserved` | decimal | **bulk products** ledger (parallels mfg-material-lot) |
| `stock_items` | relation 1:m → stock-item | **serialized products** |
| `notes` | text | |

> **Convergence decision (must settle before coding):** `stock-batch` and
> `mfg-material-lot` both model "a lot with expiry + a quantity ledger". Recommended: make
> `stock-batch` the generic concept and have Epic 1's raw-material lots either (a) become
> `stock-batch` rows with `product.kind='raw_material'`, or (b) keep `mfg-material-lot` for
> WIP-specific fields and share a `stock.lot-common` component. Do **not** ship two
> divergent expiry ledgers. See Epic 1.

### product extension

- `is_perishable` (boolean, default false) — gates expiry **prompting & enforcement** per
  product (not all products have expiry). A non-perishable product simply leaves unit
  `expiry_date` null; an expiry can still be recorded ad-hoc on any unit if desired.
- `shelf_life_days` (integer, nullable) — auto-computes `expiry_date` at receipt when the
  supplier doesn't provide one (`received_at + shelf_life_days`).
- `expiry_alert_days` (integer, nullable) — per-product override of the global "expiring
  soon" window.

### stock-item extension (with Epic 2's location fields — one schema window)

- `expiry_date` — date, **nullable, per-unit source of truth**. Each generated/added unit can
  carry its own expiry; two units of the same product may differ. FEFO sorts/filters directly
  on this field (`sort: ['expiry_date:asc']`) with no join. `null` = non-perishable / no
  expiry (the common case).
- `batch` — relation m:1 → stock-batch, **optional**. When set, the batch's `expiry_date`
  *defaults* onto the unit at creation, but the unit's own value is authoritative and may be
  overridden. A unit can exist with an expiry and no batch at all.

The existing `stock-item.status` enum already has `Expired` — reuse it (no schema change).

---

## Behaviour

### Intake — capturing a (possibly different) expiry per unit

- Every intake path gains an optional `expiry_date` (+ optional `batch_code` /
  `manufacture_date`): purchase receiving (`generateStockItems`), bulk-stock-item import
  (per-row column), and the product-stock-items **generate** and **scan** sub-tabs.
- **Because each unit may differ, the UI must allow a per-unit expiry — not just one expiry
  for the whole intake.** Practically: generating N units accepts either one expiry applied
  to all N *or* a per-unit list; scan-create carries a "current expiry" the operator can
  change between scans (and can edit any row afterward). Bulk import takes the expiry per row.
- If `is_perishable` and no expiry entered but `shelf_life_days` is set → auto-compute
  `received_at + shelf_life_days`. Batch is optional: a `batch_code` groups units and shares a
  default expiry; leaving it blank still records each unit's own `expiry_date`. Coordinate
  with Epic 2's warehouse/bin columns (one intake screen sets location + expiry together).

### FEFO allocation (the core change)

- **POS (`pos-sale`) & sale-order picking:** when selecting which physical unit fulfils a
  line for a perishable product, order candidate InStock units by `expiry_date asc`
  (nulls last), then `createdAt asc`. Today POS resolves units via
  `StockItemsEndpoints.list` / scan; add an `expiry_date:asc` sort and an
  `is_pickable`-aware filter (Epic 2). For bulk products, decrement the earliest-expiring
  Active batch's `quantity_remaining` first.
- Where allocation is centralised: the sale-item allocateStock path (currently commented
  out per `[[project-stock-model-invariant]]`) is the natural home — reviving it as a
  FEFO-aware reservation is the clean approach; interim is a sort at the pick/scan UI.

### Block-expired

- A **daily job** (Strapi cron) flips InStock units whose `expiry_date < today` (and Active
  batches past expiry) to `status='Expired'` / batch `status='Expired'`. Lifecycle then
  drops them out of `product.stock_quantity` and stock-level automatically (Expired ≠
  InStock). This is the driver the existing `Expired` status never had.
- **Hard guard at sale:** checkout rejects any unit whose `expiry_date < today` even if the
  job hasn't run yet (belt-and-braces). Web storefront hides expired stock (already reads
  `stock_quantity`, which the job corrects).
- Expired stock is written off via an Epic 3/Epic 2 **stock-adjustment** (`type=WriteOff`,
  reason `Expired`) → GL Dr SHRINKAGE_EXPENSE / Cr INVENTORY. Don't post GL from the expiry
  job itself; it only changes status — the write-off document books the loss (keeps one GL
  chokepoint).

### Alerts & dashboard

- `inventory-report`-style read endpoints: `getExpiringSoon` (within alert window),
  `getExpired`, `getExpiryAgeing` (buckets). All `get*` verbs are api-pro-whitelisted.
- `rutba-inventory` **Expiry dashboard**: expiring-soon list (by product/warehouse/batch),
  expired-not-written-off list (→ one-click create write-off adjustment), batch browser.
- Optional notification hook: reuse the notification-template system to email/notify on
  expiring batches (defer if not needed).

---

## Backend surface

- New CT descriptor `packages/api-provider/api/stock-batches.js` (CRUD + `getExpiringSoon`/
  `getExpired` report actions), `export` in `api/index.js`.
- product & stock-item schema extensions (additive; defaults keep non-perishable products
  unaffected).
- Cron job `pos-strapi/src/api/stock-batch/…` or a `bootstrap`-registered scheduled task for
  expiry sweep (idempotent; only flips status, never posts GL).
- Sort/filter additions on the stock-item list descriptor for FEFO.

## Frontend surface

- `rutba-inventory`: Batch management (CRUD, quarantine/recall), Expiry dashboard.
- `pos-sale`: FEFO pick order in the unit picker; block-expired at checkout with a clear
  message.
- `rutba-web`: no change if it reads `stock_quantity` (the sweep keeps it honest); optionally
  surface "best before" on PDP for perishables.
- Intake screens (`pos-stock` receiving, bulk import): batch/expiry columns.

---

## Phasing

1. **F3 schema** — stock-batch CT + product/stock-item fields + descriptor (additive).
2. **Intake** — receiving & bulk import capture batch/expiry; shelf-life auto-compute.
3. **Expiry sweep + block-expired** — cron + checkout guard; reports `getExpiringSoon`/
   `getExpired`.
4. **FEFO allocation** — sort at pick/scan; then revive allocateStock FEFO-aware.
5. **UI** — batch mgmt + expiry dashboard in `rutba-inventory`; PDP "best before" (optional).

## Open decisions

- **Batch convergence with mfg-material-lot** (see above) — settle with Epic 1 first.
- **FEFO enforcement strength** — soft (sort, cashier can override) vs hard (allocation
  forces earliest). Recommend soft at POS scan, hard for web-order auto-pick.
- **Per-unit expiry is the model (user decision, 2026-07-10):** `expiry_date` on the unit is
  the source of truth so units of one product can differ, with or without a batch. Batch is an
  optional grouping whose expiry only *defaults* onto units at creation. A batch-expiry edit
  may offer to re-stamp its units, but the unit value stays authoritative.

## Verification checklist

- Two **units of the same product with different `expiry_date`** (batch or no batch) →
  POS/web picks the earlier-expiry unit first (FEFO on the per-unit field).
- A unit can be added with an expiry and **no batch**; generating N units can apply distinct
  expiries per unit.
- A **non-perishable** product's units keep `expiry_date` null and are unaffected by any
  expiry logic.
- Expiry sweep flips a past-expiry InStock unit to `Expired`; `product.stock_quantity` and
  stock-level drop by exactly that count.
- Checkout refuses an expired unit even if the sweep hasn't run.
- Write-off adjustment for expired stock posts SHRINKAGE_EXPENSE (idempotent).
- Non-perishable products: zero behaviour change (defaults off).
