# Server-side address book — multi-address per customer

## ✅ Shipped

The server-side, multi-address book is **built and live** — it rides the
contact-unification model (see `docs/todo/` notes on person unification),
**not** the `api::customer-address` + `user` design sketched further down.

> **Deviation from the original spec:** built as **`api::address`** with a
> **`person`** relation (ownership resolved via `person.user.id`), *not* the
> spec's `api::customer-address` keyed directly on `users-permissions.user`.
> The address belongs to the unified `person`, and the person belongs to the
> user. The descriptor, paths, and lifecycle behaviour below are the real,
> shipped surface — the "Design sketch" section is kept only as historical
> context.

### What shipped (maps to the old "What's missing")
- **Cross-device** ✓ — addresses persist server-side per user (resolved via
  their `person`), so phone + laptop share one book.
- **Multi-address** ✓ — the schema is a `collectionType`; a person can hold
  many addresses, one flagged `is_default`.
- **CSR / Strapi visibility** ✓ — rows live in the `addresses` table linked to
  `person`, so admin and order history can reference them.

### Schema — `pos-strapi/src/api/address/content-types/address/schema.json`
`api::address.address` (collectionType, `collectionName: "addresses"`):
`label`, `line1`, `line2`, `city`, `state`, `country`, `zip_code`,
`is_default` (boolean), `archived_at` (datetime — soft-delete),
`recipient_name` + `recipient_phone` (gift-order overrides), and
`person` (manyToOne → `api::person.person`, `inversedBy: addresses`).

### API surface — shipped endpoints
Routes in `pos-strapi/src/api/address/routes/address.js`, handlers in
`pos-strapi/src/api/address/controllers/address.js` (every op scoped by
resolving `ctx.state.user → person → addresses`; ownership enforced in
`findOwnedAddress` via `row.person.user.id === userId`):
- `GET /me/addresses` → `list` (default first, then oldest; archived excluded)
- `POST /me/addresses` → `createForMe` (first address auto-defaults)
- `PUT /me/addresses/:documentId` → `updateForMe`
- `DELETE /me/addresses/:documentId` → `deleteForMe` (soft-delete via
  `archived_at`; promotes the next address to default if the deleted one was)
