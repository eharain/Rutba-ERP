# strapi-api-pro — Complete Plugin Specification (v1)

> **Purpose of this document**
> This is the authoritative rebuild specification. Nothing should be coded until the developer has read and understood every section. All prior Codex-built code under `packages/strapi-api-pro` has been deleted. Start from an empty directory.

---

## 1. What the plugin does — plain English

`strapi-api-pro` (plugin id: `api-pro`) is a **developer-facing Strapi 5 admin plugin** that lets a backend developer:

1. **Record** live Strapi API calls in the browser / Postman and save them as "API Recordings".
2. **Convert** recordings (or create manually) into typed **API Interfaces** — a structured description of a Strapi route with its path, method, accepted query params, filters, populate, and body fields.
3. **Scaffold** TypeScript client code from those interfaces (stored as flat files, not in DB).
4. **Author Policies** per interface method — JSON templates that use context variables (`{{user.id}}`, `{{claim.roleKey}}`, etc.) to build dynamic `filters`, `populate`, `fields`, and body restrictions.
5. **Compare policies** side-by-side across different **API Roles** so a developer can see exactly what role A vs role B is allowed to do on each method.
6. **Manage API Roles** (grouped under **API Domains**) and assign them to Strapi users — replacing the old `api-guard-pro` plugin entirely.
7. Expose a runtime **context-validation middleware** and a **`/me/permissions`** endpoint so client apps can bootstrap their access maps.

The plugin stores everything **in files** (YAML/JSON under a configurable path) **except** recordings, which are stored in the Strapi database.

---

## 2. Terminology map (AGP → API-Pro)

| AGP term | API-Pro term | DB / file model |
|---|---|---|
| Resource | API Interface | file |
| Resource Method | Interface Method | file |
| Method Policy | Method Policy | file |
| Role | API Role | `plugin::api-pro.app-role` |
| Domain | API Domain | `plugin::api-pro.app-domain` |
| Recording | API Recording | `plugin::api-pro.recording-session` + `plugin::api-pro.recording-entry` |
| `api_guard_roles` on User | `app_roles` on User | many-to-many relation injected into `users-permissions.user` |

---

## 3. Repository layout

```
packages/strapi-api-pro/
├── package.json
├── strapi-admin.js          # re-export: ./dist/admin/index.mjs
├── strapi-server.js         # re-export: ./dist/server/index.js
├── scripts/
│   └── ensure-dist-package-json.cjs   # post-build: writes dist/server/package.json
├── admin/
│   └── src/
│       ├── index.js         # plugin admin entry
│       ├── components/
│       │   └── PluginIcon.jsx
│       └── pages/
│           ├── App.jsx              # router root
│           ├── Recordings.jsx
│           ├── Interfaces.jsx
│           ├── InterfaceDetail.jsx
│           ├── Policies.jsx
│           ├── Roles.jsx
│           └── Users.jsx
└── server/
    └── src/
        ├── index.js
        ├── config/index.js
        ├── content-types/
        │   ├── app-domain/schema.json
        │   ├── app-role/schema.json
        │   ├── recording-session/schema.json
        │   └── recording-entry/schema.json
        ├── controllers/
        │   ├── recordings.js
        │   ├── interfaces.js
        │   ├── roles.js
        │   └── users.js
        ├── services/
        │   ├── recordings.js
        │   ├── interfaces.js     # file-backed CRUD + scaffold
        │   ├── policies.js       # file-backed CRUD
        │   ├── policy-resolver.js
        │   ├── scaffold.js       # TypeScript client generator
        │   └── users.js
        ├── routes/
        │   └── index.js
        ├── middlewares/
        │   └── context-validator.js
        └── bootstrap.js
```

---

## 4. Content-types (database)

### 4.1 `plugin::api-pro.app-domain`

```json
{
  "kind": "collectionType",
  "collectionName": "api_pro_app_domains",
  "info": { "singularName": "app-domain", "pluralName": "app-domains", "displayName": "API Domain" },
  "attributes": {
    "name":        { "type": "string", "required": true },
    "domainKey":   { "type": "uid", "targetField": "name", "required": true },
    "description": { "type": "text" },
    "appRoles":    { "type": "relation", "relation": "oneToMany", "target": "plugin::api-pro.app-role", "mappedBy": "appDomain" }
  }
}
```

