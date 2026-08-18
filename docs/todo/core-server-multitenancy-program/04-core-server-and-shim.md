# Phase 3 — `services/core`: server skeleton, data shim, api-pro port

A new package `packages/services/core` (its own workspace; runnable standalone). It serves
the identical descriptor API from the identical MySQL 8 schema, so it can take over
routes one module at a time.

## 3.1 Stack decisions (recommended)

- **HTTP: Koa + @koa/router.** Strapi is Koa; api-pro's interceptor, policies, and every
  custom middleware are Koa middlewares operating on `ctx`. Choosing Koa makes the
  auth/middleware port nearly verbatim and keeps route-matching semantics (first-match,
  the literal-prefix ordering rule) familiar. Fastify's perf edge is irrelevant at this
  workload.
- **DB: Knex.** It is what Strapi 5 uses underneath, the team already debugs it, and
  reusing it minimizes semantic drift in the shim (identical parameter binding, pooling,
  transaction model). Migrations via knex-migrate-style plain SQL/JS files, written
  against MySQL semantics — notably that MySQL implicitly commits on every DDL
  statement, so a migration cannot wrap schema changes in a rollback-able transaction
  (see `services/core/migrations/README.md`). services/core carries both the `mysql2` and `pg`
  drivers, but MySQL 8 is the deployed engine; `pg` is optionality, not current state.
- **Config**: same env conventions as today (root env loader), pino logging, one
  error-handler middleware producing byte-compatible Strapi error bodies.

## 3.2 Schema registry

- [ ] Loader that reads the existing `schema.json` files (content-types + the 20
      components) into an in-memory model registry: attributes, relation kinds, join
      tables, component tables, draft/publish flag.
- [ ] Table/column name derivation must reproduce Strapi 5's conventions exactly
      (snake_case pluralized tables, `_lnk` join tables with order columns, component
      link tables, `document_id`/`published_at`/`locale` columns). Validate by diffing
      derived DDL against a live services/strapi database — this validator is a one-day tool
      that prevents weeks of subtle bugs.
- [ ] The schema.json files become the shared source of truth: Strapi keeps loading them
      until retirement; services/core loads the same files.

## 3.3 Data-access shim (the main engineering artifact)

Implement a `documents(uid)` API compatible with the call sites as used (361 sites) so
ported controllers/services are mostly copy-paste:

- [ ] `findOne / findFirst / findMany / create / update / delete / count`
- [ ] Filter dialect: the operators actually used in the codebase + generated clients
      (enumerated in Phase 0) — `$eq/$ne/$in/$notIn/$null/$notNull/$contains/$containsi/
      $gt(e)/$lt(e)/$between/$and/$or/$not` on attributes and nested relation paths.
- [ ] Sort, pagination (page/pageSize and start/limit), field selection.
- [ ] **Populate** including nested-object form (212 call sites), components, media
      relations, count-populate if used. This is where most of the effort goes; drive it
      test-first from real queries harvested in Phase 0.
- [ ] `db.query(uid)` lower-level twin (162 sites) sharing the same engine; the 7 raw
      `db.connection` sites port as hand-written Knex.
- [ ] Transactions: `strapi.db.transaction(cb)`-equivalent wrapping Knex trx (19 sites);
      shim calls inside a transaction context join it.
- [ ] Draft & publish: implement the minimal subset for the 18 CMS types (status filter,
      publish/unpublish creating the published row) — or, decision point: simplify CMS to
      published-only at migration time and delete D&P handling entirely. Decide when the
      CMS tranche comes up; the shim ignores D&P until then.
- [ ] Media: no upload logic in core — uploads already go through the custom provider to
      Rutba-Media-FileServer. Core needs only the `files` table read side (populate) and
      the provider's write path ported for the endpoints that attach media.
- [ ] **Document middleware hook**: reproduce the document-service middleware seam
      (kind-typing etc. already prefers it over lifecycles). The 28 `lifecycles.js`
      files get ported per-module onto this hook or inlined into services — audited one
      by one during each module's migration, never bulk-converted.

**Acceptance**: shim test suite = golden queries recorded from services/strapi against the
contract-fixture DB, replayed through the shim, results deep-equal after normalization.

## 3.4 api-pro engine port

The plugin (`packages/strapi-api-pro/server/src`) is your code; this is a port, not a
rewrite:

- [ ] Descriptor loader + seeder logic (verb whitelist, method/scope rules) reading the
      same `packages/api-provider/api/*.js` files; DB mirror tables unchanged.
- [ ] Request interceptor as Koa middleware: claim resolution (user → app_roles) with
      the same cache design (per-process cache is fine — one tenant per process now,
      pool-keyed per tenant in the endgame), `$user.*` token evaluation, ownership
      (`owners`) checks, `requireAppRole`, API-token bypass, `X-Rutba-App-Role` handling.
- [ ] `/me/permissions` endpoint byte-compatible.
- [ ] Route table generation from descriptors honoring literal-before-param ordering.
- [ ] **JWT: verify-only.** Same UP secret per tenant; services/strapi remains the sole
      issuer (register/login/refresh/reset) until Phase 7. Guest + optional-auth routes
      reuse the manual-parse pattern.

## 3.5 Platform services used by modules

Port once, before the first module: cron scheduler (env-gated per process; the 3 cron
config files migrate entries per-module), email sender (mailcow SMTP + settings-DB
templates), notification service seam, workflow engine util, the state-machine harness
(`executeTransition`) — the harness moves early even though the sale module moves late,
so migrated modules can register transitions against it.

## Phase 7 — endgame (after all modules migrate)

- [ ] Port auth issuance: register/login/refresh/password-reset + email verification
      (contract tests already cover the flows). Cut Caddy's `/auth/*` over last.
- [ ] Retire services/strapi containers; keep schema.json files as the schema registry input.
- [ ] **Multi-tenant core process**: tenant context (from Caddy header) → per-tenant
      Knex pool + per-tenant api-pro cache, LRU-capped pools. One core process serves
      many tenant DBs; the control plane's backend template shrinks to fleet-shared
      core + per-tenant DB. This is the hosting-margin payoff.
- [ ] Re-run Phase 0 baseline metrics; publish the before/after.
