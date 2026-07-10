# Epic 2 — Inventory Management App (`rutba-inventory`, port 4017)

> The flagship epic. Introduces the shared **Foundation** (warehouse/bin locations,
> per-location stock-level cache, batch/expiry fields, `track_mode` activation) that Epics
> 1, 3, 4, 5 all build on, then delivers the full inventory-control feature set in a new
> dedicated app.

Owning app: **new `rutba-inventory`** (Next.js, port 4017). Backend: `pos-strapi`
(`inventory-*` + extensions to `stock-item`, `product`, `purchase`). Depends on: nothing
(this epic *is* the foundation). Blocks: Epics 3, 4, 5 and Epic 1's inventory hooks.

See [00-overview-and-roadmap.md](00-overview-and-roadmap.md) for the shared conventions and
the F1–F5 foundation summary this doc expands.

---

## Goals

1. Model **physical space** properly: Warehouse → Storage-Location/Bin hierarchy, with
   every stock unit placed.
2. Give a **single, queryable on-hand truth** per (product, location[, batch]) without
   N×COUNT scans, preserving the existing global `product.stock_quantity` invariant.
3. Replace the weak destination-push transfer with **two-sided transfers** (source
   decrement, in-transit, receive-confirm).
4. Add **stock adjustments** (write-offs, found stock, damage, re-grade) as first-class
   documents with reason codes and GL posting.
5. Add an **inventory-valuation report** and per-location stock views.
6. Ship a **new app** that is the home for all of the above plus the screens Epics 3/4/5 add.

Non-goals (flagged, deferred unless separately prioritised): weighted-average/FIFO
valuation (stays specific-identification), multi-currency inventory, serial-vs-lot hybrid
per line, 3PL/EDI integration.

---

## Phase 1 — Foundation (build FIRST; blocks everything)

### 1.1 Location content-types

**`warehouse`** (`pos-strapi/src/api/warehouse/…`)
| field | type | notes |
|-------|------|-------|
| `code` | uid | unique |
| `name` | string | required |
| `type` | enum | `warehouse` \| `store` \| `transit` \| `virtual` \| `supplier` \| `customer` (default `warehouse`) |
| `branch` | relation m:1 → branch | which store/entity owns it |
| `address` | text | |
| `is_default` | boolean | one default per branch (used by backfill + receiving) |
| `is_active` | boolean | default true |
| `locations` | relation 1:m → storage-location | |

**`storage-location`** (a.k.a. bin) (`pos-strapi/src/api/storage-location/…`)
| field | type | notes |
|-------|------|-------|
| `code` | string | unique within warehouse (validate in lifecycle) |
| `name` | string | |
| `warehouse` | relation m:1 → warehouse | required |
| `parent` / `children` | relation self-ref | tree: zone→aisle→rack→shelf→bin |
| `type` | enum | `zone`\|`aisle`\|`rack`\|`shelf`\|`bin`\|`staging`\|`quarantine` |
| `is_pickable` | boolean | excluded from FEFO pick if false |
| `is_receivable` | boolean | put-away target |
| `is_active` | boolean | default true |
| `stock_items` | relation 1:m → stock-item | |

### 1.2 stock-item extension

Add to `pos-strapi/src/api/stock-item/content-types/stock-item/schema.json`:
- `warehouse` — relation m:1 → warehouse (inversedBy nothing needed, or a `stock_items` back-rel)
- `storage_location` — relation m:1 → storage-location (inversedBy `stock_items`)
- (Epic 5 also adds `batch` + `expiry_date` here — coordinate one schema change window.)

The existing `branch` FK stays; derive it from `warehouse.branch` on write for consistency
(a validation hook, not a second source of truth).

### 1.3 Per-location stock-level cache (F2)

**`stock-level`** (`pos-strapi/src/api/stock-level/…`) — a **cache**, never hand-written:
| field | type | notes |
|-------|------|-------|
| `product` | relation m:1 → product | |
| `warehouse` | relation m:1 → warehouse | |
| `storage_location` | relation m:1 → storage-location | nullable (warehouse-level roll-up if null) |
| `batch` | relation m:1 → stock-batch | nullable (Epic 5) |
| `quantity_on_hand` | integer/decimal | serialized→count, bulk→sum |
| `quantity_reserved` | integer/decimal | |
| `quantity_available` | integer/decimal | derived = on_hand − reserved |

