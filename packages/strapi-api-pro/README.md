# strapi-api-pro — Plugin Knowledge Base

A Strapi 5 admin plugin that replaces `api-guard-pro` across the Rutba ERP monorepo. Provides per-(content-type × action × role) policy authoring backed by a `.api-pro/` file-store + DB mirror, a runtime Koa interceptor that resolves `$user.id`-style tokens and injects role-scoped filters into every authenticated request, and an admin UI with five tabs (Recordings, Interfaces, Policies, Domains & Roles, Users).

The historical spec at `acees-guard-pro-replacment-strapi-api-pro.md` is a v1 sketch only. Where it conflicts with this document, **this document is authoritative.**

## Identity & loading

- Package name: `strapi-api-pro`
- `strapi.name` (used as the config key and `plugin::api-pro.*` content-type namespace): **`api-pro`**
- Installed in `pos-strapi` via `"strapi-api-pro": "file://../packages/strapi-api-pro"` (symlinked into node_modules)
- **Do NOT set `resolve:` in `pos-strapi/config/plugins.js`.** Setting it to a directory breaks Strapi 5's server loader (path-doubling: `<plugin>/dist/server/dist/server/index.js`). Setting it to `package.json` breaks the admin loader (which expects a directory). Auto-discovery via the file: dep sidesteps both. The `config: {…}` block applies via `applyUserConfig` regardless.

## Layout

```
packages/strapi-api-pro/
├── package.json                # strapi.name="api-pro", kind="plugin"
├── strapi-admin.js             # re-export dist/admin/index.mjs
├── strapi-server.js            # re-export dist/server/index.js
├── scripts/ensure-dist-package-json.cjs   # post-build: writes {"type":"commonjs"} to dist/server
├── admin/src/
│   ├── index.js                # admin entry — addMenuLink registers the Shield icon
│   ├── components/
│   │   ├── PluginIcon.jsx      # INLINE SVG (Vite can't cross the symlink to @strapi/icons)
│   │   └── QueryBuilders/
│   │       ├── tokens.js       # constants only — KEEP JSX-free so Vite parses as .js
│   │       ├── TypeBadge.jsx   # split out of tokens.js for the same reason
│   │       ├── FiltersBuilder.jsx     # AND/OR tree, 14 operators, $-token-friendly values
│   │       ├── PopulateBuilder.jsx    # dot-path list → Strapi populate object/array
│   │       └── KeyValueEditor.jsx     # flat key:value rows with auto-coerce
│   └── pages/
│       ├── App.jsx             # tab shell + lifted state (currentPage + policiesSelection for deep-link)
│       ├── Recordings.jsx      # start/stop sessions + Capture filters form (methods, paths, CT UIDs)
│       ├── Interfaces.jsx      # grouped by content-type family + expandable cards → methods → role policy chips → deep-link
│       ├── Policies.jsx        # BrowseTree (interface→method tree) → MethodEditor (comparative role columns) → PlayModal
│       ├── DomainsRoles.jsx    # CRUD for domains + roles, Re-seed button
│       └── Users.jsx           # Strapi users with app_roles assignment (faithful AGP port)
└── server/src/
    ├── index.js                # lifecycle exports
    ├── register.js             # calls extendUserRelation
    ├── bootstrap.js            # LRU cache, strapi.apiPro registry, global interceptor mount, syncAll(), lifecycle invalidation hooks
    ├── config.js               # defaults; pos-strapi overrides headerDomainKey/headerRoleKey/bypassPaths/domains
    ├── destroy.js
    ├── content-types/
    │   ├── app-domain/         # api_pro_app_domains
    │   ├── app-role/           # api_pro_app_roles; extendUserRelation injects app_roles into users-permissions.user
    │   ├── api-interface/      # file = source of truth, DB = mirror
    │   ├── api-interface-method/
    │   ├── api-method-policy/  # filtersTemplate / populateTemplate / bodyTemplate / queryTemplate (json columns)
    │   ├── recording-session/  # has `filters` json field (HTTP methods, path patterns, CT UIDs)
    │   └── recording-entry/    # written by the recorder middleware (NOT YET IMPLEMENTED)
    ├── controllers/
    │   ├── me.js               # public /me/permissions
    │   ├── policies.js         # list / findOne / upsert / remove + findForMethod / bulkUpsertForMethod
    │   ├── admin-tools.js      # POST /admin/seed
    │   ├── play.js             # POST /play (Play-as-role)
    │   └── (recordings, interfaces, users, domains, health)
    ├── services/
    │   ├── context.js          # resolveClaim from x-rutba-app + x-rutba-app-role headers
    │   ├── policy-resolver.js  # $-syntax: $user.id / $today / $now / $claim.* / $query.* / $params.* / $body.*
    │   ├── permission-engine.js# getPolicyForActionAndRole (one row per claim), 30s LRU cache
    │   ├── request-interceptor.js  # runtime: claim → policy → resolve → inject into ctx
    │   ├── me-permissions.js   # response includes rolesByApp for the client's role-selector menu
    │   ├── file-store.js       # atomic JSON read/write under .api-pro/
    │   ├── sync.js             # file → DB upsert; runs syncAll() at boot
    │   ├── policies.js         # file-first CRUD; bulk per-method endpoints (Comparative Editor)
    │   ├── scaffold.js         # TS client generator (Interfaces "Scaffold" modal)
    │   ├── scaffold-runner.js  # alignment linter (route :tokens vs method signature)
    │   ├── seeder.js           # runFullSeed: walks @rutba/api-provider → upserts domains/roles/interfaces/methods/policies
    │   ├── play.js             # dry-run + real-fetch for Play-as-role
    │   └── (users, recordings, interfaces)
    ├── routes/index.js         # content-api (/me/permissions) + admin (full CRUD + bulk + /play + /admin/seed)
    ├── middlewares/
    │   └── app-context.js      # per-route claim middleware — NOT applied to admin routes; only for content-api gating
    └── policies/index.js       # empty export (Strapi requires it)
```

