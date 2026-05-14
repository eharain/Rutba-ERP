# Site Settings: singleType → collectionType (per-app)

## Goal
Convert `site-setting` from a Strapi `singleType` to a `collectionType` so each app
(pos, cms, admin, etc.) can have its own site settings record, looked up by
documentId.

## Current state
[pos-strapi/src/api/site-setting/content-types/site-setting/schema.json](pos-strapi/src/api/site-setting/content-types/site-setting/schema.json):

```json
"kind": "singleType",
"collectionName": "site_settings",
```

Only one row exists; every app shares it.

## Target state
- `"kind": "collectionType"` (keep `collectionName: "site_settings"`).
- Each app owns one (or more) site-setting documents, addressed by `documentId`.
- CMS gains a list view + edit-by-documentId UI (replacing the current
  single-record edit screen).
- Apps resolve "their" site settings via a stable key (e.g. an `appKey` field
  like `pos`, `cms`, `admin`) — pick the lookup key during implementation.

## Work items
1. Schema: flip `kind` to `collectionType`; add an `appKey` (uid/string,
   unique) or equivalent discriminator field.
2. Migration: seed one row per existing app from the current singleton; map
   downstream readers to the new lookup.
3. API provider: update [packages/api-provider/api/site-setting.js](packages/api-provider/api/site-setting.js)
   — list + getByDocumentId + getByAppKey; drop the implicit single-record
   assumption.
4. CMS UI: list page + edit-by-documentId page (replace whatever currently
   assumes a single record).
5. Consumers: audit every app that reads site settings and switch them to the
   per-app lookup. See [pos-strapi integration contracts](../../C:/Users/EjazArain/.claude/projects/d--Rutba-ERP/memory/project_pos_strapi_contracts.md)
   for headers/contracts that may be affected.
6. Permissions: ensure RBAC scopes still make sense per-row (owners/app-scoped
   reads).

## Open questions
- Lookup key: `appKey` string vs relation to an `app` content-type?
- Should one app be allowed multiple site-setting rows (e.g. per locale /
  per storefront), or strictly one per app?
- Fallback behaviour when an app has no row yet — 404, or inherit from a
  global default row?
