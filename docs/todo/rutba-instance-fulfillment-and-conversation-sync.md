# Rutba instance sync — fulfillment status push-back + order conversation sync

> **Status (2026-07-29):** Spec only — nothing in this doc is built yet. Written
> for a fresh implementation session to pick up without re-discovering context.
> Companion to [rutba-instance-marketplace.md](../features/rutba-instance-marketplace.md)
> (the "Rutba instance as a Marketplace" feature) — **read that doc first**, it
> covers the catalog-push/order-pull machinery this spec builds directly on top
> of. This doc covers exactly the two gaps called out there under Roadmap:
> "P4 — Fulfillment status push-back" plus a second, not-previously-scoped
> piece: order conversation (customer/rider/staff chat) sync.

## TL;DR

Two Rutba ERP instances exist: **LAN / in-house** (`192.168.0.46`, source of
truth, where staff actually pack/ship/deliver orders) and **rutba.pk / online**
(the public storefront customers order from and check status on). Today:

- Catalog + price/stock push (in-house→online) and order **pull**
  (online→in-house) both work — see the marketplace doc.
- Once an order is pulled onto the LAN instance, **nothing flows back**. Staff
  update the order's status locally (PREPARING → OUT_FOR_DELIVERY → DELIVERED,
  etc.) via the normal state machine, but the customer's own order on rutba.pk
  never learns about it — `capabilities.fulfillment: false` on the `rutba`
  adapter is explicit about this being unbuilt, and a repo-wide grep confirms
  there is no push-back code path at all.
- Order **conversations** — the customer/rider/staff message thread on an
  order (`api::order-message`) — are 100% local to whichever instance they were
  written on. A customer message on rutba.pk is invisible to LAN staff (who do
  the actual fulfillment work) unless someone manually relays it, and a staff
  reply from LAN never reaches the customer on rutba.pk.

This spec adds both, reusing the exact architecture the marketplace feature
already established: a **watermark-polled push job** run by the
`rutba-marketplace` worker, an **adapter method** per direction, and a
**service-token-gated `/integration/*` endpoint** on the receiving side. No new
infrastructure, no webhooks, no message queue — just two more jobs alongside
the existing `catalog` / `inventory` / `orders` cron jobs.

---

## 0. Prerequisite reading (don't skip)

Before touching code, read:

- `docs/features/rutba-instance-marketplace.md` — the whole feature this
  extends. Pay special attention to:
  - §2 "Identity model" — orders are matched via `sale-order.external_order_id`
    (the **online-side** `documentId`) + `channel='rutba'`, set at ingest time
    in `pos-strapi/src/api/marketplace-account/services/marketplace-account.js`
    `ingestOne` (~lines 24-188).
  - §2 File map — where the adapter/engine/routes for the existing three flows
    live, since the new code sits right next to them.
  - §3 Setup, particularly the **service-token gate** (`isServiceToken`,
    `src/utils/is-service-token.js`) every `/integration/*` route uses, and the
    **route-ordering gotcha** (two-segment `/integration/*` paths so they never
    collide with `/sale-orders/:documentId`).
  - §4 Operating & observability — `marketplace-sync-log` (`kind` enum) is
    where every sync run's counts/errors are recorded; both new jobs must write
    to it the same way.
- `pos-strapi/src/api/sale-order/services/sale-order-state-machine.js`
  `executeTransition` (~lines 86-227) — the single chokepoint for order
  side-effects (stock, accounting, workflow audit). Per
  `feedback_order_state_machine_owns_stock_side_effects` (memory), **new side
  effects belong here, not in a controller** — the status push-back trigger
  must hook this function, not duplicate transition logic elsewhere.
- `rutba-marketplace/lib/engine.js` — `syncOrdersForAccount` (order **pull**,
  lines ~167-222) is the closest existing analog to the status-push job below;
  copy its shape (fetch → normalize → per-item try/catch → sync-log write).

---

## 1. Fulfillment status push-back (LAN → rutba.pk)

### 1.1 Direction and identity

- **Direction:** LAN (where the transition actually happens) → rutba.pk (where
  the customer's original order lives). This is the primary, common-case flow:
  warehouse packs → ships → delivers, and the customer needs to see that
  online.
- **Identity:** the LAN-side local order (channel `rutba`) already carries
  `external_order_id` = the **rutba.pk-side** order's `documentId` (set at
  ingest). The push endpoint on rutba.pk receives that `documentId` directly —
  no new identity scheme needed.
