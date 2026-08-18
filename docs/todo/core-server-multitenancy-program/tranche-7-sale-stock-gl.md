# Tranche 7 — Sale / Stock / Payment / GL: migration sheet

Status: **ported + smoke-verified** (steps 1–4 of the playbook done against the
live dev DB; goldens, schema handover and the Caddy flip remain).

## What runs in core now

`services/core/src/modules/sale-stock.js` (same zero-copy model as tranches 1–6).
This is "the big one": every flow funnels through the sale-order state
machine's `executeTransition` chokepoint and the stock/GL lifecycles it
drives, so the whole cluster migrates as ONE tranche — 97 custom routes
across 14 APIs.

### Route surface (in Strapi route-file order — koa-router is first-match)

| Area | Routes | Auth model |
|---|---|---|
| sale-order | 40 (dual `/orders` + `/sale-orders` paths): web checkout create, myOrders/myOrderDetail (override the core find/findOne exactly as live does), calculate-delivery, secret-gated tracking, order messages, update-status / update-items / assign-rider / attach-stock-item / attach-divisible / cancel, record- & verify-payment, cost-change round-trip, labels | selfAuth (ensureUser / requireStaffUser inside) except integration export/update-status + checkout validate-address (gated) |
| sale (POS) | detail, checkout, record-payment, pay-later ± unlock (gated: uid+action); cancel, search-by-stock-item, search-by-item-price (selfAuth) | mixed |
| sale-offer | for-product listing + publish/unpublish triad | selfAuth (order/sale/cms membership inside) |
| cash-register | active, open, :id/close, :id/expire | selfAuth (ensureUser + ownership/manager rules inside) |
| stock-item | orphan-groups ×2, bulk-resolve, bulk-process (gated); recompute-product-stock, backfill-default-locations, transfer, valuation, stock-health, sell-units, return-units (selfAuth). `expiring` + `sweep-expired` stay with tranche 4 | mixed |
| stock-batch / stock-input / stock-level | recompute-product-bulk, process + bulk (gated), recompute | mixed |
| stock-adjustment / transfer / count | post/cancel, dispatch/receive/cancel, post/cancel | selfAuth (requireAppRole inventory/stock manager+ inside) |
| return-request | create, mine, :documentId read, cancel/approve/reject/set-received/resolve, label | selfAuth |
| return-policy | `GET /return-policy` legacy singular resolver | gated (findEffective) |
| rider | me, me/status, offers ×2, accept/reject ×4, deliveries, delivery status | selfAuth |

Parity notes baked into the ordering: `GET /sale-orders/confirm-change` is
declared after `GET /sale-orders/:documentId` in services/strapi, so live serves
myOrderDetail for it — core preserves that shadowing (the POST route is the
functional one).

### Lifecycles NEW this tranche (document middlewares)

sale-item, sale-return, sale-return-item (stock reset on returns),
cash-register-transaction (drawer GL), stock-adjustment / stock-transfer /
stock-count (number auto-assign), acc-expense, acc-invoice (posting JEs),
return-policy (singular is_default). Cross-module invariants were already
registered: sale-order + return-request (hr), stock-item / stock-batch /
acc-bill / acc-journal-entry (mfg).

### Crons

None — the inventory expiry/alert sweeps belong to tranche 4.

### New platform capability this tranche forced

- **`strapi.db.metadata.get(uid)`** on the compat db — tableName, scalar
  columnName, and the relation joinTable layout (name / joinColumn /
  inverseJoinColumn / orderColumnName), backed by the registry, resolving both
  owner-side and mappedBy attributes. The stock-item valuation / stock-health
  raw-knex queries build SQL from it.

## Verified end-to-end in the smoke (37 checks, `smoke-sale-stock.js`)

- Guest web checkout: server-side offer re-pricing, provisional person,
  PAYMENT_CONFIRMED, secret-gated tracking, staff PREPARING transition,
  invalid-transition rejection, cancel through the state machine.
- POS: register open (opener stamped from the caller) → sale + line + serial
  unit → `/checkout` settles (payment row, stock unit Sold via the stock-item
  lifecycle, sale Completed/Paid, revenue + COGS JEs **with lines linked**) →
  `/detail` tree → search-by-stock-item → register close (expected-cash
  reconciliation math, difference 0).
- Stock adjustment: role gate 403, WriteOff post moves InStock units to
  Reduced with adjusted_item_ids recorded, cancel reverts exactly those.
- Read contracts: return-policy resolver, sale-offers for-product (member
  gate + shape), return-requests/mine, rider/me.

Smoke hygiene learned here (baked into the script):
- The acc-journal-entry lifecycle **refuses to delete Posted entries** (by
  design) — cleanup sweeps GL raw (line rows then entry rows; `_lnk` rows
  FK-cascade).
- `updateAccountBalances` mutates cached acc-account balances and raw JE
  deletion doesn't reverse them — the smoke snapshots **all acc-account
  balances** up front and restores them in cleanup. (Drift from the first
  runs was measured against a full recompute-from-lines and corrected;
  every other account matched its recomputed value exactly.)

## Known deviations (parity-relevant, same class as earlier tranches)

- `strapi.plugin('email')` is a throwing stub → notification-service email
  sends are caught no-ops (`[notification-service] email failed` logs);
  in-app notification rows are still written. Same status as crm/cms — email
  lands with its own tranche. At flip, transactional order emails stop until
  then — flip decision must weigh that.
- `strapi.plugin('users-permissions')` manual-JWT fallbacks in these
  controllers throw into their catch blocks — harmless, because core's
  optional-auth middleware has already set `ctx.state.user` for valid tokens
  (Strapi parses nothing on auth:false routes; core's optional parse is what
  keeps logged-in guests attached to their orders).

## Verification

- `node scripts/smoke-sale-stock.js` — 37 checks green, marker-only,
  self-cleaning (verified zero marker rows and zero balance drift after).
- Full sweep green: documents, writes, http, platform, hr, crm, inventory,
  cms-social, marketplace. smoke-mfg still shows only the 3 PRE-EXISTING
  dev-DB WO-stage failures (tracked separately since tranche 5).
- validate-schema: 0 mismatches, 0 warnings.
- contract-diff vs live services/strapi: at the pre-existing 101/113 baseline
  (the 12 /api/branches populate=* items-ordering diffs tracked separately).

## Remaining for this tranche

Same as tranches 1–6: goldens on a fixture DB, baseline migration via
`schema-diff.js --filter`, Caddy flip + bake. No cron cutover. Flip
considerations specific to this tranche: it owns the money paths (POS
checkout, web orders, GL postings) — flip it LAST of the ported tranches,
after the others have baked, and only once email lands or the order-email gap
is accepted explicitly.
