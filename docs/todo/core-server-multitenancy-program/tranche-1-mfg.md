# Tranche 1 — Manufacturing: migration sheet

Status: **ported + smoke-verified** (playbook steps 1–4 done against the live dev DB;
goldens on a fixture DB, schema handover and the Caddy flip remain).

## What runs in core now

`rutba-core/src/modules/mfg.js` (registered via `src/modules/index.js`; the HTTP layer
mounts module routes before the descriptor-seeded table).

### Custom routes (were 501)

| Route | Handler (pos-strapi source, required as-is) |
|---|---|
| POST /mfg-work-orders/:documentId/process | mfg-work-order/controllers/transition.js |
| POST /mfg-bundles/:documentId/process | mfg-bundle/controllers/transition.js |
| POST /mfg-tasks/:documentId/process·approve·reject | mfg-task/controllers/transition.js |
| POST /mfg-job-works/:documentId/dispatch·receive·cancel·close | mfg-job-work/controllers/transitions.js |
| POST /mfg-material-lots/recompute | mfg-material-lot/controllers/recompute.js |
| POST /mfg-production-templates/:documentId/instantiate | mfg-production-template/controllers/instantiate.js |

All are `selfAuth` (mirrors `auth:false` + controller-enforced auth in Strapi — the
interceptor never gated them there, so core doesn't either).

### Document middlewares

- **mfg-bom KIND typing** — same `validateBomWrite` registration as pos-strapi
  `src/index.js`.
- **Lifecycle adapters** (`src/modules/lifecycles.js` runs pos-strapi
  `content-types/*/lifecycles.js` files unchanged around core `documents()` writes):
  mfg-job-work, mfg-material-issue, mfg-material-lot, mfg-qc-inspection, plus the
  cross-module invariants the mfg flows write into: **stock-item, stock-batch,
  acc-bill, acc-journal-entry**. Their owning tranches (4/7) inherit these
  registrations when they migrate.

### Crons

**None.** pos-strapi has no manufacturing crons (config/server.js schedules social +
inventory tasks only — those move with tranches 5/4). The scheduler stays dormant for
this tranche; nothing to disable on the Strapi side at flip time.

## How it was ported (deviation from the playbook — better than planned)

Playbook step 3 said "copy controllers/services and swap to the shim". Instead the
port is **zero-copy**: rutba-core `require()`s the pos-strapi source files
(controllers, state machines, services, lifecycles, validator, shared utils) and runs
them against the compat `strapi` object (`src/compat/strapi.js`), which grew:

- `strapi.service(uid)` → loads `pos-strapi/src/api/<name>/services/<svc>.js`;
  a require-cache stub for `@strapi/strapi` supplies `factories.createCoreService`
  markers so the Strapi runtime is never loaded into the core process.
- `strapi.entityService` → id-based adapter over `documents()` (document middlewares
  fire, matching Strapi where entityService fires db lifecycles).
- `strapi.db.query` grew `orderBy/limit/offset` mapping + **scalar-only** direct
  writes (`update/updateMany/delete/deleteMany`) — lifecycle-free like Strapi's query
  engine is middleware-free; ported code uses them only for denormalised cache
  columns (stock_quantity, quantity_remaining, …).
- `strapi.query` alias, `strapi.eventHub` (plain EventEmitter), `global.strapi`
  assignment so ported files' bare `strapi` references resolve.
- documents shim: relation filters accept id shorthand (`{ work_order: 7 }`,
  arrays, null), UP **role** populate (super-admin gates read `role.type`), builtin
  relation targets writable by documentId (audit-trail `actor`).

One commit to pos-strapi source = both servers pick it up. When pos-strapi's copies
are deleted at playbook step 8, the files MOVE into rutba-core (they are the only
consumer by then).

## Gaps found while porting (fixed)

- **Seeded-descriptor drift**: job-work `dispatch`/`receive` and template
  `instantiate` were never seeded into api_pro_interface_methods (404 in core);
  job-work `cancel`/`close` are seeded with action `create` (verb whitelist), which
  core previously mounted as *plain create handlers on the custom paths*. Module
  routes now mount first and claim their verb+path, fixing both.
- UP `role` populate resolved to `null` in core (builtin target) — super-admin
  checks (`isManufacturingManager`, `requireAppRole`) silently lost the admin
  bypass. Now projected (id/name/type only).

## Verification

- `node scripts/smoke-mfg.js` — 27 checks, self-cleaning, live dev DB: lifecycle
  adapters (lot defaults, issue→lot balance recompute incl. delete-restore,
  jw_number), BOM typing (Active blocks / Draft warns), HTTP state machines
  (401/400/transition chain Draft→Released→InProgress→Completed with costing +
  audit trail, bundle moves, manager-gated lot recompute).
- Existing suites still green: smoke-documents, smoke-writes, smoke-platform,
  smoke-http, contract-diff sweep.

## Remaining for this tranche (playbook steps 2, 5–8)

1. Goldens on the fixture DB (step 2) — full auth matrix over the routes above.
2. Schema handover (step 5): baseline SQL migration for the mfg-* tables +
   freeze-check on their schema.json files.
3. Caddy flip for `/api/mfg-*` path prefixes (+ Strapi-side 503 guard), canary first.
4. Bake 1–2 weeks; then delete pos-strapi's mfg controllers/services/lifecycles
   (schema.json stays) and move the source files into rutba-core.