- **Reverse direction (rutba.pk-initiated changes, e.g. a customer
  self-cancels):** partially covered already — `ingestOne` on the LAN side
  re-checks the remote status on every poll and flips the **local** order to
  `CANCELLED` if the remote status matches `/cancel/i` (marketplace-account
  service, ~lines 38-49). That is poll-driven (up to 15 min latency, the
  `orders` job's cadence) and cancel-only. **Out of scope for this spec** to
  make it real-time or cover other statuses — note it as a known limitation,
  don't block on it.

### 1.2 New adapter capability

`rutba-marketplace/lib/providers/rutba.js`:

- Flip `capabilities.fulfillment` to `true` once built (currently `false`,
  line ~57, with the comment "No oauth, no fulfillment push in phase 1" right
  above it — phase 1 is done, this is phase 2).
- Add `pushOrderStatus(account, { external_order_id, status, status_detail })`
  → `POST {base_url}/sale-orders/integration/update-status` with the same
  Bearer-token auth pattern as `pushCatalog`/`pushInventory` (lines 81-94 for
  the shape to copy).

### 1.3 New engine job

`rutba-marketplace/lib/engine.js` — add `syncOrderStatusForAccount` /
`syncAllOrderStatus`, mirroring `syncOrdersForAccount` (~167-222) but in the
**push** direction (like `syncInventoryForAccount`, ~516-633, is the closest
push-shaped analog):

1. Query local `sale-order` rows where `channel = 'rutba'` and
   `updated_at > account.last_status_synced_at` (new watermark field, see
   §1.5) — these are orders whose status may have changed since the last push.
2. For each, compare current `status` against a new
   `marketplace_status_synced_value` field (see §1.5) to skip no-op pushes
   (an order can be re-touched — e.g. a payment-verification edit — without
   its `status` actually changing).
3. Call `adapter.pushOrderStatus(...)`. On success, update
   `marketplace_status_synced_value` = the pushed status.
4. Write a `marketplace-sync-log` row, `kind: 'status'` (new enum value, see
   §1.5), same shape (fetched/created/updated/skipped/failed + `detail`) as
   the other jobs.
5. Advance `account.last_status_synced_at` to the max `updated_at` seen (same
   watermark pattern as `last_orders_synced_at` / `last_inventory_synced_at`).

Wire it into `rutba-marketplace/worker.js` as a new cron job (`status`,
suggested default rule `*/10 * * * *` — more frequent than catalog, since
customers actively watching "where's my order" care about latency), and add a
manual `POST /api/accounts/:id/sync-status` endpoint mirroring
`pages/api/accounts/[id]/sync-catalog.js`, plus a button in
`rutba-marketplace/pages/accounts.js` next to the existing Catalog/Orders/Stock
buttons.

### 1.4 Receiving endpoint (rutba.pk side, `pos-strapi/`)

New route, same file/pattern as the existing three:
`pos-strapi/src/api/sale-order/controllers/sale-order.js` +
`routes/01-custom-sale-order.js` — add `updateStatusFromIntegration` at
`POST /sale-orders/integration/update-status`, gated `isServiceToken` (same
guard as `exportMarketplace`).

Body: `{ external_order_id, status, status_detail? }`. Handler:

1. Find the **local** (rutba.pk-side) order by `documentId = external_order_id`.
   404 if not found (log it — could mean drift, e.g. order was deleted).
2. Call the **existing** `sale-order-state-machine.executeTransition` with the
   target status — do **not** hand-roll a status field write. This is the
   whole point of routing through the state machine: it re-runs the correct
   local side effects (stock item Reserved→Sold on DELIVERED, GL postings,
   workflow audit log) so rutba.pk's own invariants (stock quantity cache,
   accounting) stay correct, exactly as if a rutba.pk staff user had made the
   change themselves.
3. Guard against illegal/out-of-order transitions the normal way the state
   machine already does (reject a transition that isn't valid from the order's
   current status; return a clear error, don't throw an unhandled exception —
   the LAN-side job's try/catch will log it to `marketplace-sync-log` per
   order and move on, it must not abort the whole batch).
4. Idempotent: if the requested status equals the current status, no-op
   success (200), don't error and don't re-run side effects.

### 1.5 Schema changes

- `pos-strapi/src/api/marketplace-account/content-types/marketplace-account/schema.json`
  — add `last_status_synced_at` (datetime), matching the existing
  `last_orders_synced_at` / `last_inventory_synced_at` fields.
- `pos-strapi/src/api/sale-order/content-types/sale-order/schema.json` — add
  `marketplace_status_synced_value` (string, nullable) to track what was last
  successfully pushed, so the job can skip no-ops without re-deriving it from
  `marketplace-sync-log`.
- `pos-strapi/src/api/marketplace-sync-log/content-types/marketplace-sync-log/schema.json`
  — add `'status'` to the `kind` enum (alongside existing `orders` |
  `inventory` | `catalog`).
- **Both instances need this schema present and must restart** (same gotcha
  as the original P1 rollout — schema/enum changes, not just code).

### 1.6 Testing

Follow the existing test shape exactly:

