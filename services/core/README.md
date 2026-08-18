# services/core

The in-house backend core that strangler-replaces services/strapi, serving the same
descriptor-defined REST contract from the same database. Program plan and
ground rules: `docs/todo/core-server-multitenancy-program/`.

Follows the services/strapi precedent: a top-level app with its own standalone
install (`npm --prefix services/core install`), **not** an npm workspace — its
dependency tree stays isolated from the frontend workspaces.

## Status

- **Schema registry** (`src/schema/`): loads the existing `schema.json` files
  (118 app CTs + api-pro plugin CTs + 20 components — the shared source of
  truth with services/strapi) and derives Strapi 5 table/column/link-table naming.
  Validated **byte-exact** against the live DB: 140 entity tables, 314 link
  tables, 15 component tables, zero diffs.
- **documents() shim v0** (`src/documents/`): read path — findMany/findOne/
  findFirst/count with the Strapi filter dialect, draft/published status
  semantics, sort, pagination, and populate (relations incl. inverse sides,
  media via `files_related_mph`, components incl. nested component→component→
  relation chains).
- **Write path** (`src/documents/write.js`): create (draft-by-default, accepts
  caller-supplied documentId for the sync engine), update (scalars +
  connect/disconnect/set relations + component replace), delete (full graph:
  versions, component trees, morph rows; link/cmps rows via FK cascade),
  publish/unpublish (graph clone with D&P relation targets remapped to
  published counterparts, unpublished targets dropped). Each op runs in its
  own transaction. Known v0 limits are documented in the file header
  (inverse-side writes throw; inverse order columns left NULL).
- **HTTP layer + api-pro port** (`src/http/`, `src/compat/`): Koa server
  mounting 362 descriptor routes from the api-pro DB mirror
  (`api_pro_interfaces`/`_methods`; unported custom actions answer 501 — as of
  2026-08-17 the remaining 501s are the campaigns cluster (cmp-*),
  mail-message/mail-link and the media api dir; every other module's custom
  actions are served from `src/modules/`). Auth = users-permissions JWT (verify-only; services/strapi
  stays issuer) + admin API tokens (no-user requests skip policy, parity with
  services/strapi). Policy enforcement runs the api-pro plugin's OWN service
  modules (context / permission-engine / policy-resolver / request-interceptor
  required directly from `packages/strapi-api-pro`) through a thin
  strapi-compat object (`config.get`, `db.query`→shim, `apiPro.cache`, `log`).
  The UP user model mirrors api-pro's register()-time `app_roles` injection.
  Verified: 401/403/200 policy matrix + Strapi REST envelope
  (`scripts/smoke-http.js`).
- **/me/permissions** ported (both `/api/me/permissions` and
  `/api/api-pro/me/permissions`) via the plugin's own mePermissions service —
  appRoles/domains/rolesByApp/permissions shape verified. Known gap: `role`
  (the UP admin-role name) is null — compat drops the builtin role populate.
- **Bypass paths**: prefix-matched from plugin config (services/strapi's plugins.js
  api-pro block is fully commented out, so plugin defaults ARE parity);
  bypassed paths skip policy enforcement and allow unauthenticated access
  (parity with `auth: false` public routes).
- **Caller-scoped transactions**: `withTransaction()` (AsyncLocalStorage) —
  every shim query joins the ambient transaction automatically; compat exposes
  it as `strapi.db.transaction(cb)`. Rollback verified in the write smoke.
- Since built (status updated 2026-08-17): cron scheduler
  (`src/platform/cron.js`), document-middleware hook seam (`src/documents/` +
  `src/modules/lifecycles.js`), custom-action handlers for all migration
  tranches (`src/modules/` — 12 modules, ~505 routes), email sender
  (`src/platform/email.js`), uploads (`src/platform/upload.js` +
  `src/modules/uploads.js`).
- **Policy layer** (`src/policy/`, 2026-08-17): core seeds the `api_pro_*`
  tables from the descriptor contract itself and mints API tokens, so a
  descriptor edit → seed → serve cycle needs no Strapi process. The seeder
  diffs rather than upserts (writes only what differs, and can print the plan
  first), reports rows no descriptor declares any more, and preserves
  admin-tuned policies. Boot reseeds automatically when the contract changed,
  skipping in ~40ms when it did not. Proven against the Strapi-seeded database:
  a from-scratch core seed reproduces all 6,359 rows and their 6,163 links
  exactly (`scripts/smoke-policy.js`).
- Not yet started: content-sync engine.

## Commands

```bash
npm run dev:core                             # nodemon — restarts on any watched source change
npm run start:core                           # plain node, no watcher (what deploys run)
```

`dev` runs under nodemon (`services/core/nodemon.json`). The watch list is wider
than `src/` on purpose: core `require`s services/strapi controllers/services/utils
zero-copy through `posRequire()` and loads the api-pro plugin's own service
modules from `packages/strapi-api-pro/server/src`. Node caches those requires,
so an edit on either side is invisible until the process restarts — hence they
are watched too. `services/strapi/src/admin` and `src/seed/data` are ignored (admin
panel code core never loads; JSON fixture blobs).

```bash
node services/core/scripts/validate-schema.js   # diff derived schema vs live DB (must stay clean)
node services/core/scripts/smoke-documents.js   # read-path smoke, cross-checked against raw SQL
node services/core/scripts/smoke-writes.js      # write-path smoke, marker rows, self-cleaning
node services/core/scripts/smoke-http.js        # boots the server; auth + policy matrix + envelope
node services/core/scripts/smoke-policy.js      # seeder + token minting, inside a rolled-back txn
```

Policy tables and API tokens, without Strapi (`src/policy/`):

```bash
npm --prefix services/core run seed:policy -- --dry-run    # print the plan, write nothing
npm --prefix services/core run seed:policy                 # write what differs
npm --prefix services/core run seed:policy -- --prune      # also drop rows no descriptor declares
npm --prefix services/core run token -- list
npm --prefix services/core run token -- mint "<name>" --days=90
```

`--dry-run` exits 2 when the plan is non-empty, so CI can gate "the committed
descriptors match the seeded tables" without a second tool. `seed:policy` also
runs at boot when the contract's hash or the row counts moved
(`RUTBA_CORE_POLICY_SEED=auto|off|force`).

Both read env the same way the dev stack does: repo-root `.env` /
`.env.<ENVIRONMENT>`, honoring `CORE__*` > `POS_STRAPI__*` > bare names
(services/core connects to the same DB as services/strapi during the migration).

## Invariants

- `validate-schema` must exit clean before trusting any shim change; the shim
  is only correct while the registry's derivation matches the live schema.
- schema.json files stay owned by services/strapi until a module's migration hands
  its tables over to SQL migrations (program ground rule 3).
- Never expose up_users secret columns through populate — user rows go through
  the safe projection in `src/documents/index.js`.
