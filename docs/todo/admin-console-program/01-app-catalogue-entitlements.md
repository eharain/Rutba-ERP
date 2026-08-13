# 01 — App Catalogue & Entitlements

> **Status: specification only.** The headline deliverable of the
> [Admin Console Program](README.md). Nothing here is built.

The question this section answers, in the user's words:

> *"Should rutba.pk, as a customer of Rutba ERP, have this app or not?"*

Instance-level, and distinct from `rutba-console`, which provisions
infrastructure for the service provider. This is the customer's own switch.

## The problem, precisely

`app-domain` already has an `isActive` boolean, and the server already honours
it. What defeats it is that the *presentation* of the app catalogue lives in a
hardcoded frontend constant that no server response can reach.

```
app-domain.isActive = false     →  claim stripped, roles vanish, policies deny
APP_META['manufacturing']       →  still renders a tile in the launcher
```

The admin deactivates Manufacturing. The tile stays. Clicking it takes the user
to a working Next.js app that 403s on every request. That is the bug.

### What `isActive` already does (verified)

| Site | Behaviour |
|---|---|
| [`me-permissions.js:132`](../../../packages/strapi-api-pro/server/src/services/me-permissions.js) | `where: { isActive: true }` — inactive domains excluded from the claim; wildcard roles do not fan out into them |
| [`policies.js:155`](../../../packages/strapi-api-pro/server/src/services/policies.js) | `where: { isActive: true }` — inactive domains contribute no policies |
| [`users.js:22`](../../../packages/strapi-api-pro/server/src/services/users.js) | `where: { isActive: true }` — inactive domains excluded from role resolution |

So the enforcement half is done and correct. Three further defects sit on top:

- **No UI reads or writes it.** `grep isActive rutba-users/pages rutba-users/components`
  returns nothing. [`app-domains.js`](../../../rutba-users/pages/app-domains.js)
  edits Key, Name and Description only.
- **No descriptor method can set it.**
  [`api/app-domains.js`](../../../packages/api-provider/api/app-domains.js)
  exposes `list`, `create`, `del` — there is **no `update`**.
- **Deactivation is a one-way door.** `del` is a soft-delete:
  [`deleteDomain`](../../../pos-strapi/src/api/user-admin/controllers/user-admin.js)
  writes `isActive: false`, while `listDomains` at the same file's line 123
  filters `isActive: true`. A deactivated domain **disappears from the only
  screen that could reactivate it**, and no endpoint sets it back to `true`.
  Recovery today is a manual SQL `UPDATE`. This violates ground rule 6.

## The three payoffs

This is not one feature. One data model change resolves three separate problems,
which is why it leads the program.

### Payoff 1 — the requested feature

An instance administrator turns apps on and off, and the whole UI follows:
launcher tiles, category popovers, cross-app links, the app-switcher, accents.

### Payoff 2 — one registry instead of four unsynchronized ones

Adding an app today means editing four registries that **nothing cross-validates**.
Measured drift on the dev branch as of 2026-08-13:

| Registry | Path | Keys |
|---|---|---|
| `APP_META` | [`pos-shared/lib/roles.js:65`](../../../packages/pos-shared/lib/roles.js) | 22 |
| `APP_URLS` | [`pos-shared/lib/roles.js:15`](../../../packages/pos-shared/lib/roles.js) | 22 |
| `VALID_APP_KEYS` | [`pos-shared/lib/roles.js`](../../../packages/pos-shared/lib/roles.js) | 21 |
| `domains.json` | [`api-provider/config/domains.json`](../../../packages/api-provider/config/domains.json) | 26 |
| `RUTBA_SVC_PORT` | [`scripts/rutba_apps.sh`](../../../scripts/rutba_apps.sh) | 25 |

Actual disagreements:

