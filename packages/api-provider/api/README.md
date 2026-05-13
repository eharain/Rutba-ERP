# api/ â€” Endpoint Descriptor Convention

This directory holds the **endpoint descriptor source** for every Strapi-backed resource in the ERP. Each file is a thin manifest that says, for one content-type:

- Which Strapi content-type UID it targets
- Which apps/domains and which role levels can hit it
- For each method (find/findOne/create/update/delete/custom): the HTTP method, path, default params, and per-method app/role overrides

Two consumers read this directory:

1. **`scripts/scaffold-endpoint-providers.mjs`** â€” emits typed JS client wrappers under `providers/generated/client/` so app code can call `byRegister(documentId)` etc. without rebuilding the URL.
2. **`api-pro/services/seeder.js`** â€” walks each file, infers `(uid, action, method, path, grants)`, and upserts rows into `api_pro_interfaces`, `api_pro_interface_methods`, `api_pro_method_policies`.

Anything you put here ends up in BOTH the generated client AND the plugin's seeded policy rows.

## File convention

One file per Strapi resource (roughly one per content-type), kebab-cased to match the resource path:

- `cash-register-transactions.js` â†’ exposes the `/cash-register-transactions` resource
- `hr-employees.js` â†’ `/hr-employees`
- `cms-pages.js` â†’ `/cms-pages`

`web/` is a sub-folder for **public web endpoints** (no auth) â€” kept separate so `pos-strapi/config/plugins.js` can auto-derive `bypassPaths` from this subset only.

`index.js` re-exports all sibling files.

`__publish_generic_helper.js` is a build-time helper, not an endpoint set â€” files starting with `_` are skipped by the seeder walker.

## File shape

ESM (`export const`). Pattern:

```js
/**
 * <ResourceName>Endpoints
 * Pure endpoint descriptors for the /<resource> resource.
 */
export const CashRegisterTransactionEndpoints = {

  meta: {
    uid: 'api::cash-register-transaction.cash-register-transaction',
    domains: ['accounts', 'sale', 'accounts-ar', 'accounts-ap'],
    roles: ['admin', 'manager', 'staff']
  },

  // â”€â”€ Methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Each method is an arrow function that returns a descriptor object.

  create: (data) => ({
    path: '/cash-register-transactions',
    action: 'create',
    method: 'post',
    apps: ['sale'],                          // domains where this method is callable
    approle: ['admin', 'manager', 'staff'],  // role LEVELS allowed (filtered by domain via roles.json)
    data,
  }),

  byRegister: (registerDocumentId, { page = 1, pageSize = 500, sort } = {}) => ({
    path: '/cash-register-transactions',
    action: 'find',
    method: 'get',
    apps: ['sale'],
    approle: ['admin', 'manager', 'staff'],
    params: {
      filters: { cash_register: { documentId: { $eq: registerDocumentId } } },
      sort: sort ?? ['transaction_date:asc'],
      pagination: { page, pageSize },
    },
  }),
};
```

## The `meta` block

| Field | Required | Notes |
|---|---|---|
| `uid` | yes | The Strapi content-type UID (`api::<dir>.<name>` or `plugin::*`). Used as the default if a method doesn't override + as the seeded `api_pro_interfaces.uid`. |
| `domains` | recommended | Default `apps:` for every method in the file. Domain keys must exist in `config/domains.json`. |
| `roles` | recommended | Default `approle:` for every method. Role LEVELS (admin/manager/staff/user/public) â€” NOT role keys. The seeder filters each domain's roles by these levels via `config/roles.json`. |

If a single file genuinely targets multiple content-types (rare â€” usually a CRM file with several closely-related types), each method can override `uid:` in its descriptor.

## Method descriptor shape

Method functions return an object with this shape. All fields except `path` are optional:

| Field | Type | Notes |
|---|---|---|
| `path` | string | required. Strapi route path; supports `:tokens` and `${tokens}` |
| `method` | string | http verb, lowercase: `get` `post` `put` `patch` `delete`. Inferred from the method name if omitted. |
| `action` | string | strapi action: `find` `findOne` `create` `update` `delete` `publish` `unpublish` etc. Inferred from name + method + path. |
| `apps` | string[] | overrides meta.domains for THIS method only |
| `approle` | string[] | overrides meta.roles for THIS method only |
| `scope` | object | Per-role server-side scope for this policy. See **Per-role scope** below. |
| `params` | object | Strapi query params (filters / populate / sort / pagination / fields). Becomes the URL `?` portion. |
| `data` | any | Body for POST/PUT/PATCH. Pass through verbatim. |

## Per-role scope

