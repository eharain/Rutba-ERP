---
name: project-api-provider-wire-codec
description: "Wire compression for api-provider ↔ strapi-api-pro — short-name URLs carrying only declared variables, full Strapi shape reconstructed server-side from the named descriptor. Tightens the named-policy architecture by closing the caller-passed shape escape hatch."
metadata:
  node_type: memory
  type: project
---

## Problem

URLs from rutba-web / pos-shared / rutba-cms to Strapi (via `packages/api-provider`) are multi-KB after `qs.stringify` serializes deep populate trees, filter operators, field arrays, and pagination/sort. The shape is mostly **fixed per endpoint** — only a handful of variables (slug, page, filters from caller input) actually change call-to-call. Sending the full shape over the wire is pure waste.

## Scope: public-facing first

**Phase 1 is `api/web/*.js` only** — the descriptors that emit the public/unauth `api` client per [[project_api_provider_web_public_client]]. These serve anonymous traffic from rutba-web (SSR + browser). All other call surfaces (pos-shared, rutba-cms, authenticated rutba-web traffic) stay on the long form for now and migrate later.

### Why public-first (security rationale)

The long-form URL **advertises the data model** to any reader: relation names, field names, accepted filter operators, populate depth. An anonymous scraper can read the qs off a network tab, then tweak it — try `populate[costPrice]`, `filters[role][$eq]=admin`, `fields[0]=internalNotes` — to enumerate what Strapi will return. Strapi's response will quietly include whatever the public role's permissions allow, which is more than the descriptor authors intended in many cases.

Shortening alone doesn't fix this (the short URL is just as callable as the long one). The fix is the **closed-shape rule applied to the public surface**:

1. Public callers send only `(/api-pro/x/<interface>/<method>, declared args)`.
2. Server reconstructs the descriptor-authored shape — and only that shape — before handing off to Strapi.
3. Anonymous callers literally cannot ask for `populate`/`fields`/`filters` the descriptor didn't pre-author. The schema-enumeration vector closes.
4. Once stable, the long-form `/api/...` Strapi REST routes are denied for the public role (still open for authenticated apps during their migration). A scraper that hits `/api/products?populate=*` gets 403, not data.

This is a **defense-in-depth** addition, not a replacement for proper Strapi permissions — those still need to be correct. But it removes a class of "I changed one URL param and got more data" attacks without relying on every public role permission being perfectly tightened.

## Rule (supersedes earlier "client developer owns query shape" framing in [[project-api-provider-named-policy-architecture]])

**The descriptor method owns the shape. The caller passes only variables.**

- A "shape" = `populate` / `fields` / `filters` / `sort` / `pagination defaults` / `status`.
- A "variable" = a value bound to a *named, schema-declared* parameter of the method (id, slug, page, pageSize, search term, an enum selection like `sort: 'nameAsc'`, a boolean toggle like `showArchived`).
- **No caller-passed populate/fields/filters/sort.** The `param ?? [defaults]` pattern where `param` comes from the caller is removed.
- **Any variation that can't be expressed as a declared parameter ⇒ a new method.** No anonymous shapes constructed at call sites.
- Populate size doesn't matter. A 6-level monster populate is fine — *as long as it lives behind a name* (a descriptor method) and only that name travels on the wire.

## Wire format

```
GET  /api-pro/x/<interface>/<method>?<arg1>=<v1>&<arg2>=<v2>
POST /api-pro/x/<interface>/<method>     body: { <arg1>: <v1>, … }
```

Naming convention: strip only the `Endpoints` boilerplate suffix from the descriptor export name; keep the rest camelCase as authored.

| Descriptor | Wire |
|---|---|
| `WebBannersEndpoints.homeBanner()` (`api/web/banners.js`) | `/api-pro/x/webBanners/homeBanner` |
| `CmsPagesEndpoints.bySlug(slug)` | `/api-pro/x/cmsPages/bySlug?slug=index` |
| `ProductsEndpoints.list({ page, pageSize })` | `/api-pro/x/products/list?page=1&pageSize=100` |
| `StockItemsEndpoints.list({ page, rowsPerPage, statusFilter, branchDocId, productDocId, showArchived, sort, searchTerm })` | `/api-pro/x/stockItems/list?page=…&statusFilter=active&sort=nameAsc&…` |