| Diff | Keys | Why it matters |
|---|---|---|
| In `APP_META`, not in `VALID_APP_KEYS` | `web` | `canAccessApp('web')` is unreachable while the launcher still renders a Web tile |
| In `domains.json`, not in `APP_META` | `accounts-ap`, `accounts-ar`, `accounts-viewer`, `delivery` | Real auth domains with no catalogue presence. Three are `accounts` sub-domains (arguably correct); `delivery` is a genuine orphan |
| In `rutba_apps.sh`, not in `APP_META` | `pos-strapi`, `core`, `marketplace-worker` | Backend services, correctly absent — but nothing *says* so |
| In `rutba_apps.sh`, not in `APP_META` | `pos-auth`, `pos-stock`, `pos-sale` | Same three apps as `APP_META`'s `auth`, `stock`, `sale` under **different names**. A pure naming mismatch that no tool can detect |
| In `APP_META`, not in `rutba_apps.sh` | `auth`, `stock`, `sale` | The other side of the same mismatch |

None of these is currently a bug in production. All of them are a bug waiting for
the next person who assumes the registries agree.

The documented registration procedure —
[email-program/03 §"Registration checklist (all seven points — miss one and it
silently fails)"](../email-program/03-mail-client-app.md) — is seven points
spanning **twelve files**: `roles.js` (three separate maps), the app's
`auth/callback.js`, `domains.json`, `config/roles.json`, `rutba_apps.sh` (four
arrays), root `package.json`, `.env.*`, `scripts/js/env-config.js`, `Dockerfile`,
`docker-compose.yml`, `dev-start.bat`, and `_app.js`. Plus a full Strapi restart,
because CORS origins bake at boot.

This section does not eliminate that checklist — deploy topology and workspace
wiring genuinely belong in files. It **collapses the presentation and catalogue
half of it into one row in one table**, and makes the remainder checkable.

### Payoff 3 — the shape multitenancy needs

Per-tenant app sets are unimplementable against a shared frontend bundle that
hardcodes the catalogue. Tenant A having Manufacturing and tenant B not having it
cannot be expressed by a constant compiled into `pos-shared`. Serving the
catalogue per-instance is the *prerequisite* for the tenant-aware frontend fleet
([core-server-multitenancy-program/03](../core-server-multitenancy-program/03-tenant-aware-frontends.md)),
not a follow-on from it.

## Data model

Extend `app-domain`
([`api_pro_app_domains`](../../../packages/strapi-api-pro/server/src/content-types/app-domain/schema.json)).
Existing: `key`, `name`, `description`, `isActive`, `appRoles`.

### Lifecycle fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `installed` | boolean | `true` | This instance has the app at all. Control-plane-owned once the plan grant exists; tenant-console-owned until then |
| `enabled` | boolean | `true` | The admin has switched it on. Always tenant-owned |

`isActive` **stays and keeps its exact current meaning** — the authorization
switch that the three enforcement sites already read. Do not overload it.

The derived state the catalogue serves is `installed && enabled && isActive`.
Three fields rather than one is deliberate, per
[README §grant vs state](README.md): a plan downgrade flips `installed`, an admin
preference flips `enabled`, and a downgrade-then-upgrade must not silently lose
the admin's choice. Collapsing them costs a migration on every live tenant later.

### Presentation fields (what `APP_META` hardcodes today)

| Field | Type | Notes |
|---|---|---|
| `group` | string | One of `APP_CATEGORIES` — `sales`, `inventory`, `people`, `finance`, `content`, `admin` |
| `icon` | string | FontAwesome class. `iconClass()` in `AppHome.js` already normalizes `fa-boxes` / `fas fa-boxes` / `fa-solid fa-boxes`, so validation can stay loose |
| `label` | string | Display name. **`name` already exists and is the same thing** — reuse `name`, do not add `label` |
| `description` | text | **Already exists** — reuse |
| `border` | string | Bootstrap class (`border-primary`). Presentation-only |
| `color` | string | Bootstrap **text class** (`text-dark`), *not* a hex value |
| `url` | string | Optional per-instance override of `APP_URLS` |
| `sort` | integer | Explicit catalogue ordering; today it is object-literal order |

Two corrections to how this is usually described:

1. `name` and `description` already exist on the row. Only `group`, `icon`,
   `border`, `color`, `url` and `sort` are genuinely new.
2. `APP_META.color` is a Bootstrap utility class, not a colour. The **hex**
   colours live one level up in `APP_CATEGORIES`
   ([`roles.js:49`](../../../packages/pos-shared/lib/roles.js)), which
   `appAccent()` reads via `CATEGORY_COLOR[meta.group]`. So an app's accent is
   derived from its *category*, never set on the app — which is exactly the
   invariant recorded in the app-home design system. **Do not add a per-app hex
   field.** Category → colour must remain the only path.

`APP_CATEGORIES` itself can stay a constant for now: six entries, changed roughly
never, and it is the taxonomy rather than the inventory. Revisit only if a tenant
asks to rename a category.

## Serving the catalogue

The natural home is the existing `/me/permissions` response.
[`me-permissions.js:131`](../../../packages/strapi-api-pro/server/src/services/me-permissions.js)
**already loads every active app-domain** to fan out wildcard roles:

```js
const allDomains = await strapi.db.query(APP_DOMAIN_UID).findMany({
  where: { isActive: true },
  select: ['key', 'name'],
});
```

Widening that `select` and attaching an `apps: [...]` array to the response costs
one query that is already being made. That matters: the catalogue then arrives on
the same request the client already blocks on for its claim, so no page gains a
render-blocking round trip.

- [ ] Widen the `select` to the presentation fields; attach `apps[]` to
      `/me/permissions`.
- [ ] Add a **public, unauthenticated** catalogue endpoint too. The login page
      and the app-home tiles render before a claim exists, and `pos-auth` needs
      the catalogue to decide where to send a user post-login. Serve only
      presentation fields — never role keys — from the public variant.
- [ ] Cache per instance with an explicit bust on catalogue write. Per T5, the
      cache key must be tenant-scoped; `strapi.apiPro.cache` is the existing
      per-process claim cache and the precedent to follow — and the existing
      hazard, since it is keyed by user id alone.

## Making `roles.js` read it

`APP_META` has four direct consumers and four selector functions; the selectors
are the real choke point.

**The entire surface is inside `pos-shared`.** A repo-wide search across
`packages/`, every `rutba-*` app and every `pos-*` app finds no other importer —
not one of the 18 frontends touches `APP_META` directly. So this migration is
contained in one package and needs no coordinated change across the app fleet,
which is what makes A1 an M rather than an L.

| Consumer | Reads |
|---|---|
| [`NavAppSwitcher.js`](../../../packages/pos-shared/components/NavAppSwitcher.js) | `APP_META` directly (line 32) + `getCrossAppLinks`, `getAppCatalogGroups` |
| [`Topbar.js`](../../../packages/pos-shared/components/Topbar.js) | `APP_META` directly (line 50) |
| [`AppHome.js`](../../../packages/pos-shared/components/AppHome.js) | `APP_META` directly (lines 38, 76) + defines `appAccent()` at line 37 |
| [`FooterInfo.js`](../../../packages/pos-shared/components/FooterInfo.js) | **Indirectly** — imports `getAppCatalogGroups`, `getCrossAppGroups` only |

Selectors, all in [`roles.js`](../../../packages/pos-shared/lib/roles.js):
`getCrossAppLinks` (213), `getCrossAppGroups` (262), `getAppCatalogLinks` (277),
`getAppCatalogGroups` (326).

> A correction worth recording: `FooterInfo` does **not** import `APP_META`, and
> `appAccent()` is not a standalone module — it is exported from `AppHome.js`.
> Both are reached through the selectors, which is precisely why the selectors
> are the right seam.

Convert the four selectors to read a runtime catalogue, and `FooterInfo` follows
with no edit at all. `NavAppSwitcher`, `Topbar` and `AppHome` need their three
direct `APP_META[...]` lookups redirected to the same accessor.

- [ ] Introduce `getAppCatalogue()` in `roles.js`: returns the server catalogue
      when hydrated, the hardcoded `APP_META` otherwise.
