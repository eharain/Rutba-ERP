# Epic 4 — Reordering & Replenishment

> ✅ **Status: BUILT (core; deferrals)** — branch `inventory-mfg-foundation`. `reorder-policy` CT
> (MinMax/ReorderPoint/ParLevel/Manual; min/max/safety; source Purchase/Manufacture/Transfer) +
> `getReorderSuggestions` engine (on-hand/on-order/projected, `product.reorder_level` fallback for
> policy-less products, pack rounding) + `generatePurchases`/`generateWorkOrders` + the reorder
> dashboard. **Not built:** `generateTransfers` (source=Transfer), a persisted `reorder-suggestion`
> CT (compute-on-read only), a scheduled low-stock alert cron (the only inventory cron is the
> expiry sweep), and folding open-WO remaining into projected. See the overview's
> [as-built status](00-overview-and-roadmap.md#implementation-status-as-built).

> Turn the single, passive `product.reorder_level` low-stock flag into a real replenishment
> engine: per-product (and per-warehouse) min/max/safety-stock policies, a low-stock alert
> surface, reorder suggestions with recommended quantities, and one-click generation of
> draft purchases (and manufacturing work-orders for made-in-house goods).

Owning app: `rutba-inventory` (reorder dashboard + suggestion review) + `pos-strapi`
(reorder policy CT, suggestion engine). Depends on: Foundation F2 (stock-level for
accurate per-location on-hand), the existing `purchase` flow, and Epic 1 (for
manufacture-vs-buy routing). Consumes: Epic 5 (perishable safety windows).

See [00-overview-and-roadmap.md](00-overview-and-roadmap.md).

---

## Current state

- Only `product.reorder_level` (single integer), read as a `stockStatus=low` filter
  (`stock_quantity <= reorder_level`) in `product/controllers/product.js`. No min/max, no
  safety stock, no per-location policy, no suggested quantity, no alert, no PO generation.
- `purchase` **is** the PO (Draft→…→Received); `purchase-item` carries order/received qty.
  Suppliers are linked to products (`product.suppliers` m:m, `product.supplierCode`).

---

## Data model — reorder policy

Rather than overloading product with many fields, model a **policy per (product,
warehouse)** so different locations replenish independently, with a product-level default.

**`reorder-policy`** (`pos-strapi/src/api/reorder-policy/…`):
| field | type | notes |
|-------|------|-------|
| `product` | relation m:1 → product | |
| `warehouse` | relation m:1 → warehouse | nullable = product-wide default |
| `method` | enum | `MinMax` \| `ReorderPoint` \| `ParLevel` \| `Manual` |
| `min_stock` | integer/decimal | reorder trigger (ROP) |
| `max_stock` | integer/decimal | replenish-up-to (order qty = max − on_hand − on_order) |
| `safety_stock` | integer/decimal | buffer added under the min |
| `reorder_quantity` | integer/decimal | fixed EOQ-style qty (for ReorderPoint method) |
| `lead_time_days` | integer | supplier/production lead time |
| `preferred_supplier` | relation m:1 → supplier | for auto-PO |
| `source` | enum | `Purchase` \| `Manufacture` \| `Transfer` (how to replenish) |
| `source_warehouse` | relation m:1 → warehouse | for Transfer replenishment |
| `is_active` | boolean | |

Keep `product.reorder_level` as the legacy fallback (a Manual/ReorderPoint policy with
`min_stock = reorder_level` when no policy row exists), so nothing breaks on day one.

Optional supporting fields for smarter suggestions (defer): `product.abc_class`, demand/
average-daily-usage derived from sales history.

---

## Reorder engine

A service (`reorder` service on a suitable resource) computes suggestions. Two run modes:
- **On-demand** — the reorder dashboard calls `getReorderSuggestions(warehouse?)`.
- **Scheduled** — a daily cron computes low-stock and (optionally) emits notifications.

Per (product, warehouse) with an active policy:
```
on_hand   = stock-level.quantity_available (F2)
on_order  = Σ open purchase-item.(quantity − received_quantity) for this product/wh
in_prod   = Σ open WO remaining qty (Epic 1) if source=Manufacture
projected = on_hand + on_order + in_prod
trigger when projected <= (min_stock + safety_stock)   [or <= reorder_level fallback]
suggested_qty =
   MinMax / ParLevel : max_stock − projected
   ReorderPoint      : reorder_quantity
   (round up to supplier pack/bundle_units)
```

Output rows: `{product, warehouse, on_hand, on_order, in_prod, min, suggested_qty,
source, preferred_supplier}`. Group by supplier for PO generation; by nothing for WO.

**Suggestions may be persisted** (a `reorder-suggestion` CT) so they can be reviewed,
edited, dismissed, and tracked to the PO/WO they became — recommended over ephemeral
compute-only, for auditability. Minimal viable version can compute-on-read first, add
persistence later.

---

## Generation (one-click replenish)

From the reviewed suggestions:
- **source=Purchase** → create **draft `purchase`(s)** grouped by supplier, lines =
  suggested products/qty at `product.cost_price` (or last purchase price), status `Draft` /
  `Pending Approval` so the existing purchase approval + receiving flow takes over. Reuse the
  purchase creation path; do **not** post GL (GL happens at receiving/bill, unchanged).
- **source=Manufacture** (Epic 1) → create **draft `mfg-work-order`(s)** for the suggested
  qty against the product's default active BOM. Links suggestion → WO.
- **source=Transfer** → create a **draft `stock-transfer`** (Epic 2 Phase 2) from
  `source_warehouse`.

Link generated docs back to the suggestion so the dashboard shows "covered / pending /
received".

---

## Backend surface

- `reorder-policy` CT + descriptor `packages/api-provider/api/reorder-policies.js` (CRUD).
- `reorder` service with `getReorderSuggestions` (whitelisted `get*`) + `generatePurchases`/
  `generateWorkOrders`/`generateTransfers` custom actions (verb-whitelist-safe names, e.g.
  `createReplenishment`; check the regex). Optionally `reorder-suggestion` CT if persisting.
- Daily cron for low-stock detection + notification (reuse notification-template).

## Frontend surface (`rutba-inventory`)

- **Reorder dashboard** — below/at reorder point, grouped by warehouse & supplier;
  columns on_hand/on_order/suggested; filter perishables (Epic 5 tightens their safety).
- **Suggestion review** — edit qty, choose supplier, dismiss, then **Generate POs / WOs /
  Transfers**.
- **Policy editor** — set min/max/safety/lead-time/source per product or per (product,
  warehouse); bulk-apply by category. Migrate `reorder_level` values into policies.

---

## Phasing

1. **Policy model** + engine reading F2, with `reorder_level` fallback → low-stock list &
   dashboard (read-only value first).
2. **Suggested quantities** (min/max/par math, pack rounding) + suggestion review UI.
3. **Generate draft purchases** (biggest value) grouped by supplier.
4. **Manufacture / transfer replenishment** (needs Epic 1 / Epic 2 Phase 2).
5. **Scheduled alerts** + optional persisted suggestions with coverage tracking.

## Open decisions

- **Demand-based reorder points** (avg daily usage × lead time) vs static min/max. Static
  first; derive demand from sales history in a later phase.
- **Auto-approve vs draft-only** for generated POs. Default: create as Draft/Pending
  Approval — never auto-submit to a supplier.
- **Persist suggestions vs compute-on-read.** Recommend persist for audit/coverage; can
  start compute-only.
- **Per-warehouse vs global policy** default — model supports both (nullable warehouse);
  decide the UX default.

## Verification checklist

- A product below (min+safety) with no open POs appears as a suggestion with the right
  suggested_qty (max − projected, pack-rounded).
- Open PO quantity reduces `on_order` and removes/shrinks the suggestion.
- Generate creates a Draft purchase per supplier with correct lines; existing receiving flow
  then works unchanged.
- Legacy products with only `reorder_level` still trigger correctly (fallback policy).
- Perishable safety window (Epic 5) tightens the trigger for perishables.
