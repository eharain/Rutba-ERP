# Tranche 6 — Marketplace: migration sheet

Status: **ported + smoke-verified** (steps 1–4 of the playbook done against the
live dev DB; goldens, schema handover and the Caddy flip remain).

## What runs in core now

`rutba-core/src/modules/marketplace.js` (same zero-copy model as tranches 1–5).
Small tranche by design: the ENGINE (adapters, OAuth, scheduling, outbound
HTTP) lives in the rutba-marketplace app — Strapi's side is only the data
contract. The other marketplace CTs (listing, mapping, price-rule, sync-log)
are plain CRUD already served by the seeded route table.

### Custom routes (11, all interceptor-path mounted — NONE are auth:false)

| Route | Notes |
|---|---|
| GET /marketplace-accounts/:id/secrets | worker-only: full account incl. private credentials (service reads aren't sanitized) |
| PUT /marketplace-accounts/:id/state | engine-owned fields only (tokens, watermarks, enable flags); unknown keys rejected loudly |
| POST /marketplace-accounts/:id/ingest-orders | normalized marketplace orders → sale-orders: component line items, SKU→product resolution, provisional person + address, idempotent on (channel, external_order_id); marketplace-side cancels drive executeTransition |
| POST /marketplace-accounts/:id/offer-prices | marketplace SalePrice from live published offers (priority-ordered, first win) |
| GET /:id/outbound-status · outbound-messages | watermark-selected local changes the peer hasn't seen (order-integration-sync service) |
| POST /:id/ingest-messages · stamp-messages | two-way order conversation: apply peer messages idempotently on external_id; stamp peer-assigned ids so pushes don't duplicate |
| POST/PUT/DELETE /marketplace-accounts | operator credential CRUD overrides — requireAppAdmin('marketplace') inside, api-pro policy outside (hr pattern) |

Auth model: the worker authenticates with a **Strapi API token**. Core's auth
now mirrors Strapi's state shape — `ctx.state.auth = { strategy: { name:
'content-api-token' } }` and never `ctx.state.user` — so the ported
`isServiceToken()` gate runs verbatim, and token requests skip the api-pro
interceptor in both servers.

### Reach into the order cluster (deliberate, ahead of tranche 7)

ingest-orders creates sale-orders and the cancel path runs the REAL
`sale-order-state-machine.executeTransition` zero-copy. Its side effects fire
through lifecycles ALREADY registered by earlier tranches (sale-order → hr;
stock-item/stock-batch/acc-* → mfg). The sale/stock cluster itself stays
Strapi-owned until tranche 7 — this module only exercises the same shared
code paths.

### Crons / lifecycles

None. The worker schedules itself inside rutba-marketplace; sale-order's
lifecycle was registered by hr; order-message has no lifecycle file.

### New platform capability this tranche forced

- **Private-attribute output sanitization** (`stripPrivate` in http/rest.js):
  Strapi never serializes `private: true` attributes through the content API
  — core previously leaked them (api_secret / access_token / extra_config on
  marketplace-account AND social-account, the only two CTs using `private`).
  Stripping happens at the REST boundary only (find/findOne/create/update
  envelopes, incl. populated relations/components); documents()/service reads
  keep private fields — the worker's /secrets endpoint depends on that.
  Registry scalars/relations/media/components now carry the `private` flag.
- **API-token auth parity**: `ctx.state.auth` strategy shape (above).

## Verification

- `node scripts/smoke-marketplace.js` — 27 checks, self-cleaning and
  marker-only (temp API token row inserted with the sha512 recipe and
  removed; notification side effects of the CANCELLED transition swept by id
  snapshot + event name): admin gate; private fields stripped on REST but
  present via /secrets; service-token gate matrix (user 403 / anon 401 /
  token 200); state-patch allowlist; worker read contracts; ingest create /
  idempotent skip / cancel through the state machine; outbound-status
  reports the cancellation.
- Full smoke sweep green after the stripPrivate change (documents, writes,
  http, platform, hr, crm, inventory, cms-social). validate-schema: 0
  mismatches. smoke-mfg + the /api/branches contract diffs remain the two
  PRE-EXISTING dev-DB drift issues tracked separately (tranche-5 sheet).

## Remaining for this tranche

Same as tranches 1–5 (goldens, baseline migration via `schema-diff.js
--filter`, Caddy flip). No cron cutover here. At the flip, the
rutba-marketplace worker's STRAPI_URL simply follows the Caddy origin — its
service token authenticates against core's strapi_api_tokens read unchanged.
