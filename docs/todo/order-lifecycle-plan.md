# Order lifecycle — complete plan

> **Status (May 2026):** Drafted after the storefront launch + COD payment
> collection landed. Phases A-G below are forward work; the "already wired"
> recap reflects what shipped in the cart / checkout / order-management /
> stock-item-attach work this cycle.
>
> Updates 2026-05-21 (two PRs, same day):
> - Stock-item state-machine integration (E.1 + B.0) landed — see recap.
> - **Returns workflow (F.1, F.2, F.3, F.5) landed** with a new
>   `return-request` content type + its own state machine, customer
>   self-serve `/profile/orders/:id/request-return` page, staff
>   `/returns` console, `return-policy` window enforcement, and a
>   `return-method` registry. State-machine extended with the returnable
>   detour `DELIVERED → RETURN_REQUESTED → RETURN_IN_TRANSIT → RETURNED
>   → REFUND_INITIATED → REFUNDED`. See "Already wired" recap and
>   updates inline below in Phase F.
> - **Label-provider strategy interface landed** as a focused subset of
>   Phase C.1 — `sale-order/services/label-providers/{own_rider,custom,easypost}`
>   dispatching by `delivery_method.service_provider`. Phase C.5 (label
>   printing UI) shipped alongside it. The fuller C.1 (getRates,
>   createShipment, cancelShipment, parseWebhook) remains TODO.
>
> Sister docs: [rutba-web-launch-backlog.md](./rutba-web-launch-backlog.md),
> [contact-entity-unification.md](./contact-entity-unification.md).

## TL;DR

The current order lifecycle covers happy-path COD with internal-rider
delivery and storefront WhatsApp confirmation, with the stock-item state
machine closed on CANCELLED + DELIVERED + RETURNED transitions, the
returns workflow live end-to-end (customer self-serve → staff approve →
restock decision per line → manual refund), and address-label printing
dispatched via a provider registry. It does **not** yet have:

- Payment-gateway abstraction beyond a Stripe stub.
- Packer assignment / multi-parcel / packing slip docs.
- A clean *shipment* provider strategy interface — labels dispatch by
  provider today, but `getRates` / `createShipment` / `cancelShipment` /
  `parseWebhook` are still bespoke per carrier (TCS, Leopards, PostEx,
  DHL/FedEx/Aramex would each need their own integration).
- SMS comms (Pakistan-essential; email-only today).
- Gateway-driven refund flow (returns currently use a manual `refund_status`
  with `pending_manual | completed`; no provider refund call yet).
- Reverse-logistics carrier integration (F.4) — return labels dispatch
  via the label-provider registry but no live carrier pickup booking.
- Audit log, exception queues, carrier reconciliation, idempotency.

This doc is the staged plan for adding all of the above.

## Already wired (recap)

- **State machine** (`pos-strapi/src/api/sale-order/services/sale-order-state-machine.js`):
  PENDING_PAYMENT → PAYMENT_CONFIRMED → PREPARING → AWAITING_PICKUP →
  OUT_FOR_DELIVERY → DELIVERED, with CANCELLED + FAILED_DELIVERY +
  REFUND_INITIATED → REFUNDED side paths, plus the returns detour
  DELIVERED → RETURN_REQUESTED → RETURN_IN_TRANSIT → RETURNED →
  REFUND_INITIATED → REFUNDED (and rewind paths RETURN_REQUESTED/IN_TRANSIT
  → DELIVERED when staff reject/cancel mid-flight). The order's RETURNED
  transition is intentionally a metadata flip — the per-line stock walk
  lives on `return-state-machine.walkRestockDecisions` so the two state
  machines never race.
- **COD payment collection** — `payment_method`, `paid_amount`,
  `payment_collected_by_rider`, `payment_collected_at`,
  `payment_verification_status` (`unverified` | `verified` | `disputed`),
  `payment_verified_at`, `payment_verified_by`. See
  project_cod_payment_collection_model memory.
  Order-management has the Payment card + verify endpoints; rider/accounts
  UIs are still queued (now Phase A.5 / A.6 below).
