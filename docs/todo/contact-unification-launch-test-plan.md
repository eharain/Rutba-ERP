# Contact-unification — launch readiness test plan

Walk-through to validate the Phase 1A unification work before rutba-web goes
public. Group by priority — P0 blocks launch, P1 must work before any real
traffic, P2 is acceptable to fix in the first week post-launch.

Companion to [contact-entity-unification.md](./contact-entity-unification.md)
and [project_contact_unification_phase1a memory](../../C:/Users/EjazArain/.claude/projects/d--Rutba-ERP/memory/project_contact_unification_phase1a.md).

## Pre-flight

Before any test run:

- [ ] `cd pos-strapi && npm run develop` — Strapi boots without schema-sync
  errors. Watch for:
  - "[strapi] Removing component `order.order-contact`" — expected (we
    deleted it).
  - "[strapi] Removing field `customer_contact` from `sale-order`" —
    expected.
  - "[strapi] Creating content type `api::person.person`" — expected.
  - "[strapi] Creating content type `api::address.address`" — expected.
  - "[strapi] Creating content type `api::person-dedup-audit.person-dedup-audit`" — expected.
  - "[strapi] Adding fields `customer_person`, `delivery_address`,
    `delivery_snapshot` to `sale-order`" — expected.
  - Any other errors / migration prompts — STOP and investigate.
- [ ] If running against a populated dev DB: the schema sync will DROP the
  `customer_contact` column on `orders` and the `components_order_order_contacts`
  table. Verify these tables had no rows before continuing
  (`SELECT COUNT(*) FROM components_order_order_contacts;` should be 0;
  any web-side `orders` rows should be test data that's OK to lose the
  `customer_contact` value from).
- [ ] api-pro seeder logs `Generated from api subtree` includes
  `addresses.js`. Confirms the new descriptor was picked up.

---

## P0 — launch-blocking

### P0.1 — Anonymous checkout (express, no address)
- [ ] On rutba-web (logged out), add an item to cart, go to checkout.
- [ ] Submit express form with name / email / phone only.
- [ ] **Strapi admin**: confirm a new `sale-order` row exists with
  `delivery_snapshot` JSON containing the entered name/email/phone,
  `delivery_address = null`, `customer_person → person` populated.
- [ ] **Strapi admin**: confirm the linked `person` row has `provisional_at`
  set (a timestamp, not null), `user` null, and the entered email/phone/name.
- [ ] The WhatsApp / confirmation message includes the correct customer name.

### P0.2 — Anonymous checkout (full-address, save NOT requested)
- [ ] Same as P0.1 but use the full-address path with shipping fields.
- [ ] Submit.
- [ ] Confirm `sale-order.delivery_snapshot` contains line1/city/state/zip.
- [ ] Confirm `sale-order.delivery_address = null` (not saved — no JWT).
- [ ] Confirm no `address` row was created (anonymous shoppers don't get an
  address book).

### P0.3 — Authenticated checkout (express)
- [ ] Log into rutba-web. Confirm `useSession().data.jwt` is set.
- [ ] Cart → checkout → express form.
- [ ] Submit.
- [ ] Confirm sale-order's `customer_person` resolved to the existing person
  for this UP user (find-or-create logic).
- [ ] Confirm the person row's email/phone was backfilled if they were
  previously null and the checkout form provided values.
- [ ] Confirm `delivery_snapshot` reflects what was submitted.

### P0.4 — Authenticated checkout (full-address, save_address)
- [ ] Same login, cart → checkout → full-address path with all shipping
  fields filled.
- [ ] Submit.
- [ ] Confirm a new `address` row was created, linked to the user's person,
  with `is_default = true` (first address).
- [ ] Confirm `sale-order.delivery_address` points at it.
- [ ] Confirm `sale-order.delivery_snapshot` has the same values.
- [ ] **Repeat with the same address** (place another order to the same
  destination). Confirm a SECOND `address` row was NOT created — the dedup
  logic reuses the existing row. The order's `delivery_address` should point
  at the same address row.

### P0.5 — Provisional promotion on UP signup
- [ ] Log out. Place an anonymous order with email `test+promo@example.com`.
  Confirm a `person` row was created with `provisional_at` set.
- [ ] Register a new UP user with the SAME email.
- [ ] **Strapi admin**: confirm the same person row is still there (no
  duplicate created), `user` FK is now set, `provisional_at` is null.
- [ ] Place an authed checkout. Confirm the order's `customer_person`
  resolves to the SAME person row (no new row).

### P0.6 — /me/addresses CRUD (profile address book)
On rutba-web, logged in:
- [ ] Profile → Saved addresses. Confirm the list loads (might be empty
  on first visit).
- [ ] Click "Add address". Fill all fields. Save.
- [ ] Confirm the row appears in the list, marked **Default** (first one).
- [ ] Click "Add address" again. Fill different fields. Save.
- [ ] Confirm both addresses listed, first is still **Default**.
- [ ] Click "Make default" on the second one. Confirm:
  - Second one is now marked **Default**.
  - First one's badge disappeared.
- [ ] Edit the first address — change `label`. Save. Confirm change persists.
- [ ] Delete the second (default) address. Confirm:
  - It's gone from the list.
  - The first is now marked **Default** (auto-promoted).
- [ ] **Strapi admin** sanity: deleted address has `archived_at` set, not
  hard-deleted.

