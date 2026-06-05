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
   per-app lookup. See pos-strapi integration contracts
   for headers/contracts that may be affected.
6. Permissions: ensure RBAC scopes still make sense per-row (owners/app-scoped
   reads).

## Open questions
- Lookup key: `appKey` string vs relation to an `app` content-type?
- Should one app be allowed multiple site-setting rows (e.g. per locale /
  per storefront), or strictly one per app?
- Fallback behaviour when an app has no row yet — 404, or inherit from a
  global default row?

## SEO follow-ups (added 2026-05-14)

The recent storefront SEO pass extended site-setting with fields that assume
*one* canonical storefront identity. When this becomes per-app, the model
needs to evolve.

### Fields added to site-setting
- `site_url` — canonical base for `<link rel="canonical">`, OG `og:url`,
  sitemap entries, JSON-LD `url`.
- `default_meta_title`, `default_meta_description`, `default_meta_keywords` —
  fallbacks for any page that doesn't override per-page.
- `default_og_image` — fallback social share image.
- `twitter_handle` — JSON-LD `Organization.sameAs` + Twitter Card `site`.

### What needs thinking in the multi-tenant world
1. **`site_url` is intrinsically per-storefront.** When one Strapi instance
   serves multiple `web` apps (rutba.pk + a sister brand on a different
   domain), each must resolve to its own canonical URL. The lookup must
   happen on the **storefront** request (not in admin) — so the resolver
   needs to be aware of the *requesting host*, not the *requesting user*.
   Candidate: a per-app `site-setting` row plus an explicit `hostnames[]`
   array, and a `resolveSiteSettingsByHost(hostname)` server util.
2. **Robots / sitemap also become per-app.** `pages/sitemap.xml.ts` and
   `public/robots.txt` currently assume one site. With per-app:
   - `robots.txt` should be served dynamically per-host (move to
     `pages/robots.txt.ts` with `getServerSideProps`).
   - `sitemap.xml.ts` already pulls site_url at request time — fine, just
     ensure it resolves the right row.
3. **OG defaults cascade.** Pattern to encode in the resolver:
   per-page → per-app site-setting → global default site-setting (the row
   marked `is_default: true` or similar). Don't fall back to hardcoded
   strings — leave that to the schema's `default:` so it's editable.
4. **Editor UX for SEO across apps.** When the CMS list-view lands, the
   per-row edit page should keep the existing "SEO Defaults" card I built,
   but consider an inheritance indicator ("inherits from default app") so
   editors don't fill in identical values across every row.

### Quick wins for v1 (current singleton design)
Worth doing even before the multi-tenant migration:
- **Validate `site_url` on save** — strip trailing slash, reject
  non-`http(s)`, warn on a localhost URL committed to production.
- **Live preview of social share** — render a small "this is how it will
  look on Twitter/Facebook" panel under the SEO Defaults card using the
  fields the editor is currently typing. Cheap, builds confidence.
- **Per-page SEO inheritance hint** — in the cms-page editor's SEO card,
  show the resolved fallback as placeholder text ("inheriting: Site Name —
  Tagline") so editors can see what they'd get without filling it in.