Scaffolder validates `(interface, method)` uniqueness across `api/**/*.js` and fails the build on collision. No hand-picked short codes, no hashes — names stay greppable end-to-end.

## Args schema (replaces informal opts bags)

Every descriptor method must publish an `args` schema that the scaffolder reads. Two derivatives are emitted from one schema source:

- **Client-side**: `.d.ts` types so callers get autocomplete; values not in the schema are a TS error.
- **Server-side**: a validator that rejects unknown keys / wrong types with HTTP 400 before any Strapi work runs.

Suggested authoring shape (final shape TBD during implementation):

```js
StockItemsEndpoints.list = {
  args: {
    page:         { type: 'int',  default: 1 },
    rowsPerPage:  { type: 'int',  default: 100 },
    statusFilter: { type: 'enum', values: ['active','inactive','any'], default: 'active' },
    branchDocId:  { type: 'docId', optional: true },
    productDocId: { type: 'docId', optional: true },
    showArchived: { type: 'bool', default: false },
    sort:         { type: 'enum', values: ['nameAsc','nameDesc','stockDesc','recent'], default: 'nameAsc' },
    searchTerm:   { type: 'string', optional: true },
  },
  build({ page, rowsPerPage, statusFilter, branchDocId, productDocId, showArchived, sort, searchTerm }) {
    return { path: '/stock-items', params: { /* full populate/fields/filters/sort lives here */ } };
  },
};
```

Notes:
- `sort` is **enumerated**, never raw Strapi sort syntax. The descriptor maps the enum to the actual Strapi sort string inside `build`.
- Filters are declared, typed, single-value-per-key. No raw filter operator objects from the caller.

## Two clean layers (server)

| Layer | Reads | Writes | Owned by |
|---|---|---|---|
| **Wire codec** (new) | short URL + descriptor registry | `ctx.path`, `ctx.query` (Strapi-native qs) | `strapi-api-pro` middleware, registered **before** request-interceptor |
| **Request interceptor** (existing) | JWT, `X-Rutba-App`, `X-Rutba-App-Role`, `ctx.query` | injects policy fragments into `ctx.query` / body; expands `$user.*` / `$claim.*` tokens | unchanged from current `request-interceptor.js` |

The codec is a **pure transport-layer concern**. It doesn't know about auth, policies, or tokens — it just takes `(name, variables)` and produces a fully-formed Strapi request. All existing role-scope / ownership / situational-claim machinery keeps consuming the same headers + expanded `ctx.query` as it does today.

## Codec flow (end-to-end)

1. Client app calls `StockItemsEndpoints.list({ page: 1, searchTerm: 'widget' })`.
2. Generated client wrapper knows its `(interface, method)` identity at codegen time; emits `GET /api-pro/x/stockItems/list?page=1&searchTerm=widget`. Headers (`Authorization`, `X-Rutba-App`, `X-Rutba-App-Role`) flow through unchanged.
3. Server middleware looks up `stockItems/list` in the boot-loaded descriptor registry.
4. Validates query against `args` schema → 400 on unknown/malformed keys.
5. Calls descriptor's `build({ page, searchTerm, …defaults })` → gets `{ path: '/stock-items', params: { populate, fields, filters, sort, pagination } }`.
6. Rewrites `ctx.path = '/api/stock-items'`, sets `ctx.query` from `params`.
7. `await next()` — existing request-interceptor runs, then Strapi core.

## Pieces to build

1. **Schema-aware scaffolder pass** — extend [scripts/scaffold-endpoint-providers.mjs](packages/api-provider/scripts/scaffold-endpoint-providers.mjs) to read the new `args` field and emit:
   - `.d.ts` types per method (replaces the current parsed-signature approach where the surface is the full Strapi shape).
   - A single registry artifact (`policies.json` / `endpoints-registry.json`) listing `(interface, method, argSchema, …)`. This aligns with [[project-api-provider-named-policy-architecture]] §"Codegen artifact".

