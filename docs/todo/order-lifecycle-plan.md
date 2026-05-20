# Order lifecycle — complete plan

> **Status (May 2026):** Drafted after the storefront launch + COD payment
> collection landed. Phases A-G below are forward work; the "already wired"
> recap reflects what shipped in the cart / checkout / order-management /
> stock-item-attach work this cycle. Sister docs:
> [rutba-web-launch-backlog.md](./rutba-web-launch-backlog.md),
> [contact-entity-unification.md](./contact-entity-unification.md).

## TL;DR

The current order lifecycle covers happy-path COD with internal-rider
delivery and storefront WhatsApp confirmation. It does **not** yet have:

- Payment-gateway abstraction beyond a Stripe stub.
- Packer assignment / multi-parcel / packing slip docs.
- A clean delivery-provider strategy interface (TCS, Leopards, PostEx,
  DHL/FedEx/Aramex etc. would each be bespoke today).
- SMS comms (Pakistan-essential; email-only today).
- Auto-restock on CANCELLED or auto-mark-Sold on DELIVERED — the
  stock-item state machine on the order side is still manual.
- Refund flow (entity, gateway-driven workflow).
- Returns (the whole RMA surface — entity, customer UI, staff inspection,
  reverse logistics, restock decision).
- Audit log, exception queues, carrier reconciliation, idempotency.

This doc is the staged plan for adding all of the above.

## Already wired (recap)

- **State machine** (`pos-strapi/src/api/sale-order/services/sale-order-state-machine.js`):
  PENDING_PAYMENT → PAYMENT_CONFIRMED → PREPARING → AWAITING_PICKUP →
  OUT_FOR_DELIVERY → DELIVERED, with CANCELLED + FAILED_DELIVERY +
  REFUND_INITIATED → REFUNDED side paths.
- **COD payment collection** — `payment_method`, `paid_amount`,
  `payment_collected_by_rider`, `payment_collected_at`,
  `payment_verification_status` (`unverified` | `verified` | `disputed`),
  `payment_verified_at`, `payment_verified_by`. See
  [project_cod_payment_collection_model memory](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/project_cod_payment_collection_model.md).
  Order-management has the Payment card + verify endpoints; rider/accounts
  UIs are still queued (now Phase A.5 / A.6 below).
- **Stock-item attach per line** — order-product-item has a `stock_item`
  relation, controller endpoint `attachStockItem` transitions the chosen
  unit InStock → Reserved, lifecycle hooks recompute product.stock_quantity
  per the [stock model invariant](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/project_stock_model_invariant.md).
  Order-management detail page has a per-line picker UI.
- **Delivery-method** has `service_provider` enum-like field
  (`own_rider`, `easypost`, `manual_contact`) and a `delivery-zone`
  relation. Rider assignment + state machine work.
- **Notifications** are template-driven via `api::notification-template`,
  dispatch via `notification-service.js` on every state transition. Email
  channel wired (SMTP env still tenant-side); SMS channel stubbed in
  schema but not implemented.
- **Tracking** — public secret-keyed endpoint at
  `/orders/tracking/:documentId?secret=…`. Returns JSON; no UI yet.

## Industry patterns — context

