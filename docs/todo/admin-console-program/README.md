# Admin Console Program

> **Status (2026-08-13): phase A0's app move is done; the six sections are
> still specification.** Three of them exist today as working code inside
> **`rutba-admin`** (:4022) and are extended here; three are new.
>
> **Superseded:** this spec was written assuming `rutba-users` would be renamed
> in place, keeping the app key `users` (ground rule 1 below). That was reversed
> before implementation: `rutba-admin` was created as a **copy**, `rutba-users`
> was deleted, and a **new `admin` app-domain** with `admin_admin` /
> `admin_manager` / `admin_staff` was added. The `users` domain and its roles
> survive as a deprecated alias — every `users_*` holder was additively granted
> the matching `admin_*` role — so nothing below that depends on the *domain*
> `users` is invalidated, only the claims about the app key.

`rutba-users` was carved out of `pos-auth` as a User Management app. It has since
accumulated mailbox provisioning, mail-server registration and app-domain
administration — surfaces that have nothing to do with users. The app is already
an admin console; this program names it one and finishes the job.

## Scope boundary: this is the *tenant's* admin console

Two consoles, deliberately distinct:

| | `rutba-console` (control plane) | **Rutba Admin** (this program) |
|---|---|---|
| Audience | Rutba, the service provider | The customer's own administrator |
| Question it answers | "Provision infrastructure for tenant X" | "Should **this instance** have this app, and who may use it?" |
| Lives in | Control-plane DB | Tenant DB |
| Status | Specced in [core-server-multitenancy-program](../core-server-multitenancy-program/02-control-plane.md) | This program |

rutba.pk is a customer of Rutba ERP. Its administrator must be able to say "we do
not use Manufacturing" without a Rutba engineer editing a constant. That is the
headline deliverable — [01](01-app-catalogue-entitlements.md).

## Measured scope (2026-08-13, dev branch)

| Surface | Measurement |
|---|---|
| `rutba-admin` pages | 8 (`app-domains`, `email-servers`, `mailboxes`, `users/{index,new,[id],access-assignment}`, `index`) |
| Home tiles in [`pages/index.js`](../../../rutba-admin/pages/index.js) | 6 — five `ready: true`, one (`/notifications`) `ready: false` |
| Pages wrapped in `PermissionCheck` | 4 of 7 (missing on `users/index`, `users/[id]`, `users/new`) |
| App registries that must agree | **4** (`domains.json`, `roles.js` ×3 maps, `rutba_apps.sh` ×2 maps, plus `config/roles.json`) |
| App keys per registry | `APP_META` 22 · `APP_URLS` 22 · `VALID_APP_KEYS` 21 · `domains.json` 27 · `rutba_apps.sh` 25 |
| Registries that cross-validate each other | **0** |
| Documented steps to register a new app | 7 points spanning **12 files** ([email-program/03 §41](../email-program/03-mail-client-app.md)) |
| Integration entities converging on one shape | 5 (`social-account`, `social-relay-provider`, `marketplace-account`, `cmp-sending-identity`, `mail-server`) |
| …of those, encrypted at rest | **2** (the mail pair). The other 3 are `private: true` plaintext |
| Integration entities with an admin UI | 1 (`mail-server`, via `/email-servers`) |
| `app-domain.isActive` enforcement sites | 3 (`me-permissions.js:132`, `policies.js:155`, `users.js:22`) |
| `app-domain.isActive` UI affordances | **0** |

## The six sections

