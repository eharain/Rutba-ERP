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

4. **Client emit — scaffolder decides per app, single tree, no runtime variant logic.** The variant decision rides the existing workspace context-resolution chain (see §"Context resolution chain" below). When the scaffolder runs for a given app launch, `process.env.API_WIRE_MODE` and `targetPrefix` are already resolved by [load-env.js](scripts/js/load-env.js). The scaffolder reads them and emits **one variant** to a **per-app output directory**.

   ```
   packages/api-provider/.generated/
     RUTBA_WEB/client/web/banners.js, cms-pages.js, …    ← short (because RUTBA_WEB__API_WIRE_MODE=short)
     POS_AUTH/client/web/banners.js, …                   ← long (inherits global)
     POS_SALE/client/web/banners.js, …                   ← long
     …
   ```

   Each file is single-purpose. A short-variant wrapper directly calls `api.fetch('/api-pro/x/webBanners/homeBanner', args)`. A long-variant wrapper directly calls `api.fetch('/product-groups', { populate, filters, … })`. **No ternaries, no env-var reads in generated source, no `wireCall` / `longCall` helpers, no client-side registry.** The interface/method identity is baked into the URL string literal in the short-variant source — greppable end-to-end (`rg "/api-pro/x/cmsPages/bySlug"`).

   **How the app finds its tree.** The api-provider package's own `exports` map (or a tiny `lib/client-resolver.js` re-export) reads `process.env.RUTBA_TARGET_APP` (already set by load-env) and resolves `@rutba/api-provider/client` to `.generated/<APP_PREFIX>/client/`. The decision lives **once**, inside api-provider, not duplicated in every app's bundler config.

   **What the app sees.** App source imports `from '@rutba/api-provider/client'` and never names a variant. No `next.config.js`/`vite.config.js` changes per app. No bundler alias maintenance. The `.d.ts` describes one method shape (signatures are identical across variants); the same types serve both modes because they only describe args in/response out.

   **Concurrent dev safety.** Per-app output directories mean `rutba-web` and `pos-auth` running side-by-side don't collide on `providers/generated/client/`. Each owns its own subtree.

   **`RUTBA_API_SCAFFOLDED=1` short-circuit is dropped.** The existing cross-app skip in [load-env.js:149](scripts/js/load-env.js#L149) assumed app-agnostic output. With per-app trees the skip is incorrect: each launch must scaffold for *its* app. The scaffolder is idempotent and cheap (content-aware, mtime-gated), so the per-launch cost stays in the low seconds. Replace the boolean with `RUTBA_API_SCAFFOLDED_FOR=<APP_PREFIX>` if a same-app re-run optimization is wanted later.

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

**Nothing to configure per app.** Because the variant is resolved at scaffold time and baked into the generated source, the browser bundle just sees normal JavaScript with literal URLs. No env-var inlining via `next.config.js` `env:`, no Vite `define:`, no `NEXT_PUBLIC_` plumbing. The api-provider's exports map handles import resolution at the bundler's module-resolve step — visible to every bundler natively.

### What the switch actually does

- `long` → scaffolder emits wrappers that call `api.fetch('/api/<resource>', { populate, filters, … })`. Wire format unchanged.
- `short` → scaffolder emits wrappers that call `api.fetch('/api-pro/x/<interface>/<method>', args)`. Server codec middleware reconstructs the full shape from the descriptor.

The server **accepts both modes simultaneously** during rollout — short-form on `/api-pro/x/*`, long-form still on `/api/*`. This is what lets one app flip while others lag.

### Context resolution chain (end-to-end)

The wire-mode decision rides the workspace's existing per-app context resolution. No new mechanism — the same chain that resolves `PORT`, `DB_URL`, etc., resolves `API_WIRE_MODE`:

```
1. Workspace .env contains:
     API_WIRE_MODE=long                       # global default
     RUTBA_WEB__API_WIRE_MODE=short           # per-app override

2. `npm run dev --workspace=rutba-web` invokes load-env.js
   → findTargetDir() detects workspace dir = 'rutba-web'
   → targetPrefix = 'RUTBA_WEB'
   → splitVariables() routes RUTBA_WEB__API_WIRE_MODE → app-specific
   → buildEnvForApp() strips the prefix, child env gets API_WIRE_MODE=short
   → also exports RUTBA_TARGET_APP=RUTBA_WEB into child env

3. load-env.js spawns the scaffolder (one-shot, line 148-163)
   → scaffolder reads process.env.API_WIRE_MODE === 'short'
   → reads process.env.RUTBA_TARGET_APP === 'RUTBA_WEB'
   → emits short-variant wrappers into packages/api-provider/.generated/RUTBA_WEB/client/

4. load-env.js spawns the app command (next dev)
   → app code imports from '@rutba/api-provider/client'
   → api-provider's exports map / resolver reads RUTBA_TARGET_APP
   → resolves to .generated/RUTBA_WEB/client/
   → bundler picks up the short-variant tree
   → no per-app bundler config touched
```

Every decision is made **once**, at the boundary where the context is already known. No runtime branching anywhere — not in generated source, not in `lib/api.js`, not in bundler config.

### Sequence

1. Phase 0 audit (scoped to `api/web/`) → punch list.
2. Closed-shape sweep + `args` schemas on `api/web/*.js` descriptors. Old shape still works.
3. Scaffolder gains the per-app emit + variant branch. `load-env.js` exports `RUTBA_TARGET_APP`. Drops the cross-app `RUTBA_API_SCAFFOLDED=1` short-circuit. api-provider's exports map / resolver resolves `client` per app.
4. Codec middleware + descriptor bundle land in `strapi-api-pro`. Both routes (`/api/*` long, `/api-pro/x/*` short) accept traffic. Env var defaults to `long` everywhere.
5. **Flip `RUTBA_WEB__API_WIRE_MODE=short`** in workspace `.env`. Restart rutba-web. Verify in Strapi console that no long-form public-role traffic remains.
6. **Deny long-form for the public role** on Strapi side (permissions or middleware) — this is the actual security win per §"Why public-first". Authenticated roles still hit long-form for pos/cms.
7. Later phases: repeat the sweep for pos and cms descriptors, flip their per-app env vars, then deny long-form globally and retire the legacy path.

## Out of scope

- Compressing the `args` payload further (operator codes, base64 packs). Not needed — once shapes are out of the URL, what remains is small and bounded.
- Versioning of short names. Names are derived from the descriptor; renaming a descriptor is a breaking change at every layer simultaneously (deliberate).
- The existing `api-provider/pos` layer ([[project_api_provider_pos_anti_pattern]]) — move-to-pos-shared work remains a separate follow-up.

## Pointers

- Existing architecture this amends: [[project-api-provider-named-policy-architecture]]
- Context-resolution chain (load-env, prefix split, scaffolder one-shot): [scripts/js/load-env.js](scripts/js/load-env.js), [scripts/js/env-utils.js](scripts/js/env-utils.js)
- Existing client serialization to replace: [packages/api-provider/lib/api.js](packages/api-provider/lib/api.js) `querify()`, [providers/generated/client/___core__.js](packages/api-provider/providers/generated/client/___core__.js) `withQuery()`
- Existing server interception (downstream of new codec): [packages/strapi-api-pro/server/src/services/request-interceptor.js](packages/strapi-api-pro/server/src/services/request-interceptor.js)
- Scaffolder to extend: [packages/api-provider/scripts/scaffold-endpoint-providers.mjs](packages/api-provider/scripts/scaffold-endpoint-providers.mjs)
- Bootstrap registration point for the new middleware: [packages/strapi-api-pro/server/src/bootstrap.js](packages/strapi-api-pro/server/src/bootstrap.js)
- Public-client surface scope (which descriptors emit unauth `api`): [[project_api_provider_web_public_client]]