| System | Lifecycle | Worth borrowing |
| --- | --- | --- |
| **Shopify** | Order has many *fulfillments* (one per shipment / tracking#). Refunds are separate child entities. | One order → N parcels, each with own state machine. Refunds aren't just an order status flip. |
| **WooCommerce** | pending → processing → completed; refunds as child orders. | Customer-readable status names. |
| **ERPNext / Odoo** | Sales Order → Delivery Note → Sales Invoice → Payment Entry as separate documents. | Decouples physical movement from financial state. Partial-ship + partial-pay is naturally modeled. |
| **Magento / BigCommerce** | RMA entity separate from Order. | Returns deserve their own state machine. |

### Pakistan-specific patterns

1. **COD ~70-80% of orders** — first-class workflow, not afterthought.
   Already done. ✓
2. **WhatsApp** as primary customer channel. ✓
3. **SMS essential** — email open rates low; SMS approaches 95%.
4. **Address confirmation call** before dispatch — saves ~30-40% on failed
   COD trips. Single biggest economics win available right now.
5. **Courier ecosystem**: TCS, Leopards, M&P, Pakistan Post, BlueEx,
   **PostEx** (purpose-built for ecom COD), Trax. ₨ 200-350 per delivery
   typically; settle weekly/fortnightly; reconciliation is a major
   accounts task.
6. **High return rate** (sizing, expectations, COD-refusal-at-door =
   de-facto return). Reverse logistics is mandatory.
7. **Payment rails (post-2023)**: Raast (SBP instant rail, free + instant),
   JazzCash + Easypaisa wallets, NayaPay, SadaPay. Cards via 2C2P, Foree,
   Safepay, AlfaPayment (local PSPs handling 3DS for local cards).

## Cross-cutting design rules

Apply these to every phase below:

1. **Generic-vs-tenant cut** — the ERP repo ships strategy *interfaces* +
   neutral providers (manual, stripe, easypost). Tenant-specific
   providers (TCS, JazzCash, etc.) ship in a tenant overlay with their
   API keys in tenant config — never in the generic seed. Per
   [project_erp_generic_vs_rutba_pk_implementation memory](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/project_erp_generic_vs_rutba_pk_implementation.md).
2. **Migrations, not seed JSON**, for any default data introduced. Per
   [project_data_seeding_strategy_migrations_not_seed_json memory](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/project_data_seeding_strategy_migrations_not_seed_json.md).
3. **Money in integer paisa** — never decimal. `amount_paisa: bigint`.
4. **`auth: false` routes manually parse JWT** when they want optional
   auth (customer-initiated cancel, customer-initiated return). Per
   [feedback_strapi_auth_false_means_no_user memory](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/feedback_strapi_auth_false_means_no_user.md).
5. **Descriptors start with a whitelisted verb prefix** (`list`, `find`,
   `recompute`, `sync`, etc.) or the api-pro seeder silently skips them
   and every request 403s. Per
   [feedback_api_pro_descriptor_verb_whitelist memory](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/feedback_api_pro_descriptor_verb_whitelist.md).
   New verbs proposed: `initiateRefund`, `createShipment`, `cancelShipment`,
   `inspectReturn`, `recordPickup`. Verify each against the whitelist
   before adding.
6. **`owners` plural manyToMany** for any new entity with ownership
   semantics (refund, return-request). Per
   [feedback_ownership_owners_convention memory](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/feedback_ownership_owners_convention.md).
7. **Idempotency keys on every mutation endpoint reachable by a webhook**
   (carrier status webhooks retry; payment gateway webhooks retry). See
   Phase G.5.
8. **Variant price fallback** — positive-or-parent + Number coercion.
   Applies anywhere variant pricing flows (refund credit values, return
   restock prices). Per
   [feedback_variant_price_fallback_pattern memory](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/feedback_variant_price_fallback_pattern.md).

## Prerequisites (tenant ops)

Not engineering tasks but blockers for end-to-end validation of the phases
that follow:

| Item | Where | Owner |
| --- | --- | --- |
| `POS_STRAPI__EMAIL_HOST/PORT/USER/PASS/FROM` in tenant env | host env vars | Ops |
| Strapi admin → Email Templates → "Reset password" → set URL to `${WEB_URL}/reset-password?code={CODE}` | Strapi admin UI | Ops |
| SMS provider account + API keys (for D.1) | tenant env | Ops |
| Courier merchant accounts (TCS / Leopards / PostEx) + API credentials (for C.2b) | tenant env | Ops + Business |
| Payment gateway merchant accounts (Stripe / Safepay / JazzCash) (for A.2) | tenant env | Ops + Business |

Track in the ops runbook, not in engineering tasks.

---

# Phase A — Payment clearance

**What's missing**: real gateway integration; today only COD has a
verification path. Stripe controller is a stub; other rails (JazzCash,
Easypaisa, Raast, Safepay) aren't there at all.

### A.0 — Tighten verifyPayment to accountant role only (generic)

Today `verifyPayment` is gated by `requireStaffUser` which accepts any
`rutba_app_user`. Verification belongs to accounts, not packers or
order-management staff. Add a `requireAccountantUser` helper (or a
generic role-set check) and apply to `verifyPayment`. Tiny scope; ship
**first** in Phase A so A.6 lands on a safe gate.

### A.1 — Payment-method abstraction (generic)

Today `payment_status` is free-form, `payment_method` is enum. Both too
loose. Introduce:

```
content-type: payment-method
  key                 string unique  (cod, jazzcash, easypaisa, raast, stripe, paypal, bank_transfer, …)
  display_name        string
  provider_key        string         (generic strategy key mapped at runtime to integration class)
  is_active           boolean
  capability_cod      boolean        (supports deferred / cash-on-delivery semantics?)
  capability_refund   boolean        (can it auto-refund?)
  config              json           (tenant: API keys, sandbox flag, merchant ID — encrypted at rest)
  display_order       integer
  countries           json           (which delivery_zones this method is offered for)
```

Same shape as `delivery-method.service_provider` — generic primitive,
tenant fills with concrete providers.

### A.2 — Gateway provider strategy interface (generic)

Mirror the delivery provider abstraction (Phase C). One module per
gateway under `pos-strapi/src/api/payment/providers/`:

```js
{
  createIntent({ order, amountPaisa, returnUrl }) → { redirectUrl, providerRef }
  verifyWebhook({ headers, rawBody })            → { providerRef, status, amount }
  refund({ providerRef, amountPaisa, reason })   → { refundRef, status }
  getStatus({ providerRef })                     → { status }
  supports: { cod: false, refund: true, partial_refund: true, recurring: false }
}
```

Generic providers shipped in A.2: **manual** (admin marks paid), **cod**
(existing), **stripe** (skeleton already there).

Tenant providers (separate work, not generic): **jazzcash**, **easypaisa**,
**safepay** (cards), **raast** (bank), **bank_transfer** (manual). Each
adds a single module; no schema changes.

### A.3 — Payment intent + receipt entities (generic)

Today `sale-order.paid_amount` + `payment_status` are flat. Breaks the
moment a customer pays partial / splits methods / gets a partial refund /
retries a failed payment.

```
content-type: payment-intent
  order          relation manyToOne ← sale-order
  payment_method relation oneToOne
  amount_paisa   bigint             (always integer paisa — no decimal arithmetic on money)
  currency       string default PKR
  status         enum               (initiated, pending, succeeded, failed, refunded, partially_refunded)
  provider_ref   string             (gateway txn id)
  initiated_at   datetime
  succeeded_at   datetime
  failed_reason  string
  raw_response   json               (audit; encrypted)
```

`sale-order.paid_amount` becomes a computed cache:
`sum(payment_intents.amount where status=succeeded) - sum(refunds.amount)`.
Same shape as the existing `product.stock_quantity` cache invariant.

### A.4 — Pre-dispatch confirmation queue (generic primitive)

Pakistan operations call the customer to confirm before dispatching COD
orders. Saves ~30-40% on failed-trip courier fees. Add:

```
sale-order:
  confirmation_status     enum (not_required, pending_call, called_voicemail, confirmed, declined)
  confirmation_called_at  datetime
  confirmation_called_by  relation → user
  confirmation_notes      text
```

New tab in CRM lists `confirmation_status = pending_call`. One-click
**Confirmed** (advances order to PREPARING) / **Declined → Cancel order**.

### A.5 — Rider app: cash-collect modal on delivery completion

When the rider marks an order DELIVERED in `rutba-rider`, prompt for
actual amount collected (default `order.total`) + courier ref / note,
then POST `/sale-orders/:id/record-payment` via the existing descriptor.
Payment lands as `unverified`, feeds the accounts inbox (A.6).
Mobile-first UI — one-thumb usable at the door.

### A.6 — Accounts cash-drops verification inbox

Page in `rutba-accounts` listing orders with
`payment_verification_status = unverified` AND `payment_method = cod`
AND `paid_amount > 0`. Columns: order ref, rider name, amount,
collected_at, courier ref / note. **Bulk-select + bulk-verify** for daily
or weekly courier-statement reconciliation. Single-row **Dispute** path
for shortfalls. Depends on A.0 being shipped first.

---

# Phase B — Packaging

**What's missing**: no concept of "this order has been physically packed";
no auditable trail of who packed it / how heavy or large.

### B.0 — Stock-item state-machine on order DELIVERED / FAILED_DELIVERY

Symmetric with Phase E.1 (auto-restock on CANCELLED). On state transition
to DELIVERED, walk `order.products.items` and transition each attached
`stock_item` from Reserved → **Sold**. On FAILED_DELIVERY, keep Reserved
until staff decides (retry or cancel-then-restock).

Single helper `transitionAttachedStockItems(orderDocId, fromStatus, toStatus)`
shared with E.1. Bundle the two changes.

### B.1 — Packer assignment + packed timestamp (generic)

```
sale-order:
  packed_by         relation → user (manyToOne, like assigned_rider)
  packed_at         datetime
  package_count     integer default 1
  total_weight_kg   decimal
  packing_notes     text
```

State machine refinement:

```
PAYMENT_CONFIRMED → PREPARING (auto on attach-first-stock-item)
                  ↳ PACKED      (new — manual; requires packed_by set)
                  ↳ AWAITING_PICKUP (only after PACKED)
```

### B.2 — Package (parcel) sub-entity (generic, deferred)

Ships only when split shipments or multi-unit lines (qty > 1) become a
real need. Both share the same fix.

```
content-type: order-parcel
  sale_order        relation manyToOne
  parcel_number     integer        (1 of N)
  weight_kg         decimal
  length_cm         decimal
  width_cm          decimal
  height_cm         decimal
  tracking_code     string
  tracking_url      string
  carrier_label_url string
  status            enum (packed, picked_up, in_transit, delivered, lost)
  stock_items       relation manyToMany → stock-item
```

Today's one-stock-item-per-line model becomes one-stock-item-per-parcel —
much more flexible. Multi-unit serialised products (qty = 3) can spread
units across two or three parcels naturally.

### B.3 — Pick list + packing slip docs (generic)

PDF generation at
`/sale-orders/:documentId/pick-list.pdf` and `/packing-slip.pdf`. Pure
data binding into a template — no business logic. Lives in
`rutba-order-management`.

---

# Phase C — Delivery provider abstraction

**What's missing**: clean strategy interface so adding TCS, Leopards,
PostEx, DHL etc. is a 200-line per-provider module, not a re-architecture.

### C.1 — Provider strategy interface (generic) — matches A.2

```js
// pos-strapi/src/api/delivery-method/providers/<key>/index.js
module.exports = {
  key: 'tcs',
  capabilities: {
    cod: true,
    domestic: true,
    international: false,
    pickup_from_merchant: true,
    return_pickup: true,
    real_time_rates: true,
    real_time_tracking: true,
  },

  async getRates({ origin, destination, parcels, codAmountPaisa })       { /* … */ },
  async createShipment({ order, parcel, codAmountPaisa, returnAddress }) { /* … returns { trackingCode, labelUrl, carrierBookingRef } */ },
  async cancelShipment({ carrierBookingRef })                            { /* … */ },
  async getStatus({ trackingCode })                                      { /* … */ },
  async parseWebhook({ headers, rawBody })                               { /* … returns { trackingCode, status, eventAt } */ },
};
```

Existing `easypost-service.js` is the starting template — refactor into
this shape as the worked example, then add siblings.

### C.2 — Providers to ship

| Provider | Phase | Country | Notes |
| --- | --- | --- | --- |
| `own_rider` | done | Any | Internal fleet |
| `manual_contact` | done | Any | "We'll WhatsApp you" |
| `pickup` | C.2a (generic) | Any | Customer collects from store |
| `easypost` | C.2a (refactor, generic) | International aggregator | Stub already exists |
| `shippo` | C.2a (generic) | International aggregator alt | Cheaper for some lanes |
| `tcs` | C.2b (tenant) | PK | TCS COD API |
| `leopards` | C.2b (tenant) | PK | Cheaper than TCS in many zones |
| `postex` | C.2b (tenant) | PK | Purpose-built for ecom COD; 24h settlement |
| `mp` | C.2c (tenant) | PK | M&P |
| `blueex` | C.2c (tenant) | PK | Older but reliable |
| `pakistan_post` | C.2c (tenant) | PK | Cheapest, slowest |
| `dhl` | C.2d (generic, international) | INT | Express |
| `fedex` | C.2d (generic, international) | INT | Express |
| `aramex` | C.2d (generic, international) | INT | Middle East strength |
| `ups` | C.2d (generic, international) | INT | |

ERP repo ships C.2a + C.2d. Tenant overlay (separate repo / submodule)
ships C.2b + C.2c with the actual API keys.

### C.3 — Webhook router (generic)

`POST /delivery/webhook/:providerKey` — dispatches to the provider's
`parseWebhook` and updates the order based on the parsed event. Pattern
identical to the existing Stripe webhook.

### C.4 — Rate-shop at checkout (generic, tenant data)

Existing `/orders/calculate-delivery` already returns options. Phase C
makes it call each enabled provider's `getRates` in parallel and merges
results into a single chooser shown at checkout. Customer picks; their
pick determines which provider's `createShipment` runs at
PACKED → AWAITING_PICKUP.

### C.5 — Label printing (generic)

Each provider returns a PDF/PNG URL. Order-management page shows a
**Print label** button per parcel that opens the carrier-generated label
in a new tab.

---

# Phase D — Customer communications

**What's missing**: SMS, richer tracking page, app push (future).

### D.1 — SMS channel (generic primitive, tenant providers)

Today `notification-template.channel` has `email | sms | both` but the SMS
branch is unimplemented.

```
content-type: sms-provider
  key       string unique  (twilio, infobip, jazz_corporate, telenor_corporate, vrg, …)
  is_active boolean
  config    json
```

Strategy interface (same shape as A.2, C.1):

```js
{ async send({ to, message, from }) → { providerRef, status }, parseWebhook(…) }
```

Generic providers: **twilio** + **infobip** (international) + **dummy**
(logs to console for dev). Tenant: **jazz_corporate** + **telenor_corporate**
+ **vrg** (Pakistan SMS aggregators).

Touchpoints to add SMS to existing notification templates:

- Order placed (with ref + total)
- Payment confirmed
- Out for delivery (with rider name + phone, or tracking URL)
- Delivered
- Cancelled / refunded

### D.2 — Richer tracking page (generic)

Today's `/order-tracking/:documentId?secret=…` returns a JSON blob.
Build a real page on `rutba-web`:

- Visual timeline (received → packed → out for delivery → delivered)
- Estimated delivery window
- Rider/carrier name + tracking number with deep link to carrier site
- "Need help?" → WhatsApp deep link with order ref pre-filled
- For COD: payment amount due on delivery, clearly stated

### D.3 — App push (deferred)

Same template engine, add `channel: push` + a Firebase/APNs provider
strategy. Out of current scope until the mobile app exists.

---

# Phase E — Cancellation hardening

**What's missing**: cancel works but leaves stock allocated and doesn't
refund.

### E.1 — Auto-restock on CANCELLED (generic)

State-machine transition `* → CANCELLED` should iterate
`order.products.items` and:

- For each `stock_item` attached: transition Reserved → InStock.
- For each `order-parcel` already created: cancel via the provider's
  `cancelShipment`.
- Push CANCELLED notification to customer.

Single helper `restoreStockForOrder(orderDocId)` called from the existing
cancel transition. Shares the per-line walker with B.0.

### E.2 — Refund flow (generic)

New entity (mirrors Shopify):

```
content-type: refund
  sale_order      relation manyToOne
  amount_paisa    bigint
  reason          enum (customer_cancel, defective, wrong_item, fraud, goodwill, returned)
  status          enum (initiated, processing, succeeded, failed)
  refund_method   enum (original_method, store_credit, manual_cash, bank_transfer)
  payment_intent  relation oneToOne (which payment to reverse)
  initiated_by    relation → user
  initiated_at    datetime
  succeeded_at    datetime
  provider_ref    string
  raw_response    json
  notes           text
```

Endpoints:

- `POST /sale-orders/:doc/initiate-refund` → creates refund, calls
  provider's `refund({ providerRef, amountPaisa, reason })`.
- Provider returns success → `refund.status = succeeded` → order →
  REFUNDED.
- Webhook for async refunds (Stripe sometimes takes days).

For COD orders: `refund_method` defaults to `bank_transfer` or
`manual_cash` — accounts team marks complete by hand.

### E.3 — Customer-initiated cancellation rules (generic)

Today any auth'd staff can cancel anything. Storefront customers should
be able to self-cancel in a narrow window:

- Allow self-cancel when `order_status ∈ {PENDING_PAYMENT, PAYMENT_CONFIRMED}`
  AND `createdAt > now - 30min`.
- After OUT_FOR_DELIVERY, customer must contact staff (WhatsApp).
- After DELIVERED, customer initiates a **return**, not a cancel.

---

# Phase F — Returns (Reverse logistics)

**What's missing**: the entire return surface.

### F.1 — Return-request entity (generic)

Needs its own resource — Shopify, BigCommerce, Magento all model it
separately and they're right to.

```
content-type: return-request
  sale_order         relation manyToOne
  return_ref         string unique         (RET-<timestamp>)
  reason             enum                  (defective, damaged_in_transit, wrong_item, wrong_size, changed_mind, late_delivery, other)
  reason_notes       text
  resolution         enum                  (refund, exchange, store_credit, repair)
  status             enum                  (requested, approved, rejected, awaiting_pickup, in_transit, received, inspected, completed, cancelled)
  customer_evidence  media multiple        (photos of damage / wrong item)
  inspection_notes   text
  inspected_by       relation → user
  inspected_at       datetime
  refund             relation oneToOne     (created when resolution = refund and status = completed)
  return_parcel      relation oneToOne     (reverse-logistics parcel)
  requested_by       relation → user       (customer)
  approved_by        relation → user       (staff)
  return_items       component repeatable  (which order lines + qty + per-line reason + restock decision)
```

`return-items` component points at the original order line (by index or
copy) and adds:

```
  restock_decision  enum (back_to_inventory, damaged_writeoff, returned_to_supplier)
```

Drives whether the returned stock-item goes back to `InStock` or
`ReturnedDamaged` — both enum values already exist on stock-item.

### F.2 — Customer return UI on storefront (generic)

On `/profile/orders/:id` add a **Request return** button (visible only
when `order.order_status = DELIVERED` AND `now < order.actual_delivery_time + 7 days`).
Form: pick line items + qty, pick reason per line, upload photos. Submit
→ creates return-request in `requested` state, notifies staff.

### F.3 — Staff return-management page (generic)

New page in `rutba-order-management` at `/returns`:

- Inbox view of `status = requested`.
- Approve / reject (with reason).
- On approve: trigger reverse logistics (call provider's
  `createReturnShipment` if supported, else mark `awaiting_pickup`
  manual).
- Inspection view when `status = received`: photo grid + per-item
  restock decision + condition notes.
- On `completed`: auto-create refund entity if resolution = refund.

### F.4 — Reverse logistics on delivery providers (generic interface)

Extend the C.1 provider strategy with:

```js
async createReturnShipment({ from, to, parcel }) → { trackingCode, labelUrl }
```

PostEx, TCS, DHL, FedEx all support reverse pickup. Providers that don't
(manual_contact) get a stub that throws, and the UI shows a
"Manual return — share label by WhatsApp" fallback.

### F.5 — Return window enforcement (generic primitive, tenant config)

```
content-type: return-policy
  scope         enum (global, category, brand, product)
  scope_id      string
  window_days   integer
  applies_to    enum (all, defective_only, non_defective_only)
  exchange_only boolean
```

Migration ships a single `(global, 7 days, all)` row as default. Tenants
layer category/brand/product overrides.

---

# Phase G — Cross-cutting

### G.1 — Order audit log (generic)

```
content-type: order-event
  sale_order   relation manyToOne
  event_type   string         (status_changed, payment_recorded, stock_attached, parcel_created, refund_issued, return_received, …)
  actor_user   relation → user
  actor_role   string         (customer, staff, system, webhook:tcs, …)
  before       json
  after        json
  occurred_at  datetime
```

Every controller writes to this on state mutation. Powers the timeline
on customer tracking page AND the staff order detail page. Also feeds
compliance / dispute resolution.

### G.2 — Analytics primitives (generic)

- `time_to_pack` = `packed_at - createdAt`
- `time_to_ship` = `picked_up_at - packed_at`
- `time_to_deliver` = `actual_delivery_time - picked_up_at`
- `cod_refusal_rate` per delivery zone per courier
- `return_rate` per product / per category

SQL views; no new entities. Surface on a dashboard page in
`rutba-order-management`.

### G.3 — Exception queues (generic)

Three CRM inboxes:

- **Stuck orders**: `order_status` unchanged > X hours (X varies by state).
- **Failed deliveries**: `FAILED_DELIVERY` awaiting retry / return decision.
- **Disputed payments**: `payment_verification_status = disputed`.

### G.4 — Carrier reconciliation (generic primitive, tenant data)

Couriers settle weekly with CSV statements of COD collections. Build a
CSV import endpoint that matches statements to orders by tracking code,
flags mismatches, updates `payment_verification_status`. Critical for
accounts.

### G.5 — Idempotency on mutation endpoints (generic, cross-cutting)

Carrier webhooks retry. The same event must not double-update an order.
Add `idempotency_key` to every mutation endpoint + a small table that
records `(key, response)` and replays the same response on duplicate.

### G.6 — Notification template migration off seed JSON

Per the [data seeding directive](../../C:/Users/EjazArain/.claude/projects/D--Rutba-ERP/memory/project_data_seeding_strategy_migrations_not_seed_json.md),
retire `src/seed/data/notification-template.json` in favour of a Strapi
migration. New trigger events from Phases A-F (payment_partial_refunded,
packed, parcel_picked_up, return_requested, return_approved,
return_completed, …) added at the same time.

---

# Phased prioritisation

| # | Phase | Why now | Blocks |
| --- | --- | --- | --- |
| 1 | **E.1** Auto-restock on CANCELLED | Closes active stock-leak. 1-day fix. | Analytics |
| 2 | **B.0** Stock-item state-machine on DELIVERED | Symmetric with E.1; same helper. Ship together. | — |
| 3 | **A.0** Tighten verifyPayment to accountant | Tiny security fix; do before A.6. | A.6 |
| 4 | **A.4** Pre-dispatch confirmation queue | Biggest COD economics win. | — |
| 5 | **B.1** Packer assignment + PACKED state | Auditable trail before anything ships. | C |
| 6 | **A.5** Rider cash-collect modal | Mobile-friendly close of COD loop. | — |
| 7 | **A.6** Accounts cash-drops inbox | Counterpart to A.5; weekly settlement workload. | — |
| 8 | **C.1** Provider strategy interface | Unblocks C, F. | C.2*, F.4 |
| 9 | **D.1** SMS channel | Pakistan-essential customer-perception lift. | — |
| 10 | **A.1+A.3** Payment-method + intent entities | Unlocks non-COD payments cleanly. | A.2 |
| 11 | **A.2** Stripe + manual gateway providers | First non-COD path. | — |
| 12 | **C.2b** TCS / Leopards / PostEx (tenant) | Removes manual courier handoff. | — |
| 13 | **F** Returns workflow | Big surface; do once core is solid. | — |
| 14 | **B.2** Multi-parcel (incl. qty > 1 split) | Only when split shipments are actually needed. | — |
| 15 | **G** Cross-cutting (audit log, exceptions, reconciliation, idempotency) | Operational maturity. | — |

**Deferred**: B.3 (PDF docs), C.5 (label printing UI), D.3 (push), G.2
(analytics dashboards). Quality-of-life, not lifecycle-blocking.

# Recommended next change

**E.1 + B.0 together** — both walk `order.products.items` and transition
`stock_item.status`. Build one helper, call it from both transitions.
~1-2 hours of work. Closes the two open paths in the stock-item state
machine that were left as TODOs when `attachStockItem` shipped.