**Invariant extension (critical):**
```
stock-level(product, warehouse).quantity_on_hand
    === count(stock-items WHERE product AND warehouse AND status='InStock' AND archived≠true)   [serialized]
    === Σ stock-transaction.quantity for that (product,warehouse)                                [bulk]

product.stock_quantity === Σ stock-level.quantity_on_hand across warehouses   (unchanged global meaning)
```
Maintained by extending the stock-item lifecycle: when a unit's `status`, `product`,
`warehouse`, `storage_location`, or `archived` changes, recompute the affected
stock-level row(s) **and** the global `product.stock_quantity`. Extend
`recomputeAllProducts()` → `recomputeAllStockLevels()` to rebuild the cache during
reconcile. Add a `withSuppressedRecompute(fn)` batch wrapper so bulk imports recompute once.

### 1.4 `track_mode` activation (F5)

Branch every intake/consumption/lifecycle path on `product.track_mode`:
- `serialized` (default) — stock-item rows as today. Unchanged behaviour.
- `bulk` — no per-unit rows; quantity moves recorded on stock-level (and stock-transaction /
  stock-batch). Finally makes `product.bulk_quantity_on_hand` a maintained value
  (= Σ stock-level for that product). Gate behind the field so existing serialized products
  are untouched.

### 1.5 Backfill migration (idempotent)

Strapi migration (`pos-strapi/database/migrations/…`):
1. For each `branch`, create one default `warehouse` (`is_default`) + one default
   receiving `storage-location` (type `staging`, `is_receivable`).
2. Set every existing `stock-item.warehouse`/`storage_location` to its branch's defaults.
3. Build `stock-level` rows for every (product, warehouse) with a live InStock count.
4. Verify Σ stock-level == product.stock_quantity per product; log drift.
Re-runnable; skips work already done (checkpoint pattern like the api-pro seeder).

### 1.6 Descriptors & registration (Phase 1)

- `packages/api-provider/api/warehouses.js`, `storage-locations.js`, `stock-levels.js`
  (+ `export` in `api/index.js`). `meta.domains = ['inventory','stock']`, roles
  admin/manager/staff. stock-level list is read-only (no create/update descriptors — it's a
  cache; only a `recompute` custom action).
- Register the **new app** (see overview checklist): workspace, env (4017), roles.js,
  domains.json (`inventory` domain), `/auth/callback`.

**Phase 1 acceptance:** Strapi boots clean; migration backfills defaults; every stock-item
has a warehouse+bin; stock-level rebuilt; `product.stock_quantity` unchanged for all
products (Σ stock-level equals it); app appears in the switcher for a user holding an
`inventory_*` role.

---

## Phase 2 — Two-sided transfers

Replace `POST /stock-items/transfer` (destination-push) with a proper transfer document.

**`stock-transfer`** CT: `transfer_number` (uid), `from_warehouse→`, `to_warehouse→`,
`from_location→`, `to_location→`, `status` enum
`Draft|Requested|InTransit|PartiallyReceived|Received|Cancelled`, `notes`, `lines` (1:m →
`stock-transfer-line`: product→, batch→(nullable), quantity, stock_items→ (serialized
picks), quantity_received). State machine (executeTransition chokepoint):
- **Dispatch** (→ InTransit): serialized units set `status='Transferred'`,
  `warehouse=transit` (or flagged in-transit); bulk decrements source stock-level.
- **Receive** (→ Received): units set `status='InStock'`, `warehouse=to_warehouse`,
  `storage_location=to_location`; bulk increments destination stock-level. Partial receive
  supported.
- GL: intra-entity moves post nothing (or Dr/Cr INVENTORY_IN_TRANSIT if in-transit
  visibility is wanted); inter-branch that crosses legal entities is a decision (default: no
  GL, single entity).

Custom routes `auth:false` + `ensureUser` manager check (same pattern as existing
transfer/recompute). Keep the old `/stock-items/transfer` as a thin shim that creates+auto-
receives a same-instant transfer, so `pos-stock`'s inline "send to branch" keeps working.

**Print:** transfer note / pick list, client-side (BulkBarcodePrint pattern).

---

## Phase 3 — Stock adjustments & write-offs

**`stock-adjustment`** CT: `adjustment_number` (uid), `warehouse→`, `location→`, `type` enum
`WriteOff|FoundStock|Damage|ReGrade|Correction|Consumption`, `reason_code` (relation to a
small `adjustment-reason` CT or enum), `status` `Draft|Approved|Posted|Cancelled`, `notes`,
`lines` (product→, batch→, quantity(±), stock_items→ (serialized), unit_cost). State
machine on **Post**:
- Serialized: set target units to `Damaged`/`Lost`/`Reduced`/`InStock` (for found) →
  lifecycle recomputes stock-level + product cache.
