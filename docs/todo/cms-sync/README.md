# Syncing Rutba CMS content between two Strapi instances

<!-- verify-docs: external server/** image/** -->
<!-- Paths and commits below are inside the strapi-content-sync-pro plugin repo
     (D:Rutbastrapi-pluginsstrapi-content-sync-pro), not this one. -->

> **Status (2026-07-29), updated:** GAP-1, GAP-2, GAP-8, GAP-10 (and part of
> GAP-3) were fixed in the plugin (see plugin-gaps.md), and this runbook has now
> been **executed and verified live** between the LAN instance (source) and
> rutba.pk (target): Connection configured (paired mode, matching shared
> secret, a full-access API token issued by rutba.pk and stored on both sides
> so it survives a future LAN→rutba.pk DB refresh — see
> `strapi_api_tokens` id 4 on LAN, name "content-sync-pro (LAN)"), all five
> in-scope content types enabled (`seo-meta` deliberately left off per §4b),
> six advanced push profiles created with the field policies from §5. Two
> `sync-now` runs completed with **zero errors and zero unmatched relations**.
> Spot-verified directly against rutba.pk's content API: every
> `cms-menu-item.menu` relation resolves (confirms the GAP-1 fix), and
> `cms-page-group.pages` membership (flip-card members) resolves too — both
> were unconditional blockers before the fix. Still not verified: published-page
> images (§7a, GAP-2) and Site Settings (§11.3, GAP-5 — still unfixed, do by
> hand). Read [plugin-gaps.md](./plugin-gaps.md) for what's fixed vs. still
> open before assuming more than this was done.

## 0. TL;DR

Syncing Rutba CMS with `strapi-content-sync-pro` as it stands is **partly** a
configuration task. What you can get working today with configuration alone:

- ✅ CMS **records** — pages, page groups, menus, menu items, footers — with all
  their scalar fields (title, slug, richtext content, layout, order, flags,
  priorities, footer scripts) and correct published state.
- ✅ **Unidirectional** relations: `cms-page.related_pages`,
  `cms-page.footer`, `cms-footer.pinned_pages`, and the `cms-menu-item` target
  links (`cms_page`, `page_group`).
- ✅ **Media file bytes and rows** (via the Media profile).

What configuration **cannot** fix — see the linked gaps:

- ❌ Menu structure (`cms-menu-item.menu`, `.parent`), flip-card membership
  (`cms-page-group.pages`, `cms-page.page_groups`), menu↔page links, and every
  `seo-meta` link — all use `inversedBy` → [GAP-1](./plugin-gaps.md#gap-1).
- ❌ Images on **published** pages — morph links land on the draft row only →
  [GAP-2](./plugin-gaps.md#gap-2).
- ❌ Site Settings (logo, favicon, meta defaults, default footer) — it is a
  single type → [GAP-5](./plugin-gaps.md#gap-5).

So: follow this runbook to get the content across, then finish the nav, the
group membership and the images by hand (or apply the plugin fixes first — GAP-1
and GAP-2 together are maybe 30 lines).

---

## 1. Topology and direction

| | |
|---|---|
| **Source of truth** | the authoring instance (local dev / staging) |
| **Target** | `rutba.pk` production (`https://api.rutba.pk`) |
| **Run the sync from** | the **source** instance's admin |
| **Direction** | `push` |

Both `push` and `pull` are initiated by the instance you are sitting in and only
need **source → target** connectivity:

- `push` → the source POSTs each record to
  `POST https://api.rutba.pk/api/strapi-content-sync-pro/receive`
  (`server/src/utils/applier.js:150-183`).
- `pull` → the source GETs `https://api.rutba.pk/api/<plural>` and writes
  locally.

Use **`push`**. Never configure production to pull from a laptop.

> Do **not** use the `Sync → Bulk transfer` screen for this. It runs an
> unphased single pass that ships raw media and relation payloads and can attach
> the wrong file — [GAP-7](./plugin-gaps.md#gap-7). Drive the sync from
> `Sync → Run profiles` instead.

---

## 2. Prerequisites

1. **Identical schema on both sides.** Both instances must be running the same
   git revision of `services/strapi/src/api/**/schema.json`. A field that exists only
   on the source is silently dropped by Strapi's `processData`
   (`@strapi/database/dist/entity-manager/index.js:91`) — no error, no log.
2. **Plugin enabled on both instances.**
   `services/strapi/config/plugins.js:144-146` → `'strapi-content-sync-pro': { enabled: true }`.
   Confirm the target actually loaded it: `GET https://api.rutba.pk/api/strapi-content-sync-pro/ping`
   must return 200 (that route is `auth: false`).
