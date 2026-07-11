# Inventory & Manufacturing Program — Overview & Roadmap

> Program-level plan for five epics that extend the ERP from a single-branch serialized
> stock model into a full inventory-management platform with warehouse/bin locations,
> batch/expiry tracking, reconciliation, replenishment, and a manufacturing recipe layer.
>
> Each epic below has its own spec doc in this folder and is designed to be **built
> separately** by an independent effort. This document is the map: the shared data-model
> foundation they all sit on, the dependency graph, the recommended sequencing, and the
> cross-cutting conventions every epic must honour.

Authored: 2026-07-10. **Status: largely BUILT** (backends + the `rutba-inventory` app
shell) on branch `inventory-mfg-foundation` — see [Implementation status
(as-built)](#implementation-status-as-built) below. Decisions locked with the user
(2026-07-10):

1. **Inventory app packaging** → new dedicated `rutba-inventory` app (port **4017**), own
   `inventory` domain. `pos-stock` (4001) stays for POS-adjacent stock entry.
2. **Location model depth** → full **Warehouse → Storage-Location/Bin** hierarchy.
3. **Expiry/batch** → **per-unit `expiry_date` on the stock unit (optional; not all products
   have expiry, and each unit may differ), optional batch grouping, FEFO at sale**, expiry
   alerts, block-expired.
4. **Manufacturing scope** → **reusable product-type/recipe templates, multi-output
   (co/by-products), auto-consume BOM inputs on completion**, activate `track_mode`.

---

## The five epics

| # | Epic | Owning app(s) | Status | Spec |
|---|------|---------------|--------|------|
| 1 | Manufacturing product-types, recipes, multi-output, auto-consume | `rutba-manufacturing` + `pos-strapi/mfg-*` | ✅ **Built** (backend) | [epic-1-manufacturing-product-types.md](epic-1-manufacturing-product-types.md) |
| 2 | Inventory Management app (warehouses/bins, stock ledger, transfers, adjustments, valuation) | **new `rutba-inventory`** + `pos-strapi/inventory-*` | ✅ **Built** (core; deferrals) | [epic-2-inventory-management-app.md](epic-2-inventory-management-app.md) |
| 3 | Stock reconciliation + cycle counts | `rutba-inventory` + `pos-strapi/stock-item` | 🟡 **Partial** | [epic-3-stock-reconciliation-cycle-counts.md](epic-3-stock-reconciliation-cycle-counts.md) |
| 4 | Reordering / replenishment | `rutba-inventory` + `pos-strapi` | ✅ **Built** (core; deferrals) | [epic-4-reordering-replenishment.md](epic-4-reordering-replenishment.md) |
| 5 | Product expiry / batch / FEFO | `pos-strapi` + `pos-sale`/`rutba-web` + `rutba-inventory` | ✅ **Built** | [epic-5-product-expiry-batch-fefo.md](epic-5-product-expiry-batch-fefo.md) |

---

## Implementation status (as-built)

> Verified against live code on branch `inventory-mfg-foundation` (2026-07-11). This
> section supersedes the "Starting state" baseline further down, which records the
> *pre-build* state at program authoring. A ✅ here means the **backend** is built and
> load-only verified; frontends are the `rutba-inventory` app shell (screens below) and
> are esbuild-verified but not all click-through-verified.

### Foundation (F1–F5)

| Item | Status | Notes |
|---|---|---|
| **F1** Location model (`warehouse`, `storage-location` bin tree) | ✅ Built | + backfill controller `warehouse/controllers/backfill.js` |
| **F2** Per-location `stock-level` cache | ✅ Built | `recomputeStockLevelsForProduct(s)` / `recomputeAllStockLevels` + `suppressStockLevelRecompute` batch guard; invariant `Σ stock-level.quantity_on_hand === product.stock_quantity` preserved |
| **F3** Batch/lot + per-unit expiry (`stock-batch`, `stock_item.expiry_date`/`batch`) | ✅ Built | `mfg-material-lot` kept for raw material; `stock-batch` is the finished-goods lot ("keep both" convergence option) |
| **F4** Unified append-only `stock-transaction` ledger | ⬜ Not built | Was flagged *optional / retrofit-later*. The stock-item lifecycle is the single writer, so it can still be introduced without rewriting call-sites |
| **F5** Activate `track_mode` (serialized vs bulk) | ✅ Built | WO state machine + reorder engine branch on it; `bulk_quantity_on_hand` maintained by the stock-batch lifecycle |

### Per-epic

- **Epic 1 — Manufacturing (✅ built, backend).** No `mfg-product-type`/`mfg-recipe` CT — the recipe layer is `product.kind` (classifier) + `mfg-bom` with a repeatable **`outputs[]`** component (`mfg.bom-output`: primary/co_product/by_product/scrap + `cost_share_pct`) + **`mfg-production-template`** (reusable product-type recipe → instantiated into a versioned BOM via `POST /mfg-production-templates/:id/instantiate`). WO state machine does multi-output receipt with cost-share normalization, `autoConsumeInputs` on completion (serialized→`Reduced`, bulk→FEFO `mfg-material-issue`), and track_mode routing. Kind-typing enforced by document-service middleware `bom-typing-validator.js`. *Deferred:* dedicated `rutba-manufacturing` template/BOM builder UI.
- **Epic 2 — Inventory app (✅ built core; deferrals).** Foundation + two-sided `stock-transfer` (Draft→InTransit→Received, `transitions.js`), `stock-adjustment` (posts loss GL Dr `SHRINKAGE_EXPENSE` / Cr INVENTORY, idempotent), specific-identification valuation report, and the full `rutba-inventory` app. *Deferred:* transfer-line CT + `from_location`, adjustment approval workflow + reason-code CT + bulk signed-qty path, movement/ageing reports, put-away screen.
- **Epic 3 — Reconciliation & cycle counts (🟡 partial).** Cache reconcile + drift jobs (maintenance screen) done. `stock-count` exists but v1: Draft/Posted/Cancelled only, `inv.count-line` component (product/system_qty/counted_qty — no batch/location/variance fields), Post flips shortages directly to `Lost` (not via stock-adjustment, no count-side GL). *Not built:* freeze/snapshot/blind/scan-tally/review lifecycle, batch/location-aware lines, post-as-adjustment, orphan-reconcile UI.
- **Epic 4 — Reordering (✅ built core; deferrals).** `reorder-policy` CT (MinMax/ReorderPoint/ParLevel/Manual, min/max/safety, source Purchase/Manufacture/Transfer), `getReorderSuggestions` engine (on-hand/on-order/projected + `product.reorder_level` fallback + pack rounding), `generatePurchases`/`generateWorkOrders`, and the reorder dashboard. *Not built:* `generateTransfers` (source=Transfer), persisted `reorder-suggestion` CT, scheduled low-stock alert cron, open-WO qty folded into projected.
- **Epic 5 — Expiry/batch/FEFO (✅ built).** `stock-batch` + per-unit `expiry_date`/`batch`, product `is_perishable`/`shelf_life_days`/`expiry_alert_days`, FEFO in `allocateSellableUnits` (opened-first → earliest-expiry, nulls last), daily `inventoryExpirySweep` cron + `POST /stock-items/sweep-expired`, `GET /stock-items/expiring`, and the expiry/batches screens. *Gap:* no independent hard checkout block-expired guard beyond the sweep having flipped units out of `InStock`.
- **Divisible stock** (added on top of this program) — one discrete item sold in N sub-units; see [../../features/divisible-stock.md](../../features/divisible-stock.md).

### `rutba-inventory` app screens (`rutba-inventory/pages/`)

`index` (landing) · `warehouses` (warehouse + bin-tree editor) · `stock-levels` (per-product/warehouse on-hand grid) · `transfers` (two-sided dispatch/receive) · `adjustments` (write-off/damage/lost/expired + GL) · `valuation` (by warehouse) · `counts` (cycle counts) · `batches` (batch CRUD + status) · `expiry` (expiring-soon + run sweep) · `reorder` (suggestions → generate purchases/WOs) · `maintenance` (idempotent reconcile jobs).

---

## Starting state — pre-build baseline (verified against live code, 2026-07-10)

> ⚠️ **Historical.** This records the state *before* the program was built. Most of the
> gaps below are now closed — see [Implementation status (as-built)](#implementation-status-as-built)
> above for what actually shipped. Kept for context on the starting point.

- **Serialized stock** is the canonical model. `stock-item` = one physical unit, unique
  `barcode`, `status` enum (InStock/Reserved/Sold/Damaged/Lost/Expired/Transferred/…),
  `status_history` component, `cost_price` per unit. Invariant:
  `product.stock_quantity === count(stock-items WHERE product=X AND status='InStock' AND archived≠true)`,
  maintained by the stock-item lifecycle → `recomputeProductStock`. Full-DB reconcile job at
  `POST /stock-items/recompute-product-stock`. **See `[[project-stock-model-invariant]]`.**
- **Only spatial dimension is `branch`** (a store/company entity). No warehouse, location,
  bin, or zone content-type exists. `product.stock_quantity` is a **global** count, not
  per-branch. Transfer (`POST /stock-items/transfer`) is a destination-push only — no
  source decrement, no in-transit, no receive-confirm.
- **Bulk / non-serialized:** `product.track_mode` (serialized|bulk) and
  `product.bulk_quantity_on_hand` exist but are **inert** — no runtime code reads them.
  The only quantity-ledger in the system is `mfg-material-lot` (+ immutable
  `mfg-material-issue`), used mfg-side for raw fabric/thread, and it already carries
  `expiry`, `lot_code`, `dye_lot`, reserved/remaining.
- **Manufacturing:** `mfg-bom` = per-product recipe → single output (`mfg-bom.product` +
  `output_quantity`), inputs via `material_lines[]` (`mfg.bom-line.material_product`).
  `product.kind` (raw_material/consumable/semi_finished/finished_good/service) is the only
  classifier and is **unenforced**. WO-Completed mints finished serialized stock-items and
  lifts the cache, but **inputs are not auto-consumed** and there is no multi-output and no
  reusable recipe/template above the product-specific BOM.
  **See `[[project-manufacturing-module-phase1]]`.**
- **Reorder:** only `product.reorder_level` (single integer) used as a read-filter
  (`stockStatus=low`). No min/max, safety stock, alerts, or auto-PO.
- **Valuation:** specific-identification via `stock_item.cost_price`. COGS at sale =
  Σ(sold unit cost_price), posted Dr COGS / Cr INVENTORY via the accounting engine. No
  weighted-average/FIFO layer, no inventory-valuation report.
- **Purchasing:** `purchase` **is** the PO (status Draft→…→Received). Receiving is
  client-driven — `generateStockItems` creates units at status `Received` (not `InStock`).
  `purchase.generateBill` posts AP. **See `[[project-accounting-payroll-modules-state]]`.**

---

## Shared data-model foundation (built once, consumed by all five epics)

These schema changes are **prerequisites** and should land first (they are Phase 1 of
Epic 2, but every other epic depends on them). Sequencing them first de-risks the whole
program.

### F1 — Location model (new content-types)

```
warehouse            code, name, branch→, type(warehouse|store|transit|virtual|supplier|customer),
                     address, is_active, is_default, locations→ (oneToMany)
storage-location     code, name, warehouse→, parent/children (self-ref tree:
   (a.k.a. "bin")    zone→aisle→rack→shelf→bin), type(zone|aisle|rack|shelf|bin|staging|quarantine),
                     is_pickable, is_receivable, is_active, stock_items→ (oneToMany)
```

`stock-item` gains: `warehouse` (manyToOne), `storage_location` (manyToOne). `branch`
stays (a warehouse belongs to a branch). Migration: backfill every existing stock-item to
a per-branch **default warehouse + default receiving bin** so nothing is orphaned.

### F2 — Per-location on-hand cache (extends the invariant)

New `stock-level` cache CT: `product→, warehouse→, storage_location→ (nullable), batch→
(nullable), quantity_on_hand, quantity_reserved, quantity_available (derived)`. Maintained
by the stock-item lifecycle alongside `recomputeProductStock`. **The global invariant is
preserved**: `product.stock_quantity` becomes the **sum of stock-level.quantity_on_hand
across warehouses** (still = count of InStock serialized units). Reconcile job extends to
rebuild stock-levels too. This is the query surface reorder rules, reconciliation, and the
inventory dashboards read from — avoids N COUNT(*) scans.

### F3 — Batch / lot + expiry (new content-type + stock-item fields)

```
stock-batch (a.k.a. inventory-lot)   batch_code, product→, supplier→, manufacture_date,
                                     expiry_date, received_at, status(Active|Expired|Quarantined|
                                     Depleted|Recalled), unit_cost, notes,
                                     stock_items→ (serialized), plus quantity ledger fields
                                     (quantity_received/remaining/reserved) for bulk products
```

`stock-item` gains: `expiry_date` (date, **nullable, per-unit source of truth** — each unit
may carry a different expiry, `null` = no expiry, which is the common case) and an
**optional** `batch` (manyToOne → stock-batch) that only *defaults* an expiry onto its units.
Expiry/batch are optional: not all products have expiry, and each generated/added unit may
differ. This unifies with the mfg-material-lot pattern — Epic 1 and Epic 5 should converge on
**one** batch/lot concept rather than two.

### F4 — Unified stock-transaction ledger (append-only) — *recommended backbone*

New `stock-transaction` (a.k.a. `inventory-move`) immutable ledger: every quantity change
(receipt, issue, transfer-out/in, adjustment, count-correction, sale, return, production
in/out) writes a row `{ type, product→, batch→, from_location→, to_location→,
quantity(±), unit_cost, stock_item→ (serialized) | quantity (bulk), source_type,
source_id, posted_by, occurred_at }`. Stock-levels (F2) are derived from it; serialized
stock-item status/location changes emit a transaction. This mirrors the accounting
journal-entry and `mfg-material-issue` patterns and gives one audit trail + valuation
basis for the whole platform.

> **Phasing note:** F4 is the "correct" WMS backbone but is the largest change. It is
> acceptable to ship Epics 2–5 reading F2 (stock-levels) directly and retrofit F4 as the
> ledger underneath in a later phase — **as long as** the lifecycle stays the single writer
> so F4 can be introduced without rewriting call-sites. Each epic spec notes where it would
> hook F4.

### F5 — Activate `track_mode` (serialized vs bulk)

Today inert. The stock-item lifecycle and all intake/consumption paths must branch on
`product.track_mode`: `serialized` → stock-item rows (unchanged); `bulk` → quantity moves
on stock-batch/stock-level (finally giving `bulk_quantity_on_hand` a real maintainer).
Epic 1 (mfg auto-consume) and Epic 2 (bulk receiving) are the first consumers.

---

## Dependency graph & recommended sequencing

```
        ┌─────────────────────────────────────────────┐
        │  FOUNDATION (F1 locations, F2 stock-level,    │  ← build first,
        │  F3 batch/expiry, F5 track_mode; F4 optional) │    inside Epic 2 Phase 1
        └───────────────┬───────────────┬───────────────┘
                        │               │
      ┌─────────────────┼───────┐       │
      ▼                 ▼       ▼       ▼
 Epic 2 (rest:      Epic 3   Epic 4   Epic 5
 transfers,        (recon +  (reorder (expiry/
 adjustments,      cycle     /replen) batch/FEFO
 valuation, UI)    counts)            — uses F3)
                        ▲
      Epic 1 (mfg) ─────┘ (auto-consume + finished-goods
                           receipt reuse F2/F3/F5; can run
                           in parallel once foundation lands)
```

Recommended order (each is independently shippable behind the one before it):

1. **Foundation** (Epic 2 Phase 1) — locations, stock-level cache, batch/expiry fields,
   track_mode activation, backfill migration. *Nothing else is correct without it.*
2. **Epic 5 (expiry/batch/FEFO)** — small once F3 exists; high user value; unblocks
   perishable selling and gives Epic 1 the batch concept to reuse.
3. **Epic 2 (rest)** — transfers (two-sided), adjustments, valuation report, the
   `rutba-inventory` app UI.
4. **Epic 3 (reconciliation + cycle counts)** — depends on stock-levels + adjustments.
5. **Epic 4 (reordering)** — depends on stock-levels + purchase flow; consumes expiry for
   perishable min-stock.
6. **Epic 1 (manufacturing)** — can start in parallel after Foundation; its auto-consume
   and finished-goods receipt reuse F2/F3/F5.

> This is a recommendation, not a hard order. Epics 1 and 5 can proceed in parallel with
> Epic 2's UI work once Foundation lands. Reprioritise per business urgency.

---

## The new `rutba-inventory` app — registration checklist

Owned by Epic 2. Per `[[project_registering_new_erp_app_checklist]]`, a new app needs all
of the following or it silently won't appear / redirects out:

1. **Workspace** — add `rutba-inventory` to root `package.json` workspaces +
   `dev:/build:/start:inventory` scripts.
2. **Env** — `NEXT_PUBLIC_INVENTORY_URL` + `RUTBA_INVENTORY__PORT=4017` in `.env.development`
   (and prod env). Next free port is **4017**.
3. **Client registry** — `packages/pos-shared/lib/roles.js`: add `inventory` to `APP_URLS`,
   `VALID_APP_KEYS`, and `APP_META` (icon/label/description).
4. **Server domain** — `packages/api-provider/config/domains.json`: `"inventory"` key with
   roles `inventory_admin/manager/staff` (+ optional `inventory_viewer`).
5. **Auth callback** — `pages/auth/callback.js` re-exporting `@rutba/pos-shared/components/AuthCallback`
   with an empty `getServerSideProps`.
6. **App skeleton** — Layout + ProtectedRoute + `useAuth()`, Bootstrap, matching the other
   rutba-* apps.

---

## Cross-cutting conventions every epic must honour

- **api-pro is the auth layer.** Every new content-type needs a descriptor in
  `packages/api-provider/api/<ct>.js` (+ `export … from` in `api/index.js`). `meta = { uid,
  domains, roles }`; each method returns `{ path, action, method, apps, approle, params|data }`.
  **Deny-by-default: no descriptor = 403.** `action` must start with a whitelisted verb
  (list/find/create/update/delete/recompute/sync/transfer/adjust/count/…) or the seeder
  silently skips it — verify the whitelist regex in
  `packages/strapi-api-pro/server/src/services/seeder.js` (`isDescriptorMethodName`) before
  naming a custom action; `method:` is mandatory for mutations. Custom actions that must
  bypass UP need a `CUSTOM_ACTIONS` grant in up-permissions-seed.
  **See `[[feedback_api_pro_descriptor_verb_whitelist]]`, `[[feedback_api_pro_custom_route_action_matching]]`.**
- **Never write `product.stock_quantity` (or the new stock-level cache) from a controller.**
  The stock-item lifecycle owns the invariant; all mutation paths go through
  `entityService/documents.update('api::stock-item…')`. Bulk paths should use a
  `withSuppressedRecompute` batch helper (already a noted TODO) to avoid one recompute per row.
- **Side effects on status change go in the state-machine `executeTransition` chokepoint**,
  never scattered across controllers. **See `[[feedback_order_state_machine_owns_side_effects]]`.**
- **Accounting is idempotent & centralised.** Post only via
  `api::acc-journal-entry.accounting` (`createAndPost`/`reverseBySource`), check
  `findBySource` first. New resolver keys this program needs: `INVENTORY_ADJUSTMENT_GAIN/LOSS`,
  `STOCK_WRITE_OFF`, `INVENTORY_IN_TRANSIT`, `SHRINKAGE_EXPENSE`, `WIP` (mfg). Inventory
  moves that change total on-hand value must post; pure location transfers within one
  legal entity need not. **See `[[project-accounting-payroll-modules-state]]`.**
- **Generic ERP, not tenant-specific.** No rutba.pk / PK-specific reference data, rates, or
  jurisdictions in code or seed. **See `[[project_erp_generic_vs_rutba_pk_implementation]]`.**
- **Reference-data seeding via migrations, not seed JSON.** Default warehouse/bin per branch
  is created by a migration. **See `[[project_data_seeding_strategy_migrations_not_seed_json]]`.**
- **Labels/prints are client-side** (React + `window.print()`), no server PDF. Reuse the
  BulkBarcodePrint / SaleInvoicePrint pattern for count sheets, transfer notes, put-away lists.
- **Commit directly to main; no Claude co-author footer.**
  **See `[[feedback_commit_directly_to_main]]`, `[[feedback_no_claude_coauthor_attribution]]`.**

---

## Program-wide risks & watch-items

- **The invariant must survive the location split.** `product.stock_quantity` stays global
  = count of InStock units; per-location breakdown moves to `stock-level`. The recompute and
  reconcile jobs must be extended atomically with F1/F2 or the cache silently drifts.
- **Backfill migration is load-bearing.** Every existing stock-item must land in a real
  warehouse+bin, and every existing product needs stock-level rows, or reorder/recon read
  garbage. Migration must be idempotent and re-runnable.
- **Two batch concepts must not fork.** `mfg-material-lot` (bulk raw) and the new
  `stock-batch` (F3) should converge — Epic 1 and Epic 5 must agree the model before either
  ships batch code. Decide: unify into `stock-batch`, or keep mfg-material-lot for bulk raw
  and make stock-batch the finished-goods analogue with a shared component.
- **track_mode activation is behaviour-changing.** Flipping the lifecycle to branch on
  serialized vs bulk touches every intake path; gate behind the field default (`serialized`)
  so existing products are unaffected until explicitly set to `bulk`.
- **Valuation method choice affects accounting.** Program keeps specific-identification
  (current) unless Epic 2 valuation phase explicitly adds weighted-average/FIFO — that is a
  separate decision flagged in Epic 2.