2. **Server descriptor bundle** — at scaffold time, emit a CommonJS bundle of all descriptors into `packages/strapi-api-pro/server/generated/descriptors.js`. Boot loads it into an in-memory `(interface, method) → { argSchema, build }` map.

3. **Codec middleware** — new file under `packages/strapi-api-pro/server/src/middlewares/wire-codec.js`. Registered in [bootstrap.js](packages/strapi-api-pro/server/src/bootstrap.js) **before** the existing request-interceptor. Owns the path-rewrite + qs-rebuild logic above.

4. **Client emit changes — two parallel trees, no runtime variant logic.** The scaffolder emits **two complete generated trees**:

   ```
   packages/api-provider/providers/generated/
     client-long/
       web/banners.js, cms-pages.js, …    ← long variant only
     client-short/
       web/banners.js, cms-pages.js, …    ← short variant only
   ```

   Each file is single-purpose. A long-variant wrapper directly calls `api.fetch('/product-groups', { populate, filters, … })`. A short-variant wrapper directly calls `api.fetch('/api-pro/x/webBanners/homeBanner', args)`. No ternaries, no env-var reads in generated source, no `wireCall` / `longCall` helpers. The interface/method identity is baked into the URL string literal in the short-variant source — greppable end-to-end (`rg "/api-pro/x/cmsPages/bySlug"`).

   **No client-side registry.** The descriptor registry exists only on the server (item 2). The client just emits literal URLs; nothing to look up at runtime.

   **Variant decision lives in each app's bundler config — once.** Webpack/Vite alias `@rutba/api-provider/client` to `client-short` or `client-long` based on the per-app env var resolved at the app's build time:

   ```js
   // rutba-web/next.config.js
   config.resolve.alias['@rutba/api-provider/client'] =
       process.env.API_WIRE_MODE === 'short'
           ? '@rutba/api-provider/providers/generated/client-short'
           : '@rutba/api-provider/providers/generated/client-long';
   ```

   App source imports `from '@rutba/api-provider/client'` and never names a variant. Flipping `RUTBA_WEB__API_WIRE_MODE=short` in the workspace `.env` swaps the entire generated tree the bundler sees for that app. The `.d.ts` describes one method shape (signatures are identical across variants).

5. **Closed-shape sweep** — every descriptor method whose signature accepts `{ populate, fields, filters, sort } = {}` (currently most `list*` and `byId*` methods per [[project-api-provider-named-policy-architecture]] line 101) gets converted: the destructured surface is replaced with the declared `args` schema; any internal `param ?? [defaults]` fallbacks become the fixed values inside `build`. **This is the larger half of the work.**

6. **Validator gate** — `validate-endpoint-usage.mjs` (already gating unknown member access) extends to flag any caller passing `populate`/`fields`/`filters`/`sort` into a method. CI hard-fails on a legacy call site that survived the sweep.

## Phase 0 audit (must precede the codec)

Read-only audit of every consuming app to categorize each call site:

- ✅ Already named and fixed (no work).
- ⚠️ Descriptor takes an informal opts bag → publish `args` schema, freeze key set, leave callers alone.
- 🔴 Caller passes its own `populate` / `fields` / `filters` / `sort` → migrate to a new method, fold into an existing method's defaults, or convert to an enum param.
- 🔴 Caller passes raw Strapi sort/filter syntax → enum-ify.

Output: punch list grouped by descriptor file, fed into the closed-shape sweep above.

## Rollout

Per [[feedback-strict-rollout-no-warn-phase]] — strict no-mercy in the steady state, but the **per-app flip is gated by an env var** so each app can switch independently.

### Per-app env-var switch

Uses the existing workspace convention from [scripts/js/load-env.js](scripts/js/load-env.js): vars in the root `.env` are either **global** (bare name, available to all apps) or **app-specific** (`APPPREFIX__NAME`, where `APPPREFIX` is the workspace-dir name uppercased with dashes→underscores). The loader strips the prefix before spawning each app; child processes always see the bare name `API_WIRE_MODE`.

