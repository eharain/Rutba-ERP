# Core-server + Multitenancy Program

Two intertwined workstreams:

- **Workstream A — Multitenancy**: turn the single-tenant rutba.pk deployment into a
  SaaS fleet: control plane, tenant provisioning, shared frontend fleet, per-tenant
  backend + database.
- **Workstream B — Strapi replacement**: strangler-migrate the backend from pos-strapi
  to a slim in-house core server (`rutba-core`) serving the exact same descriptor-defined
  REST contract, module by module.

They are sequenced so that A ships revenue first on instance-per-tenant Strapi, while B
proceeds in parallel and progressively replaces what each tenant container runs. The
control plane's contract is deliberately "a backend container that serves the descriptor
API" — it must never assume Strapi.

## Measured scope (2026-07, dev branch)

| Surface | Count |
|---|---|
| Content-types (`pos-strapi/src/api`) | 118 |
| API descriptor files (`packages/api-provider/api`) | 107 |
| Custom JS files under `src/api` | 471 |
| Custom controllers / services | 147 / 135 |
| `strapi.documents()` call sites | 361 (67 files) |
| `strapi.db.query` / `db.connection` call sites | 162 (raw SQL: 7) |
| Legacy `entityService` call sites | 71 |
| `populate` usages (nested-object form) | 295 (212) |
| Transaction call sites | 19 |
| `lifecycles.js` files | 28 |
| draftAndPublish content-types | 18 (CMS cluster) |
| Components | 20 |
| Cron config files | 3 (`cron-tasks.js`, `inventory-cron-tasks.js`, `social.js`) |
| Frontend apps (workspaces) | 18 |

Key leverage: the public contract consumed by all 18 frontends is the descriptor API
(api-provider generated clients), **not** Strapi's native REST. Downstream apps also
treat MySQL table names as a stable contract. Both servers can therefore share one
database and one wire contract during migration.

## Phases

| Phase | Workstream | Deliverable | Doc |
|---|---|---|---|
| 0 | B (enables A too) | Contracts freeze + golden contract test suite | [01-contracts-freeze.md](01-contracts-freeze.md) |
| 1 | A | Control plane MVP: tenant registry + provisioning + Caddy routing | [02-control-plane.md](02-control-plane.md) |
| 2 | A | Tenant-aware frontend fleet (hostname → tenant → API origin) | [03-tenant-aware-frontends.md](03-tenant-aware-frontends.md) |
| 3 | B | `rutba-core` skeleton: Koa + data shim + api-pro port | [04-core-server-and-shim.md](04-core-server-and-shim.md) |
| 4 | B | First module migrated end-to-end (mfg) + playbook validated | [05-module-migration-playbook.md](05-module-migration-playbook.md) |
| 5 | A | Fleet ops: upgrade rings, backups, monitoring, suspension | [02-control-plane.md](02-control-plane.md) |
| 6 | B | Remaining modules in tranches; sale/stock/accounting cluster last | [05-module-migration-playbook.md](05-module-migration-playbook.md) |
| 7 | B | Auth issuer cutover, Strapi retirement, multi-DB core process | [04-core-server-and-shim.md](04-core-server-and-shim.md), [05](05-module-migration-playbook.md) |

Phases 1–2 (ship SaaS on Strapi) and 3–4 (prove the core) can run in parallel.

Cross-cutting reference: [06-plugin-replacement-map.md](06-plugin-replacement-map.md) —
what happens to api-provider (kept), strapi-api-pro (ported), strapi-content-sync-pro
(replaced by a contract-level sync engine), and the inter-instance copy-over paths.

## Ground rules

1. **Contract over implementation.** No frontend, descriptor, or DB-table change is
   required by this program. If a migration step needs one, that step is wrong.
2. **Same database, exclusive write paths.** During strangling, pos-strapi and
   rutba-core run against the same MySQL 8 DB, but any given module's routes are served
   by exactly one of them (Caddy path routing). A module migrates atomically with its
   side-effect chokepoints.
3. **Schema authority handover, never shared.** Until a module migrates, Strapi's
   auto-sync owns its tables. After migration, plain SQL migrations own them — and the
   content-type schema **stays present in Strapi** (routes dark) until final retirement,
   because removing a CT can trigger destructive schema sync.
4. **Database-per-tenant, forever.** Even after Strapi is gone. Isolation, per-customer
   backup/restore/offboarding, and PK data-residency all depend on it.
5. **Descriptors remain the single source of authorization truth** (api-pro model),
   evaluated per-request by whichever server owns the route.

## Risks (summary — details in each doc)

- **Shim semantic drift** (filters/populate/pagination differences) → golden contract
  tests diffing both backends against the same snapshot DB, per module, before flip.
- **Destructive Strapi schema sync** on migrated tables → rule 3 above.
- **Split side effects** (e.g. order transition posting GL while sale and accounting
  live in different servers) → tranche ordering in the playbook; the
  sale/stock/payment/GL cluster moves as one.
- **Auth issuer duality** → Strapi remains the sole JWT issuer until the final phase;
  rutba-core only verifies (shared secret).
- **Fleet upgrade blast radius** → version pinning + canary ring (rutba.pk is canary 0).
- **Per-tenant cost with Strapi backend** (~0.5–1 GB RSS/tenant) → acceptable at launch
  scale; the economic driver for Workstream B's endgame (one multi-DB core process).
