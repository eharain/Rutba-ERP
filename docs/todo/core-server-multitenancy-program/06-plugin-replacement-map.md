# 06 — Plugin & package replacement map

How each load-bearing package/plugin maps into the services/core world, and how
inter-instance data integration (copy-over) survives the migration.

## api-provider — KEEP, unchanged (it is the contract, not a Strapi artifact)

`packages/api-provider` was never a Strapi plugin: descriptors in `api/*.js` +
scaffolder + generated clients. It is precisely the asset that makes replacement
possible, so it must not change:

- Frontends keep consuming generated clients exactly as today.
- services/core reads the **same descriptor files** to register routes and policies
  (already the plan in 04 §3.4).
- Later, optionally, the scaffolder gains a small "server manifest" emit for
  services/core (route table pre-compiled instead of parsed at boot) — an
  optimization, not a requirement.

Rule: any change a migration step wants to make to a descriptor's shape is a
red flag (program ground rule 1).

## strapi-api-pro — PORT (it's our code; the plugin wrapper is the only Strapi part)

Decomposition into services/core modules:

| Plugin piece | services/core home | Notes |
|---|---|---|
| Descriptor loader + seeder (verb whitelist, method/scope, custom-action rules) | `src/policy/seeder` | Same DB mirror tables — the api-pro CTs are already in the registry and schema-validated |
| Request interceptor (hybrid + denyByDefault) | Koa middleware `src/policy/interceptor` | Ports near-verbatim (Strapi is Koa) |
| Claim resolution user→app_roles + cache | `src/policy/claims` | Same cache design; per-process is fine (one tenant per process); pool-keyed per tenant at endgame |
| `$user.*` token evaluation, ownership (`owners`), scopes, requireAppRole | `src/policy/evaluate` | Pure functions, direct port |
| `/me/permissions` | core route | Byte-compatible (contract test) |
| **API-token verification** | `src/policy/api-token` | MUST be in the first port: inter-instance sync and the marketplace worker authenticate with API tokens (`strapi_api_tokens` table — core reads it; own token CT only at endgame) |
| JWT handling | verify-only until Phase 7 (issuer stays services/strapi) | Shared per-tenant secret |
| Policy Editor admin UI | **moves to a rutba app** (apps/admin/seed control app or rutba-console) | Consistent with the standing "no Strapi-admin extensions" rule; the admin `admin::hasPermissions` routes die with the admin panel |

## strapi-content-sync-pro — REPLACE with a contract-level sync engine

Today there are **two** inter-instance integration paths:

1. **Commerce copy-over** (catalog/stock/order with the second Rutba instance):
   already contract-level — the `rutba` marketplace adapter + worker talk to the
   other instance's descriptor API with an API token, identity via
   `external_ids.rutba_origin`. **This survives the migration untouched** and is
   the proven pattern to generalize.
2. **CMS copy-over** (sync-pro): Strapi-internal (document service, admin UI,
   `sync_logs`/`sync_run_reports` tables — the "unaccounted" tables in the
   schema validator). This is the piece that must be re-architected, because it
   dies with Strapi and because DB-level/internal sync breaks the moment one
   side is migrated and the other isn't.

### Replacement: `services/core` content-sync module (or standalone worker)

Design principle: **sync speaks the wire contract, never the database**, so any
pairing works during and after the strangler — Strapi↔Strapi, Strapi↔core,
core↔core. Components:

- **Sync manifest** (config, per connection): which CTs sync, direction
  (push/pull/two-way), conflict policy per CT (source-of-truth wins /
  last-write-wins), populate depth, media handling.
- **Identity**: keep the per-domain conventions — CMS entities carry the same
  `documentId` across instances (create-with-documentId must therefore be part
  of the shim's write path); commerce entities keep `external_ids.<origin>`
  mapping. Do not invent a third scheme.
- **Change detection**: cursor on `updatedAt` per CT + tombstone handling for
  deletes (a small `sync_tombstones` log written by the delete path, or
  full-set `documentId` diff for low-volume CMS types — decide per CT in the
  manifest; CMS volumes make full-diff acceptable).
- **Transport**: plain descriptor-API HTTP with an API token; media copied via
  the media file server (namespace-to-namespace), not re-uploaded through
  entity endpoints.
- **Runs & audit**: keep the `sync_logs` / `sync_run_reports` table shapes
  (register their schemas in services/core when sync-pro is retired) so history
  and the existing reporting UI patterns carry over.
- **Triggers**: cron + manual run endpoint + optional webhook on publish.
- **UI**: run status/history moves to a rutba app (apps/content/cms for CMS sync,
  apps/sales/marketplace already owns commerce sync) — same rule as the Policy
  Editor: no admin-panel UIs to rebuild.

### Multitenancy bonus

The same engine covers tenant-scoped copy-over inside one fleet: golden/demo
content into a freshly provisioned tenant (provisioning step 4 can call it),
staging→production promotion, and tenant export/import (pairs with the
CMS export/import work already planned inside apps/content/cms).

## The rest ("etc.")

- **Upload provider (media file server)**: read side done in shim v0; the
  provider's write path (attach/create file rows + morph links) ports with the
  shim's write path. The file server itself is untouched.
- **users-permissions**: verify-only now; issuance/register/reset ported in
  Phase 7 (04 §Phase 7). The role/permission tables stay as-is — api-pro is the
  real authority anyway.
- **Email**: mailcow SMTP sender + settings-DB templates — small port, needed
  before any module that sends mail (order notifications) migrates.
- **Admin panel & content manager**: not replaced; remaining monthly-use
  screens get homes in rutba apps before Phase 7 (playbook standing decision).
- **i18n**: not meaningfully used (locale columns exist, single locale) — the
  shim treats locale as a plain column; no plugin equivalent needed unless a
  multi-locale storefront becomes a requirement.

## Sequencing note

The api-pro port (with API-token support) comes with the Koa layer — nothing
serves without it. The sync engine replacement can wait until the CMS tranche
(playbook tranche 5); until then sync-pro keeps running on the Strapi side, and
commerce copy-over is already migration-proof.