- **Stock-item attach per line** — order-product-item has a `stock_item`
  relation, controller endpoint `attachStockItem` transitions the chosen
  unit InStock → Reserved, lifecycle hooks recompute product.stock_quantity
  per the stock model invariant.
  Order-management detail page has a per-line picker UI.
- **Stock-item state machine closed on the order side** (E.1 + B.0,
  2026-05-21) — `sale-order-state-machine.executeTransition` walks
  `order.products.items` and:
  - on CANCELLED: Reserved → InStock (restock)
  - on DELIVERED: Reserved → Sold (finalise)
  FAILED_DELIVERY leaves units Reserved until staff retries or cancels.
  Shared helper `transitionAttachedStockItems(orderDocumentId, from, to)`
  lives on the state-machine service; every caller of `executeTransition`
  picks up the side effect automatically. Best-effort: a stock-item
  failure logs a warning but doesn't unwind the order transition.
- **Returns workflow** (F.1 + F.2 + F.3 + F.5, 2026-05-21):
  - `api::return-request` content type with its own state machine
    (`return-state-machine.js`): REQUESTED → APPROVED → AWAITING_PICKUP
    → RECEIVED → COMPLETED, with REJECTED + CANCELLED side paths. Each
    transition mirrors onto the parent order via the order state machine.
  - `return-line` component carries the line-level `restock_decision`
    (`back_to_inventory` | `damaged_writeoff`). On `RECEIVED →
    COMPLETED` the return state machine walks restock decisions:
    Sold → InStock or Sold → ReturnedDamaged.
  - `api::return-policy` with a `(global, 7 days, all)` migration seed
    (`2026.05.21T00.00.00.return-policy-seed.js`); per-product opt-out
    via `product.non_returnable`.
  - `api::return-method` registry (`own_rider_pickup` | `courier_dropoff`
    | `walk_in`) keyed by `service_provider` to share the label registry.
  - Storefront: `/profile/orders/[id]/request-return` — customer picks
    lines + qty + per-line reason + photos.
  - Order management: `/returns` inbox + `/returns/[documentId]` detail
    page; `ReturnStage` panel on the sale-order shell drives approve /
    reject / print label / set-received; `SettledStage` exposes an
    inline "Request Return" card.
  - Refund recording is **manual** — `return_request.refund_status` is
    `pending_manual | completed`; gateway-driven refund (E.2) still TODO.
- **Label-provider strategy** (subset of C.1, plus C.5, 2026-05-21):
  - Registry under `sale-order/services/label-providers/` dispatches by
    `delivery_method.service_provider`:
    - `own_rider`, `custom` → return JSON descriptors that the client
      renders as React print pages (OwnRiderLabel | CustomPickSlip with
      qrcode.react QR + `@page 4x6` CSS, auto `window.print()`).
    - `easypost` → returns the cached carrier label URL.
  - Endpoints: `GET /sale-orders/:id/label`, `GET /sale-orders/:id/return-label`,
    `GET /return-requests/:id/label`. `?reprint=1` restamps the cache
    timestamp without re-issuing the provider call.
  - Sale-order schema gains `label_url`, `label_generated_at`,
    `return_label_url`, `return_label_generated_at`, plus the
    `return_method` relation.
  - `rutba-order-management` has a `/print/sale-order-label` page;
    `PrintAddressLabel` opens it in a new window.
- **Stage-based order-management refactor** (2026-05-21) — the
  monolithic `/[documentId]/sale-order.js` (1200 lines) broken into a
  thin shell + per-stage components under
  `rutba-order-management/components/sale-order/`:
  `DraftStage`, `PaymentStage`, `VerificationStage`, `PreparationStage`,
  `PickupStage`, `DeliveryStage`, `SettledStage`, `ReturnStage`,
  `CancelledStage`, `FailedStage`, plus `StageStepper`, `ItemsTable`,
  `CustomerCard`, `StockItemPicker`, `useSaleOrder`. Every stage button
  funnels through the same state-machine chokepoint.
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
   project_erp_generic_vs_rutba_pk_implementation memory.