## Build & run

```bash
# From the plugin dir
npm run build            # strapi-plugin build + ensure-dist-package-json.cjs
npm run watch            # live rebuild

# From the monorepo root
npm run dev:strapi       # starts pos-strapi with the plugin loaded
# Then visit http://localhost:4010/admin → click the Shield icon "Strapi API Pro"
```

## Frozen design decisions

1. **The plugin is generic.** It knows nothing about HR teams, cash registers, branches, etc. End-developers write filter templates that reference their own schema paths (`{ branch: { id: { $eq: "$user.branch.id" } } }`). The plugin only resolves `$`-tokens at request time.

2. **File = source of truth, DB = runtime mirror.**
   - `.api-pro/interfaces/{key}.json` — interface + method definitions
   - `.api-pro/policies/{interfaceKey}/{methodKey}/{roleKey}.json` — one file per (method × role)
   - DB tables `api_pro_interfaces`, `api_pro_interface_methods`, `api_pro_method_policies` are populated from the files via `services/sync.syncAll()` at boot AND from per-write sync after CRUD mutations.
   - Domains, roles, and recordings are DB-only.

3. **Claim model: explicit role selection (no elevation).**
   - Client sends `x-rutba-app: <domainKey>` AND `x-rutba-app-role: <roleKey>`.
   - Server validates both against `user.app_roles` for the active domain.
   - When the user holds exactly one role for the active app, the role header is optional (auto-selected).
   - **No more `x-rutba-app-admin` elevation** — admin access is just another role the user can pick from the menu. The config key is retained as a no-op for backward compat.
   - `ctx.state.apiProClaim = { appName, roleKey, domainKey, domainKeys }`.

4. **Token syntax: `$user.id`, NOT `{{user.id}}`.** $-syntax matches AGP and the resolver. Mustache was in the v1 spec but never adopted.

5. **One claimed role = one policy.** No multi-policy merge. If a user needs broader access, they switch roles via the UI menu (rolesByApp on `/me/permissions`).

6. **Permission cache.** 30s LRU on `strapi.apiPro.cache`, keyed `u:{userId}:r:{roleKey}:p:{contentTypeUid}:{actionName}`. Lifecycle hooks on app-role / app-domain / method-policy mutations call `clearAll()`. Manual clearing: `strapi.apiPro.clearCache(userId)` or `clearAllCache()`.

## Seeding

`pos-strapi/src/seed/api-provider-seed.js` calls `strapi.plugin('api-pro').service('seeder').runFullSeed(strapi)` on every Strapi boot. The seeder reads `@rutba/api-provider/config/{domains,roles}.json` and `@rutba/api-provider/api/*.js` descriptors. Output on a fresh DB: 18 domains, 50 roles, 25 interfaces, 162 methods, 1013 policies.

Re-seed on demand: `POST /api-pro/admin/seed` (button on Domains & Roles page).

See `../api-provider/CLAUDE.md` for the source-of-truth shape and `../api-provider/api/CLAUDE.md` for the descriptor convention.

## /me/permissions response

Consumed by `pos-shared/context/AuthContext.js` across every ERP frontend app:

```js
{
  role,                                                  // Strapi role.name
  roleType,                                              // Strapi role.type
  domains: [{ key, name, roleKey }, ...],                // one per (domain × role) pair
  appRoles: [{ id, key, name }, ...],                    // every role the user holds
  rolesByApp: { [appDomainKey]: [{ key, name }, ...] },  // grouped → drives the role-selector menu
  permissions: { [contentTypeUid]: { [action]: { allowed, policies } } },
  strapiPermissions: [...],                              // pass-through of role.permissions
  sessionTimeout                                          // seconds
}
```

