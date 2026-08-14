# 06 — Sync-back granularity: what the replayer replays

> **Status: decided (2026-08-14).** This document settles
> [`offline-pos-options.md` §10.5.1](../offline-pos-options.md#105-still-open),
> restated as the open decision in
> [03 §The open decision](03-app-policies.md#the-open-decision--1051). It is a
> policy decision about the **outbox payload shape**, which is why it had to be
> taken before D4 is specced rather than during it — changing that shape later
> means draining every field outbox before upgrading.
>
> Nothing here is code. The evidence below is a read of the code that exists on
> `dev` today.

## The question

When a sale was rung offline against replica units, does the replayer:

- **(a)** replay the stock-unit references the till captured, flagging per-unit
  collisions when another till already sold one; or
- **(b)** degrade the sale to product + quantity and let
  [`stock-item.allocateSellableUnits`](../../../pos-strapi/src/api/stock-item/services/stock-item.js)
  (`pos-strapi/src/api/stock-item/services/stock-item.js:555`) pick real units at
  sync?

## The decision

**Replay the captured references. Fall back to allocation only when a reference
cannot be honoured.**

The framing that matters, and the reason this is not a coin-toss between two
designs: **the captured reference is the record of what physically happened.
Allocation is the repair for when reality has moved on.** A till that scanned
unit X knows something the server does not, and that knowledge is the only
record of which object left the shop. Throwing it away at capture time to avoid
a conflict at replay time discards evidence to make a report tidier.

So (a) is the primary path and (b) is the exception path, and both ship. The
replayer sends the references; the server honours what it can; whatever it
cannot honour falls through to the allocator and is recorded as a discrepancy
under the already-decided oversell policy.

## Why the reference has to survive: three consequences, none cosmetic

### 1. Returns restock **only** through `items`

[`sale-return-item/lifecycles.js:28-64`](../../../pos-strapi/src/api/sale-return-item/content-types/sale-return-item/lifecycles.js)
is the whole restock path. `restockLinkedItems` populates the return line's
`items` relation and walks it — nothing else:

```js
const row = await strapi.db.query(RETURN_ITEM_UID).findOne({
  where: { id: itemId },
  populate: { items: { select: ['id', 'status', 'sellable_units', 'units_sold'] } },
});
const linked = Array.isArray(row?.items) ? row.items : [];
for (const stockItem of linked) { /* … → status: 'InStock' */ }
```

A `sale-return-item` carrying `product + quantity` and no `items` produces the
refund, the return document and the paperwork, and **restocks nothing**. There
is no quantity-based branch to fall back to, and no warning on that path — the
only `strapi.log.warn` in the file fires for divisible rolls
(lines 43-47), not for an empty relation. Stock silently fails to come back.

### 2. Unit lookup and the return UI are built on hard references

`GET /sales/search-by-stock-item`
([`search-by-stock-item.js:73-83`](../../../pos-strapi/src/api/sale/controllers/search-by-stock-item.js))
resolves a scanned unit to its sale by filtering sale-items on
`items: { id: { $in: stockIds } }`. Scanning a returned unit to find the sale it
came from works **only** because the sale holds hard unit references. Degrade
the capture and the counter staff's "scan it to find the receipt" stops working
for every offline-rung sale.

The return page renders per-unit rows —
`pos-sale/pages/[documentId]/sale-return.js:897-931` gives each linked unit its
own row with SKU and Barcode columns — and gates returnability on the unit's own
status:

```js
const isSold = si.status === "Sold";
const canReturn = isSold && isReturnable;
```

A unit the server never marked `Sold` renders with `—` and the tooltip *"Only
sold items can be returned"*. A unit that was never linked to the sale does not
render at all.

### 3. COGS is relieved against the specific unit's `cost_price`

Never `product.cost_price`. Both posting paths agree:

| Path | Where | Cost basis |
|---|---|---|
| POS checkout | [`checkout.js:185-204`](../../../pos-strapi/src/api/sale/controllers/checkout.js) | `stock.cost_price` per linked unit; divisible lines pro-rate `units × (roll cost_price / capacity)` |
| Web order | [`sale-order-state-machine.js:396-421`](../../../pos-strapi/src/api/sale-order/services/sale-order-state-machine.js) | *"the `cost_price` of the specific stock-items attached to the order lines"* — its own comment, line 397 |

Units of the same product routinely differ in cost — that is the entire reason
`cost_price` lives on `stock-item` and not on `product`. A sale that names no
unit posts **no COGS at all** on the POS path: `totalCost` accumulates only from
`item.items`, and `if (totalCost > 0)` is what gates the journal entry. Not a
wrong number — a missing entry.

### And a supporting fact: quantity is *derived* from the unit count

[`SaleItem.js:448`](../../../packages/pos-shared/context/domain/sale/SaleItem.js):

```js
quantity: this.items.length || Number(this.quantity) || 0,
```

with the comment *"items.length is the source of truth while the line holds
stock units"*. In the whole-unit model, product + quantity is not a smaller
description of the sale; it is what is left after the description is deleted.

## The failure mode of degrading, stated plainly

The cashier hands the customer unit Y. The server, at sync, allocates unit X.
Then:

- **Y stays `InStock` forever.** It is gone from the shelf and present in the
  count. Every stock take from now on is short by one and nobody knows which one.
- **X sits on the shelf marked `Sold`.** It will not be allocated, will not be
  sellable, and will not appear as available.
- **A return of Y finds nothing.** `search-by-stock-item` does not resolve it;
  the return page will not offer it; and if a return line is forced through,
  `restockLinkedItems` restocks X, compounding the error.

This is **the database disagreeing with the physical world, permanently, with
no signal**. It is a different class of problem from an inconsistency — an
inconsistency is a state two systems will reconcile; this is a state both
systems consider correct and neither will ever revisit. Distinguishing the two
is the point of this decision.

## The counter-argument is real, and it is already answered

[§9.2](../offline-pos-options.md#92-the-scoping-decision-that-removes-the-hardest-problem)
makes the case for (b) properly, and it is not weak: *"this specific unit was
already sold" cannot occur*, and what remains is a shortfall on a number — far
easier to report and settle than a per-unit collision.

That argument is **already answered by the decided oversell policy**
([§5](../offline-pos-options.md#5-what-the-server-still-owes-the-proxy),
reaffirmed at [§13.5](../offline-pos-options.md#135-not-adopted-the-local-database-is-the-source-of-truth)):

> the sale **posts**, the already-sold unit is **not** consumed twice, and the
> discrepancy is recorded for a human.

That policy *is* the repair path. A per-unit collision is not an unhandled case
requiring a different capture model — it is a case with a decided outcome, and
the outcome is exactly what (b) would have produced anyway (the allocator picks
a substitute) **plus** a record of which unit was expected. It needs **no change
to the outbox payload**; it needs the distinguishable `409` that
[§5b](../offline-pos-options.md#5-what-the-server-still-owes-the-proxy) already
owes the proxy, and which
[04 §4](04-server-prerequisites.md#4-conflicts-that-are-distinguishable)
already schedules as a D0 prerequisite.

So (b) buys a simpler conflict report at the price of the three consequences
above. That is not a trade worth making.

## The argument that does NOT hold: the receipt

[03 §The open decision](03-app-policies.md#the-open-decision--1051) and
[§10.5.1](../offline-pos-options.md#105-still-open) both record (b)'s cost as
*"it changes what the receipt's line items mean"* — a customer holding a receipt
naming unit X against a database recording unit Y.

**That is not true of the receipt this repo prints.** Checked directly:
[`SaleInvoice.js`](../../../pos-sale/components/print/SaleInvoice.js) prints
**nothing unit-specific**. The item table has exactly two columns, `Item` and
`Total` (lines 229-235); each row prints

```js
const itemName = item?.items?.[0]?.name || item.product?.name || 'Item';
```

(line 245) plus `qty × unit price` and an optional discount. There is no SKU, no
barcode, no serial, no batch, no expiry on any line. The only barcode on the
document is `BarcodeDisplay` of the **invoice number** (line 380) — the sale's
identity, not a unit's. Batch and expiry data is staff-facing only.

This matters enough to state explicitly, because the receipt argument is the
intuitive one and the one most likely to be reached for again: **the case
against degrading is the returns, COGS and unit-lookup consequences above, and
nothing else.** If someone later disproves those three, the receipt will not
rescue the decision.

## Divisible lines are the exception, and they stay product + quantity

Not a carve-out invented for offline — it is the shape they already have online.

The POS never connects whole units for a divisible line. It sends product +
quantity to `POST /stock-items/sell-units`
([`saleApi.js:327-346`](../../../packages/pos-shared/lib/saleApi.js), which
`continue`s past the whole-unit path at line 345), and the server allocates:

```
saleApi.saveSaleItems → StockItemsEndpoints.sellUnits({ productDocId, qty, saleItemDocId })
  → POST /stock-items/sell-units  (product_document_id, qty)
  → stock-item.sellDivisibleUnits → allocateSellableUnits (opened-first → FEFO)
```

And `sellDivisibleUnits`
([`stock-item.js:716-783`](../../../pos-strapi/src/api/stock-item/services/stock-item.js))
is **reconcile-to-target**, which its own docblock states as a contract
(lines 705-710):

> *"`qty` is the TOTAL the line should have consumed, not an increment. A retry
> … that passes the same qty consumes nothing and returns the already-recorded
> allocations, so stock is never double-sold."*

The implementation is lines 731-750: read the line's recorded `allocations`, sum
them to `existingUnits`, allocate only `want - existingUnits`, and return early
with `{ idempotent: true }` when the difference is zero. **A replay with the same
qty consumes nothing.** That is idempotency by construction — a property of the
operation, not of the retry machinery around it.

Contrast the whole-unit path, which is idempotent only *accidentally*: setting
`status: 'Sold'` twice is a no-op. That happens to be safe, and it is safe for a
reason nobody designed, which is worth knowing before relying on it under
replay.

> ### Consequence for the outbox: the payload must carry both shapes
>
> This is the concrete D4 output of this decision. A sale's queued write is not
> one payload schema. A line is either:
>
> | Line kind | Payload | Replay semantics |
> |---|---|---|
> | whole-unit | line + captured unit references | honour each reference; fall through to the allocator per unhonoured unit, record the discrepancy |
> | divisible | line + `product_document_id` + total `qty` | reconcile-to-target; a repeat consumes nothing |
>
> The discriminator exists in the client model already (`item.isDivisibleSale`,
> `saleApi.js:327`) and on the server (`product.divisible`, enforced at
> `stock-item.js:725` — portion-selling a non-divisible product is a `400`).
> The outbox records which shape it captured; it does not infer it at replay.

## Two findings that outlive this decision

### The POS has no state machine

Web orders route stock side effects through
[`sale-order-state-machine.js`](../../../pos-strapi/src/api/sale-order/services/sale-order-state-machine.js)'s
`executeTransition`. The POS has no equivalent: `pos-strapi/src/api/sale/services/`
contains only `sale.js`, and the six state machines in the repo belong to
`hr-leave-request`, `mfg-bundle`, `mfg-task`, `mfg-work-order`, `return-request`
and `sale-order`. **There is no sale state machine.**

The POS stock walk is the **browser client** issuing one
`PUT /stock-items/:documentId` per unit from `saveSaleItems`
([`saleApi.js:351-388`](../../../packages/pos-shared/lib/saleApi.js)), each
carrying `{ status: 'Sold', sale_items: { connect: [saleItemId] } }`.

Two things follow:

1. **An offline POS sale is a replay of a client-driven multi-call sequence**,
   not a replay of one server-side transition. The outbox is queueing the
   client's intent at a lower level of abstraction than the web-order path would
   require, and ordering within the group is load-bearing rather than incidental.
2. It sits outside the repo convention that **stock side effects belong in the
   state machine**. This program does not fix that, and should not try to inside
   D4 — but the next person who proposes "just replay the transition" for POS
   should know there is no transition to replay.

### `allocateSellableUnits`' lock does not cover a replaying bridge

The allocator is guarded by an **in-process promise mutex**
(`withProductLock`, [`stock-item.js:31-62`](../../../pos-strapi/src/api/stock-item/services/stock-item.js)),
and its own header says what that does and does not cover:

> *"This is an IN-PROCESS lock: it protects one Strapi instance (the current
> deployment — single container, no compose replicas). If Strapi is ever scaled
> horizontally, promote this to a DB advisory lock (MySQL `GET_LOCK` keyed by
> product) so the guarantee holds across instances."*

A bridge draining its outbox while live tills sell against the same products is
**exactly** the contention that lock does not cover — the replay arrives as
ordinary HTTP, so it is covered as long as one Strapi instance serves everything,
and stops being covered the moment there are two. Two tills draining
simultaneously against a two-instance deployment is a lost update on
`units_sold`: the oversell the mutex was written to prevent, in the one scenario
it cannot see.

- [ ] **Phase-3 prerequisite.** Promote `withProductLock` to a DB advisory lock
      before D4 carries real sales, or record explicitly that the deployment is
      pinned to a single Strapi instance for as long as bridges replay into it.
      This is cheap now and is a data-corruption incident later.

### One asymmetry that favours references anyway

The allocator excludes expired units and prefers earliest expiry
([`stock-item.js:570-577`](../../../pos-strapi/src/api/stock-item/services/stock-item.js)):

```js
// Exclude already-expired units — the daily sweep flips them to 'Expired'
// but between expiry and the next sweep they'd otherwise sort FIRST …
.filter((it) => !it.expiry_date || String(it.expiry_date).slice(0, 10) >= today);
```

The POS whole-unit path has **no expiry guard at all** — `expiry` appears
nowhere in `pos-sale/` or in `packages/pos-shared/`. A scanned unit is sold
whatever its expiry date, and the only thing that ever stops it is the daily
sweep flipping the row to `Expired`.

Offline, a unit that expires mid-outage replays regardless, because the sweep
that would have caught it never ran against the till's replica. Recorded as a
**pre-existing gap that an outage widens**, not one this design creates: the
same unit sold online at 9am on its expiry date, before the sweep, is sold just
as freely today. Fixing it belongs to the stock module, not to D4 — but D4
should not be the place where somebody first discovers it and mistakes it for a
replay bug.

## What remains open

1. **The discrepancy record's shape.** The oversell policy says *"recorded for a
   human"*; it does not say in what. D4 owns this, and it is the input to the
   shell's conflicts screen
   ([02](02-desktop-shell.md#connectivity-and-the-queue-live-in-shell-chrome)).
2. **Granularity of a partially-honoured line.** Three units captured, one
   already sold elsewhere: one conflict for the line, or one per unit? The
   money and the count are right either way; this is about what the human is
   asked to look at.
3. **Which identity the outbox captures for a unit.** Both are in live use —
   `checkout.js:189-194` builds a `byDoc`/`byId` pair precisely because
   allocations carry `stock_item` (documentId) *and* `stock_item_id`. The
   replayer needs one rule, and it interacts with provisional ids
   ([§2](../offline-pos-options.md#2-the-hard-part-provisional-ids)) for units
   created offline.
4. **The advisory lock's timing and mechanism** — the checkbox above.
5. **The expiry gap** — whose module, which release. Not D4's, but somebody's.

## What this does not reopen

- The oversell policy ([§5](../offline-pos-options.md#5-what-the-server-still-owes-the-proxy)).
  It is the repair path this decision relies on.
- [§13.5](../offline-pos-options.md#135-not-adopted-the-local-database-is-the-source-of-truth) —
  the server remains the authority on stock. Replaying a captured reference is a
  **claim** about what happened, submitted for adjudication. It is not the till
  asserting ownership of a unit.
- [§13.3](../offline-pos-options.md#133-confirmed-not-changed-the-outbox-is-an-append-only-operation-log) —
  the outbox stays an append-only operation log. This decision fixes what one
  operation carries, not how operations are stored.