2. **Migrations, not seed JSON**, for any default data introduced. Per
   project_data_seeding_strategy_migrations_not_seed_json memory.
3. **Money in integer paisa** — never decimal. `amount_paisa: bigint`.
4. **`auth: false` routes manually parse JWT** when they want optional
   auth (customer-initiated cancel, customer-initiated return). Per
   feedback_strapi_auth_false_means_no_user memory.
5. **Descriptors start with a whitelisted verb prefix** (`list`, `find`,
   `recompute`, `sync`, etc.) or the api-pro seeder silently skips them
   and every request 403s. Per
   feedback_api_pro_descriptor_verb_whitelist memory.
   New verbs proposed: `initiateRefund`, `createShipment`, `cancelShipment`,
   `inspectReturn`, `recordPickup`. Verify each against the whitelist
   before adding.
6. **`owners` plural manyToMany** for any new entity with ownership
   semantics (refund, return-request). Per
   feedback_ownership_owners_convention memory.
7. **Idempotency keys on every mutation endpoint reachable by a webhook**
   (carrier status webhooks retry; payment gateway webhooks retry). See
   Phase G.5.
8. **Variant price fallback** — positive-or-parent + Number coercion.
   Applies anywhere variant pricing flows (refund credit values, return
   restock prices). Per
   feedback_variant_price_fallback_pattern memory.

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

### B.0 — Stock-item state-machine on order DELIVERED / FAILED_DELIVERY  ✅ shipped 2026-05-21

Symmetric with Phase E.1. Landed together — see "Already wired" recap.
Implemented as `transitionAttachedStockItems` on the state-machine
service, driven by the `STOCK_TRANSITIONS_ON_ORDER_STATUS` map in
`executeTransition`. FAILED_DELIVERY intentionally not mapped — units
stay Reserved until staff retries or cancels.

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

**Partial progress (2026-05-21):** the *labels* slice of C.1 + the whole
of C.5 shipped. `sale-order/services/label-providers/{own_rider,custom,easypost}/index.js`
dispatch by `delivery_method.service_provider`. Use this as the worked
example when expanding to the full strategy interface below.

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

### C.5 — Label printing (generic)  ✅ shipped 2026-05-21

Label-provider registry under `sale-order/services/label-providers/` —
`own_rider` + `custom` return JSON descriptors that the client renders
as React print pages (OwnRiderLabel | CustomPickSlip with qrcode.react
QR + `@page 4x6` CSS, auto `window.print()`); `easypost` returns the
cached carrier URL. Endpoints `GET /sale-orders/:id/label`, `GET
/sale-orders/:id/return-label`, `GET /return-requests/:id/label` with
`?reprint=1` to restamp the cache. Order-management exposes `/print/sale-order-label`
and `PrintAddressLabel` opens it in a new window.

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

- Visual timeline driven by the **G.1 buyer-visible event feed** — each
  row renders as `{customer_message}` with `{customer_icon}` glyph and
  `{occurred_at}` timestamp. No hardcoded "received → packed → …"
  ladder — the timeline reflects what actually happened, including
  exceptions (FAILED_DELIVERY, CANCELLED, refund-in-progress).
- Estimated delivery window (from `delivery_method.estimated_days_*`).
- Rider/carrier name + tracking number with deep link to carrier site.
- "Need help?" → WhatsApp deep link with order ref pre-filled.
- For COD: payment amount due on delivery, clearly stated.

Same component renders on `/profile/orders/:id` for logged-in buyers
(reads from the authenticated `events` endpoint instead of the
secret-keyed public one). G.1 is therefore a hard prerequisite for the
timeline portion of this page — without it the storefront has no event
stream to render and the page falls back to the today's flat JSON.

### D.3 — App push (deferred)

