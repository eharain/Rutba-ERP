# Divisible Stock — sell one physical item in many sellable sub-units

> **Status: built** (branch `inventory-mfg-foundation`). Backend engine + POS
> wiring on both sale surfaces are complete and load-only verified.
> Commits: `c4360c8` (model), `a3e51e1` (allocation), `1bf549b` (release),
> `0f899d1` (order-management sale wiring), `569b26e` (intake UI), `ac99d9d`
> (product toggle + order-fulfilment sell UI), `cfb60ed` (pos-sale checkout).

## The problem

Some stock is **one discrete physical item that holds many sellable sub-units**,
sold either whole *or* portion-by-portion:

- a **tablet box** containing 100 tablets, sold as strips or singles;
- a **lace / fabric roll** of 50 or 100 yards, sold yard-by-yard or metre-by-metre;
- a **cable drum**, a **bulk spice sack**, a **paint tin** decanted by the litre.

Generating one `stock-item` row per sub-unit doesn't scale (100 rows for one box)
and even collides on the serialized-intake barcode scheme. The chosen model keeps
**one discrete item** and tracks a **divisible quantity on it**.

This is distinct from pure bulk (`track_mode='bulk'`, a stock-batch quantity
ledger with *no* discrete item): a divisible item keeps its own barcode, cost,
expiry, and location — it is a *countable thing* that happens to be sub-divisible.

## The three stock models (where divisible fits)

| Model | Signal | On-hand cache | One row represents |
|---|---|---|---|
| **Serialized** | default | `product.stock_quantity` = count of InStock items | 1 sellable unit |
| **Bulk** | `product.track_mode='bulk'` | `product.bulk_quantity_on_hand` = Σ batch remaining | no discrete item; a batch quantity ledger |
| **Divisible** | `product.divisible` / `stock_item.sellable_units > 1` | `product.sellable_quantity` = Σ (remaining) of InStock items | 1 discrete item holding **N** sub-units |

The three are independent and additive. Turning a product divisible does **not**
touch its `stock_quantity` count — divisible math rides *alongside* the serialized
invariant, so ordinary products and the whole-item sale path are entirely
unaffected.

## Data model

### Product (`api::product.product`)

| Field | Type | Meaning |
|---|---|---|
| `divisible` | boolean | Opt-in switch. When on, intake screens expose "sellable units / item" and the POS sells fractional portions. |
| `sellable_quantity` | decimal | Cache = Σ remaining sub-units across the product's `InStock` items (the divisible analogue of `stock_quantity`). Ordinary items contribute 1, so it is a safe superset. Maintained by the stock-item lifecycle. |

### Stock item (`api::stock-item.stock-item`)

| Field | Type | Meaning |
|---|---|---|
| `sellable_units` | decimal (default 1) | **Total capacity when full** = the price denominator. e.g. a 50-yard roll → `50`. `> 1` marks the item divisible. |
| `units_sold` | decimal (default 0) | Grows as portions sell. **remaining = `sellable_units − units_sold`**. |
| `expiry_date` | date (nullable) | Per-unit expiry (used by FEFO ordering, below). |

When `units_sold` reaches `sellable_units` the item **depletes** and flips
`status → Sold`. A return re-opens it to `InStock`.

> `sold_units` (integer) is a **separate legacy field** and is *not* the divisible
> counter — the divisible engine reads/writes `units_sold` (decimal) only.

### Sale line

Two shapes carry the sold portion, one per sale surface:

- **Order line** (`order.order-product-item` component, used by `rutba-order-management`):
  `sellable_qty` (decimal) + `allocations` (json).
- **Sale item** (`api::sale-item.sale-item`, used by `pos-sale`):
  `sellable_qty` (decimal) + `allocations` (json). `quantity` stays an integer
  (kept at 1 — one line); the real fractional portion lives in `sellable_qty`.

## Pricing rule

**The price stays fixed; a portion is a fraction of it.**

```
unit (sub-unit) price = selling_price ÷ sellable_units
line total            = qty × unit price
```

A 50-yard roll priced at 5000 sells at `5000 ÷ 50 = 100` per yard; 3.5 yards costs
`350`. Helper: `stock-item.sellableUnitPrice(item)`.

## The allocation engine (`api::stock-item.stock-item` service)

All divisible selling funnels through **one** engine so ordering, FEFO, pricing,
and depletion live in a single tested place (stock logic stays under
`api::stock-item`, never in `api::product`).

### `allocateSellableUnits(productId, qty, { scannedItemDocId, dryRun })`

