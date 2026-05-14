# Server-side address book — multi-address per customer

## Current state (v1, shipped)

- [src/store/store-customer.ts](rutba-web/src/store/store-customer.ts) — Zustand-persisted, single saved customer record (contact + last shipping address) in `localStorage`.
- Used by:
  - [src/pages/checkout.tsx](rutba-web/src/pages/checkout.tsx) — pre-fills `<FormQuickOrder>` and seeds `formShippingInformation` when the full-address path is opened. Surfaces a "Shipping to: …" hint above the express form when an address is on file.
  - [src/pages/profile/address.tsx](rutba-web/src/pages/profile/address.tsx) — view / edit / clear UI ("Saved address" tab in the profile sidebar).
- Persists on every successful order — both express and full-address paths.

This buys 80% of the win: returning shoppers skip the form on their next express order; logged-in users see a friendlier checkout greeting; the profile has an actual shipping section instead of dead UI.

## What's missing — and why we'll need it

1. **Cross-device** — the localStorage record only follows the browser. A shopper on phone + laptop has two ghost address books.
2. **Multi-address** — current model is *one* saved address. Real shoppers have home + office + parents' house + a friend's place for gift orders.
3. **Tied to the user** — anonymous shoppers and logged-in shoppers share the same store; on login we should fold the local record into the server book.
4. **CSR / Strapi visibility** — admins can't see a customer's saved addresses; orders can't reference them.

## Design sketch

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

Permissions: per-user RBAC — only the owner (or admin) can read/write their own rows. The `owners` relation pattern from [Authorization model](../../C:/Users/EjazArain/.claude/projects/d--Rutba-ERP/memory/project_authorization_model.md) applies.

### API surface
Goes under `packages/api-provider/api/web/` (the public-`api` namespace currently) but **must require auth** — these are private to a user. Two options:
- Move it into a new `api/me/` namespace that the scaffolder generates with `authApi` (override the web→api default per descriptor).
- Or keep under `web/` and add a per-descriptor `clientName: 'authApi'` override. See [api/web/ descriptors generate public-`api` clients](../../C:/Users/EjazArain/.claude/projects/d--Rutba-ERP/memory/project_api_provider_web_public_client.md) for the convention to subvert.

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