Same template engine, add `channel: push` + a Firebase/APNs provider
strategy. Out of current scope until the mobile app exists.

---

# Phase E — Cancellation hardening

**What's missing**: cancel works but leaves stock allocated and doesn't
refund.

### E.1 — Auto-restock on CANCELLED (generic)  ✅ shipped 2026-05-21 (stock leg only)

Stock-item leg landed alongside B.0 — `transitionAttachedStockItems`
walks `order.products.items` and moves Reserved → InStock on the
CANCELLED transition. Customer notification already fires from
`cancelOrder` controller (`notificationService.send('cancelled', …)`).

**Still TODO** (deferred to their owning phases):
- Per-line `order-parcel.cancelShipment` call — depends on Phase C.1
  provider strategy and B.2 parcel sub-entity.
- Restock from FAILED_DELIVERY → CANCELLED path is already covered
  (FAILED_DELIVERY leaves units Reserved; subsequent CANCELLED triggers
  the same walker).

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

**Status (2026-05-21):** F.1, F.2, F.3, F.5 ✅ shipped. F.4 (reverse
logistics on delivery providers) is the only remaining piece — return
labels render today via the label-provider registry but no live carrier
pickup booking. Refund integration (E.2) still TODO; current refund flow
is a manual record on the return-request.

### F.1 — Return-request entity (generic)  ✅ shipped 2026-05-21

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

**Shipped shape differences from the spec above:**
- `status` enum landed as `REQUESTED|APPROVED|REJECTED|AWAITING_PICKUP|RECEIVED|COMPLETED|CANCELLED`
  (dropped the planned `in_transit` and `inspected` intermediate
  states — handled via the `received_at` + per-line restock decision
  instead).
- `resolution` enum landed as `refund|store_credit` (dropped `exchange`
  and `repair` — out of scope for v1).
- `restock_decision` enum landed as `back_to_inventory|damaged_writeoff`
  only (dropped `returned_to_supplier` — defer until purchase-return is
  modelled).
- Refund is recorded *on the return-request* (`refund_amount_paisa`,
  `refund_method`, `refund_status`, `refund_notes`) instead of a
  separate `refund` entity — E.2 will turn this into a proper
  `payment-intent`-linked refund when gateway integration lands.
- Pickup logistics fields (`pickup_method`, `pickup_scheduled_at`,
  `pickup_carrier_ref`) live on the return-request directly rather than
  via the planned `return_parcel` relation — promote to a relation when
  B.2 multi-parcel ships.

### F.2 — Customer return UI on storefront (generic)  ✅ shipped 2026-05-21

On `/profile/orders/:id` add a **Request return** button (visible only
when `order.order_status = DELIVERED` AND `now < order.actual_delivery_time + 7 days`).
Form: pick line items + qty, pick reason per line, upload photos. Submit
→ creates return-request in `requested` state, notifies staff.

### F.3 — Staff return-management page (generic)  ✅ shipped 2026-05-21

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

**Partial today** — return *labels* dispatch via the label-provider
registry (own_rider, custom, easypost); but no provider booking call is
made, so the customer-side pickup is still arranged manually (rider or
WhatsApp). Real `createReturnShipment` waits on the fuller C.1.

### F.5 — Return window enforcement (generic primitive, tenant config)  ✅ shipped 2026-05-21

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

### G.1 — Order audit log + buyer-facing timeline (generic) — **flagged priority 2026-05-21**

Two-layer design:

1. **Internal audit trail** — every controller that mutates an order
   writes one `order-event` row. Full fidelity, never edited, never
   deleted, no pagination cap. Powers staff dispute resolution, the
   order-management detail-page timeline, and compliance.
2. **Buyer-visible timeline** — a filtered, plain-language subset of
   the same rows surfaced on the storefront tracking page (D.2) and
   `/profile/orders/:id`. Customers see "Your order is being prepared"
   not `status_changed: PAYMENT_CONFIRMED → PREPARING`.

