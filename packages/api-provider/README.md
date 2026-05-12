# @rutba/api-provider — Knowledge Base

The **single source of truth** for every Strapi-backed endpoint, domain, and role across the Rutba ERP monorepo. It's a plain JS package (not a Strapi plugin); other packages and apps import from it.

Three responsibilities:

1. **Domain + role registry** — `config/domains.json` and `config/roles.json` enumerate all RBAC tiers across the system.
2. **Endpoint descriptors** — `api/*.js` files declare every Strapi endpoint the ERP exposes, with the (method, path, action, params, body, role grants) shape needed by both the front-ends and the `strapi-api-pro` plugin's seeder.
3. **Generated client proxies** — `scripts/scaffold-endpoint-providers.mjs` reads the `api/*.js` descriptors and emits typed JS proxies under `providers/generated/client/` that wrap each method with `executeEndpoint(authApi, methodName, descriptor)` for callers.

## Identity

- Package name: `@rutba/api-provider`
- Type: workspace package (`packages/api-provider/`), private, ESM
- Strapi-bridge: `server/access-guard/` (an ESM facade + the CJS resource walker)

## Layout

```
packages/api-provider/
├── package.json
├── index.js                          # public entry: re-exports config + helpers
├── analyze-cleanup.js                # one-off codemod helper (rarely touched)
├── utils.js                          # internal helpers
├── config/
│   ├── domains.json                  # { [domainKey]: { roles: [roleKey, ...] } }
│   ├── roles.json                    # { [roleKey]: { level, domain } }
│   ├── configuration.json            # serialized aggregate (generated)
│   └── configuration.source.js       # config loader; exported as `@rutba/api-provider/config`
├── api/                              # ENDPOINT DESCRIPTORS — see api/CLAUDE.md
│   ├── index.js
│   ├── __publish_generic_helper.js
│   ├── cash-register-transactions.js # one file per Strapi content-type / resource
│   ├── hr-employees.js
│   ├── (50+ more)
│   └── web/                          # public web endpoints (no auth required)
├── client/                           # public web-facing client wrappers
├── endpoints/                        # legacy entry — being replaced by providers/
├── providers/
│   └── generated/
│       └── client/                   # GENERATED — do not hand-edit
├── lib/                              # api + auth helpers used by generated proxies
│   └── api.js                        # authApi + executeEndpoint
├── pos/                              # POS-specific orchestrations
├── server/
│   └── access-guard/
│       ├── index.js                  # ESM facade — exports buildAccessGuardProPayload(strapi)
│       └── build-resources.cjs       # CJS resource walker (uses dynamic import for ESM api files)
└── scripts/
    ├── scaffold-endpoint-providers.mjs   # main generator
    ├── scaffold__core__.js               # generator template
    ├── scaffold__client_core__.js
    ├── scaffold__property_mapper__.js
    ├── combine-endpoints.js
    ├── generate-configuration.js
    ├── split-configuration.js
    ├── join-configuration.js
    ├── clean-api-transport.mjs
    ├── remove-api-async-helpers.mjs
    ├── validate-exports.mjs
    └── validate-web-proxies.mjs
```

## Build & validate

```bash
# From this package
npm run scaffold:endpoint-providers   # regenerates providers/generated/client/*.js from api/*.js
npm run validate                       # validate:exports + validate:web-proxies
npm run build                          # scaffold + validate
```

The scaffold script is incremental and idempotent. Run it whenever an `api/*.js` file changes.

## Package.json exports (what consumers can import)

```
"."                  → index.js (default), storage.js, api.js
"./config"           → config/configuration.source.js
"./config/domains"   → config/domains.json
"./config/roles"     → config/roles.json
"./endpoints"        → endpoints/index.js (legacy)
"./endpoints/*"      → providers/generated/client/*  (generated typed wrappers)
"./api/*"            → api/* (raw descriptor files)
"./client"           → client/index.js
"./pos"              → pos/index.js
"./lib/*"            → lib/*
"./server/access-guard" → server/access-guard/index.js
```

The package.json **does NOT export `./package.json`**. Don't rely on `require.resolve('@rutba/api-provider/package.json')` — it will throw `ERR_PACKAGE_PATH_NOT_EXPORTED`. Resolve via a known sub-path instead (e.g. `require.resolve('@rutba/api-provider/config/domains')` then `path.dirname(path.dirname(...))` to recover the package root). The strapi-api-pro seeder does exactly this.

## Domains and roles

`config/domains.json` — 18 entries:

```json
{
  "accounts":           { "roles": ["accounts_admin", "accounts_manager", "accounts_staff"] },
  "accounts-ap":        { "roles": ["ap_admin", "ap_manager", "ap_staff"] },
  "auth":               { "roles": ["auth_admin", "auth_manager", "auth_staff"] },
  "cms":                { "roles": ["cms_admin", "cms_manager", "cms_staff"] },
  "crm":                { "roles": ["crm_admin", "crm_manager", "crm_staff"] },
  "hr":                 { "roles": ["hr_admin", "hr_manager", "hr_staff"] },
  "sale":               { "roles": ["sale_admin", "sale_manager", "sale_staff"] },
  "stock":              { "roles": ["stock_admin", "stock_manager", "stock_staff"] },
  "web-public":         { "roles": ["web_public"] },
  "web-authenticated":  { "roles": ["web_user"] },
  ... (18 total)
}
```

