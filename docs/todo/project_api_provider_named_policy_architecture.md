---
name: project-api-provider-named-policy-architecture
description: "The bigger api-provider architectural target discussed before the runtime-error cleanup — server-side named query policies driven by descriptors, isomorphic client/server interface, scaffoldStrapiHandlers as request transformers"
metadata: 
  node_type: memory
  type: project
  originSessionId: fcd105ef-dfd6-48f9-a4bd-3519a8356db4
---

> **STATUS BLOCK — what's actually true now (supersedes the design narrative below).**
>
> The architectural **goals** in this doc were achieved, but via a **different mechanism** than the design it describes. Read this block first; treat the rest of the doc as a design record, not a description of the current system.
>
> - **`meta.scope` / `ROLE_SCOPES` — ✅ DONE (via seeder + interceptor).** Per-role scope is authored in the descriptors using a shorthand (`owner` / `recency` / `owner+recency`) plus optional literal `filters`/`body`/`populate`/`query` overrides — see the `ROLE_SCOPES` const and the `scope:` field on every method in `packages/api-provider/api/sale-orders.js`. This is the canonical role-bound filter source described in follow-up #2 below. **DONE.**
> - **Scope expansion happens in the SEEDER, not in generated handlers.** `packages/strapi-api-pro/server/src/services/seeder.js` reads each descriptor's `meta.scope` and per-method `scope`, expands the shorthand (`expandScopeShorthand` / `buildTemplatesFromLevelBlock` / `templatesForRole`), and writes `{filters,populate,body,query}Template` rows into the `api_method_policies` DB table. Admin-tuned policies (`templateVersion > 1`) are preserved across reseeds.
> - **Additive enforcement + `$user.*` resolution happen in the REQUEST-INTERCEPTOR, not in per-entity handlers.** `packages/strapi-api-pro/server/src/services/request-interceptor.js` looks up the single policy for (contentTypeUid, action, claimed role), resolves `$user.*` / `$last7days` tokens against the live request, and **additively** merges the resolved filter/populate/body/query fragment into `ctx.query` / `ctx.request.body`. This covers follow-up #4 ($user.* resolution). **DONE.**
> - **`scaffoldStrapiHandlers` → `providers/generated/server/<entity>.js` — NOT BUILT, and largely MOOT.** The headline design of this doc (generating a per-entity Strapi policy file from each descriptor) was never built. There is no `providers/generated/server/` directory, no `scaffoldStrapiHandlers`, and no `policies.json` reflection dump. The interceptor + seeder pair covers the entire purpose of that design (DB-row-driven, single interception point), so this piece is not just unbuilt — it is superseded and need not be built.
> - **Follow-up #1 (descriptor signature sweep) and #6 (`validate-strapi-alignment.mjs`) — SUPERSEDED / NOT BUILT.** The signature sweep was overtaken by the wire-codec closed-shape rule (see the amendment note below) and the `listParams`/`byIdParams` builders in `api/__param_builders.js`; `validate-strapi-alignment.mjs` does not exist in `packages/api-provider/scripts/` and was never built.
> - **DEAD CODE to delete.** `packages/api-provider/providers/createStrapiProxy.js` is a no-op passthrough (it just returns `{ key, ep, args }` and is never wired into Strapi), and the `*Server` exports in `packages/api-provider/server/index.js` (`AccAccountsServer`, `SaleOrdersServer`, … all built via `createStrapiProxy`) are vestigial — nothing on the Strapi side consumes them now that enforcement lives in the interceptor. Both are deletion candidates.
>
> Everything below is preserved as the original design discussion. Where it conflicts with this block, this block wins.

The api-provider monorepo (`packages/api-provider`) is converging on an architecture the user laid out across the long pre-execution discussion (turns up to "I have given you the picture, now eliminate the client runtime errors"). The runtime-error cleanup that followed is a tactical subset; this memory captures the bigger picture so future sessions can pick up the architectural work without re-deriving it.