### 4.2 `plugin::api-pro.app-role`

```json
{
  "kind": "collectionType",
  "collectionName": "api_pro_app_roles",
  "info": { "singularName": "app-role", "pluralName": "app-roles", "displayName": "API Role" },
  "attributes": {
    "name":      { "type": "string", "required": true },
    "roleKey":   { "type": "uid", "targetField": "name", "required": true },
    "appName":   { "type": "string", "required": true },
    "appDomain": { "type": "relation", "relation": "manyToOne", "target": "plugin::api-pro.app-domain", "inversedBy": "appRoles" },
    "users":     { "type": "relation", "relation": "manyToMany", "target": "plugin::users-permissions.user", "mappedBy": "app_roles" }
  }
}
```

### 4.3 Inject `app_roles` into `users-permissions.user`

In `server/src/bootstrap.js`, after Strapi loads, extend the user schema:

```js
// do NOT redeclare schema; only patch the attributes map at runtime
strapi.contentType('plugin::users-permissions.user').attributes.app_roles = {
  type: 'relation',
  relation: 'manyToMany',
  target: 'plugin::api-pro.app-role',
  inversedBy: 'users',   // NOT mappedBy — user owns the relation
};
```

> **Rule**: Never put `app_roles` in a `schema.json` override. Always do it programmatically in `bootstrap.js` so there is only one declaration.

### 4.4 `plugin::api-pro.recording-session`

```json
{
  "kind": "collectionType",
  "collectionName": "api_pro_recording_sessions",
  "attributes": {
    "label":     { "type": "string" },
    "status":    { "type": "enumeration", "enum": ["recording","stopped"], "default": "recording" },
    "startedAt": { "type": "datetime" },
    "stoppedAt": { "type": "datetime" },
    "entries":   { "type": "relation", "relation": "oneToMany", "target": "plugin::api-pro.recording-entry", "mappedBy": "session" }
  }
}
```

### 4.5 `plugin::api-pro.recording-entry`

```json
{
  "kind": "collectionType",
  "collectionName": "api_pro_recording_entries",
  "attributes": {
    "session":     { "type": "relation", "relation": "manyToOne", "target": "plugin::api-pro.recording-session", "inversedBy": "entries" },
    "method":      { "type": "string" },
    "path":        { "type": "string" },
    "queryParams": { "type": "json" },
    "requestBody": { "type": "json" },
    "responseBody":{ "type": "json" },
    "statusCode":  { "type": "integer" },
    "recordedAt":  { "type": "datetime" }
  }
}
```

---

## 5. File storage

All API Interfaces, Interface Methods, and Method Policies are stored as JSON files under:

```
{strapiRoot}/.api-pro/
├── interfaces/
│   └── {interfaceId}.json      # one file per interface
└── policies/
    └── {interfaceId}/
        └── {methodId}/
            └── {roleKey}.json  # one file per (interface × method × role)
```

### Interface file schema

```jsonc
{
  "id": "cms-footer",
  "contentType": "api::cms-footer.cms-footer",
  "label": "CMS Footer",
  "methods": [
    {
      "id": "find",
      "label": "Find",
      "httpMethod": "GET",
      "path": "/cms-footers",
      "acceptedQueryParams": ["filters", "populate", "fields", "pagination", "sort"],
      "signature": "find({ filters, populate, fields, pagination } = {})"
    },
    {
      "id": "findOne",
      "label": "Find One",
      "httpMethod": "GET",
      "path": "/cms-footers/:documentId",
      "acceptedQueryParams": ["populate", "fields"],
      "signature": "findOne(documentId, { populate, fields } = {})"
    }
  ],
  "generatedAt": "2025-01-01T00:00:00.000Z"
}
```

> **Route-token alignment rule**: Any path segment like `:documentId` or `${documentId}` MUST exactly match the corresponding function parameter name. The interface service must enforce this and report mismatches as validation errors, not silently fix them.

