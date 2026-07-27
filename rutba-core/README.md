# rutba-core

The in-house backend core that strangler-replaces pos-strapi, serving the same
descriptor-defined REST contract from the same database. Program plan and
ground rules: `docs/todo/core-server-multitenancy-program/`.

Follows the pos-strapi precedent: a top-level app with its own standalone
install (`npm --prefix rutba-core install`), **not** an npm workspace — its
dependency tree stays isolated from the frontend workspaces.

## Status

- **Schema registry** (`src/schema/`): loads the existing `schema.json` files
  (118 app CTs + api-pro plugin CTs + 20 components — the shared source of
  truth with pos-strapi) and derives Strapi 5 table/column/link-table naming.
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
  (`api_pro_interfaces`/`_methods`; 89 custom actions answer 501 until their
  module is ported). Auth = users-permissions JWT (verify-only; pos-strapi
  stays issuer) + admin API tokens (no-user requests skip policy, parity with
  pos-strapi). Policy enforcement runs the api-pro plugin's OWN service
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
- **Bypass paths**: prefix-matched from plugin config (pos-strapi's plugins.js
  api-pro block is fully commented out, so plugin defaults ARE parity);
  bypassed paths skip policy enforcement and allow unauthenticated access
  (parity with `auth: false` public routes).
- **Caller-scoped transactions**: `withTransaction()` (AsyncLocalStorage) —
  every shim query joins the ambient transaction automatically; compat exposes
  it as `strapi.db.transaction(cb)`. Rollback verified in the write smoke.
- Not yet started: cron scheduler, document-middleware hook seam, custom-action
  handlers (per-module tranches), email sender, content-sync engine.

## Commands

```bash
node rutba-core/scripts/validate-schema.js   # diff derived schema vs live DB (must stay clean)
node rutba-core/scripts/smoke-documents.js   # read-path smoke, cross-checked against raw SQL
node rutba-core/scripts/smoke-writes.js      # write-path smoke, marker rows, self-cleaning
node rutba-core/scripts/smoke-http.js        # boots the server; auth + policy matrix + envelope
```

Both read env the same way the dev stack does: repo-root `.env` /
`.env.<ENVIRONMENT>`, honoring `RUTBA_CORE__*` > `POS_STRAPI__*` > bare names
(rutba-core connects to the same DB as pos-strapi during the migration).

## Invariants

- `validate-schema` must exit clean before trusting any shim change; the shim
  is only correct while the registry's derivation matches the live schema.
- schema.json files stay owned by pos-strapi until a module's migration hands
  its tables over to SQL migrations (program ground rule 3).
- Never expose up_users secret columns through populate — user rows go through
  the safe projection in `src/documents/index.js`.