| # | Section | State | Doc |
|---|---|---|---|
| 1 | Users & access | **Built** — extend | [below, §Users & access](#1-users--access-built) |
| 2 | **App catalogue & entitlements** | **New** — headline | [01](01-app-catalogue-entitlements.md) |
| 3 | **Integrations & connected accounts** | **New** | [02](02-integrations-and-credentials.md) |
| 4 | Mail administration | **Partly built** — extend | [03](03-mail-administration.md) |
| 5 | Relay providers | Server-side only — surface it | [02 §5](02-integrations-and-credentials.md) |
| 6 | Notifications | Buried in a user detail tab — promote | [below, §Notifications](#6-notifications-promote) |

Sections 5 and 6 are small enough that they do not earn their own document.
Section 5 is a consumer of the registry specced in [02](02-integrations-and-credentials.md);
section 6 is specced in full below.

## Ground rules

1. ~~**Grow `rutba-users`, never fork it.** The app **key stays `users`** —
   renaming it is a 12-file migration for a cosmetic gain.~~ **REVERSED — done
   as a rekey.** `rutba-admin` is a copy of `rutba-users` on the same port
   (4022) claiming `X-Rutba-App: admin`; `rutba-users` is deleted. The 12-file
   migration was paid: `domains.json`, `roles.json`, `APP_URLS.admin`,
   `NEXT_PUBLIC_ADMIN_URL`, `RUTBA_ADMIN__PORT`, unit `rutba_admin`, and
   `apps: ['admin', 'users']` on every descriptor this app calls. The `users`
   entries stay everywhere server-side as a **deprecated alias**; only
   `pos-shared/lib/roles.js` dropped its `users` entry, because a launcher tile
   pointing at an app that no longer exists is worse than no tile. Migrating
   grants off `users_*` and retiring the domain is a separate, later task.
2. **Data over constants.** Every list this console administers must be a table
   the console can edit. A hardcoded map that the admin cannot reach is a defect,
   not a design. This is the whole thesis of [01](01-app-catalogue-entitlements.md).
3. **Federate, don't migrate.** Where a capability already exists in a module
   (mailcow provisioning, marketplace credentials, relay providers), the console
   gets a *view* over it. Moving live credential tables for the sake of tidiness
   is real risk for cosmetic gain — see [02 §3](02-integrations-and-credentials.md).
4. **Server-enforced, client-reflected.** Every gate is enforced by api-pro
   descriptors server-side. UI gating (`PermissionCheck`, hidden tiles) is a
   courtesy to the user, never the control. A catalogue entry that hides an app
   must not be mistaken for an authorization boundary.
5. **No new authorization model.** The console administers the existing one
   (app-domain → app-role → policy). It does not introduce a parallel notion of
   "admin".
6. **Reversible switches.** Every enable/disable this console offers must be
   flippable back from the same screen. Today's `app-domain` soft-delete fails
   this and is fixed in [01](01-app-catalogue-entitlements.md).

## Tenancy discipline

The multitenancy program has ruled **database-per-tenant, forever**
([core-server-multitenancy-program ground rule 4](../core-server-multitenancy-program/README.md)).
The consequence for this program is precise and worth stating plainly:

> **Tenant-awareness means PLACEMENT, not a `tenant_id` column.**
> Everything specced in this program is tenant-side. It lives in the tenant
> database, is served by that tenant's backend, and needs no tenant discriminator
> because the database *is* the discriminator.

Adopt **T1–T10** from
[helpdesk-program/spec/34-multi-tenant-considerations.md](../helpdesk-program/spec/34-multi-tenant-considerations.md)
as the standing checklist for every table and endpoint added here. T3 (*tenant is
resolved from request context, never from a parameter*) and T5 (*no shared mutable
state keyed only by entity id* — the api-pro claim cache is the live example) are
the two that this program can actually violate.

### The one deliberate seam: grant vs state

There is exactly one place where this program touches the control plane, and it
is a seam, not a coupling:

| | Lives in | Owned by | Exists |
|---|---|---|---|
| **GRANT** — "this tenant's plan includes Mail" | Control-plane DB | Rutba (billing/plan) | Later |
| **STATE** — "Mail is enabled in this instance" | Tenant DB (`app-domain` row) | The customer's admin | **Now** |

Build the STATE row now. Shape it so a GRANT can be reconciled against it later
**without a migration**:

- Model the state as `installed` (the tenant has this app at all) and `enabled`
  (the admin has switched it on), not as one boolean. A grant revocation flips
  `installed`; an admin preference flips `enabled`. Collapsing them means a
  downgrade-then-upgrade silently loses the admin's choice.
- Never let the tenant DB hold a *reason* for `installed: false`. When the
  control plane arrives it owns the reason; the tenant row is a projection.
- Reconciliation is idempotent and one-way: control plane → tenant. The tenant
  console may never write `installed`.

Recording this now is the entire point — it costs nothing today and saves a
migration on every live tenant later.

## Phases

| Phase | Contents | Size | Depends on |
|---|---|---|---|
| **A0** | ~~Rename to~~ **rekey as** *Rutba Admin* (**done**); six-section IA; `PermissionCheck` on the three unwrapped pages; tighten `ADMIN_DOMAINS` to `['admin']` | S | — |
| **A1** | **App catalogue**: extend `app-domain`, serve the catalogue, `roles.js` reads it at runtime, admin UI | M+M | A0 |
| **A2** | **Credential vault**: lift `mail/crypto.js` to shared; migrate the 3 plaintext entities behind it | M | — (parallel) |
| **A3** | **Integration registry** + one admin UI over it; surface relay providers (§5) | M | A2 |
| **A4** | **Mail administration**: domains, aliases, quotas, bulk provisioning | M | A0 |
| **A5** | **Notifications section** (§6) + `app-role-template` UI | S | A0 |
| **A6** | Control-plane reconciliation of `installed` against a plan grant | S | A1, control plane Phase 1 |

A1 is the headline and should go first after A0. A2 is the only phase with a
security clock on it and shares no code with A1 — run them in parallel.

---

## 1. Users & access (built)

Working today: user CRUD, per-app access assignment matrix, app-domain list,
role assignment. Three defects and one gap:

- [ ] **Wrap the three unprotected pages in `PermissionCheck`.**
      [`users/index.js`](../../../rutba-admin/pages/users/index.js),
      [`users/[id].js`](../../../rutba-admin/pages/users/[id].js) and
      [`users/new.js`](../../../rutba-admin/pages/users/new.js) have no wrapper;
      the other four admin pages each use it. Server-side gating still holds
      (ground rule 4), so this is a UX defect — the pages render, then fail every
      request — not a breach.
      *Note: the brief for this program named two pages; `users/new.js` is a
      third, found during verification.*
- [ ] **Tighten `ADMIN_DOMAINS` to `['admin']`.**
      [`user-admin.js`](../../../pos-strapi/src/api/user-admin/controllers/user-admin.js)
      is now `['admin', 'users', 'auth']` — two deprecated aliases, each kept so
      an earlier generation of holders isn't locked out: `users` until the
      `admin_*` backfill has run everywhere, `auth` until the older `users_*`
      one has. Preconditions: confirm every `auth_admin` and every `users_*`
      holder also holds an `admin_*` role, then flip. The `listDirectory` call
      deliberately widens to `[...ADMIN_DOMAINS, 'hr']` and keeps its own
      semantics. The same widening applies to the mail-server, mail-account
      access and notification-preference gates.
- [ ] **Give `app-role-template` a UI.** The content type exists
      ([`api_pro_app_role_templates`](../../../packages/strapi-api-pro/server/src/content-types/app-role-template/schema.json)
      — `key`, `name`, `description`, `appRoles` m2m) and is *hidden from the
      Strapi content-manager and content-type-builder alike*
      (`pluginOptions.visible: false`), so it has no UI anywhere outside the
      api-pro admin plugin. It is exactly the "job title → role bundle" primitive
      the access-assignment matrix needs: pick *Warehouse Supervisor*, get the
      seven roles.
- [ ] Apply a template to a user from `users/[id]` and to a selection from the
      access-assignment matrix; show which roles a template would add or remove
      before applying (never a silent overwrite).

## 6. Notifications (promote)

`UserNotificationPrefs` is a component rendered inside a tab on
[`users/[id].js:494`](../../../rutba-admin/pages/users/[id].js). The
`/notifications` tile in [`pages/index.js:14`](../../../rutba-admin/pages/index.js)
is `ready: false` and links nowhere.

Per-user preference editing buried one level inside a user record is the wrong
altitude for the questions an admin actually asks — *which channels are enabled
instance-wide, which templates exist, who is over-notified, why did this event
not fire.*

- [ ] Build `/notifications` as its own section; flip the tile to `ready: true`.
- [ ] Keep `UserNotificationPrefs` mounted on `users/[id]` as well — the
      per-user view is still the right place to answer "why does *this* person
      get this". Promote, do not move.
- [ ] Instance-wide channel toggles; a template browser; a per-event matrix of
      who currently receives what.
- [ ] Respect the two-engine invariant: engine-owned rows use
      `trigger_event='none'`, and the section must not offer to change that.
      (Recorded in commit `f662c15`; both engines share one table.)
- [ ] Recent-deliveries view with failure reasons — the single most common
      support question this section can retire.