Consumes `qty` sub-units across the product's `InStock` items and returns the
allocation breakdown. Ordering (the user's rule):

1. **A scanned item is honoured first** — if the teller physically scans a
   specific roll/box, sell from it, but **emit a warning** if a nearer-expiry unit
   is being skipped ("Selling a unit expiring 2026-09-01 while a nearer-expiry unit
   (2026-08-10) is available").
2. Otherwise **already-opened items first** (`units_sold > 0`) so a new full item
   isn't broken unnecessarily —
3. then **FEFO** (earliest `expiry_date`, nulls last) —
4. then insertion order (createdAt-ish, stable).

It spans multiple items when one can't satisfy the quantity; each depleting item
flips to `Sold`. Returns:

```js
{ allocations: [ { stock_item, stock_item_id, units, unit_price, line_total, depleted } ],
  totalUnits, totalPrice, warning? }
```

If total remaining `< qty` it returns `{ insufficient: true, available }` and
**mutates nothing** (all-or-nothing). `dryRun` computes without writing.

### `releaseSellableUnits(allocations)`

The reverse (return / cancel / void): subtracts the units from each item's
`units_sold` (floored at 0) and **re-opens** any item that had depleted to `Sold`
back to `InStock`. Best-effort and idempotent-ish — a missing item is skipped.

### `sellDivisibleUnits(productDocId, qty, { scannedItemDocId, saleItemDocId })`

POS entry point that resolves the product by `documentId`, calls
`allocateSellableUnits`, and (when a sale-item is given) **links the consumed units
to that sale-item** for traceability. Throws `{ status: 409, available }` when
short.

### `recomputeSellableQuantity(productId)`

Rebuilds `product.sellable_quantity` = Σ remaining of `InStock` items. Fired by the
stock-item lifecycle on any `units_sold` / `status` / `product` / `archived` change.

## Endpoints

| Method / path | Handler | Used by |
|---|---|---|
| `POST /sale-orders\|orders/:documentId/attach-divisible` | `sale-order.attachDivisible` → `attachDivisibleToLine` | rutba-order-management (order fulfilment) |
| `POST /stock-items/sell-units` | `sell-units.run` → `stock-item.sellDivisibleUnits` | pos-sale (immediate checkout) |

Both are `auth:false` routes with manual auth (mirroring the other custom
stock-item endpoints) and funnel into the same engine. Descriptors:
`SaleOrdersEndpoints.attachDivisible`, `StockItemsEndpoints.sellUnits`.

## Sale semantics — consumed at allocation, released on reversal

Unlike a whole item (which walks `InStock → Reserved → Sold`), **divisible
sub-units are consumed at allocation time** — there is no single "Reserved" unit to
hold. The mirror is release:

- **Order management**: the sale-order state machine calls
  `releaseDivisibleForOrder` on **CANCELLED / RETURNED**, reading each line's
  stored `allocations` json.
- **pos-sale**: allocation happens **only when the sale is paid** (drafts reserve
  nothing, matching the whole-item path). Returns run through the existing
  sale-return flow.

## Two POS surfaces, one engine

### rutba-order-management — order fulfilment (PreparationStage)

`StockItemPicker` **infers** divisibility from the units (`sellable_units > 1`, no
dependency on the flag being populated) and switches to sell-by-portion mode: a
"Sell N units" bar (server allocates), per-unit "Sell here" (scan a specific
roll/box, warns on FEFO skip), plus Remaining and Unit-price columns.
`PreparationStage.handleSellUnits` → `attachDivisible`, surfacing the allocation
warning as a toast.

### pos-sale — immediate checkout

The domain model does the work additively:

- **`SaleItem`** gains `sellableQty` and divisible getters (`subUnitCapacity`,
  `isDivisible`, `isDivisibleSale`, `perSubUnitPrice`); the money getters
  (`price` / `unitPrice` / `subtotal` / `row_discount`), `setQuantity`, and
  `toPayload` branch on divisible-sale mode. A divisible line keeps **one
  representative item** and records a fractional portion; whole-unit and custom
  lines are untouched. Restored from the API on reload.
- **`SaleModel.addStockItem`** detects divisibility (`sellable_units > 1` or
  `product.divisible`); repeated adds **bump the sub-unit portion** instead of
  pulling another physical unit.
- **The cart qty cell** allows decimals for divisible lines and shows a
  `units · N/item` capacity hint.
- **`saveSaleItems`** routes divisible lines through `StockItemsEndpoints.sellUnits`
  on paid (skipping the whole-unit connect / Sold flip), throwing a clear
  "only N available" error if short.

### Intake (pos-stock)

The product edit form has a **"Divisible (sold in units)"** checkbox. Once set, the
Generate / Scan intake screens expose a **"Sellable units / item"** field that
stamps `sellable_units` on each created item (alongside the optional `expiry_date`).

## What is verified, and what to check by hand

**Load-only verified** (self-cleaning smoke tests against a booted Strapi):
opened-first ordering, per-sub-unit pricing, multi-item spanning, depletion→Sold,
sale-item linking, `product.sellable_quantity` recompute, and the insufficient
(409, no-mutation) guard.

**Not yet click-through-verified** (the UI is esbuild-parse-verified but needs a
live run): mark a product divisible in pos-stock, generate a roll with e.g. 50
units, then sell a fractional portion — in an order via rutba-order-management, and
in an immediate sale via pos-sale.

## Known limitations / follow-ups

- POS saves are **not transactional** (pre-existing): an insufficient-stock
  allocation mid-save throws after the sale header was created — the teller
  retries. A pre-flight `dryRun` availability check would remove the partial-sale
  window.
- `product.divisible` and `stock_item.sellable_units` are the source of truth;
  a mis-intake (divisible product with `sellable_units = 1`) degrades gracefully to
  whole-unit behaviour.
- Divisible items are **not** yet reflected in Epic 4 reorder suggestions by
  sub-unit remaining (reorder reads `stock_quantity` / bulk on-hand).

## Related

- [Inventory & Manufacturing Program overview](../todo/inventory-manufacturing-program/00-overview-and-roadmap.md)
- [Epic 5 — expiry / batch / FEFO](../todo/inventory-manufacturing-program/epic-5-product-expiry-batch-fefo.md) (FEFO ordering shared with divisible allocation)
- Stock model invariant — `project_stock_model_invariant` (auto-memory)