### Policy file schema

```jsonc
{
  "interfaceId": "cms-footer",
  "methodId": "findOne",
  "roleKey": "web_user",
  "filters": { "publishedAt": { "$notNull": true } },
  "populate": "{{input.populate}}",
  "fields": ["title", "links"],
  "bodyAllowList": [],
  "bodyDenyList": ["internalNotes"],
  "strict": true
}
```

---

## 6. Server API routes

All routes are under `/api-pro` prefix and require `isAuthenticated` + an admin-role check except where noted.

| Method | Path | Controller | Purpose |
|---|---|---|---|
| GET | `/api-pro/recordings` | recordings.list | List recording sessions |
| POST | `/api-pro/recordings/start` | recordings.start | Start a new session |
| POST | `/api-pro/recordings/:id/stop` | recordings.stop | Stop a session |
| GET | `/api-pro/recordings/:id/entries` | recordings.entries | List entries for a session |
| POST | `/api-pro/recordings/:id/convert` | recordings.convert | Convert session to interface |
| GET | `/api-pro/interfaces` | interfaces.list | List all interface files |
| GET | `/api-pro/interfaces/:id` | interfaces.findOne | Get one interface |
| POST | `/api-pro/interfaces` | interfaces.create | Create interface manually |
| PUT | `/api-pro/interfaces/:id` | interfaces.update | Update interface |
| DELETE | `/api-pro/interfaces/:id` | interfaces.delete | Delete interface file |
| GET | `/api-pro/interfaces/:id/scaffold` | interfaces.scaffold | Get generated TS client code |
| GET | `/api-pro/policies/:interfaceId/:methodId` | policies.list | List policies for a method (all roles) |
| PUT | `/api-pro/policies/:interfaceId/:methodId/:roleKey` | policies.upsert | Save policy for role |
| DELETE | `/api-pro/policies/:interfaceId/:methodId/:roleKey` | policies.delete | Remove policy file |
| GET | `/api-pro/roles` | roles.list | List app-roles with domain |
| POST | `/api-pro/roles` | roles.create | Create app-role |
| PUT | `/api-pro/roles/:id` | roles.update | Update app-role |
| DELETE | `/api-pro/roles/:id` | roles.delete | Delete app-role |
| GET | `/api-pro/domains` | roles.listDomains | List app-domains |
| POST | `/api-pro/domains` | roles.createDomain | Create app-domain |
| PUT | `/api-pro/domains/:id` | roles.updateDomain | Update app-domain |
| DELETE | `/api-pro/domains/:id` | roles.deleteDomain | Delete app-domain |
| GET | `/api-pro/users` | users.list | List Strapi users with app_roles |
| PUT | `/api-pro/users/:id/roles` | users.assignRoles | Assign app_roles to user |
| GET | `/api-pro/me/permissions` | users.mePermissions | Public (authenticated) — user's effective permissions |

---

## 7. Policy resolver (runtime)

`server/src/services/policy-resolver.js` exposes a single function:

```ts
resolvePolicyTemplate(template: unknown, context: PolicyContext): unknown
```

`PolicyContext` shape:

```ts
{
  strapi: { request: { method: string; path: string } };
  user:   { id: number; email: string };
  claim:  { appName: string; roleKey: string; domainKey: string };
  input:  { id?: string; fields?: string[]; populate?: Record<string, unknown> };
}
```

Token syntax: `{{token.path}}` anywhere inside a string value.  
Rules:
- Walk the template recursively (arrays and objects).
- For each string value, replace all `{{x.y.z}}` tokens using the context.
- If a token resolves to `null | undefined` → replace with `""` in lenient mode, throw in strict mode.
- If a token resolves to an object → `JSON.stringify(value)`.
- Non-string values (numbers, booleans, arrays, objects) are returned unchanged.

---

## 8. Context-validator middleware

`server/src/middlewares/context-validator.js`

