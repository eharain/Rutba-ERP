# Registry drift report — P0

Status: **measured 2026-08-17; resolved the same day.** The first deliverable of [P0](README.md):
every surface that enumerates apps, compared, with each disagreement classified as *accidental
drift* (fix it) or *deliberate divergence* (the manifest must encode it as a flag, not "fix" it).

**Outcome:** [config/apps.manifest.json](../../../config/apps.manifest.json) is now the single
source of truth and [verify-app-wiring.js](../../../scripts/js/verify-app-wiring.js) hard-fails
on any surface that disagrees with it. `npm run verify:wiring` went from **9 errors to
25/25 wired**; the gate was checked by injecting a port change and confirming it fails.

## The surfaces and their counts

| Surface | Count | What it enumerates |
|---|---|---|
| [scripts/rutba_apps.sh](../../../scripts/rutba_apps.sh) | 25 units | 22 apps + strapi + core + marketplace-worker |
| root [package.json](../../../package.json) workspaces | 22 apps | + `packages/*`; backends deliberately out-of-workspace |
| [Dockerfile](../../../Dockerfile) targets | complete | all 22 apps + strapi + core + marketplace-worker |
| [docker-compose.yml](../../../docker-compose.yml) | 27 services | adds `mysql` + `strapi-seed` (profile) |
| [roles.js](../../../packages/shared/lib/roles.js) `APP_URLS` | 22 | includes `web` |
| roles.js `VALID_APP_KEYS` | 21 | excludes `web` — deliberate (D1) |
| roles.js `APP_META` | 22 | includes `web` with `public: true` |
| [domains.json](../../../packages/api-provider/config/domains.json) | 27 domains | 22 app domains + `users` + `delivery` + 3 `accounts-*` sub-domains |
| [.env.development](../../../.env.development) | 22 `*__PORT` + 2 dead | see A2 |

## Accidental drift — status

- **A1 — ✅ fixed. `APP_FOLDERS` in [discover-descriptor-meta.mjs](../../../packages/api-provider/scripts/discover-descriptor-meta.mjs)
  was missing 8 of 22 apps**: `apps/inventory/manufacturing`, `apps/sales/marketplace`, `apps/inventory/control`,
  `apps/admin/seed`, `apps/content/campaigns`, `apps/content/mail`, `apps/admin/console`, `apps/sales/helpdesk` — every app
  added after apps/content/storefront, so descriptor usage in all of them was invisible to the meta-discovery
  pass. Worse than [tech-debt-cleanup.md](../tech-debt-cleanup.md) §4 recorded (it named only
  manufacturing). All 22 now listed, and `descriptorScan` in the manifest keeps it that way.
- **A2 — ✅ fixed. Dead env keys** in `.env.development`:
  `NEXT_PUBLIC_USERS_URL` and `RUTBA_USERS__PORT` (both point at 4022, which belongs to
  `apps/admin/console`). Leftovers of the users→admin rekey. Delete.
- **A3 — ⚠️ still owed, but now visible. `delivery` domain** in
  [domains.json](../../../packages/api-provider/config/domains.json) has no app, no workspace and
  no catalogue presence. Recorded in the manifest's `domainsWithoutApps` as `status: "undecided"`
  so it can no longer hide — the validator demands every domain be either claimed by an app or
  declared here with a reason. The decision (planned vs vestigial) is still yours.
- **A4 — ⚠️ still open. [hostinger.config.js](../../../apps/sales/portal/scripts/hostinger/hostinger.config.js)**
  has no `manufacturing` entry (nor the later apps). Scope: the Hostinger deploy path only, which
  is why it is not yet a manifest-checked surface.
- **A5 — ✅ fixed. [tech-debt-cleanup.md](../tech-debt-cleanup.md) §4 was itself stale**: of its five
  claims, three are already fixed — `scripts/js/env-config.js` has `NEXT_PUBLIC_MANUFACTURING_URL`,
  [roles.js](../../../packages/shared/lib/roles.js) carries manufacturing in all three maps,
  and [rutba_log_rotate.sh](../../../scripts/rutba_log_rotate.sh) now reads
  `RUTBA_SERVICES` from the registry instead of a hand list. Only A1 and A4 remain. Updated in
  this commit.
- **A6 — ⚠️ still open. `apps/sales/rider` hardcodes `-p 4012`** in its package.json scripts; every
  other app takes `PORT` from [load-env.js](../../../scripts/js/load-env.js). One divergent app,
  invisible until a port move. Low risk while 4012 agrees with the manifest, so it is left for
  the P3 sweep rather than churned now.

**Also fixed in passing** (both surfaced by the manifest, neither in the original list):
`CORE__PORT` was missing from the tracked
[sample.env.enviromentname.txt](../../../sample.env.enviromentname.txt) — a first-time deploy
seeds `.env.production` from that file, so services/core would have fallen back to port 3000 — and
`NEXT_PUBLIC_CONSOLE_URL` was missing from `.env.production`.

## Deliberate divergences — the manifest must encode these, not "fix" them

- **D1 — `web` is a public app**: in `APP_URLS` and `APP_META` (`public: true`) but not in
  `VALID_APP_KEYS`, so it never gates access and always appears in catalogues. Manifest flag:
  `public`.
- **D2 — `users` is a deprecated domain alias** with no app: documented in both
  [roles.js](../../../packages/shared/lib/roles.js) and
  [api/users.js](../../../packages/api-provider/api/users.js). Retires in P3 with the alias.
  Manifest: domains may exist without apps, flagged `deprecated`.
- **D3 — `accounts-ap` / `accounts-ar` / `accounts-viewer`** are authorization domains without
  frontends (per-policy role-scope convention). Same manifest rule as D2: the domain set is a
  superset of the app set, by design.
- **D4 — `apps/admin/auth` / `apps/inventory/stock` / `apps/sales/pos`** workspace directories vs app keys
  `auth` / `stock` / `sale`. The naming split no tool can see through. Manifest carries
  `workspacePath` separately from `key` now; the directories rename in P3 (D8 in the
  [program README](README.md)).
- **D5 — `marketplace-worker`** is a portless service (registry records `-`). Manifest:
  services may have no port.

## What shipped

[config/apps.manifest.json](../../../config/apps.manifest.json) carries one entry per
app/service — `key`, `unit`, `workspace`, `kind`, `port` (nullable), `domains`, `category` — plus
the five flags that turn D1–D5 from tribal knowledge into declarations: `public`, `npmWorkspace`,
`build`, `launcher`, `descriptorScan`. Domains with no app live in `domainsWithoutApps` with a
stated reason.

[verify-app-wiring.js](../../../scripts/js/verify-app-wiring.js) now checks the manifest against
the systemd registry (command, port, kind), the workspace list, the root script families, both env
files plus the tracked sample, `roles.js` (`APP_URLS` var + fallback port, `VALID_APP_KEYS`,
`APP_META` presence and category), `domains.json`, the descriptor scan list, the Dockerfile and
compose, and `dev-start.bat`.

Presentation deliberately stayed out: `label`/`icon`/`description` remain in `APP_META` until the
admin console serves the catalogue per tenant, because baking titles into a build-time file is
work undone the moment a tenant can choose its own app set.