- `POST /me/addresses/:documentId/make-default` → `makeDefault`
  (lifecycle clears `is_default` on the person's other rows)

Descriptor: `packages/api-provider/api/addresses.js` (`AddressesEndpoints`,
top-level `api/` so it defaults to `authApi`; `domains: ['web','web-user']`,
`roles: ['user']`).

### Storefront — shipped
- `rutba-web/src/services/me-addresses.ts` — `createMeAddressesService()`
  (`list` / `create` / `update` / `remove` / `makeDefault`). Uses the
  descriptors for paths/methods but calls via axios + the next-auth session
  JWT (the generated proxy authenticates with the api-provider storage JWT,
  which rutba-web doesn't populate).
- `rutba-web/src/components/form/profile/form-shipping-information.tsx` — the
  profile address form.
- `rutba-web/src/pages/profile/address.tsx` — the profile address screen.
- `rutba-web/src/pages/checkout.tsx` — pre-fills from the **default** server
  address (`serverAddresses.find(a => a.is_default) || [0]`), falling back to
  the legacy localStorage `savedCustomer`; logged-in full-address checkouts
  persist into the server book (`saveAddress: !!jwt`).

## Remaining / open

1. **Fold anonymous localStorage address into the server book on login** — not
   done. The localStorage `useSavedCustomer` store
   (`rutba-web/src/store/store-customer.ts`) still lives in parallel; on login
   the local record is never POSTed into `/me/addresses`. Checkout only reads
   the server default and *falls back* to the local record — it doesn't migrate it.
2. **Multi-address picker dialog at checkout** (optional) — checkout currently
   pre-fills the default address only; there's no "Use a different address"
   picker to switch between saved addresses inline.

---

## Current state (v1, shipped)

- [src/store/store-customer.ts](rutba-web/src/store/store-customer.ts) — Zustand-persisted, single saved customer record (contact + last shipping address) in `localStorage`.
- Used by:
  - [src/pages/checkout.tsx](rutba-web/src/pages/checkout.tsx) — pre-fills `<FormQuickOrder>` and seeds `formShippingInformation` when the full-address path is opened. Surfaces a "Shipping to: …" hint above the express form when an address is on file.
  - [src/pages/profile/address.tsx](rutba-web/src/pages/profile/address.tsx) — view / edit / clear UI ("Saved address" tab in the profile sidebar).
- Persists on every successful order — both express and full-address paths.

This buys 80% of the win: returning shoppers skip the form on their next express order; logged-in users see a friendlier checkout greeting; the profile has an actual shipping section instead of dead UI.

> **Superseded — see "✅ Shipped" at the top.** The "What's missing" items
> below (cross-device, multi-address, user-tied visibility) all shipped via the
> `api::address` + `person` model. Only item 3's *fold-on-login* half remains
> open (tracked under "Remaining / open"). The section is kept for history.

## What's missing — and why we'll need it

1. **Cross-device** — the localStorage record only follows the browser. A shopper on phone + laptop has two ghost address books.
2. **Multi-address** — current model is *one* saved address. Real shoppers have home + office + parents' house + a friend's place for gift orders.
3. **Tied to the user** — anonymous shoppers and logged-in shoppers share the same store; on login we should fold the local record into the server book.
4. **CSR / Strapi visibility** — admins can't see a customer's saved addresses; orders can't reference them.

## Design sketch

> **Historical — NOT how it was built.** Shipped as `api::address` + `person`
> (ownership via `person.user.id`), not `api::customer-address` + `user`. See
> the "✅ Shipped" section for the real schema, endpoints, and storefront wiring.

### Strapi content type
`api::customer-address.customer-address`:

| field | type | notes |
|---|---|---|
| `label` | string | e.g. "Home", "Office", "Mum's house" |
| `name` | string | recipient (defaults to user name) |
| `email` | email | optional override |
| `phone_number` | string | required |
| `address` | text | line 1 + line 2 |
| `city`, `state`, `country`, `zip_code` | string | rest of the address |
| `is_default` | boolean | exactly one per user — enforce in lifecycle |
| `user` | relation oneToMany → users-permissions.user | the owner |

Permissions: per-user RBAC — only the owner (or admin) can read/write their own rows. The `owners` relation pattern from Authorization model applies.

### API surface
Goes under `packages/api-provider/api/web/` (the public-`api` namespace currently) but **must require auth** — these are private to a user. Two options:
- Move it into a new `api/me/` namespace that the scaffolder generates with `authApi` (override the web→api default per descriptor).
- Or keep under `web/` and add a per-descriptor `clientName: 'authApi'` override. See api/web/ descriptors generate public-`api` clients for the convention to subvert.

Endpoints:
- `GET /me/addresses` → list
- `POST /me/addresses` → create
- `PATCH /me/addresses/:id` → update
- `DELETE /me/addresses/:id` → delete
- `POST /me/addresses/:id/make-default` → flip the `is_default` flag (lifecycle clears the others)

### Storefront migration
1. Replace `useSavedCustomer` with a hybrid: when logged in, hydrate from server + write-through; when anonymous, fall back to the existing localStorage store.
2. On login, **fold** any localStorage record into the server book (POST as a new address, mark default, clear local store).
3. Profile address page becomes a list with: per-row pencil/trash, "Make default" toggle, "Add another address" CTA at the top.
4. Checkout's "Shipping to: …" hint shows the *default* address with a "Use a different address" link that opens a small picker dialog.

### Edge cases
- **Two addresses with same default flag** — lifecycle hook on save: clear `is_default` on all other rows for the same user before persisting.
- **Anonymous → login mid-checkout** — defer the fold until next page load (or capture the local record into a banner: "Save this address to your account?").
- **Address used by an existing order** — never hard-delete; soft-delete (`archivedAt`) so order history references stay readable.

## Effort

- Schema + lifecycle hook: half-day.
- Per-descriptor authApi override in scaffolder + new `/me/` descriptors: half-day.
- Storefront hybrid store + profile list UI + checkout picker: 1 day.
- Migration on login (fold local record): few hours.
- QA: half-day.

~2.5 days end-to-end. Not blocking launch — the localStorage shim covers the core UX. Worth slotting in as soon as the shopper-base hits the point where multi-address requests start coming in.