### P0.7 — POS sale untouched
- [ ] Open pos-sale. Create a sale through the normal POS flow with a
  customer chosen / created.
- [ ] Confirm the sale lands successfully. No "customer_contact" errors.
- [ ] Confirm `api::sale.sale` row has the customer FK populated as before.
- [ ] (POS is the production-data app — any regression here is a launch
  blocker even though it's unrelated to web.)

### P0.8 — Order detail page (rutba-web /profile/orders/:id)
- [ ] As a logged-in user with at least one order, open profile → orders.
- [ ] Click an order.
- [ ] Confirm the detail page renders name / phone / email / address from
  the order's snapshot (not blank — would be the most visible bug).

---

## P1 — must-fix-before-launch-if-broken

### P1.1 — Notification template variables
- [ ] Set up an `order_placed` notification template with at least
  `{{customer_name}}` and `{{customer_email}}`.
- [ ] Place a new order.
- [ ] Confirm the notification renders the correct name/email — sourced
  from `delivery_snapshot` (controller uses snapshot first, then person).
- [ ] Edit the user's `person.name` to a different value. Confirm a NEW
  notification for a NEW order uses the new name, but re-firing the
  template for the OLD order (if any retry flow exists) still uses the
  snapshot's frozen name.

### P1.2 — Public order tracking page (/transaction/:id?secret=…)
- [ ] Open a placed order's tracking link (with secret query param).
- [ ] Confirm the page renders customer name, address, and order details.
- [ ] Page should NOT 500. The synthesized `customer_contact` shape comes
  from snapshot/person in `sale-order.trackOrder`.

### P1.3 — Rider mobile (rutba-rider)
- [ ] Log into rutba-rider as a rider.
- [ ] Confirm `/deliveries` lists assigned orders with customer name (no `—`
  unless the order genuinely has no name).
- [ ] Open a delivery detail. Confirm customer name / phone / address all
  populate from snapshot.
- [ ] Open a delivery offer detail. Same check.

### P1.4 — Order management admin (rutba-order-management)
- [ ] Log into the admin app.
- [ ] /sale-orders list shows customer name column.
- [ ] /:documentId/sale-order detail loads with form fields prefilled.
- [ ] Save changes. Confirm the controller accepts the new flat `customer`
  payload — should hit the unification controller's legacy-tolerance branch
  if anything wasn't updated, OR the new branch directly.

### P1.5 — gift-order recipient overrides
- [ ] Profile → Saved addresses → Add address. Fill `recipient_name` and
  `recipient_phone` as a "ship to mum" override.
- [ ] **Strapi admin** confirm `recipient_name` / `recipient_phone` saved on
  the address row.
- [ ] (No UI flow consumes these yet — Phase 2 work. Just confirm the
  schema accepts them.)

### P1.6 — Contact-ticket submit
- [ ] As a logged-in user, submit a contact ticket via whatever route the
  app exposes.
- [ ] **Strapi admin** confirm the ticket row has both `user` AND `person`
  FK populated, both pointing at the right rows.

---

## P2 — post-launch acceptable

### P2.1 — Strapi admin browse
- [ ] In Strapi admin → Content Manager, confirm `Person`, `Address`,
  `Person Dedup Audit` show up under their respective collection types.
- [ ] Open one of each — fields are editable, relations populate.

### P2.2 — Case-insensitive email matching
- [ ] Place anonymous order with email `Test@Example.com`.
- [ ] Register UP user with email `test@example.com`.
- [ ] Confirm the provisional was claimed despite case difference (`$eqi`).

### P2.3 — Concurrent ensureForUser
- [ ] Log in.
- [ ] Open two tabs of /profile/address. Hit "Add address" on both at the
  same time.
- [ ] Confirm no DB error / 500. The race-safe try/catch in `ensureForUser`
  should swallow the unique-constraint violation and re-fetch.

### P2.4 — Anonymous → signup email mismatch
- [ ] Place anonymous order with email A.
- [ ] Register UP user with email B (different).
- [ ] Confirm B does NOT auto-claim A's provisional person — they're
  different rows, no merge happens. (Phase 3 dedup work covers this case
  for human review.)

### P2.5 — Delete-default edge cases
- [ ] User with only ONE saved address. Delete it. Confirm no crash, list
  empties cleanly. (No fallback default to promote.)
- [ ] User with three addresses, second is default. Delete the first
  (non-default). Confirm second is still default.

### P2.6 — Long-form / unicode handling
- [ ] Place an order with name / address containing emoji, RTL Arabic,
  very long strings. Confirm no truncation or encoding errors.

---

## What's NOT in this plan (out of scope for Phase 1A)

- `customer` row creation from the web — POS-only entity until Phase 1B.
- CRM lead / crm-contact dual-write — Phase 1C.
- Person merge UI — Phase 3.1 (will live in rutba-crm).
- Backfill of existing POS customers to person — Phase 1B (separate seed
  with dry-run mode).

## Rollback

If P0 fails catastrophically:

- Schema changes are reversible by reverting the affected schema.json files
  and bouncing Strapi (it re-syncs). Will lose any data in the new tables —
  acceptable pre-launch.
- Storefront / order-management changes are local edits, revert via git.
- POS is untouched, so a rollback should not affect production POS use.

If P0 passes but P1 has issues, ship anyway and hotfix the specific
P1 item — the failure modes there are display-only (notification text,
admin page rendering) and don't corrupt data.