```
content-type: order-event
  sale_order        relation manyToOne
  event_type        string        (status_changed, payment_recorded, payment_verified, stock_attached, parcel_created, parcel_picked_up, rider_assigned, refund_issued, return_received, message_sent, …)
  actor_user        relation → user            (null for system/webhook events)
  actor_role        string        (customer, staff, rider, system, webhook:tcs, webhook:stripe, …)
  before            json
  after             json
  occurred_at       datetime

  # Buyer-visibility layer
  customer_visible  boolean       default false   — whether this row appears on /order-tracking and /profile/orders/:id
  customer_message  string        — plain-language summary shown to the buyer (e.g. "Your order is on its way", "Payment received"). Localisable per tenant. Generated at write time from a template keyed off event_type + new status.
  customer_icon     string        — optional UI hint (`check`, `truck`, `package`, `alert`) so the storefront renders the right glyph without re-mapping event_type.
```

**Default `customer_visible` policy** (codified in a `order-event-visibility.js`
map, NOT a free-form decision per call site):

| event_type / status                     | customer_visible | Why |
| --- | --- | --- |
| `status_changed → PAYMENT_CONFIRMED`    | ✓ | "Payment received" |
| `status_changed → PREPARING`            | ✓ | "Your order is being prepared" |
| `status_changed → AWAITING_PICKUP`      | ✗ | Internal handoff — confusing to buyer |
| `status_changed → OUT_FOR_DELIVERY`     | ✓ | "Your order is out for delivery" + rider name |
| `status_changed → DELIVERED`            | ✓ | "Delivered" + timestamp |
| `status_changed → FAILED_DELIVERY`      | ✓ | "Delivery attempted, we'll try again" (with reason) |
| `status_changed → CANCELLED`            | ✓ | "Your order was cancelled" (with reason if available) |
| `status_changed → REFUND_INITIATED`     | ✓ | "Refund in progress" |
| `status_changed → REFUNDED`             | ✓ | "Refund complete" |
| `payment_recorded` (COD by rider)       | ✗ | Internal — buyer just paid, they know |
| `payment_verified`                      | ✗ | Internal accounts hygiene |
| `stock_attached` / `parcel_created`     | ✗ | Warehouse plumbing |
| `parcel_picked_up`                      | ✓ | "Picked up by courier" + tracking link |
| `rider_assigned`                        | ✓ if `OUT_FOR_DELIVERY` reached | Buyer wants rider name + phone |
| `refund_issued`                         | ✓ | "Refund issued to <method>" |
| `return_received` / `return_inspected`  | ✓ | Buyer wants RMA progress visibility |
| `message_sent`                          | ✓ if sender=staff | Already surfaced via order-message; one timeline line per conversation |

**Endpoints:**

- `GET /sale-orders/:documentId/events` (staff) → full timeline, all rows.
  Gated by `requireOrderAccessUser` + staff-or-owner check.
- `GET /orders/tracking/:documentId/events?secret=…` (public) → only
  rows where `customer_visible = true`. Same secret-keyed gate as the
  existing tracking endpoint.
- `GET /orders/my-orders/:documentId/events` (authenticated buyer) →
  same filter as the tracking endpoint, ownership-gated.

**Writer pattern:** a single `recordOrderEvent({order, event_type,
actor, before, after})` service. Called from `executeTransition` (so
every order status change auto-emits, just like the stock-item side
effects from E.1/B.0 do today), and from each controller for non-status
events (`recordPayment`, `verifyPayment`, `attachStockItem`, `cancelOrder`
reason, refund/return endpoints when they exist).

**Backfill:** ship the migration with a one-time backfill that
synthesizes `status_changed` events from each order's current state +
its `createdAt` / `actual_delivery_time` so existing orders have at
least a sparse history when the timeline UI goes live. Don't try to
reconstruct anything not already in the row.

**Retention:** none initially. Volume is bounded (~10-30 events per
order; even 100K orders is < 5M rows). Revisit when it hurts.

