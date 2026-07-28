# strapi-content-sync-pro — code gaps blocking Rutba CMS sync

> **Status (2026-07-29), updated:** GAP-1, GAP-2, GAP-8 and GAP-10 are now
> **fixed** — commit `a810890` on branch `fix/sync-core` in
> `D:\Rutba\strapi-plugins\strapi-content-sync-pro` (committed locally; **not
> yet pushed** — that repo's remote credentials aren't set up in this
> environment, push it by hand). GAP-3 is **partially** fixed in the same
> commit: relations targeting `plugin::*`/`admin::*` (the confirmed Rutba
> blocker — `cms-page.owners` → `plugin::users-permissions.user`) are now
> excluded from the owner-relation set instead of hard-failing the whole
> record; the fuller fix (excluding any `api::*` target outside the sync scope,
> not just plugin/admin ones) was left undone — see its section below for what
> remains. GAP-4, GAP-5, GAP-6, GAP-7, GAP-9, GAP-11 are still open exactly as
> originally audited. An earlier, much larger rewrite (1638 lines across 10
> files, including a new `strategy.js` "Sync Strategy Contract" module) was
> found NOT to actually fix any of these gaps despite claiming to — it was set
> aside (`git stash`, not deleted: `stash@{0}` on `fix/sync-core`, message
> "agent draft refactor (2026-07-29) - core gap fixes not actually applied, set
> aside for review") rather than shipped. The fixes below are small, targeted,
> and verified against Strapi's own source line-by-line — read them before
> assuming anything more was done.
>
> **Update this doc's own README.md TL;DR table** (§0 there) once you've
> re-verified these fixes against a live sync — it still describes GAP-1/2/5 as
> unconditional blockers.
>
> Companion: [README.md](./README.md) — the configuration runbook for what
> *does* work today, plus the workarounds for everything listed here.

## TL;DR

Syncing Rutba's CMS between two Strapi instances is **not** a pure configuration
task. Three of the gaps below are hard blockers:

| # | Gap | Severity | Rutba symptom |
|---|-----|----------|---------------|
| [1](#gap-1) | Owner-side relation detection excludes `inversedBy` | **blocker** | Menus have no items, menu items have no parent, page groups have no member pages, SEO meta is detached |
| [2](#gap-2) | Media morph links land on only one Draft&Publish version | **blocker** | Published pages show no featured image / gallery / logo |
| [3](#gap-3) | Relations to out-of-scope targets hard-fail the whole record | **blocker** | Every `cms-page` with an `owners` value fails its entire relations pass |
| [4](#gap-4) | Stale morph links are never removed | high | A replaced `featured_image` leaves both files linked to a single-value field |
| [5](#gap-5) | Single types are unsyncable | high | `site-setting` (logo, favicon, meta defaults, default footer) can never sync |
| [6](#gap-6) | Components + dynamic zones are dropped (2-pass) or corrupted (1-pass) | high | N/A for CMS today; blocks any future page-builder DZ, and breaks `api::product` |
| [7](#gap-7) | Bulk Transfer runs an unphased pass that ships raw media/relation payloads | high | Wrong file linked, or `400 relation(s) … do not exist` |
| [8](#gap-8) | Live-mode loop guard keyed on a `syncId` no schema declares | medium | `executionMode: 'live'` ping-pongs records between instances forever |
| [9](#gap-9) | `uid`/slug collision fails at publish, leaving a broken draft | medium | Colliding `slug` lands as an unpublished draft + a logged error |
| [10](#gap-10) | `syncDeletions` on a one-way profile turns creates into deletes | medium | A push profile with deletions on never creates anything |
| [11](#gap-11) | DB-rows-only media push cannot create remote file rows | low | `syncFileBytes: false` on push is a no-op for new files |

Reference points used throughout (versions as installed in `pos-strapi`,
Strapi `5.51.0`):

- `pos-strapi/node_modules/@strapi/database/dist/metadata/relations.js:31`
  — `const isOwner = (attribute)=>!isBidirectional(attribute) || hasInversedBy(attribute);`
- `pos-strapi/node_modules/@strapi/core/dist/services/document-service/transform/relations/transform/data-ids.js`
  — `getRelationIds` throws `ValidationError: Document with id "…" not found`
- `pos-strapi/node_modules/@strapi/core/dist/services/entity-validator/index.js:372-388`
  — `checkRelationsExist` throws `N relation(s) of type X … do not exist`
- `pos-strapi/node_modules/@strapi/core/dist/services/entity-validator/validators.js:105`
  — `if (attr.type !== 'uid' && !attr.unique) return validator;` → uid is *always* unique-validated
- `pos-strapi/node_modules/@strapi/core/dist/services/document-service/entries.js:112-129`
  — `publishEntry` clones the fully-populated draft → a published document has **two** rows and **two** sets of morph rows
- `pos-strapi/node_modules/@strapi/database/dist/entity-manager/index.js:91`
  — `processData` iterates known attributes only → unknown keys (e.g. `syncId`) are silently dropped

---

<a id="gap-1"></a>
## GAP-1 — `inversedBy` is the OWNER side, and the plugin excludes it (blocker)

> **FIXED** in commit `a810890` (`fix/sync-core`) — both call sites now use
> `if (attr.mappedBy) continue;` / `if (rel.mappedBy) continue;`.

**Where**

- `server/src/services/sync.js:139-154` — `getOwnerRelationFieldSet`, predicate on line 148:
  ```js
  if (attr?.type === 'relation' && attr.target && !attr.mappedBy && !attr.inversedBy) {
  ```
- `server/src/services/dependency-resolver.js:205-233` — `getConstrainedDependencyTargets`, same mistake on line 211:
  ```js
  if (rel.mappedBy || rel.inversedBy) continue;
  ```

**What's wrong**

In Strapi, `mappedBy` marks the *inverse* side and `inversedBy` marks the
*owning* side. `@strapi/database/dist/metadata/relations.js:31` is unambiguous:

```js
const isBidirectional = (attribute) => hasInversedBy(attribute) || hasMappedBy(attribute);
const isOwner        = (attribute) => !isBidirectional(attribute) || hasInversedBy(attribute);
```

The plugin's predicate keeps only *unidirectional* relations. For every
**bidirectional** relation both sides are skipped — the `mappedBy` side
(correctly, to avoid double-writes) and the `inversedBy` side (wrongly, because
that is the owner). The result is that no bidirectional relation is ever synced,
in either direction, under `hybrid_two_pass` — the recommended and default
execution strategy (`admin/src/components/SyncProfilesTab.jsx:44`).

The inline comment on `sync.js:147` ("are not inverse-only markers") shows the
intent; the predicate does not match it.

**Rutba blast radius** — every relation below is currently dropped:

| Content type | Field | Declaration | Consequence |
|---|---|---|---|
| `api::cms-menu-item` | `menu` | `pos-strapi/src/api/cms-menu-item/content-types/cms-menu-item/schema.json:77-82` (`inversedBy: items`) | Every menu item lands orphaned — the storefront nav is empty |
| `api::cms-menu-item` | `parent` | same file `:83-88` (`inversedBy: children`) | No nesting; mega/dropdown structure is lost |
| `api::cms-menu` | `pages`, `items` | `pos-strapi/src/api/cms-menu/content-types/cms-menu/schema.json:44-55` | Menu↔page links lost |
| `api::cms-page-group` | `pages` | `pos-strapi/src/api/cms-page-group/content-types/cms-page-group/schema.json:55-60` (`inversedBy: member_page_groups`) | **Flip cards have no members** |
| `api::cms-page` | `page_groups` | `pos-strapi/src/api/cms-page/content-types/cms-page/schema.json:78-83` | Flip-card blocks never appear on a page |
| `api::cms-page` | `menus`, `offers`, `delivery_methods` | same file `:90-95`, `:128-139` | Lost (owner side is also `inversedBy` on the peer type) |
| `api::seo-meta` | all 8 entity relations | `pos-strapi/src/api/seo-meta/content-types/seo-meta/schema.json:53-100` (every one `inversedBy`) | SEO rows arrive completely detached |

What *does* survive today are only the unidirectional relations —
`cms-page.related_pages`, `cms-page.product_groups`, `cms-page.hero_product_groups`,
`cms-page.brand_groups`, `cms-page.category_groups`, `cms-page.footer`,
`cms-page.owners`, `cms-footer.pinned_pages`, and the five `cms-menu-item`
target links (`cms_page`, `page_group`, `product_group`, `mega_*`).

**Required change**

In both call sites, the owner test must be `!attr.mappedBy` (equivalently
`!isBidirectional(attr) || hasInversedBy(attr)`). Extract one shared helper so
the two sites cannot drift:

```js
// server/src/utils/relations.js (new)
const isOwnerRelation = (attr) =>
  attr?.type === 'relation' && !!attr.target && !attr.mappedBy;
```

- `sync.js:148` → `if (isOwnerRelation(attr)) { … }`
- `dependency-resolver.js:211` → `if (!isOwnerRelation(rel)) continue;`
  (note `analyzeContentType` copies `mappedBy`/`inversedBy` onto the entry at
  `dependency-resolver.js:54-61`, but not `type`/`target` in the shape the
  helper expects — either widen the entry or inline the `!rel.mappedBy` test.)

**Regression risk**: none for unidirectional relations. For bidirectional ones
the owner side is now written and the inverse side still skipped, which is
exactly one write per link — no double-write.

**Test**: a fixture with `A.rel (inversedBy) ↔ B.rel (mappedBy)` must produce
`phaseFields` containing `A.rel` and not `B.rel`.

---

<a id="gap-2"></a>
## GAP-2 — Media morph links land on only one Draft & Publish version (blocker)

> **FIXED** in commit `a810890` (`fix/sync-core`) — `applyMorphLinks` now
> `findMany`s every row for the `relatedDocumentId` and fans the link out to
> each one, instead of an unordered `findOne`.

**Where**

- `server/src/services/sync-media.js:498-552` — `exportMorphLinks`
- `server/src/services/sync-media.js:554-640` — `applyMorphLinks`

**What's wrong**

A Draft & Publish document has **two rows** in the content table sharing one
`documentId` (draft with `published_at IS NULL`, published with it set) —
`publishEntry` clones the fully-populated draft
(`@strapi/core/…/document-service/entries.js:112-129`), so the polymorphic
`files_related_mph` table also holds **two** rows per (file, field): one keyed on
the draft's `id`, one on the published `id`.

`exportMorphLinks` collapses both to the same `relatedDocumentId`
(`sync-media.js:522-548`) and emits two identical link records.

`applyMorphLinks` then resolves the target with a single unordered lookup:

```js
// sync-media.js:591-594
related = await strapi.db.query(link.relatedType).findOne({
  where: { documentId: link.relatedDocumentId },
  select: ['id', 'documentId'],
});
```

`findOne` with no `orderBy` returns **one arbitrary row** — in practice the
lower `id`, i.e. the draft. One morph row is inserted; the second identical link
is then rejected by the existence check on `sync-media.js:606-618` ("morph link
already exists").

**Rutba symptom.** All six CMS types have `draftAndPublish: true`. The storefront
reads published content. So after a media sync, `cms-page.featured_image`,
`cms-page.gallery`, `cms-page.background_image`,
`cms-page-group.cover_image` and `cms-menu-item.icon_image` are attached to the
**draft** row and are missing from every page the public site actually renders.

**Required change**

`applyMorphLinks` must fan out to every row of the document:

```js
const relatedRows = await strapi.db.query(link.relatedType).findMany({
  where: { documentId: link.relatedDocumentId },
  select: ['id', 'documentId'],
});
if (!relatedRows.length) { skipped.push({ link, reason: 'related documentId not found locally' }); continue; }
for (const related of relatedRows) { /* existing exists-check + insert, per row */ }
```

`exportMorphLinks` should be de-duplicated on
`(fileDocumentId|fileName+ext+size, relatedType, relatedDocumentId, field, order)`
so the payload does not carry the redundant second copy — it is pure wire waste
once the receiver fans out.

**Note for non-D&P types** (`api::seo-meta` has `draftAndPublish: false`): the
fan-out is a no-op — one row, one insert. Safe for both.

**Test**: publish a D&P entity with one media field on the source, sync, then
assert the target has a morph row for **both** the draft and published `id`s.

---

<a id="gap-3"></a>
## GAP-3 — A relation to an out-of-scope target hard-fails the whole record (blocker)

> **PARTIALLY FIXED** in commit `a810890` (`fix/sync-core`) —
> `getOwnerRelationFieldSet` now excludes any relation whose target starts with
> `plugin::` or `admin::`, which covers the confirmed Rutba blocker
> (`cms-page.owners` → `plugin::users-permissions.user`). The fuller version of
> this fix — threading `scopeUids` (the enabled-content-types set) through so
> an `api::*` target that simply isn't in scope (e.g. catalog types when only
> CMS is enabled) is also excluded, not just plugin/admin ones — was **not**
> done; that needs `scopeUids` plumbed from `syncConfig.contentTypes` through
> `syncNow` → `syncContentType` → `selectFieldsForPhase` →
> `getOwnerRelationFieldSet`, none of which currently pass it.

**Where**

- `server/src/services/sync.js:139-154` — `getOwnerRelationFieldSet` has no scope filter
- `server/src/utils/applier.js:28-53` — `normalizeRelations` emits `{ set: [{ documentId }] }` unconditionally

**What's wrong**

`selectFieldsForPhase(uid, fields, 'relations')` (`sync.js:161-166`) includes
**every** owner relation regardless of whether the target content type is in the
sync scope or even syncable. `normalizeRelations` turns it into a documentId
`set`, and Strapi then resolves that set strictly:

- `@strapi/core/…/transform/relations/transform/data-ids.js` — `getRelationIds`
  throws `ValidationError: Document with id "…" not found` when a documentId
  has no local row.
- `@strapi/core/…/entity-validator/index.js:372-388` — `checkRelationsExist`
  throws `N relation(s) of type X associated with this entity do not exist`.

A single unresolvable documentId aborts the **entire** write, so all the other
relations on that record are lost too — not just the offending field.

**Rutba symptom.** `pos-strapi/src/api/cms-page/content-types/cms-page/schema.json:96-100`:

```json
"owners": { "type": "relation", "relation": "manyToMany", "target": "plugin::users-permissions.user" }
```

`owners` is unidirectional, so it *is* in the owner set today. Staging user
documentIds do not exist on production → **every CMS page that has an owner
fails its relations pass outright**. The same applies to
`cms-page.product_groups` / `hero_product_groups` / `brand_groups` /
`category_groups` and the `cms-menu-item.product_group` / `mega_*` links when the
catalog is not synced.

**Required change**

`selectFieldsForPhase` must intersect the owner set with the sync scope. The
scope logic already exists in `dependency-resolver.js:205-233`
(`getConstrainedDependencyTargets`) — reuse its rules:

```js
// sync.js — getOwnerRelationFieldSet(uid, allowedFields, scopeUids)
if (!isOwnerRelation(attr)) continue;
if (scopeUids && scopeUids.size > 0 && !scopeUids.has(attr.target)) continue;
if (attr.target.startsWith('plugin::') || attr.target.startsWith('admin::')) continue;
```

`scopeUids` = the set of enabled content types from
`syncConfig.contentTypes.filter(ct => ct.enabled)`, threaded through
`syncNow` / `syncContentType` / `syncContentTypePage`.

Additionally, `applyLocal` should degrade gracefully: on a relation
`ValidationError`, retry once with the offending field removed and log a
`relation_skipped` entry, rather than losing the record's whole relation set.

**Workaround until fixed**: an *advanced* sync profile with a
`{ field: 'owners', direction: 'none' }` field policy — see
[README §4](./README.md#4-field-policies-required). `filterFieldsByPolicy`
(`server/src/services/sync-profiles.js:459-487`) handles `'none'` correctly.

---

<a id="gap-4"></a>
## GAP-4 — Stale morph links are never removed (high)

**Where**: `server/src/services/sync-media.js:554-640` — `applyMorphLinks` only
ever `insert`s (line 620) and skips duplicates (line 615).

**What's wrong**: there is no reconciliation. If `cms-page.featured_image` is
changed from `old.jpg` to `new.jpg` on the source, the target ends up with morph
rows for **both** files on a `multiple: false` media field. Strapi returns
whichever the join order yields — the rendered image becomes nondeterministic
and can silently revert.

**Required change**: make apply a *reconcile* per
`(relatedType, relatedDocumentId, field)` group — delete local morph rows in the
group that are not present in the incoming link set for that group, then insert
the missing ones. Gate it behind a profile flag
(`reconcileMorphLinks`, default `true` for one-way profiles, `false` for
`direction: 'both'`) so a bidirectional media profile cannot delete links the
peer simply hasn't sent yet.

---

<a id="gap-5"></a>
## GAP-5 — Single types are unsyncable (high)

**Where**

- `server/src/services/content-type-discovery.js:17` — `if (ct.kind !== 'collectionType') continue;` → single types never appear in the Content Types tab
- `server/src/services/bulk-transfer.js:137` — same filter in `listSyncableContentTypeUids`
- `server/src/utils/fetcher.js:180-195` — `uidToPluralEndpoint` returns `pluralName`; a single type is served at `/api/<singularName>`
- `server/src/utils/applier.js:119-127` — the create branch calls `documents(uid).create()`, which is not the single-type semantic

**Rutba symptom.** `pos-strapi/src/api/site-setting/content-types/site-setting/schema.json:1-2`
is `"kind": "singleType"`. It carries `site_logo`, `favicon`, `default_og_image`,
`site_url`, all the `default_meta_*` fields, the header promo, the nav labels and
`default_footer`. **None of it can ever be synced.** Even if it were enabled by
hand in the store, the remote fetch would 404 (`/api/site-settings` vs
`/api/site-setting`).

**Required change**

1. Allow `kind === 'singleType'` in both discovery functions, tagged so the UI
   can label it.
2. `uidToPluralEndpoint` → `uidToRestEndpoint(uid)`: return
   `info.singularName` when `contentTypes[uid].kind === 'singleType'`, else
   `info.pluralName`.
3. Fetchers: for a single type, fetch the one document
   (`documents(uid).findFirst()` locally; a bare `GET /api/<singular>` remotely,
   normalising `json.data` object → one-element array).
4. `applier.applyLocal`: for a single type, always `update` the existing
   document (creating it if absent) and never key on a remote `documentId`
   — the singleton identity is the content type itself.
5. `reconcileDeletions` must be skipped entirely for single types.

**Workaround until fixed**: maintain Site Settings by hand on production. See
[README §7](./README.md#7-what-you-must-still-do-by-hand).

---

<a id="gap-6"></a>
## GAP-6 — Components and dynamic zones are dropped, or corrupted (high)

**Where**

- `server/src/services/sync.js:156-179` — `selectFieldsForPhase`: the `entities`
  phase resolves to `allScalarFields(uid)` (line 134-137, `SCALAR_TYPES` only);
  the `relations` phase is `attr.type === 'relation'` only. **Neither phase ever
  names a `component` or `dynamiczone` attribute.**
- `server/src/utils/fetcher.js:26-42` — `scalarQueryFields` drops anything that
  is not a scalar from the `fields` selection (line 34 comment says so
  explicitly).
- `server/src/utils/applier.js:28-53` — `normalizeRelations` only touches
  `attr.type === 'relation'`; components pass through untouched.
- `server/src/services/dependency-resolver.js:64-77` *does* analyse components
  and dynamic zones, and `buildDependencyGraph:139-169` adds them to the graph —
  but nothing downstream consumes that. Dead analysis.

**Behaviour**

- `hybrid_two_pass` (default): components and dynamic zones are **silently
  dropped**. No error, no log line.
- `one_pass` / Bulk Transfer: `phaseFields` is `[]`, so `filterFields`
  (`applier.js:191-200`) keeps the whole populated record — component payloads go
  over the wire carrying **source-local numeric `id`s** and nested relation/media
  objects. On the target those ids address different rows.

**Rutba status: N/A for CMS today.** No `cms-*` content type declares a
`component` or `dynamiczone` attribute — `cms-page.content` is a plain
`richtext`. The 15 content types that do use components are all transactional
(`sale-order`, `mfg-*`, `pay-*`, `stock-*`, `branch`, `workflow`) plus
`api::product` (`product.variant-information`). So this gap does **not** block
the CMS sync — but it becomes a blocker the moment a page-builder dynamic zone is
added to `cms-page`, and it already blocks any catalog sync that includes
`api::product`.

**Required change**

Add a third phase, or extend `entities`, with a component sanitiser:

```js
// server/src/utils/components.js (new)
// Recursively strip `id` from component/DZ payloads, keep `__component`,
// convert nested relations to { set: [{ documentId }] } and nested media to
// a deferred morph-link record (media inside components is stored in the same
// files_related_mph table, with `field` = the dotted path).
```

and include component/DZ attribute names in `selectFieldsForPhase` for that
phase. `fetcher.scalarQueryFields` must not be asked to carry them in `fields`
(Strapi 400s) — they arrive via `populate: '*'` already, so the change is purely
in `filterFields`/`normalizeRelations`, not in the query.

---

<a id="gap-7"></a>
## GAP-7 — Bulk Transfer runs an unphased pass (high)

**Where**

- `server/src/services/bulk-transfer.js:287-291` — calls
  `syncService.syncContentTypePage(chunk.uid, { profile, page, pageSize })`
  with **no `phase`**.
- `server/src/services/sync.js:659-660` — `const phase = options.phase || 'all';`
  → `selectFieldsForPhase(uid, [], 'all')` returns `[]`.
- `server/src/utils/applier.js:191-200` — `filterFields(record, [])` therefore
  keeps **everything** populated by `populate: '*'`.

**Consequences**

1. **Media objects are sent raw.** `data.featured_image = { id: 42, documentId: …, url: … }`.
   `buildRelationsStore` (`@strapi/core/…/entity-validator/index.js:284-320`)
   treats `media` exactly like a relation and resolves it **by `id`**
   (`checkRelationsExist`, line 376-380). Either the target has no row 42 →
   `400 … relation(s) of type plugin::upload.file … do not exist`, or it has a
   different row 42 → **the wrong file is silently attached**. The second failure
   mode is worse than the first.
2. **Relations are sent at create time**, before the target type's chunk has
   run, so `getRelationIds` throws for anything not yet present.
3. Components/DZ ship with source-local ids — see [GAP-6](#gap-6).

The `Full Push` / `Full Pull` buttons are therefore the *least* safe path, not
the most convenient one, and the admin UI does not say so.

**Required change**

`runContentChunk` must do what `syncContentType` does: iterate
`['entities', 'relations']` (from `profile.executionStrategy`) and pass `phase`
through to `syncContentTypePage`. Per-page resumption still works — track
`{ phase, page }` on the chunk instead of `page` alone, and run all pages of
`entities` before the first page of `relations`.

Independently, `normalizeRelations` should handle `attr.type === 'media'`:
reduce to `{ set: [] }` (defer to the media/morph pass) rather than passing
source-local ids through. That single guard removes the wrong-file failure mode
from every code path at once, and is the cheapest fix in this document.

---

<a id="gap-8"></a>
## GAP-8 — Live-mode loop guard is keyed on a field no schema declares (medium)

> **FIXED** in commit `a810890` (`fix/sync-core`) — the three lifecycle hooks
> now key on `result.documentId`; `ensureSyncId`/`beforeCreate` removed.

**Where**

- `server/src/bootstrap.js:83-88` — `beforeCreate` calls `ensureSyncId(params.data)`
- `server/src/bootstrap.js:95-99, 110-114, 124-128` — `const key = \`${model.uid}:${result.syncId}\``
- `server/src/utils/applier.js:81` — marks `\`${uid}:${key}\`` where `key = documentId || syncId`

**What's wrong**

No Rutba content type declares a `syncId` attribute, and Strapi's
`processData` (`@strapi/database/dist/entity-manager/index.js:91-97`) iterates
**known attributes only**, so the injected `syncId` is silently discarded before
the insert. `result.syncId` is therefore always `undefined`.

The applier marks `uid:<documentId>`; the lifecycle checks
`uid:undefined`. **The guard never matches.** With
`executionMode: 'live'` and a `push`/`both` profile, a record received from the
peer is immediately pushed back — a permanent ping-pong, amplified by the fact
that each bounce updates `updatedAt` and so keeps winning the `latest` conflict
strategy.

The fetcher already knows this: `fetcher.js:23-24` — *"`syncId`, which no user
schema actually defines"*.

**Required change**

Key the guard on `documentId`, which both sides already have:

```js
// bootstrap.js — all three hooks
const key = `${model.uid}:${result.documentId}`;
```

and drop the `ensureSyncId` call from `beforeCreate` (it fires on **every**
create in the host application and accomplishes nothing). Keep the `syncId`
fallbacks in `applier.js`/`comparator.js` for legacy installs that did add the
column.

**Workaround until fixed**: never set `executionMode: 'live'`. Use
`on_demand` or `scheduled`.

---

<a id="gap-9"></a>
## GAP-9 — `uid`/slug collisions fail at publish and leave a broken draft (medium)

**Where**: `server/src/utils/applier.js:110-127`.

**What's wrong**

`applyLocal` creates with `status: 'published'`. Strapi's repository
(`@strapi/core/…/document-service/repository.js:283-295`) first creates the
**draft** (`filterDataPublishedAt` strips `publishedAt`, so
`isDraft === true`) and then calls `publish()`.

`addUniqueValidator` (`@strapi/core/…/entity-validator/validators.js:105`)
applies to **every `uid` attribute** regardless of an explicit `unique` flag —
but it is skipped for drafts ("We don't validate any unique constraint for draft
entries"). So the sequence is: draft with a duplicate slug is created
successfully → `publish()` throws `This attribute must be unique`.

Net result: the record lands on the target as an **unpublished draft with a
colliding slug**, plus one error line in the sync log. Nothing tells the operator
that the two instances have divergent identities for the same slug.

Rutba has four `uid` fields in scope: `cms-page.slug`, `cms-page-group.slug`,
`cms-menu.slug`, `cms-footer.slug`.

**Required change**

Add a pre-flight to `syncContentType` / bulk chunks: for each `uid` attribute of
the content type, fetch `(documentId, <uid field>)` pairs from both sides and
report any value present on both with **different** documentIds, as a blocking
diagnostic before any write. Surface it in the Stats/Logs tab as
`identity_conflict`. Optionally offer "adopt remote documentId" as a resolution.

---

<a id="gap-10"></a>
## GAP-10 — `syncDeletions` on a one-way profile turns creates into deletes (medium)

> **FIXED** in commit `a810890` (`fix/sync-core`) — the branch is removed from
> `compareRecords`; a one-sided record is always a create candidate now.

**Where**: `server/src/utils/comparator.js:52-58`

```js
} else if (direction === 'push' || direction === 'both') {
  if (syncDeletions && direction !== 'both') {
    result.toDeleteRemote.push(localRecord);   // ← local exists, remote doesn't
  } else {
    result.toCreateRemote.push(localRecord);
  }
}
```

A record that exists locally and not remotely is a **create**, always. The
branch treats it as a delete whenever `syncDeletions` is on and the direction is
one-way — so a `push` profile with deletions enabled never creates anything.
(It is masked in practice because `deleteRemote` no-ops on a missing target, and
because `syncNow` (`sync.js:313`) and `syncContentTypePage` (`sync.js:692`) both
hard-code `syncDeletions: false`. Only the profile-driven `syncContentType`
path (`sync.js:507`) passes the real value — i.e. exactly the path the Sync
Profiles / Sync Execution tabs drive.)

Snapshot-based `reconcileDeletions` (`sync.js:43-94`) is the correct mechanism
and already runs separately (`sync.js:577-581`).

**Required change**: delete the `syncDeletions` branch from `compareRecords`
entirely (both the push and pull halves, lines 52-58 and 62-72) and drop the
option from the signature. Deletion is `reconcileDeletions`' job.

**Workaround until fixed**: leave `syncDeletions: false` on every profile.

---

<a id="gap-11"></a>
## GAP-11 — DB-rows-only media push cannot create remote file rows (low)

**Where**: `server/src/services/sync-media.js:463-496` — `syncDbRowPush` returns
`'needs_bytes'` (line 495) for any file that does not already exist on the peer,
and does nothing.

**Why it matters for Rutba**: both instances are configured to use the same
external media host — `pos-strapi/config/plugins.js:178-192` switches the upload
provider to `strapi-provider-upload-media` (`MEDIA_BASE_URL`, i.e.
`images.rutba.pk`) whenever that env var is set. When both sides share the media
origin, re-uploading bytes is pure waste: the file is already reachable. The
natural configuration — `syncFileBytes: false`, `syncDbRows: true` — is a no-op
for new files, so it cannot be used, and every push duplicates the object on the
media server under a fresh hash.

**Required change**: give `syncDbRowPush` a create path — `POST` the file
metadata to a new signed plugin endpoint (`/media-sync/files/upsert`) that
inserts a `plugin::upload.file` row verbatim (preserving `hash`, `url`,
`provider`, `formats`, and `documentId`) without going through the upload
service. That also fixes the `documentId` instability that forces
`applyMorphLinks` into its name/ext/size fallback (`sync-media.js:575-583`).

---

## Not gaps (checked, works as intended)

- **Self-referencing relations.** `dependency-resolver.js:111` and `:213` skip
  self-references, but that is only the *topological ordering* input — a type
  cannot be ordered before itself. The relations phase still carries a
  self-reference: `cms-page.related_pages`
  (`pos-strapi/src/api/cms-page/content-types/cms-page/schema.json:73-77`) is
  unidirectional and does sync correctly today under `hybrid_two_pass`.
  `cms-menu-item.parent` is broken by [GAP-1](#gap-1) (it uses `inversedBy`), not
  by self-reference handling. In `one_pass` a self-reference can never resolve on
  first create — another reason to keep `hybrid_two_pass`.
- **`documentId` preservation on create.** `applier.js:121` sets
  `data.documentId`; `@strapi/core/…/document-service/entries.js:22-62` reads and
  enforces it, and the yup validator does not strip unknown keys. Cross-instance
  identity holds.
- **Publish-state mirroring.** `fetcher.js:62-65` fetches `status: 'published'`
  for D&P types, `applier.js:110` writes `status` back. Drafts never travel and
  published content stays published — correct for a staging→production flow.
- **HMAC on mutating endpoints.** `/receive`, `/media-sync/morph-links/apply`
  and `/users/{export,import}` all carry `verifySignature`
  (`server/src/routes/index.js:13, 24, 29-30`).
- **api-pro interference.** None. `packages/strapi-api-pro/server/src/services/request-interceptor.js:135`
  returns `{ status: 'skipped' }` when `ctx.state.user` is absent, which is the
  case for Strapi's `api-token` strategy. A full-access API token passes through.