`config/roles.json` — ~60 entries:

```json
{
  "accounts_admin":   { "level": "admin",   "domain": "accounts" },
  "hr_staff":         { "level": "staff",   "domain": "hr" },
  "web_user":         { "level": "user",    "domain": "web-authenticated" },
  ... (60 total)
}
```

`level` values: `admin` | `manager` | `staff` | `user` | `public`. Used by `build-resources.cjs::expandGrants` to filter the domain's roles down to those matching the endpoint's declared `meta.roles`.

## Integration with strapi-api-pro

The `strapi-api-pro` plugin's seeder (`services/seeder.js`) **reads this package directly** at every Strapi boot:

1. `require.resolve('@rutba/api-provider/config/domains', { paths: [strapi.dirs.app.root] })` → derives the package root via `path.dirname(path.dirname(...))`.
2. Loads `config/domains.json` and `config/roles.json` directly via `fs.readFileSync` (CJS).
3. Walks `api/*.js` using `import(pathToFileURL(...))` (the api files are ESM, the seeder is CJS).
4. For each exported endpoint set, processes each method via `inferAction` / `expandGrants` (porting the logic from `server/access-guard/build-resources.cjs`).
5. Upserts everything into `api_pro_app_domains`, `api_pro_app_roles`, `api_pro_interfaces`, `api_pro_interface_methods`, `api_pro_method_policies`.

On a fresh DB the seed produces **18 domains · 50 roles · 25 interfaces · 162 methods · 1013 policies**.

The seeder is idempotent — re-running upserts by stable keys (`domain.key`, `role.key`, `interface.key`, `${interfaceKey}:${methodName}`, `${interfaceKey}:${methodName}:${roleKey}`).

## buildAccessGuardProPayload

`server/access-guard/index.js` exports a Strapi-aware helper:

```js
const { buildAccessGuardProPayload } = require('@rutba/api-provider/server/access-guard');

const payload = await buildAccessGuardProPayload(strapi);
// payload.domains    — domains config map
// payload.roles      — roles config map
// payload.resources  — { [contentTypeUid]: { [`${modelName}.${action}`]: { policies: [{ key, grants: [roleKey] }] } } }
```

Originally consumed by the legacy AGP data-transfer service. **The current strapi-api-pro seeder doesn't use this function** — it does its own walk so it can capture HTTP method + path per descriptor (not just role grants). The function is retained for backward compatibility.

## Generated client wrappers

`scripts/scaffold-endpoint-providers.mjs` reads each `api/<resource>.js` file and emits `providers/generated/client/<resource>.js`. Each exported method gets wrapped:

```js
// providers/generated/client/cash-register-transactions.js (excerpt)
import { authApi } from '../../../lib/api.js';
import { executeEndpoint } from './___core__.js';
import { CashRegisterTransactionEndpoints as Source } from '../../../api/cash-register-transactions.js';

async function byRegister(...args) {
  return executeEndpoint(authApi, 'byRegister', Source.byRegister(...args));
}
```

`executeEndpoint` (in `lib/api.js`) issues the HTTP call with the auth context, the `x-rutba-app` and `x-rutba-app-role` headers (populated by the consuming app), and returns the response.

## Validation scripts

- `validate:exports` — checks every `api/*.js` exports `meta.uid` and that all method functions return well-formed descriptors.
- `validate:web-proxies` — checks `client/` web endpoints align with the underlying descriptors.

Run `npm run validate` after touching anything under `api/`.

## When to touch what

| Want to... | Edit |
|---|---|
| Add a new content-type endpoint set | `api/<resource>.js` then `npm run scaffold:endpoint-providers` |
| Add a new domain or role | `config/domains.json` and/or `config/roles.json`; re-seed strapi-api-pro |
| Change which roles can access an endpoint method | The method's `apps` and `approle` arrays in `api/<resource>.js` |
| Re-generate client wrappers | `npm run scaffold:endpoint-providers` |
| Bootstrap strapi-api-pro DB tables | Strapi boot triggers `pos-strapi/src/seed/api-provider-seed.js` which calls the plugin's seeder; or `POST /api-pro/admin/seed` from the admin UI |

## Quirks

- `api/*.js` files are **ESM** (`export const Endpoints = {...}`). The seeder + build-resources use `import(pathToFileURL(...))` to load them from CJS contexts. Node logs a warning `MODULE_TYPELESS_PACKAGE_JSON` on each import — harmless, but adding `"type": "module"` to this package.json would silence it.
- Async functions exported from `api/` files are **skipped** by `inferAction` / the seeder walker (heuristic: `value.constructor?.name === 'AsyncFunction'`). Use sync arrow functions that return descriptor objects.
- `endpoints/` is the LEGACY entry path. New code should import from `providers/generated/client/*` (typed proxies) or `api/*` (raw descriptors).