- `rutba-marketplace/lib/engine.js`'s new function → add cases to
  `rutba-marketplace/test/unit.js` (dependency-free, mocked `fetch`) —
  no-op skip when status unchanged, successful push advances watermark, a
  failed push doesn't advance the watermark and logs `detail`.
- Receiving endpoint → add cases to
  `pos-strapi/tests/marketplace-catalog-ingest.test.js` (or a sibling file if
  that one is catalog-specific enough to warrant a separate
  `marketplace-status-sync.test.js`) — valid transition succeeds and runs
  state-machine side effects, illegal transition rejected, unknown
  `external_order_id` 404s, idempotent re-push of the same status no-ops.

---

## 2. Order conversation sync (`order-message`, bidirectional)

### 2.1 Scope note — read before building

"Conversations" here means **`api::order-message`** — the customer/rider/staff
chat thread attached to an order (`getMessages`/`sendMessage` in
`sale-order.js` ~lines 1301-1331, `sender_type` enum `rider|customer|staff`).
It does **not** mean the generic internal `work-item-comment` /
`work-item-watch` / `work-item-activity` collaboration layer (used for
manufacturing jobs, internal audit trails, etc.) — that layer has no
cross-instance use case today (staff work directly on the LAN instance where
those work items live) and is **explicitly out of scope** for this spec. Don't
build sync for it unless separately asked; adding origin-tracking fields to it
speculatively is exactly the kind of premature abstraction this repo's
conventions warn against.

### 2.2 Why this one is harder than status push-back

Status push-back is one-directional and has an existing identity anchor
(`external_order_id`). Conversation sync is **bidirectional** (a customer
messages from rutba.pk, staff reply from LAN, either side can originate a
message) and `order-message` has **zero** existing cross-instance concept — no
origin field, no external-id, nothing. This spec has to design that from
scratch; treat §2.3 as the concrete proposal, not a discovered fact.

### 2.3 Schema changes

`pos-strapi/src/api/order-message/content-types/order-message/schema.json` —
add, mirroring the `sale-order.channel` / `external_order_id` pattern already
proven in this codebase:

- `sync_origin` (enumeration: `local` | `rutba`, default `local`) — which
  instance this message was **authored** on.
- `external_id` (string, nullable) — the **peer instance's** `documentId` for
  this same message, once synced. Used for dedup on both sides (a message
  pulled in from the peer gets its `external_id` set to the origin's
  `documentId`; the origin's own copy has `external_id = null` since it has no
  peer-side id to reference, only its own `documentId` which the peer stores
  as *its* `external_id`).

### 2.4 Sync direction and job shape

Two watermark-polled push jobs, one per direction, both living in
`rutba-marketplace/lib/engine.js` next to `syncOrderStatusForAccount`:

**LAN → rutba.pk** (`syncOrderMessagesUpForAccount`):
1. Query local `order-message` rows where `sync_origin = 'local'` (i.e.
   authored on LAN, by staff) AND the parent order's `channel = 'rutba'` AND
   `created_at > account.last_messages_pushed_at`.
2. For each, resolve the parent order's `external_order_id` (rutba.pk-side
   documentId — same field status push-back uses).
3. `adapter.pushOrderMessage(account, { external_order_id, message body,
   sender_type, created_at, local_message_id })` →
   `POST {base_url}/sale-orders/integration/messages` on rutba.pk.