Vocabulary (matches the api-pro plugin's DB tables):

- **Interface** â€” this descriptor file (one Strapi content-type).
- **Policy** â€” each method (`list`, `byId`, `create`, `update`, ...). Methods ARE policies.
- **Context** â€” runtime inputs to a policy. Assembled from client headers/body/params AND server user/db state. The policy resolver applies $-tokens against this shared context.

A `scope` block declares, per role level, how to scope a policy's reads/writes. Place it inside each policy that needs scoping (preferred), or at `meta.scope` as a file-wide fallback. Policy-level `scope` wins over `meta.scope`.

```js
// Hoist the per-role scope once per file so every policy can reference it.
const ROLE_SCOPES = {
  admin: {},     // unrestricted
  manager: {},   // unrestricted
  staff: {
    scope: 'owner+recency',
    ownerField: 'opened_by',     // optional â€” defaults to 'createdBy'
    recencyField: 'opened_at',   // optional â€” defaults to 'createdAt'
    recencyToken: '$last7days',  // optional â€” defaults to '$last7days'
  },
};

list: () => ({
  path: '/cash-registers',
  action: 'find',
  apps: ['sale'],
  approle: ['admin', 'manager', 'staff'],
  scope: ROLE_SCOPES,
  params: { ... },
}),
```

**Shorthand `scope` values inside a level block:**

| Value | Effect |
|---|---|
| `'none'` (or omitted) | No filter â€” unrestricted. |
| `'owner'` | find/findOne/update/delete: `{ ownerField: { id: { $eq: '$user.id' } } }`. create: stamps `{ ownerField: '$user.id' }` in body. |
| `'owner+recency'` | `owner` filter plus a recency filter on `find` only (findOne/update/delete stay ownership-only â€” single-row lookups already target a specific id). |
| `'recency'` | Recency filter only, applied to `find`. |

For finer control, replace `scope:` with literal templates (`filters`, `body`, `populate`, `query`) â€” they layer over the shorthand. Recency tokens supported by the resolver: `$last1day`, `$last7days`, `$last30days`, `$todayStart`, `$today`, `$now`.

The Policy Editor (Comparative View) in the api-pro plugin shows each role's effective filter side-by-side per (interface Ã— method), so admin/staff differences are visible at a glance.

## Method name conventions (drive `inferAction`)

`build-resources.cjs::inferAction` derives the `action` from the method name when not explicit:

| If method name contains... | Inferred action |
|---|---|
| `publish` (without `unpublish`) | `publish` |
| `unpublish` | `unpublish` |
| `delete` or just `del` | `delete` |
| `update`, or starts with `put` | `update` |
| `create`, or starts with `post` | `create` |
| `byid` or `findone` | `findOne` |
| `list`, `search`, `find` | `find` |
| (fallback: derived from HTTP verb + path) | â€” |

The seeder skips methods whose names don't match any of `^(list|by|get|find|search|create|update|del|delete|remove|publish|unpublish|archive|unarchive|assign|process|open|close|transfer|validate|shipping|tracking|messages|send)` â€” so keep the prefix conventional.

Async functions are also skipped by the walker (heuristic). Use plain `(args) => ({...})` arrow functions.

## Grant expansion (how `approle` â†’ role keys)

For each method, the seeder computes `grants` (the role keys to write policies for) by:

1. Taking `apps` (or falling back to `meta.domains`).
2. Taking `approle` (or falling back to `meta.roles`).
3. For each `(domain, level)` pair:
   - Look up `domains.json[domain].roles` â†’ list of role keys
   - For each role key, look up `roles.json[roleKey].level`
   - Keep the role key when its level is in the `approle` list (or `approle` is empty)
4. The resulting set of role keys gets one policy row each in `api_pro_method_policies`.

Example for the `byRegister` descriptor above:
- `apps: ['sale']`
- `approle: ['admin', 'manager', 'staff']`
- `domains.json['sale'].roles = ['sale_admin', 'sale_manager', 'sale_staff']`
- All three roles are at levels admin/manager/staff respectively â†’ all three roles get a policy row.

For a method with `apps: ['accounts', 'sale']` and `approle: ['admin']`, only the `_admin` role keys from BOTH domains get policy rows.

## What the seeder writes

Per `(uid, action)` pair, the seeder upserts:

- One row in `api_pro_interfaces` (key = sanitized uid)
- One row in `api_pro_interface_methods` (key = `${interfaceKey}:${methodName}`)
- One row in `api_pro_method_policies` PER grant role (key = `${interfaceKey}:${methodName}:${roleKey}`)

Policy templates (`filtersTemplate`, `populateTemplate`, `bodyTemplate`, `queryTemplate`) are derived from each method's `scope:` block (or `meta.scope` fallback) â€” see **Per-role scope** above. Admin/manager default to empty (unrestricted) when no block is present; staff defaults to empty too unless the descriptor opts in.

Admins can override the seeded defaults in the plugin's Method Editor (Comparative View) â€” once they save a row, `templateVersion` bumps past 1 and subsequent boot-time seeds preserve the customised templates.

The `params:` field is for the GENERATED CLIENT only â€” it's what gets sent on the wire when the front-end calls the method.

## Path tokens

Two equivalent token formats are supported in `path`:

```js
path: '/cms-footers/:documentId'           // Strapi style
path: `/cms-footers/${documentId}`         // template-literal style â€” params injected at call time
```

The `scaffold-endpoint-providers.mjs` validator (`alignSignature`) ensures the path tokens match the method function's argument names. Mismatches show up in the plugin's Interfaces page under the "Alignment Playground" panel.

## Skipping a path

The build-resources walker skips paths beginning with `/upload` (Strapi's media upload endpoint â€” handled by the upload plugin). If you need to add another opt-out, edit `build-resources.cjs::buildResourcesFromApiProviderSource`.

## Adding a new descriptor file

1. Create `api/<resource>.js`. Follow the shape above.
2. Add an export to `api/index.js` if other consumers import from there.
3. From the package: `npm run scaffold:endpoint-providers` â€” generates the corresponding client wrapper under `providers/generated/client/`.
4. Restart `pos-strapi` (or hit `POST /api-pro/admin/seed`) to seed the new interface/methods/policies into the plugin's DB.

## Quirks to remember

- Files are ESM. The seeder (CJS) loads them with `import(pathToFileURL(...))`. Node prints `MODULE_TYPELESS_PACKAGE_JSON` warnings â€” harmless.
- `meta.uid` must exist in `strapi.contentTypes`. If the UID doesn't resolve, the seeder skips that method silently (logged as a warning). Add the content-type to pos-strapi first, then add the descriptor file.
- `apps` and `approle` arrays are CASE-SENSITIVE and must match `config/domains.json` / role levels exactly.
- Helper / non-endpoint functions in a file (anything whose name doesn't match the regex above) are also fine to define â€” they just won't be picked up by the seeder. Use this for internal `buildPayload`-style helpers.
