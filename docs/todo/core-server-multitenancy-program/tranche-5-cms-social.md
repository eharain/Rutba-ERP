# Tranche 5 — CMS / social: migration sheet

Status: **ported + smoke-verified** (steps 1–4 of the playbook done against the
live dev DB; goldens, schema handover and the Caddy flip remain).

## What runs in core now

`rutba-core/src/modules/cms-social.js` (same zero-copy model as tranches 1–4).
This is the **draft/publish tranche**: every content type here except
social-account and social-reply is D&P, and the publish/unpublish/discard-draft
triads run through the shim's graph-clone machinery.

### Custom routes (35 selfAuth + 5 interceptor-gated)

| Cluster | Routes | Notes |
|---|---|---|
| cms-page | GET /cms-pages/public/by-slug/:slug + publish/unpublish/discard-draft triad | public read builds the full storefront populate tree server-side; `?draft=true` requires auth (editor preview) |
| cms-page-group | GET public/by-slug/:slug + triad | member pages + images, published-only guard on nested relations |
| cms-menu | GET /cms-menus/public + triad | polymorphic link targets resolved into a flat {label, href, children} nav tree; one nested level; draft items excluded |
| cms-menu-item / cms-footer | triads | |
| site-setting | GET /site-setting (singular RESOLVER) + /publish /unpublish /discard | resolution rule: app_slug (from ?app= or X-Rutba-App) → is_default row → first row; published preferred, draft fallback. Per-row CRUD stays on the seeded /site-settings collection routes |
| cms-bulk | POST /cms-bulk/import | Excel I/O upsert: allowlisted CTs, natural-key dedup, SEO field split into the seo-meta sidecar, two-phase deferred publish with cross-row retries; gate = ensureUser + `*_admin` role header |
| social-account | GET oauth/callback, GET provider-status, POST :id/connect-url · validate-connection · refresh-token | OAuth popup flow + token probes; callback is genuinely public (provider redirect target) |
| social-post | GET/POST webhook/:platform, triad, publish-social, unpublish-social, sync-replies, reply, GET replies, duplicate | provider adapters (`pos-strapi/src/social-providers`) load zero-copy; webhooks verify HMAC over the RAW body and fail closed |
| **gated** | POST/PUT /seo-metas (create/update), POST/PUT/DELETE /social-accounts | core-action OVERRIDES on authenticated REST routes (hr pattern: uid+action → interceptor). seo-meta chains super.* then denormalises entity_title; social-account adds the DB-backed social_admin gate (credentials live there) |

### Crons

`socialPublishScheduled` (\* \* \* \* \*), `socialSyncReplies` (\*/10),
`socialRefreshTokens` (0 \*/6) read zero-copy from pos-strapi's
`config/cron-tasks.js` with the same env-tunable rules
(SOCIAL_CRON_PUBLISH_RULE etc). **Dormant** unless `RUTBA_CORE_CRONS=1`; at
the flip remove `buildSocialCronTasks` from pos-strapi config/server.js in the
same deploy — double cron here means double provider publishes.

### Lifecycles

cms-page + cms-page-group (seo-meta sidecar auto-create, idempotent) and
site-setting (single `is_default` flag — setting it on one row clears the
rest, scoped by documentId). Known deviation: under Strapi the publish clone
also fires afterCreate at the query-engine layer; core fires lifecycles only
on documents() create/update/delete. Both hooks are idempotent, so the drift
is benign.

### New platform capability this tranche forced

- **documents().discardDraft** — inverse of publish: deletes the draft
  version, clones the published graph back into a fresh draft, remapping D&P
  relation targets to their draft counterparts (`cloneEntityGraph` gained a
  remap direction).
- **Inbound link repair on publish/discard** — replacing a version row
  FK-cascades link rows OWNED BY OTHER documents that pointed at it (seo-meta
  sidecar → page, child menu-item → parent). Both operations now snapshot
  inbound rows first and re-point them at the fresh clone, matching Strapi's
  relation maintenance. (First attempted as a read-time source-side version
  hop — reverted: it broke byte-parity on /api/branches?populate=*.)
- **JSON re-stringify in the publish clone** — mysql2 parses JSON columns on
  read; handing the parsed array back to knex breaks the insert (arrays become
  SQL lists). First D&P type with a json column (social-post.platforms).
- **Optional-auth mode for selfAuth routes** — parity with Strapi
  `auth: false`, where the framework never rejects: valid token → user set;
  missing OR INVALID token → anonymous fall-through, the controller's own gate
  decides. Required for genuinely public reads (a storefront holding an
  expired JWT must still get the public CMS pages) and for webhooks/OAuth
  callbacks. Previously core 401'd all unauthenticated selfAuth traffic.
- **`pagination: {...}` param + populate-level `sort`** in the documents shim
  (the shapes the cms services use).
- **compat `config.get('social')` / `('server.url')`** — pos-strapi's own
  config/social.js evaluated with a Strapi-style env helper (POS_STRAPI__
  prefix honored), and **`strapi.contentTypes`** — attribute-metadata view
  over the registry (cms-bulk's Excel type coercion + draftAndPublish checks).
- **Raw-body capture** — the exact request bytes exposed under
  `Symbol.for('unparsedBody')` (Strapi includeUnparsed parity) for webhook
  HMAC verification.

### Parity notes

- A CLAIMLESS authenticated request (no X-Rutba-App header) is **skipped** by
  the interceptor in both servers — e.g. POST /seo-metas succeeds for any
  authed user until a claim is presented. Same plugin logic both sides;
  controller-level gates (social-account) still apply regardless.
- site-setting publish/unpublish/discard remain auth:false (standing hole
  noted in the route file; ported as-is, not widened).

## Verification

- `node scripts/smoke-cms-social.js` — 56 checks, self-cleaning and
  marker-only: sidecar lifecycle; publish/by-slug/draft-preview/discard/
  unpublish round-trip incl. relation remap and inbound-link survival; menu
  tree (ordering, nesting, draft exclusion, populate sort); site-setting
  resolver + marker-scoped triad + is_default invariant (real default flags
  snapshotted and restored); cms-bulk gates/dedup/deferred-publish/SEO split;
  gated overrides under a cms_admin/social_admin claim; social provider
  failure paths, duplicate, webhook handshake + fail-closed signature; cron
  registration. No provider API is ever called.
- All prior suites green EXCEPT two pre-existing dev-DB drift issues verified
  to fail identically on a clean HEAD (spawned as separate tasks):
  smoke-mfg 3 WO-stage checks, and contract-diff 101/113 — all 12 diffs are
  one endpoint (/api/branches populate=* items ordering). validate-schema:
  0 mismatches (4 unaccounted live tables are plugin/temp tables outside the
  registry's scope: sync_logs, sync_run_reports, workflow_notifications,
  _tmp_wh2br_orphan_stock_items).

## Remaining for this tranche

Same as tranches 1–4 (goldens, baseline migration via `schema-diff.js
--filter`, Caddy flip) **plus the cron cutover**: set `RUTBA_CORE_CRONS=1` on
the core instance and remove `buildSocialCronTasks` from pos-strapi
config/server.js in the same deploy. The flip also needs `SOCIAL_*` env
(provider client ids/secrets, SOCIAL_PUBLIC_URL, webhook verify token)
present in the core instance's env — the compat env helper reads the same
POS_STRAPI__-prefixed workspace values, so a shared .env needs no changes.