4. Receiving endpoint (rutba.pk, same file as §1.4's new route) creates a
   local `order-message` on the matching order with `sync_origin = 'rutba'`
   (from rutba.pk's perspective, this message **originated on the peer** —
   naming is peer-relative, keep it consistent, see the naming note below)
   and `external_id = local_message_id`. Dedup: skip if an `order-message`
   with that `external_id` already exists on this order (idempotent retry).

**rutba.pk → LAN** (`syncOrderMessagesDownForAccount`):
1. Symmetric: `adapter.fetchOrderMessages(account, since)` →
   `GET {base_url}/sale-orders/integration/messages?since=...` on rutba.pk —
   returns messages where `sync_origin = 'local'` (authored by the customer,
   ON rutba.pk) created since the watermark.
2. For each returned message, resolve the **local** (LAN-side) order via
   `channel='rutba' AND external_order_id = <the rutba.pk order's
   documentId>` (same lookup direction the existing order **pull** already
   does).
3. Create a local `order-message` with `sync_origin = 'rutba'` (again,
   peer-relative — this message originated on the peer, from the LAN
   instance's point of view) and `external_id` = the rutba.pk message's
   `documentId`. Dedup on `external_id` same as above.

> **Naming clarity for whoever builds this:** `sync_origin` is
> **peer-relative, not absolute**. `'local'` always means "authored on the
> instance whose database this row lives in"; `'rutba'` always means
> "authored on the peer instance". This mirrors how `sale-order.channel`
> already works (`'rutba'` on the LAN side means "this order came from the
> rutba.pk peer") — don't invent a global/absolute naming scheme, follow the
> existing local convention.

Both jobs run on the same worker cron cadence as status push-back (suggested
`*/5 * * * *` — conversations are the most latency-sensitive of all the sync
flows; a customer waiting on a reply notices a 15-minute lag much more than a
stale catalog). Both write `marketplace-sync-log` rows (`kind: 'messages'`,
new enum value).

### 2.5 New adapter methods

`rutba-marketplace/lib/providers/rutba.js`:
- `pushOrderMessage(account, payload)` → `POST /sale-orders/integration/messages`
- `fetchOrderMessages(account, since)` → `GET /sale-orders/integration/messages?since=`

### 2.6 New endpoints (both instances need both — this flow is symmetric)

`pos-strapi/src/api/sale-order/controllers/sale-order.js` +
`routes/01-custom-sale-order.js`, same `isServiceToken` gate as everything
else under `/integration/*`:
- `POST /sale-orders/integration/messages` — receive a pushed message (§2.4
  step 4 / down-sync step 3).
- `GET /sale-orders/integration/messages?since=<iso8601>` — return
  locally-authored (`sync_origin = 'local'`) messages created after `since`,
  for the peer to pull (§2.4 down-sync step 1).

Since both instances run the identical `pos-strapi` codebase, **both routes
exist on both instances automatically** once this ships — no per-instance
branching needed, only the two engine jobs (running on the LAN-side
`rutba-marketplace` worker, since that's where the marketplace-account +
worker process live) decide which direction to call.

### 2.7 Loop prevention

A message pulled in from the peer has `sync_origin` set to the peer's name —
step 1 of each job's query explicitly filters `sync_origin = 'local'` (i.e.
"authored here, not synced in from elsewhere"), so a message synced in on one
pass can never be picked up and pushed back out on the next pass. This is the
same shape as `sale-order.channel` already preventing web-order re-ingestion
loops — don't deviate from it.

### 2.8 Testing

- `rutba-marketplace/test/unit.js` — both directions: push picks up only
  `sync_origin='local'` messages since the watermark, dedup on retry (a
  message with an `external_id` that already exists locally is skipped, not
  duplicated), watermark only advances past successfully-synced messages.
- `pos-strapi/tests/` (new or existing file) — receiving endpoint creates the
  message with the correct peer-relative `sync_origin`, rejects a
  message for an unknown `external_order_id`, `GET .../messages?since=` only
  returns `sync_origin='local'` rows and respects the `since` filter.

---

## 3. Rollout checklist (for whoever implements this)

1. Schema changes (§1.5, §2.3) on **both** instances' codebases — same
   codebase, same commit, no fork.
2. **Restart both instances** after deploy (enum + new-field schema changes —
   same requirement as the original P1 marketplace rollout).
3. Bump `rutba-marketplace/lib/providers/rutba.js` `capabilities.fulfillment`
   to `true` once §1 is live.
4. New cron jobs need the `rutba-marketplace` **worker** process restarted to
   pick up the new schedule entries (`worker.js`) — same "dead-worker check"
   caveat as existing jobs (§4 of the marketplace doc): a stale
   `last_status_synced_at` / `last_messages_pushed_at` means check the worker
   before assuming the feature is broken.
5. Smoke-test against the **live** LAN↔rutba.pk pairing before calling it
   done — the marketplace doc's own §7 gotchas list flags "media-by-reference
   rendering" as "not yet verified on live instances" even after P1 shipped;
   don't repeat that gap here. Specifically verify: a real status transition
   on a real synced order actually updates the customer-visible status on
   rutba.pk's storefront, and a real customer message on rutba.pk actually
   reaches a LAN staff user's order-management view.

## 4. Out of scope (explicitly, to prevent scope creep)

- Internal `work-item-comment`/`work-item-watch`/`work-item-activity` sync
  (see §2.1).
- Real-time/webhook delivery for either flow — this spec is watermark-polled
  cron, matching the rest of the marketplace feature. If 5-10 minute latency
  turns out to be unacceptable in practice, that's a separate follow-up
  (e.g. a lightweight webhook fired from `executeTransition` and the
  `order-message` controller, in addition to the cron safety net — don't
  build it preemptively).
- Full bidirectional status sync (rutba.pk-initiated status changes beyond
  the existing cancel-only inbound check, §1.1) — flagged as a known gap, not
  blocking.
- Delisting/reconciliation, payment gateway work, or anything else already
  tracked in `docs/features/rutba-instance-marketplace.md` §8 Roadmap or
  `docs/todo/order-lifecycle-plan.md` — this doc is scoped to exactly the two
  features in its title.