> **AMENDMENT (2026-05-14) — closed-shape rule.** The earlier framing in this doc allows the client developer to pass `populate`/`fields`/`filters`/`sort` per call (the `param ?? [defaults]` pattern). That escape hatch is now **closed**: the descriptor method owns the shape, callers pass only declared variables, and any variation requires a new method or an enum parameter. The full rationale, wire format, and migration plan live in [[project-api-provider-wire-codec]]. Sections of this doc that conflict with the closed-shape rule (notably "The client/server split" → "Client developer owns" bullets, the example descriptor signatures with `{ populate, fields, … } = {}`, and §"Settled design decisions" item on parameter visibility) are **superseded** by the codec doc. Everything else here — isomorphic descriptor, additive server enforcement, `meta.scope`, scaffoldStrapiHandlers, strict rollout, identity requirements — stands.

**Why:** User explicitly walked through this design in detail, ending with "I have given you the picture at this point I want to eliminate the client runtime errors." That redirect made the typo-elimination work the immediate priority, but the user wants the full architecture eventually. Re-deriving it would be wasted cycles.

**How to apply:** When asked about the api-provider future direction, the named-policy dispatcher, scaffoldStrapiHandlers, or "out of the way" handlers — this is the agreed shape. Treat as the target architecture for new descriptor work and any Strapi-side policy code in `strapi-api-pro`. Do **not** re-propose alternatives the user already ruled out (a `/_call/:policyId` dispatch route, GraphQL persisted operations, or a two-surface cohabitation rollout).

## The core principle: isomorphic interface, divergent binding

The `/api/<entity>.js` descriptor file is the *only* authored source per entity. Both `/client/<entity>.js` and `/server/<entity>.js` are generated specializations of it — same method names, same JSDoc/types, only the binding differs:

- **Client context**: calling `EntityEndpoints.method(args)` → HTTP request with the full Strapi query shape the developer explicitly declared. The client developer has total transparency over what they're fetching (sort/populate/fields/filters/pagination/status).
- **Server context**: incoming HTTP request → a generated Strapi-side handler enforces **auth and scoping** based on the active role/user — it does *not* rewrite the developer's query shape. Then `await next()`; Strapi's normal controller chain runs.

The wire stays Strapi's existing REST routes — no `/_call/:policyId` dispatcher, no GraphQL layer.

## The client/server split — corrected from the initial draft

The earlier framing said the client sends "thin whitelisted params" and the server "injects filters/fields/populate per role." That's wrong about which side owns query shape. The split is:

**Server-side handler owns (the end-user-role boundary):**
- Auth (is the JWT valid? what's the role?)
- Scope filters (the `staff` role only sees rows where `createdBy = $user.id` and `createdAt > now() - 7d`, per [[project_authorization_model]])
- Ownership locks on custom actions (`ctx.params.id` must match `$user.rider.id` for `acceptDeliveryOffer`)
- Relation visibility (the role can't see `customer.phone` regardless of what populate they pass — strip from response, not request)

**Client developer owns (the calling-developer boundary):**
- Sort order, populate depth, field selection, filters by domain logic, pagination
- Status (`draft` vs `published`) — the developer decides which version they need
- Anything Strapi's REST surface natively exposes that doesn't intersect with the role-bound concerns above

So `populate: { featured_image: true, gallery: true }` lives on the descriptor where the developer can see it and reason about it — not hidden inside a server-side policy block.

## scaffoldStrapiHandlers (NOT built — superseded by the seeder + interceptor; see status block)

> This section is moot. The seeder (`strapi-api-pro/server/src/services/seeder.js`) materializes the scope templates into DB policy rows and the request-interceptor (`strapi-api-pro/server/src/services/request-interceptor.js`) does the additive merge at request time. The per-entity generated policy file below was never built and is not needed. `createStrapiProxy` is now dead code, not a placeholder to replace.

Replaces the existing `createStrapiProxy` placeholder. For each descriptor it generates a Strapi policy that:

1. Reads the request ctx and resolves the active role (via X-Rutba-App-Role per [[project_pos_strapi_contracts]] and [[project_role_switcher_ui_convention]]).
2. Looks up the descriptor's `meta.scope[role]` (or method-level scope override) — the **role-bound** filter contributions.
3. Merges those scope filters into `ctx.query.filters` with an AND of the client-sent filters, resolving `$user.*` tokens per [[feedback_policy_token_syntax]].
4. Optionally restricts `populate` / `fields` based on role-bound relation visibility (e.g. staff can't populate `costPrice`).
5. `await next()` — Strapi's normal controller chain runs.

The defense is **additive** (server adds restrictive filters/locks) not **subtractive** (server replaces client's shape). A hand-crafted URL with `populate[secretRel]` gets stripped if `secretRel` isn't role-allowed; everything else flows through.

## Descriptor shape (target)

```js
export const CmsPagesEndpoints = {
    meta: {
        uid: 'api::cms-page.cms-page',
        domains: [...],
        roles: ['admin', 'manager', 'staff', 'public', 'user'],
        scope: {
            // Role-bound filter contributions enforced server-side. Per
            // [[project_authorization_model]] this is the layer the client
            // developer cannot override — auth, ownership, recency, etc.
            admin: {},
            staff: { scope: 'owner+recency', ownerField: 'createdBy', recencyField: 'createdAt' },
        },
    },
    listPublished: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        // Full Strapi query surface — developer-explicit. Defaults are
        // descriptor-authored fallbacks, not server-injected magic.
        path: '/cms-pages',
        method: 'get',
        params: {
            status: 'published',
            pagination: { page, pageSize: pageSize ?? 200 },
            sort: sort ?? ['sort_order:asc', 'createdAt:desc'],
            populate: populate ?? ['featured_image', 'background_image'],
            ...(filters ? { filters } : {}),
            ...(fields ? { fields } : {}),
        },
    }),
    bySlug: (slug, { populate, fields } = {}) => ({
        path: '/cms-pages',
        method: 'get',
        params: {
            filters: { slug: { $eq: slug } },
            populate: populate ?? { /* the rich default tree */ },
            fields: fields ?? ['title', 'slug', 'content', /* ... */],
        },
    }),
};
```

Each method exposes the full Strapi query surface in its destructured signature so the scaffolder picks it up verbatim in the `.d.ts` and the developer always knows what they can pass. Hardcoded values become `param ?? [defaults]` fallbacks — the scaffolder parses these inline; if a body is too clever to parse, fall back to a per-method `defaults: {...}` metadata field.

## Settled design decisions (already aligned with the user)

- **Client developer owns query shape; server enforces auth/scope** — see "The client/server split — corrected from the initial draft" above. `populate`/`fields`/`sort`/`filters`/`pagination`/`status` are explicit on the descriptor signature. Role boundaries (ownership, recency, restricted relations) are enforced server-side **additively** — not by rewriting the developer's request.
- **Canonical list params shape** — every `list*` method takes `({ page, pageSize, sort, populate, filters, fields } = {})`. Every `byId*` takes `(documentId, { populate, fields } = {})`. Hardcoded values become `param ?? [defaults]` fallbacks so the scaffolder picks the default up at codegen time.
- **Naming convention** — files/exports stay plural (mirrors Strapi REST: `/products`, `/sale-orders`). Method names follow record cardinality naturally: `list`/`listPaged` for multi, `get(id)`/`create`/`update`/`remove` for single.
- **System files** — `__`-prefixed filenames (e.g. `__publish_generic_helper.js`) are system helpers, skipped by validator. (Spread helpers are now resolved by the scaffolder — see [[feedback_strapi_api_pro_admin_routes_auth_false]] for adjacent gotchas.)
- **Identity for every `/api` file** — must declare one of: `meta.uid: 'api::<slug>.<slug>'`, `meta.uid: 'plugin::<plugin>.<resource>'`, `meta.controllerActions: ['rider.find', ...]`, or `meta.routes: ['/auth/local', ...]`. No anonymous files.
- **Strapi hook layer** — policies, not middlewares. Policies have the cleaner accept/reject + ctx-mutation surface and match strapi-api-pro's existing authorship UX.
- **Action-tier source of truth** — validate custom method action names against `pos-strapi/src/api/<slug>/routes/*.js` (the route is what's actually exposed; controller-with-no-route is dead code).
- **Generated server file location** — `packages/api-provider/providers/generated/server/<entity>.js`. Imported by `strapi-api-pro`, not authored inside it. Keeps codegen colocated with the descriptors.
- **Codegen artifact** — scaffolder emits a `policies.json` (or `_map.json`) reflection dump consumed by strapi-api-pro at boot. Build-time, not runtime descriptor import.
- **Parameter visibility** — every Strapi query knob the developer might use is named in the descriptor's destructured signature, so the `.d.ts` exposes the full surface. JSON-Schema validation on top of that is a future option (would mostly cover shape-correctness rather than role-bound restrictions, which live in `meta.scope`).
- **Rollout posture** — strict no mercy per [[feedback-strict-rollout-no-warn-phase]]. No two-surface cohabitation, no warn-only validators.

## What's currently in place (after the typo-cleanup turn)

- `.d.ts` sidecars per descriptor with real method signatures (parsed parameter names + destructure patterns).
- `strictEndpointGuard` Proxy wraps every generated `endpoints` object; unknown member access throws `UnknownEndpointMemberError` with diagnostic listing valid members.
- `validate-endpoint-usage.mjs` CI gate parses .d.ts member sets, greps consumer files, hard-fails on unknown access.
- `rewrite-legacy-alias-calls.mjs` codemod swept ~430 call sites from legacy verb-prefixed aliases (`postCreate`, `fetchById`, etc.) to canonical descriptor names. Legacy alias generation removed from scaffolder.
- Scaffolder handles `...__publish_generic_helper(name)` spread injection (5 methods: updateDraft/publish/unpublish/create/del).
- Scaffolder handles multi-export files (`customers.js`, `sale-items.js`, `sale-return-items.js`) by preferring `*Endpoints` over `*EndpointRules`.
- pos-shared package.json `exports` map got `.js` fallback array for `moduleResolution: bundler` resolution.
- jsconfig.json with `checkJs: true` rolled out to rutba-rider, pos-auth, pos-sale, pos-stock, packages/pos-shared.

## What's still ahead (the bigger work)

1. ~~**Descriptor signature sweep**~~ — **SUPERSEDED / NOT BUILT.** Overtaken by the wire-codec closed-shape rule and the `listParams`/`byIdParams` builders in `api/__param_builders.js`; the canonical-full-shape design was abandoned.
2. ~~**`meta.scope` field**~~ — **✅ DONE (via seeder + interceptor).** Authored as `meta.scope` / per-method `scope` (shorthand `owner`/`recency`/`owner+recency` + optional literal templates) on descriptors like `api/sale-orders.js`; expanded by the seeder into DB policy rows. This is now the canonical role-bound filter source.
3. ~~**scaffoldStrapiHandlers**~~ — **NOT BUILT, and MOOT.** Its purpose (DB-row-driven additive enforcement) is fully covered by the seeder + request-interceptor pair. No `providers/generated/server/` dir, no codegen of per-entity policies.
4. ~~**Token resolution layer**~~ — **✅ DONE (via interceptor).** `$user.*` / `$last7days` token resolution lives in `request-interceptor.js` (`resolver.buildTokenContext` + `resolvePolicyTemplates`), `$`-prefix per [[feedback_policy_token_syntax]].
5. **Custom action route locking** — handlers lock `ctx.params.id` for ownership-bound actions (e.g. rider accepting a delivery offer can only act on offers assigned to `$user.rider.id`). (Still open — the interceptor injects filters/body, but per-action `ctx.params.id` ownership locks are not generically modeled.)
6. ~~**Strapi-alignment validator**~~ — **SUPERSEDED / NOT BUILT.** No `validate-strapi-alignment.mjs` exists in `packages/api-provider/scripts/`; this validator was never authored.
7. **Retire `createClientProxy.js` legacy proxy** — once the inline-generation scaffolder (per [[feedback-scaffolder-inline-generation]]) covers all paths, the runtime URL builder + legacy alias dispatch is dead.
8. **api-provider/pos refactor** — per [[project_api_provider_pos_anti_pattern]] this directory shouldn't exist; pos-specific helpers move to pos-shared. Not done yet.
9. **Pre-existing `lib/http-client.js` and similar legacy lib files** — get cleaned up as part of the broader architecture migration.

## Pointers

- Existing descriptor source of truth: `packages/api-provider/api/*.js`
- Existing client codegen output: `packages/api-provider/providers/generated/client/`
- ~~Existing (placeholder) server codegen target: `packages/api-provider/providers/generated/server/`~~ — **never built and not planned.** `packages/api-provider/providers/createStrapiProxy.js` is **dead code** (no-op passthrough), not a placeholder; the `*Server` exports in `packages/api-provider/server/index.js` are vestigial. Server-side enforcement actually lives in `packages/strapi-api-pro/server/src/services/{seeder,request-interceptor}.js`.
- Scaffolder: `packages/api-provider/scripts/scaffold-endpoint-providers.mjs`
- strapi-api-pro plugin: per [[reference_agp_location]] pointer, owns the policy-authorship and enforcement surface that the generated handlers will register into.