3. **A full-access API token on the target.** Strapi admin → Settings → API
   Tokens → *Create new*, type **Full access**, duration **Unlimited**.
   - Read-only or custom tokens are not enough: the sync also needs
     `POST /api/upload`, `GET /api/upload/files`, the plugin's own content-api
     routes, and `?status=draft` reads.
   - api-pro does **not** interfere: its interceptor short-circuits when there is
     no `ctx.state.user`, which is the case for the `api-token` strategy
     (`packages/strapi-api-pro/server/src/services/request-interceptor.js:135`).
4. **The same shared secret on both instances.** It signs `/receive`,
   `/media-sync/morph-links/apply` and the user endpoints
   (`server/src/middlewares/verify-signature.js`). Generate once, paste into the
   Connection screen on *both* sides.
5. **A database backup of production.** This runbook writes to production.
6. **Same `MEDIA_BASE_URL`?** Check whether both instances point at the same
   media origin (`services/strapi/config/plugins.js:178-192`). If they do, media byte
   sync will duplicate every object on `images.rutba.pk` under a fresh hash —
   annoying but harmless, and currently unavoidable
   ([GAP-11](./plugin-gaps.md#gap-11)).

---

## 3. Connection (Configure → Connection)

On the **source** instance:

| Field | Value |
|---|---|
| `baseUrl` | `https://api.rutba.pk` |
| `apiToken` | the full-access token created in step 2.3 |
| `sharedSecret` | the shared secret from step 2.4 |
| `syncMode` | `paired` |

On the **target** instance (`rutba.pk`) you only need `sharedSecret` set to the
same value — that is what `/receive` verifies against. Setting `baseUrl` back at
the source is optional and only needed if you ever want to run a sync from
production.

Hit **Test connection** before continuing.

> `baseUrl` must have **no trailing slash**. The plugin builds URLs with
> `new URL(path, baseUrl)`, and a trailing slash on `api.rutba.pk` has bitten
> this repo before (see the API base-URL double-slash note in project memory).

---

## 4. Content types and order (Configure → Content types)

Enable exactly these six, in this order:

| # | UID | Why this position |
|---|---|---|
| 1 | `api::cms-footer.cms-footer` | `cms-page.footer` points at it |
| 2 | `api::cms-page.cms-page` | everything else points at pages |
| 3 | `api::cms-page-group.cms-page-group` | references pages |
| 4 | `api::cms-menu.cms-menu` | container for menu items |
| 5 | `api::cms-menu-item.cms-menu-item` | references menus, pages, page groups |
| 6 | `api::seo-meta.seo-meta` | **optional — see the warning below** |

Enabling a type auto-generates its three default profiles (Full Push, Full Pull,
Bidirectional) — `server/src/services/sync-profiles.js:148-197`. You will replace
those in §5.

### 4a. Run the whole sequence TWICE

`hybrid_two_pass` splits entities from relations **within one content type**, not
across the set (`server/src/services/sync.js:294`). Content type 2's relations
pass runs before content type 3 exists. So:

> **Run the full six-type sequence, then run it again.** Pass 1 creates every
> record; pass 2 wires every relation. A third run should report
> `pushed: 0, errors: 0` — that is your "clean" signal.

`cms-footer ↔ cms-page` is a genuine cycle (`cms-footer.pinned_pages` →
`cms-page`, `cms-page.footer` → `cms-footer`). Two passes resolve it; one does
not.

### 4b. `seo-meta` — recommend leaving it OFF for now

`services/strapi/src/api/cms-page/content-types/cms-page/lifecycles.js:6-18` (and the
identical hook on `cms-page-group`) auto-creates an SEO sidecar on the target the
moment a page arrives. Meanwhile **every** relation on `api::seo-meta` uses
`inversedBy` (`services/strapi/src/api/seo-meta/content-types/seo-meta/schema.json:53-100`),
so a synced `seo-meta` row cannot attach itself to anything
([GAP-1](./plugin-gaps.md#gap-1)).

Net effect if you enable it today: two `seo-meta` rows per page — one auto-created
and linked, one synced and orphaned. Leave it disabled and let the target's
lifecycle build its own sidecars; re-enable it (last in the order) only after
GAP-1 is fixed, and expect a one-off dedup pass.

### 4c. Catalog relations — decide before you start

`cms-page` and `cms-menu-item` also point at catalog types
(`product-group`, `brand-group`, `category-group`, `sale-offer`,
`delivery-method`). You have two choices:

- **(a) CMS only** — exclude those fields with field policies (§5). Pages sync;
  their product/brand/category blocks come across empty and are re-picked by hand
  on production.
- **(b) CMS + catalog** — add `api::brand`, `api::category`, `api::product`,
  `api::brand-group`, `api::category-group`, `api::product-group`,
  `api::sale-offer`, `api::delivery-method` **before** `cms-page` in the order.
  Be aware `api::product` carries a component (`product.variant-information`) →
  [GAP-6](./plugin-gaps.md#gap-6), and that this turns a CMS sync into a full
  catalog migration with its own risks.

This runbook assumes **(a)**.

---

## 5. Field policies (required)

Every one of the six types needs an **advanced** profile (`isSimple: false`) so
you can attach field policies. `filterFieldsByPolicy`
(`server/src/services/sync-profiles.js:459-487`) drops a field when its policy is
`none`; fields with no policy default to `both` and are included.

### 5a. `api::cms-page.cms-page` — `owners: none` is MANDATORY

```json
"fieldPolicies": [
  { "field": "owners",              "direction": "none" },
  { "field": "product_groups",      "direction": "none" },
  { "field": "hero_product_groups", "direction": "none" },
  { "field": "brand_groups",        "direction": "none" },
  { "field": "category_groups",     "direction": "none" }
]
```

`owners` is a unidirectional many-to-many to
`plugin::users-permissions.user`
(`services/strapi/src/api/cms-page/content-types/cms-page/schema.json:96-100`). It is
in the plugin's owner-relation set, so the relations pass will try to connect
staging user documentIds on production. Strapi throws
`ValidationError: Document with id "…" not found` and **the entire relations
write for that page is lost** — not just the `owners` field
([GAP-3](./plugin-gaps.md#gap-3)).

The four catalog fields are the option-(a) exclusions from §4c. Drop them from
the list if you chose (b).

### 5b. `api::cms-menu-item.cms-menu-item`

```json
"fieldPolicies": [
  { "field": "product_group",       "direction": "none" },
  { "field": "mega_category_group", "direction": "none" },
  { "field": "mega_brand_group",    "direction": "none" }
]
```

Same reasoning. `cms_page` and `page_group` stay in — both targets are in scope.

### 5c. The other four

`cms-footer`, `cms-page-group`, `cms-menu`, `seo-meta` need no exclusions —
every owner relation they declare targets something in scope. Still create them
as advanced profiles with an empty `fieldPolicies` array so the whole set is
consistent and easy to extend.

---

## 6. Profile settings (Configure → Sync profiles)

Create **one profile per content type** with these values, and mark it active
(only one profile per content type can be active —
`server/src/services/sync-profiles.js:268-275`):

| Setting | Value | Why |
|---|---|---|
| `direction` | `push` | source → production, one way |
| `conflictStrategy` | `local_wins` | the authoring instance is the source of truth; `latest` would let a production edit silently win |
| `executionStrategy` | `hybrid_two_pass` | the only strategy that separates entity creation from relation wiring. `one_pass` cannot satisfy self-references or cross-type links on first create |
| `syncDeletions` | **`false`** | a one-way profile with deletions on converts creates into deletes ([GAP-10](./plugin-gaps.md#gap-10)); it also makes an accidental staging delete destroy production content |
| `isSimple` | `false` | required to attach the field policies from §5 |
| `executionMode` | `on_demand` | **never `live`** — the loop guard is broken and live mode ping-pongs records forever ([GAP-8](./plugin-gaps.md#gap-8)) |

Global execution settings (Configure → Advanced):

| Setting | Value |
|---|---|
| `syncPageSize` | `100` (default) — lower to `25` if production has a slow link |
| `maxLogEntries` | `2000` |
| `retryOnFailure` | `true` |

---

## 7. Media (Media tab)

Run the media profile **after** all content passes are clean — `applyMorphLinks`
resolves the *entity* by documentId (`server/src/services/sync-media.js:591-594`)
and skips any link whose entity does not exist yet.

| Setting | Value | Why |
|---|---|---|
| `strategy` | `url` | `rsync` needs shell access to the production box and does not sync DB rows |
| `direction` | `push` | matches the content direction |
| `conflictStrategy` | `local_wins` | |
| `syncDbRows` | `true` | this is what carries the morph (entity↔file) links |
| `syncFileBytes` | `true` | required — a DB-rows-only push cannot create new remote file rows ([GAP-11](./plugin-gaps.md#gap-11)) |
| `includeMime` | `image/`, plus the video types if any page uses `gallery` videos | `cms-page.gallery` allows `images` and `videos` |
| `skipIfSameSize` | `true` | dedup key is name+ext+size; `hash` is regenerated on upload and would never match |
| `dryRun` | `true` for the first run | |
| `executionMode` | `on_demand` | |

### 7a. Expect images to be missing on published pages

All six CMS types have `draftAndPublish: true`, so each document has a draft row
and a published row — and **two** sets of morph rows. `applyMorphLinks` resolves
one row with an unordered `findOne` and inserts a single link, in practice
against the **draft** ([GAP-2](./plugin-gaps.md#gap-2)).

After a media sync, verify on production that a published page actually renders
its `featured_image`. If it does not, either:

- apply the GAP-2 fix (a `findMany` + loop, ~6 lines), or
- re-attach the images by hand in the production admin (open the page, re-pick
  the media, save + publish — that writes both rows).

### 7b. Changed images leave the old one attached

`applyMorphLinks` only ever inserts; it never removes stale links
([GAP-4](./plugin-gaps.md#gap-4)). If a page's `featured_image` was replaced on
the source, production ends up with both files linked to a single-value field.
Check the affected pages after any sync that includes replaced imagery.

---

## 8. Draft and publish

- The fetchers request `status: 'published'` for Draft & Publish types
  (`server/src/utils/fetcher.js:62-65`), so **drafts never travel**. Publish on
  the source before syncing, or the record simply will not appear on production.
- `applyLocal` mirrors publish state via the `status` param
  (`server/src/utils/applier.js:110-127`), so a published source record lands
  published.
- Unpublishing on the source **does** propagate (`applier.js:132-142`), and
  unpublishing is never mistaken for a deletion — existence sets are read with
  `status: 'draft'` (`fetcher.js:203-220`).
- Watch for `uid` collisions. If a slug already exists on production under a
  different `documentId`, the draft is created (unique validation is skipped for
  drafts) and then `publish()` throws `This attribute must be unique` — the
  record lands as an unpublished draft plus an error line
  ([GAP-9](./plugin-gaps.md#gap-9)). Four fields are exposed: `cms-page.slug`,
  `cms-page-group.slug`, `cms-menu.slug`, `cms-footer.slug`.

---

## 9. Run procedure

1. Back up the production database.
2. Connection configured and **Test connection** green (§3).
3. Six content types enabled (§4), six advanced push profiles active (§5, §6).
4. On the source: publish everything you intend to ship.
5. `Sync → Run profiles`, execute the six profiles **in the §4 order**.
6. `History → Logs`: expect creates and zero errors. Any
   `Document with id "…" not found` means a field policy from §5 is missing.
7. **Run the same six again** (§4a). Pass 2 wires relations.
8. Run a third time. It must report `pushed: 0, errors: 0`.
9. Media tab: run with `dryRun: true`, read the summary, then `dryRun: false`.
10. Verification (§10).

---

## 10. Verification checklist (on production)

| Check | Expected | If it fails |
|---|---|---|
| `GET /api/cms-pages?pagination[pageSize]=1` returns the same total as the source | records arrived | check Logs for identity conflicts |
| A known page's `slug`, `title`, `content`, `page_type`, `*_priority` match | scalars synced | schema drift (§2.1) |
| `GET /api/cms-pages/public/by-slug/<slug>` renders `featured_image` | images attached to the **published** row | [GAP-2](./plugin-gaps.md#gap-2) — re-attach by hand |
| Storefront header shows the menu | **will fail today** | [GAP-1](./plugin-gaps.md#gap-1) — rebuild menus by hand |
| A page-group flip card lists its member pages | **will fail today** | [GAP-1](./plugin-gaps.md#gap-1) |
| `cms-page.footer` resolves | works (unidirectional) | |
| `cms-page.related_pages` resolves | works (unidirectional self-ref) | |
| Site Settings show the right logo/meta | **will fail today** | [GAP-5](./plugin-gaps.md#gap-5) — set by hand |
| No duplicate `seo-meta` rows per page | one per page | you enabled `seo-meta` — see §4b |

---

## 11. What you must still do by hand

Until [GAP-1](./plugin-gaps.md#gap-1), [GAP-2](./plugin-gaps.md#gap-2) and
[GAP-5](./plugin-gaps.md#gap-5) are fixed in the plugin:

1. **Navigation.** Rebuild `cms-menu` → `cms-menu-item` structure on production:
   each item's `menu`, and any `parent` nesting. The items themselves and their
   `cms_page` / `page_group` targets do sync — only the containment links are
   missing.
2. **Page-group membership.** Re-pick `pages` on each `cms-page-group`, and
   `page_groups` on each `cms-page` that displays flip cards.
3. **Site Settings.** Set `site_logo`, `favicon`, `default_og_image`,
   `site_url`, `default_meta_*`, the header promo fields, the nav labels and
   `default_footer` directly in the production admin. Keep a checklist —
   nothing here is automatable today.
4. **Published-page images**, if §7a's spot check fails.
5. **SEO meta**, if the auto-created sidecars need real `meta_title` /
   `meta_description` values (the target's lifecycle creates them empty).

Fixing GAP-1 and GAP-2 removes items 1, 2 and 4 — by far the best return on
effort in this whole document.

---

## 12. Things not to do

- **Do not** use `Sync → Bulk transfer` ([GAP-7](./plugin-gaps.md#gap-7)).
- **Do not** set any profile to `executionMode: 'live'`
  ([GAP-8](./plugin-gaps.md#gap-8)).
- **Do not** enable `syncDeletions` ([GAP-10](./plugin-gaps.md#gap-10)), and
  never on a production target regardless.
- **Do not** use `direction: 'both'` for CMS. With `conflictStrategy: 'latest'`
  a production edit silently overwrites the authoring instance, and there is no
  merge — `compareRecords` is whole-record last-writer-wins
  (`server/src/utils/comparator.js:82-97`).
- **Do not** enable `plugin::users-permissions.user` or `admin::user` in the
  scope. The bulk-transfer plan itself warns that admin transfer is best-effort
  (`server/src/services/bulk-transfer.js:219`), and pushing staging users onto
  production is a security problem, not a sync feature.