```
# Global default for all apps that don't override
API_WIRE_MODE=long

# Per-app overrides (workspace dir name uppercased)
RUTBA_WEB__API_WIRE_MODE=short        # rutba-web — flip first (Phase 1)
# RUTBA_CMS__API_WIRE_MODE=long       # rutba-cms — omit to inherit global
# POS_AUTH__API_WIRE_MODE=long        # pos-* apps — omit to inherit global
# POS_SALE__API_WIRE_MODE=long
# POS_STOCK__API_WIRE_MODE=long
```

When the loader launches rutba-web: the `RUTBA_WEB__` prefix is stripped and the app sees `process.env.API_WIRE_MODE=short`. When it launches any other app with no override: the global `API_WIRE_MODE=long` flows through. The api-provider runtime always reads `process.env.API_WIRE_MODE` — one name, regardless of which app it's bundled into.

Values: `long` | `short`. Default if unset = `long` (no behavior change).

### Browser-bundle exposure

For SSR + Node-side api-provider usage the env var flows in naturally. For the browser bundle:

- **rutba-web** (Next.js): expose via `next.config.js` → `env: { API_WIRE_MODE: process.env.API_WIRE_MODE }` so it inlines into the client bundle. No `NEXT_PUBLIC_` rename needed; Next pipes it through.
- **pos-* apps** (Vite): expose via `vite.config.*` → `define: { 'process.env.API_WIRE_MODE': JSON.stringify(process.env.API_WIRE_MODE) }`.
- **rutba-cms**: same pattern as the host framework requires.

The api-provider lib reads `process.env.API_WIRE_MODE` at module-load time and caches it. No runtime config API needed; flipping the env var requires a rebuild/restart, which matches how the rest of the workspace handles env-driven config.

### What the switch actually does

- `long` → existing `querify`/`withQuery` path. Wire format unchanged. Strapi sees `/api/<resource>?...long qs...`.
- `short` → new `wireCall(interface, method, args)` path. Wire format `/api-pro/x/<interface>/<method>?<args>`. Server codec middleware reconstructs the full shape from the descriptor.

The server **accepts both modes simultaneously** during rollout — short-form on `/api-pro/x/*`, long-form still on `/api/*`. This is what lets one app flip while others lag.

### Sequence

1. Phase 0 audit (scoped to `api/web/`) → punch list.
2. Closed-shape sweep + `args` schemas on `api/web/*.js` descriptors. Old shape still works.
3. Codec middleware + client `wireCall` lands. Both routes (`/api/*` long, `/api-pro/x/*` short) accept traffic. Env var defaults to `long` everywhere.
4. **Flip `RUTBA_WIRE_MODE_WEB=short`.** rutba-web emits only short-form. Verify in Strapi console that no long-form public-role traffic remains.
5. **Deny long-form for the public role** on Strapi side (permissions or middleware) — this is the actual security win per §"Why public-first". Authenticated roles still hit long-form for pos/cms.
6. Later phases: repeat the sweep for pos and cms descriptors, flip their env vars, then deny long-form globally and retire the legacy path.

## Out of scope

- Compressing the `args` payload further (operator codes, base64 packs). Not needed — once shapes are out of the URL, what remains is small and bounded.
- Versioning of short names. Names are derived from the descriptor; renaming a descriptor is a breaking change at every layer simultaneously (deliberate).
- The existing `api-provider/pos` layer ([[project_api_provider_pos_anti_pattern]]) — move-to-pos-shared work remains a separate follow-up.

## Pointers

- Existing architecture this amends: [[project-api-provider-named-policy-architecture]]
- Existing client serialization to replace: [packages/api-provider/lib/api.js](packages/api-provider/lib/api.js) `querify()`, [providers/generated/client/___core__.js](packages/api-provider/providers/generated/client/___core__.js) `withQuery()`
- Existing server interception (downstream of new codec): [packages/strapi-api-pro/server/src/services/request-interceptor.js](packages/strapi-api-pro/server/src/services/request-interceptor.js)
- Scaffolder to extend: [packages/api-provider/scripts/scaffold-endpoint-providers.mjs](packages/api-provider/scripts/scaffold-endpoint-providers.mjs)
- Bootstrap registration point for the new middleware: [packages/strapi-api-pro/server/src/bootstrap.js](packages/strapi-api-pro/server/src/bootstrap.js)
