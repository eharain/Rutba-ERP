# Inventory & Manufacturing Program — Overview & Roadmap

> Program-level plan for five epics that extend the ERP from a single-branch serialized
> stock model into a full inventory-management platform with warehouse/bin locations,
> batch/expiry tracking, reconciliation, replenishment, and a manufacturing recipe layer.
>
> Each epic below has its own spec doc in this folder and is designed to be **built
> separately** by an independent effort. This document is the map: the shared data-model
> foundation they all sit on, the dependency graph, the recommended sequencing, and the
> cross-cutting conventions every epic must honour.

Authored: 2026-07-10. Status: planning. Decisions locked with the user (2026-07-10):

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

| # | Epic | Owning app(s) | Spec |
|---|------|---------------|------|
| 1 | Manufacturing product-types, recipes, multi-output, auto-consume | `rutba-manufacturing` + `pos-strapi/mfg-*` | [epic-1-manufacturing-product-types.md](epic-1-manufacturing-product-types.md) |
| 2 | Inventory Management app (warehouses/bins, stock ledger, transfers, adjustments, valuation) | **new `rutba-inventory`** + `pos-strapi/inventory-*` | [epic-2-inventory-management-app.md](epic-2-inventory-management-app.md) |
| 3 | Stock reconciliation + cycle counts | `rutba-inventory` + `pos-strapi/stock-item` | [epic-3-stock-reconciliation-cycle-counts.md](epic-3-stock-reconciliation-cycle-counts.md) |
| 4 | Reordering / replenishment | `rutba-inventory` + `pos-strapi` | [epic-4-reordering-replenishment.md](epic-4-reordering-replenishment.md) |
| 5 | Product expiry / batch / FEFO | `pos-strapi` + `pos-sale`/`rutba-web` + `rutba-inventory` | [epic-5-product-expiry-batch-fefo.md](epic-5-product-expiry-batch-fefo.md) |

---

## Current state (verified against live code, 2026-07-10)

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