- [ ] **Keep `APP_META` as a build-time fallback**, not as dead code. It is what
      renders before `/me/permissions` resolves, what a static export falls back
      to, and what keeps the login page from flashing an empty launcher. Mark it
      explicitly as a fallback in its docblock so the next reader does not
      "clean it up".
- [ ] Repoint the three direct lookups in `NavAppSwitcher`, `Topbar`, `AppHome`.
- [ ] Rewrite the four selectors against the accessor. `FooterInfo` requires
      no change — verify that claim rather than assuming it.
- [ ] Fallback merge rule: server catalogue **wins per app key**; keys present
      only in `APP_META` render only when the server list is entirely absent
      (not hydrated), never as a union with a live-but-shorter server list.
      Otherwise a disabled app reappears via the fallback — the original bug.
- [ ] `NavAppSwitcher`'s top-6 frecency ordering (`rutba_app_usage` cookie) must
      filter against the live catalogue *before* ranking, or a disabled app will
      keep its slot by history.

## Admin UI

Extend `/app-domains` — currently a three-field form — into the catalogue editor,
and rename the section *Apps* (its subject is apps; "domains" is the api-pro
implementation term).

- [ ] Grid of every app: state, category, icon, roles, user count.
- [ ] `installed` / `enabled` toggles with the derived effective state shown
      explicitly, so an admin can see *why* an app is dark.
- [ ] Presentation editing: category, icon, label, description, sort.
- [ ] **Add the missing `update` descriptor method.** `list`/`create`/`del` today.
- [ ] **Fix the one-way door.** Either `listDomains` gains an
      `includeInactive` parameter, or the soft-delete stops filtering inactive
      rows out of the admin list. Reactivation must be possible from the same
      screen that deactivated it (ground rule 6).
- [ ] Preserve the `web` / `web-user` delete guard already in `deleteDomain`, and
      extend it: `users` and `auth` must not be disableable either — disabling
      the admin console from inside the admin console is a lockout with no
      recovery path short of SQL. Cross-check `grant:full-access` remains the
      documented escape hatch.
- [ ] Disabling an app with active users warns and lists them; it does not block.
- [ ] **Registry drift report.** A read-only panel that diffs the catalogue
      against `domains.json`, `roles.js` and `rutba_apps.sh`, showing exactly the
      table in Payoff 2. This is the cheapest possible fix for "nothing
      cross-validates them" and it needs no migration — build it in A1 even if
      the rest slips.

## Migration

- [ ] Seed one `app-domain` row per `APP_META` entry, copying `group`, `icon`,
      `border`, `color` and deriving `label` → existing `name`. Idempotent by
      `key`, per the migrations-not-seed-json convention.
- [ ] Reconcile the four registries **as a one-off, recorded diff** before
      seeding — decide explicitly whether `delivery` is an app (catalogue it) or
      an auth-only domain (mark it `installed: false` and document why).
- [ ] Default every existing row to `installed: true, enabled: true`, so the
      migration is behaviour-preserving on live instances.
- [ ] Backfill `sort` from current `APP_META` object-literal order to preserve
      today's launcher ordering exactly.

## Risks

- **Catalogue fetch on the critical path** → it rides `/me/permissions`, which
  every app already awaits; the public variant is cacheable and role-free.
- **Fallback masks a disabled app** → the per-key merge rule above; a live server
  list is authoritative and never unioned.
- **Admin disables the admin console** → guard `users`/`auth` alongside the
  existing `web`/`web-user` guard.
- **Stale catalogue in a long-lived tab** → bust on write; accept up to one
  session of staleness for presentation fields. Authorization is unaffected —
  `isActive` is re-read server-side per request.
- **A tenant edits presentation into something unusable** (blank icons, all apps
  in one category) → validate `group` against `APP_CATEGORIES`; fall back to the
  `admin` category and `FALLBACK_ACCENT` (`#f5b400`) rather than rendering
  nothing, matching `appAccent()`'s existing behaviour.