- Bulk: apply signed quantity to stock-level + write a stock-transaction.
- **GL (idempotent, via accounting engine):** loss → Dr SHRINKAGE_EXPENSE / Cr INVENTORY;
  gain (found) → Dr INVENTORY / Cr INVENTORY_ADJUSTMENT_GAIN. Value = Σ unit cost. New
  resolver keys: `SHRINKAGE_EXPENSE`, `INVENTORY_ADJUSTMENT_GAIN`, `STOCK_WRITE_OFF`. New
  `acc-journal-entry.source_type` value `Inventory Adjustment`.

This formalises today's ad-hoc "set a stock-item to Damaged" into an auditable, GL-posted
document. It is also the write path Epic 3 (cycle counts) uses to book count variances.

---

## Phase 4 — Valuation & reporting

- **Inventory valuation report** (`inventory-report` service, read endpoints — action names
  `getValuation`/`getOnHand`/`getMovement`, all `get*` verbs are whitelisted): on-hand ×
  unit cost, grouped by warehouse / category / product; ties out to the GL INVENTORY
  account balance. Basis = specific-identification (Σ stock_item.cost_price for InStock).
- **Stock-movement / ledger report** (from stock-transaction if F4 built, else derived from
  status_history + adjustments/transfers).
- **On-hand-by-location** and **ageing** views (ageing reuses Epic 5's received_at/expiry).
- Decision flag: weighted-average/FIFO is **out of scope** unless separately approved — it
  changes COGS posting in `sale/checkout.js` and `sale-order-state-machine.js`.

---

## Phase 5 — `rutba-inventory` app UI

Screens (Bootstrap + Layout + ProtectedRoute + `useAuth().jwt`, matching sibling apps):
- **Dashboard** — on-hand value, low-stock count (Epic 4), expiring-soon (Epic 5), pending
  transfers/counts.
- **Warehouses & Locations** — CRUD + tree editor for the bin hierarchy; print bin labels.
- **Stock by Location** — stock-level grid, filter by warehouse/location/product/category;
  drill into units.
- **Transfers** — list + create/dispatch/receive wizard (Phase 2).
- **Adjustments** — list + create/approve/post (Phase 3).
- **Valuation & Movement reports** (Phase 4).
- **Put-away / receiving** — assign received units (from purchase receiving) to bins.
- Nav entries for **Reconciliation/Counts** (Epic 3) and **Reordering** (Epic 4) land in
  this app.

Reuse `ProductPickerModal`, the XLSX column-alias parser, `printStorage` + print components
from `pos-shared`/`pos-stock`.

---

## Integration points

- **Purchase receiving** — `generateStockItems` (in `packages/api-provider/pos/create.js`)
  must accept a target warehouse+bin and set it on created units; put-away screen finalises
  location. Received units stay `Received` → moved to `InStock` on put-away (or auto if no
  put-away step configured).
- **POS / sale** — checkout must decrement the correct location's stock-level; picking
  respects `is_pickable`. Coordinate with Epic 5 FEFO (pick earliest expiry).
- **Manufacturing (Epic 1)** — WO finished-goods receipt targets a warehouse+bin; auto-
  consume issues from a source location. Reuse stock-level + stock-transaction.
- **Accounting** — adjustments and (optionally) in-transit post via the engine; valuation
  report ties to INVENTORY account.

---

## Open decisions

1. **stock-transaction ledger (F4) now or later?** Recommend: build the lifecycle so it can
   emit transactions, but ship Phases 2–4 reading stock-level; retrofit the ledger as a
   dedicated phase. (Cheaper to add than to refactor call-sites into later.)
2. **Batch model ownership** — Epic 5 owns `stock-batch`. This epic's stock-level/adjustment/
   transfer schemas reference `batch` (nullable) so they're batch-ready without depending on
   Epic 5 shipping first.
3. **Inter-branch = inter-entity?** Determines whether transfers post GL. Default: single
   entity, no GL on transfer.
4. **Valuation method** — keep specific-ID (default) vs add weighted-average. Out of scope
   unless approved.

## Verification checklist

- Migration idempotent; re-run leaves DB unchanged.
- Σ stock-level.quantity_on_hand == product.stock_quantity for every product, before & after
  a transfer/adjustment/sale.
- Transfer dispatch+receive moves units between warehouses and both stock-levels reconcile;
  partial receive handled.
- Adjustment Post books the right GL entry (idempotent — re-post is a no-op).
- App registers: shows in switcher, `/auth/callback` works, `inventory_*` roles gate access.
- api-pro: unauth CRUD 403; custom actions reachable only with correct role.