## Comparative Method Editor (the centerpiece)

Policies tab → Browse → click any method → **Method Editor** opens:

- **One column per role** configured for the method. Each column has independent FiltersBuilder / PopulateBuilder / KeyValueEditor for the four template fields, with a per-builder "raw JSON" toggle.
- Live `$`-token resolved preview under every builder against `SAMPLE_CONTEXT`.
- "Add policy for role" dropdown adds a new column with empty templates. "×" marks a column for deletion (Undo recovers it).
- **Save All** writes the whole `{ [roleKey]: templates }` payload in one bulk call via `PUT /api-pro/policies/method/:interfaceKey/:methodKey`. Dirty-state detection gates the button.

## Play as role

`POST /api-pro/play` body:
```json
{
  "interfaceKey": "cash-register",
  "methodName": "byRegister",
  "roleKey": "manager",
  "actAsUserId": 42,
  "documentId": null,
  "pathParams": {},
  "queryParams": {},
  "bodyData": {}
}
```

Returns `{ method, tokenContext, resolved, finalQuery, response, executed, executionError }`.

- For `find` / `findOne` with a real `api::*.*` UID: executes `strapi.documents(uid).findMany(...)` or `.findOne(...)` with the resolved query.
- For mutations: returns ONLY the resolved templates — no DB writes. Preview-only.
- `actAsUserId` impersonates any DB user; default = current admin.

Reachable from the **▶ Play** button on every role column in the Method Editor.

## Known limitations (not implemented yet)

- **Recorder middleware** — recording-sessions can be started/stopped and filters are persisted on the session, but no Koa middleware writes `recording-entry` rows during a session. The Recordings UI shows this hint when an open session has no entries.
- **Schema-aware autocomplete** in the QueryBuilders — users type field paths manually. An endpoint exposing `strapi.contentTypes[<uid>].attributes` would let the FiltersBuilder path input become a dropdown.
- **pos-shared role-selector menu** — the server reads `x-rutba-app-role`, but `pos-shared/context/AuthContext.js` still only sends `x-rutba-app`. Needs a UI menu where the user picks their active role from `rolesByApp[currentApp]` and the client persists/sends the selection.
- **Recordings → interface conversion** — `services/interfaces.createFromRecordings` creates an empty interface; doesn't yet group session entries by (method, normalized path) and synthesize methods.

## pos-strapi integration contract (load-bearing)

- `pos-strapi/config/plugins.js` declares `api-pro: { enabled: true, config: {...} }` — NO `resolve` key (auto-discovery handles it).
- `pos-strapi/src/extensions/users-permissions/strapi-server.js` mounts the plugin's register lifecycle to inject `app_roles` into the user schema and auto-assigns the `web_user` app-role to newly registered users.
- `pos-strapi/src/index.js` bootstrap calls `strapi.apiPro.registerRoleProvider(...)` with `pos-strapi/src/utils/hr-role-provider.js` to merge `hr_*` team roles into a user's effective permissions.

## Common questions

| Question | Where to look |
|---|---|
| Why won't my plugin load? | `pos-strapi/config/plugins.js` must NOT have `resolve:` for api-pro. |
| Why is the sidebar icon missing? | Vite can't cross the symlink for `@strapi/icons`. `admin/src/components/PluginIcon.jsx` must use inline SVG. |
| Why are admin routes returning 400? | The `plugin::api-pro.appContext` middleware was attached. Admin routes are Strapi-auth-gated; don't add the claim middleware to them. |
| How do I add a new admin endpoint? | Add a controller under `server/src/controllers/`, register it in `controllers/index.js`, add a route in `routes/index.js` under the `admin` surface. Call it from React with `useFetchClient()` and `get('/api-pro/<path>')`. |
| How is runtime enforcement actually wired? | `bootstrap.js` mounts a global Koa middleware. For each non-bypassed path: `request-interceptor.process(ctx, strapi)` resolves the claim, fetches the role's policy, resolves templates, injects into ctx. Denies on `denyByDefault && noPolicy`. |
| Where do role providers (HR team roles) plug in? | `strapi.apiPro.registerRoleProvider(fn)` — fn receives `(user, { strapi })` and returns extra role-key strings. Called from `me-permissions.js` when building `/me/permissions`. |

## Branch & commit history

Recent commits relevant to this plugin (most recent first):

- `f98057e` — Interfaces drill-into-policies + Play as role
- `5403781` — grouped interfaces + comparative method editor + recording filters
- `77ba573` — visual builders for policy templates
- `a2d3a01` — seeder + explicit role-claim + paginated admin UI
- `4723401` — pos-strapi wire-up + HR roleProvider + resolve-path fix
- `f310e27` — initial AGP runtime parity + file-based authoring + admin UI

See `git log -- packages/strapi-api-pro/` for the full history.