Powers, in order of value: the storefront tracking-page timeline (D.2),
the staff order detail page timeline, dispute resolution, compliance,
and eventually the analytics in G.2.

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

Per the data seeding directive,
retire `src/seed/data/notification-template.json` in favour of a Strapi
migration. New trigger events from Phases A-F (payment_partial_refunded,
packed, parcel_picked_up, return_requested, return_approved,
return_completed, …) added at the same time.

---

# Phased prioritisation

| # | Phase | Why now | Blocks |
| --- | --- | --- | --- |
| ~~–~~ | ~~**E.1** Auto-restock on CANCELLED~~ ✅ 2026-05-21 | Closed | — |
| ~~–~~ | ~~**B.0** Stock-item state-machine on DELIVERED~~ ✅ 2026-05-21 | Closed | — |
| ~~–~~ | ~~**F.1 + F.2 + F.3 + F.5** Returns workflow (entity, customer UI, staff console, return-policy)~~ ✅ 2026-05-21 | Closed | — |
| ~~–~~ | ~~**C.5** Label printing + label-provider registry (subset of C.1)~~ ✅ 2026-05-21 | Closed | — |
| 1 | **A.0** Tighten verifyPayment to accountant | Tiny security fix; do before A.6. | A.6 |
| 2 | **A.4** Pre-dispatch confirmation queue | Biggest COD economics win. | — |
| 3 | **B.1** Packer assignment + PACKED state | Auditable trail before anything ships. | C |
| 4 | **A.5** Rider cash-collect modal | Mobile-friendly close of COD loop. | — |
| 5 | **A.6** Accounts cash-drops inbox | Counterpart to A.5; weekly settlement workload. | — |
| 6 | **C.1** Full provider strategy (getRates, createShipment, cancelShipment, parseWebhook) | Labels slice done; rest unblocks C.2, F.4. | C.2*, F.4 |
| 7 | **D.1** SMS channel | Pakistan-essential customer-perception lift. | — |
| 8 | **A.1+A.3** Payment-method + intent entities | Unlocks non-COD payments cleanly. | A.2 |
| 9 | **A.2** Stripe + manual gateway providers | First non-COD path. | — |
| 10 | **E.2** Gateway-driven refund flow | Replaces today's `pending_manual` refund record on return-request. | F.4 follow-through |
| 11 | **C.2b** TCS / Leopards / PostEx (tenant) | Removes manual courier handoff. | — |
| 12 | **F.4** Reverse-logistics carrier integration | Auto-book return pickup; rides C.1 + C.2b. | — |
| 13 | **B.2** Multi-parcel (incl. qty > 1 split) | Only when split shipments are actually needed. | — |
| 14 | **G.3 + G.4 + G.5** Exception queues, carrier reconciliation, idempotency | Operational maturity. | — |

**Flagged priority (2026-05-21)**: **G.1 — order audit log + buyer-facing
timeline.** User-requested — hard prerequisite for D.2's timeline view,
and the only entity that lets staff answer "what happened on this
order, when, and who did it" without grepping logs. Suggested slot:
between #5 (A.6 accounts inbox) and #6 (C.1 provider strategy), since
the audit log benefits every later phase and is cheaper to build before
those phases add their own events to emit. ~3-4 days for the entity +
writer + backfill migration + both endpoints; tracking-page render is
in D.2 once that ships.

**Deferred**: B.3 (PDF docs), D.3 (push), G.2 (analytics dashboards).
Quality-of-life, not lifecycle-blocking.

# Recommended next change

**A.0 — tighten `verifyPayment` to accountant role.** Small (~15-20 min),
unblocks A.6 (accounts cash-drops inbox), removes a TODO already noted
inline in `sale-order.js`. Add a `requireAccountantUser` helper (or
generic role-set check) and apply it to `verifyPayment`. After that,
**A.4 (pre-dispatch confirmation queue)** is the biggest single-feature
COD-economics win and a clean ~half-day scope.