When any registered API-Pro protected route is called:
1. Extract `ctx.state.user` (from Strapi's `isAuthenticated`).
2. Populate `app_roles` on the user from DB.
3. Extract the `X-App-Name` header (or `claim.appName` from JWT payload if present).
4. Find the matching app-role for that user + app combination.
5. Attach `ctx.state.apiProClaim = { appName, roleKey, domainKey }`.
6. Resolve policy template for the matched role and attach to `ctx.state.apiProPolicy`.
7. If no matching role and strict mode is on → 403.

---

## 9. `/me/permissions` endpoint

`GET /api/api-pro/me/permissions` — requires `isAuthenticated`.

Response shape (backward-compatible with AGP):

```jsonc
{
  "domains": [{ "domainKey": "web-authenticated", "label": "Web" }],
  "appRoles": [{ "roleKey": "web_user", "appName": "web-user", "domainKey": "web-authenticated" }],
  "permissions": {
    "cms-footer": {
      "find":    { "allowed": true, "policy": { "filters": { "publishedAt": { "$notNull": true } } } },
      "findOne": { "allowed": true, "policy": { "fields": ["title"] } }
    }
  },
  "sessionTimeout": 3600
}
```

---

## 10. Admin UI — page-by-page specification

> Use only stable `@strapi/design-system` v2 exports. Do **not** import `GridItem`, `Grid`, or any `@strapi/icons` symbol that is not present in the installed version. Use `Box`, `Flex`, `Typography`, `Button`, `Textarea`, `TextInput`, `Select`, `Option`, `Badge`, `Table`, `Thead`, `Tbody`, `Tr`, `Th`, `Td`, `Modal`, `ModalHeader`, `ModalBody`, `ModalFooter`, `ModalLayout`, `Checkbox`, `Loader`, `Alert`, `Status` only. Verify each import compiles before building the page.

### 10.1 Navigation (sidebar)

Five menu items in order:
1. **Recordings** → `/plugins/api-pro/recordings`
2. **API Interfaces** → `/plugins/api-pro/interfaces`
3. **Policies** → `/plugins/api-pro/policies`
4. **Roles & Domains** → `/plugins/api-pro/roles`
5. **Users** → `/plugins/api-pro/users`

### 10.2 Recordings page

Layout:
- Header row: title "API Recordings" | `[▶ Start Recording]` button.
- Table of sessions: columns → Label | Status (badge: recording=green, stopped=grey) | Started | Stopped | Actions.
- Actions per row: **Stop** (if recording), **View Entries**, **Convert to Interface**.
- "View Entries" opens a side-drawer showing a table of entries: Method | Path | Status Code | Recorded At | expand row to show request/response JSON.
- "Convert to Interface" opens a modal with an interface ID field (pre-filled from path slug) and a checkbox list of entries to include, then calls `POST /api-pro/recordings/:id/convert`.

### 10.3 API Interfaces page

Layout:
- Header: "API Interfaces" | `[+ New Interface]`.
- Card grid of interfaces. Each card shows: label, contentType, method count, `[Edit]` `[Scaffold]` `[Delete]`.
- "Scaffold" downloads / shows a modal with the generated TypeScript client code (`GET /api-pro/interfaces/:id/scaffold`).
- "New Interface" and "Edit" open `InterfaceDetail` page.

### 10.4 Interface Detail page

Sections:
1. **Metadata** — id (readonly after create), label, contentType (text field).
2. **Methods** — table: Method ID | HTTP Method | Path | Signature | `[Edit]` `[Remove]`.
   - "Add Method" opens an inline form / modal: id, label, httpMethod (select), path, acceptedQueryParams (tags input), and an auto-generated signature preview that updates live.
   - Signature preview rule: path tokens like `:documentId` become required function args; query params become a destructured options object.
   - If a path token name does not match a function param → show inline red warning "Token `:documentId` not in signature".
3. **Save** button at the top-right.

### 10.5 Policies page

This is the most important page. It has two distinct sub-views selectable by a tab strip:

#### Tab A — Policy Editor

- Left panel: tree of Interfaces → Methods. Click a method to load it in the right panel.
- Right panel header: `{Interface} / {Method}` | Role selector dropdown (lists all app-roles).
- Right panel body: a **split editor**: left half = "Policy Template JSON" (Textarea, editable), right half = "Resolved Preview" (readonly pre block, auto-updated on every keypress using sample context).
- Below the editor: **Token reference** table — columns: Token | Example Value | Description. Pre-populated from sample context.
- Save button: `PUT /api-pro/policies/:interfaceId/:methodId/:roleKey`.

#### Tab B — Comparative View

- Top: Interface selector, Method selector.
- Body: one column per app-role (all roles for selected interface/method). Each column shows:
  - Role name + domain badge at top.
  - Resolved policy fields: filters, populate, fields, bodyAllowList, bodyDenyList.
  - Differences from the first column are highlighted in amber.
- This view is **read-only**. It loads all policy files for the selected method and renders them side by side.

### 10.6 Roles & Domains page

Split layout: left = Domains panel, right = Roles panel.

**Domains panel**:
- List of domains, each with domainKey badge, name, description.
- `[+ New Domain]` → inline form: name, domainKey (auto-slug from name, editable), description.
- Each domain row has `[Edit]` `[Delete]`.
- Deleting a domain warns "X roles belong to this domain" if any.

**Roles panel**:
- Grouped by domain (accordion or grouped list).
- Each role row: name | roleKey badge | appName | `[Edit]` `[Delete]`.
- `[+ New Role]` → modal: name, roleKey, appName, Domain (select from domains list).
- Edit opens same modal pre-filled.

### 10.7 Users page

This page is a **faithful port of the AGP Users page** from `D:\Rutba\strapi-plugins\strapi-api-guard-pro\admin\src\pages\Users`.

Layout:
- Header: "API Users".
- Search bar (filter by email/username).
- User list table: columns → Name | Email | Confirmed | Active | App Roles (comma-separated badges).
- Click a row → right-side drawer/panel opens with:
  - User details (avatar, name, email, confirmed, active).
  - **App Roles** section: grouped by domain (accordion). Each role is a checkbox. Checked = assigned.
  - `[Save Roles]` button → `PUT /api-pro/users/:id/roles` with array of role IDs.
- The role checkboxes must show the current assignment state fetched from `GET /api-pro/users` (which populates `app_roles`).

---

## 11. TypeScript client scaffold format

`GET /api-pro/interfaces/:id/scaffold` returns a JSON object `{ code: string }` where `code` is a TypeScript module string following this pattern:

```ts
// Auto-generated by strapi-api-pro — do not edit manually
import type { StrapiClient } from '../client';

export function cmsFooterApi(client: StrapiClient) {
  return {
    find: ({ filters, populate, fields, pagination } = {}) =>
      client.get('/cms-footers', { params: { filters, populate, fields, pagination } }),

    findOne: (documentId: string, { populate, fields } = {}) =>
      client.get(`/cms-footers/${documentId}`, { params: { populate, fields } }),
  };
}
```

Rules for the generator (`server/src/services/scaffold.js`):
- Derive function name from `{camelCase(interfaceId)}Api`.
- For each method: derive args from path tokens + acceptedQueryParams.
- Path tokens → required positional args typed as `string`.
- Query params → optional destructured object arg.
- HTTP method → `client.get | client.post | client.put | client.delete`.
- Replace `:paramName` in path with `` `${paramName}` `` in template literal.

---

## 12. Build setup

### `package.json` (key fields)

```json
{
  "name": "@rutba/strapi-api-pro",
  "version": "0.1.0",
  "strapi": {
    "name": "api-pro",
    "displayName": "API Pro",
    "description": "API interface builder, policy engine, and role manager for Strapi 5."
  },
  "exports": {
    "./strapi-admin": "./dist/admin/index.mjs",
    "./strapi-server": "./dist/server/index.js"
  },
  "main": "./strapi-server.js",
  "scripts": {
    "build": "strapi-plugin build && node scripts/ensure-dist-package-json.cjs",
    "watch": "strapi-plugin build --watch"
  },
  "peerDependencies": {
    "@strapi/strapi": "^5.0.0"
  }
}
```

### `scripts/ensure-dist-package-json.cjs`

```js
const fs = require('fs');
const path = require('path');
const target = path.join(__dirname, '..', 'dist', 'server', 'package.json');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('[api-pro] dist/server/package.json written');
```

### `strapi-admin.js`

```js
'use strict';
module.exports = require('./dist/admin/index.mjs');
```

### `strapi-server.js`

```js
'use strict';
module.exports = require('./dist/server/index.js');
```

---

## 13. `pos-strapi` integration

### `pos-strapi/config/plugins.js`

```js
module.exports = ({ env }) => ({
  'api-pro': {
    enabled: true,
    resolve: '../../packages/strapi-api-pro',
    config: {
      storageDir: '.api-pro',        // relative to strapi root
      strictPolicies: false,
      sessionTimeout: 3600,
    },
  },
  'users-permissions': {
    config: {
      register: { allowedFields: ['app_roles'] },
    },
  },
});
```

### `pos-strapi/src/extensions/users-permissions/strapi-server.js`

Must:
1. Register custom routes for `GET /api/users-permissions/me/permissions` pointing to the API-Pro `mePermissions` controller.
2. After user registration (`register` lifecycle), assign the default `app-role` (roleKey = `web_user`, appName = `web-user`) if it exists.
3. Do **not** touch any AGP imports.

---

## 14. Implementation order (recommended)

1. Scaffold empty plugin with `package.json`, `strapi-admin.js`, `strapi-server.js`, `scripts/ensure-dist-package-json.cjs`.
2. Add content-types (app-domain, app-role, recording-session, recording-entry) — run `npm run build` and verify Strapi loads.
3. Add `bootstrap.js` that injects `app_roles` into user schema.
4. Implement server routes + controllers + services for **Recordings** only — verify with Postman.
5. Implement **Interfaces** file service + scaffold service — verify file read/write.
6. Implement **Policy** file service + policy-resolver — unit test the resolver in isolation.
7. Implement **Roles & Domains** CRUD endpoints.
8. Implement **Users** list + role assignment endpoints.
9. Implement `me/permissions` endpoint.
10. Build admin UI pages in order: Recordings → Interfaces → InterfaceDetail → Roles → Users → Policies (Editor tab first, Comparative tab last).
11. Wire `pos-strapi` integration and verify end-to-end boot.

---

## 15. Must-not-do list (lessons from the failed Codex build)

- ❌ Do not import `GridItem` or `Grid` from `@strapi/design-system` — it is not exported in v2.
- ❌ Do not import any `@strapi/icons` symbol without first verifying it exists at runtime with `console.log(require('@strapi/icons'))`.
- ❌ Do not declare `app_roles` in both a `schema.json` override AND `bootstrap.js` — pick one (bootstrap.js only).
- ❌ Do not patch any `pos-strapi` file without reading it fully first — partial patches cause syntax errors.
- ❌ Do not reference a service (`plugin::api-pro.data-transfer`) that does not exist.
- ❌ Do not run `npm install` in `pos-strapi` to add new dependencies to the plugin — use `resolve` path only.
- ❌ Do not write `dist/server/package.json` manually — use the post-build script so it survives every rebuild.
- ❌ Do not produce placeholder pages — every page listed in section 10 must be fully functional before the plugin is considered done.

---

## 16. Acceptance criteria

The plugin is done when:

- [ ] `npm run build` in `packages/strapi-api-pro` succeeds with zero errors.
- [ ] `npm run dev:strapi` in `pos-strapi` starts and the admin loads the plugin menu with all 5 items.
- [ ] A developer can start a recording, make API calls, stop the recording, and convert it to an interface.
- [ ] The Interface Detail page shows methods with live signature preview and inline route-token mismatch warnings.
- [ ] The Policies page (Editor tab) resolves sample context tokens live and saves the policy to a file.
- [ ] The Policies page (Comparative tab) shows all roles' policies for a selected method side by side.
- [ ] The Roles & Domains page supports full CRUD for both domains and roles.
- [ ] The Users page shows all Strapi users with their current app_roles and allows reassignment exactly like the AGP Users page.
- [ ] `GET /api/api-pro/me/permissions` returns the correct payload for an authenticated user.
- [ ] `pos-strapi` boots cleanly with no AGP references and no missing-service errors.
