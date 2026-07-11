# Epic 3 — Stock Reconciliation & Cycle Counts

> 🟡 **Status: PARTIALLY BUILT** — branch `inventory-mfg-foundation`. Cache reconcile + drift
> jobs (the `rutba-inventory` maintenance screen) are done, and a **v1 `stock-count`** exists
> (Draft/Posted/Cancelled; `inv.count-line` = product/system_qty/counted_qty; Post flips shortages
> directly to `Lost`). **Not built:** the richer count lifecycle (freeze/snapshot/blind/scan-tally/
> review/recount), batch/location-aware count lines, posting variances **as stock-adjustments**
> with count-side GL, and the orphan/duplicate reconcile UI. See the overview's
> [as-built status](00-overview-and-roadmap.md#implementation-status-as-built).

> Reconcile the product↔stock-item picture so recorded stock matches physical reality:
> a cache-vs-rows reconcile (extend what exists), orphan/duplicate cleanup, and — the real
> new capability — **physical cycle counts / stock-takes** that book variances as adjustments
> with a full audit trail.

Owning app: `rutba-inventory` (count UI) + `pos-strapi` (`stock-count` CT, reconcile
services). Depends on: Foundation F1/F2 (locations + stock-level) and Epic 2 Phase 3
(stock-adjustment, the write path for variances). Complements: Epic 4 (accurate counts feed
reorder).

See [00-overview-and-roadmap.md](00-overview-and-roadmap.md).

---

## Two distinct meanings of "reconciliation" (both in scope)

1. **Cache-vs-rows reconcile (system-internal)** — already partly built. Ensures
   `product.stock_quantity` (and the new `stock-level` cache) equal the live count of
   InStock stock-items. Job: `POST /stock-items/recompute-product-stock` →
   `recomputeAllProducts()`. **This epic extends it** to also rebuild stock-levels and to
   surface a drift report in the UI (what was corrected, by how much).
2. **Physical-vs-system reconcile (stock-take / cycle count)** — **new**. A counter walks a
   location, records physical quantities, the system computes variance vs on-hand, a manager
   approves, and variances post as stock-adjustments. This is the genuinely missing piece.

Plus **data-hygiene reconcile**: orphan stock-items (product-less) and duplicate/merge
cleanup already have primitives (`orphan-groups`, `ProductMergeTool`) — this epic surfaces
them in the inventory app and adds a "reconcile orphan → attach/merge" flow.

---

## Data model — cycle counts

**`stock-count`** (`pos-strapi/src/api/stock-count/…`):
| field | type | notes |
|-------|------|-------|
| `count_number` | uid | |
| `type` | enum | `Full` \| `Cycle` \| `Spot` \| `Blind` |
| `warehouse` | relation m:1 → warehouse | |
| `scope` | json / relations | filter: locations, categories, products, or ABC class |
| `status` | enum | `Draft` \| `InProgress` \| `Counted` \| `Review` \| `Posted` \| `Cancelled` |
| `counted_by` / `approved_by` | relation → user/hr-employee | |
| `snapshot_at` | datetime | when system on-hand was frozen |
| `lines` | 1:m → stock-count-line | |
| `notes` | text | |

**`stock-count-line`**:
| field | type | notes |
|-------|------|-------|
| `stock_count` | relation m:1 | |
| `product` | relation m:1 → product | |
| `storage_location` | relation m:1 | |
| `batch` | relation m:1 → stock-batch | nullable (Epic 5) |
| `system_quantity` | integer/decimal | frozen at snapshot |
| `counted_quantity` | integer/decimal | entered by counter |
| `variance` | integer/decimal | derived = counted − system |
| `unit_cost` | decimal | for variance valuation |
| `recount` | boolean | flagged for re-count if variance > threshold |
| `resolved` | boolean | |

---

## Flow (state machine, executeTransition chokepoint)

1. **Create / Freeze (Draft→InProgress)** — snapshot system on-hand from `stock-level` into
   `system_quantity` per line for the scope. For **Blind** counts, hide `system_quantity`
   from the counter.
2. **Count (InProgress→Counted)** — counter enters `counted_quantity` per line
   (scan-assisted: scan units in a bin; serialized counts can auto-tally by scanning each
   unit's barcode). Variance computed.
3. **Review (Counted→Review)** — variances over a configurable threshold flagged for
   recount; manager reviews.
4. **Post (Review→Posted)** — for each non-zero variance, create/append a **stock-adjustment**
   (Epic 2 Phase 3) of `type=Correction`:
   - Serialized: shortage → flip N InStock units to `Lost`/`Reduced` (oldest or scanned-
     missing); overage → create N found units (status InStock) or flip found units back.
   - Bulk: apply signed quantity to stock-level + stock-transaction.
   - **GL** via the adjustment: net loss → Dr SHRINKAGE_EXPENSE / Cr INVENTORY; net gain →
     Dr INVENTORY / Cr INVENTORY_ADJUSTMENT_GAIN. Idempotent (findBySource on the count).
   Lifecycle then reconciles stock-level + `product.stock_quantity` automatically.

The adjustment is the **single write path** — cycle-count Post never mutates stock directly,
it emits adjustments, keeping one GL/inventory chokepoint.

---

## Backend surface

- `stock-count` + `stock-count-line` CTs; descriptor `packages/api-provider/api/stock-counts.js`
  (CRUD + custom `freeze`/`postCount` actions — check verb whitelist; `post`/`set`/`recompute`
  are allowed, name the action e.g. `postVariances`→ needs a whitelisted prefix, use
  `recordCount`/`setCounted`/`getSheet`). Custom transition routes `auth:false` + manager
  `ensureUser`.
- Extend `stock-item.recomputeAllProducts()` → also `recomputeAllStockLevels()`; return a
  **drift report** (`{product, was, now, delta}[]`) so the UI shows what the cache reconcile
  corrected, not just a count.
- Reuse existing `orphanGroups`/`orphanGroupItems` for the orphan-reconcile screen.

## Frontend surface (`rutba-inventory`)

- **Cache reconcile** — button to run `recompute` + a drift report table (extends the
  existing admin trigger with visibility).
- **Cycle counts** — list; create (scope picker); count entry screen (scan-to-tally, blind
  mode); review/recount; post. Print count sheets (client-side).
- **Orphan reconcile** — surface orphan groups; attach to product / merge (reuse
  `ProductMergeTool` from `pos-shared`).

---

## Phasing

1. **Extend cache reconcile** with stock-level rebuild + drift report + UI surface (small).
2. **stock-count model + flow** (freeze → count → review → post-as-adjustment).
3. **Scan-assisted counting** + blind mode.
4. **Orphan/duplicate reconcile screen** (wraps existing primitives).

## Open decisions

- **ABC classification** for cycle-count cadence (A items counted more often) — nice-to-have;
  can seed `product` with an `abc_class` later. Defer unless wanted.
- **Recount threshold** — per-count config vs global setting.
- **Who can post** — manager-only by default (variances hit the P&L).

## Verification checklist

- Cache reconcile corrects an intentionally drifted `product.stock_quantity` and reports the
  delta; stock-level rebuilt.
- A count with a shortage posts an adjustment, flips the right units, books SHRINKAGE_EXPENSE,
  and `product.stock_quantity`/stock-level drop to the counted number.
- Overage path creates/restores found units and posts the gain.
- Post is idempotent (re-post = no-op via findBySource).
- Blind count hides system quantity; scan-tally matches manual entry.
