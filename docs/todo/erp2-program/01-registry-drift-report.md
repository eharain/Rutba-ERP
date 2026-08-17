# Registry drift report — P0

Status: **measured 2026-08-17.** The first deliverable of [P0](README.md): every surface that
enumerates apps, compared, with each disagreement classified as *accidental drift* (fix it) or
*deliberate divergence* (the manifest must encode it as a flag, not "fix" it). This report is
the ground truth the `config/apps.manifest.json` build (P0's next item) starts from.

<!-- verify-docs: planned config/apps.manifest.json -->

## The surfaces and their counts

| Surface | Count | What it enumerates |
|---|---|---|
| [scripts/rutba_apps.sh](../../../scripts/rutba_apps.sh) | 25 units | 22 apps + strapi + core + marketplace-worker |
| root [package.json](../../../package.json) workspaces | 22 apps | + `packages/*`; backends deliberately out-of-workspace |
| [Dockerfile](../../../Dockerfile) targets | complete | all 22 apps + strapi + core + marketplace-worker |
| [docker-compose.yml](../../../docker-compose.yml) | 27 services | adds `mysql` + `strapi-seed` (profile) |
| [roles.js](../../../packages/pos-shared/lib/roles.js) `APP_URLS` | 22 | includes `web` |
| roles.js `VALID_APP_KEYS` | 21 | excludes `web` — deliberate (D1) |
| roles.js `APP_META` | 22 | includes `web` with `public: true` |
| [domains.json](../../../packages/api-provider/config/domains.json) | 27 domains | 22 app domains + `users` + `delivery` + 3 `accounts-*` sub-domains |
| [.env.development](../../../.env.development) | 22 `*__PORT` + 2 dead | see A2 |

## Accidental drift — fix

- **A1 — `APP_FOLDERS` in [discover-descriptor-meta.mjs](../../../packages/api-provider/scripts/discover-descriptor-meta.mjs)
  is missing 8 of 22 apps**: `rutba-manufacturing`, `rutba-marketplace`, `rutba-inventory`,
  `rutba-seed`, `rutba-campaigns`, `rutba-mail`, `rutba-admin`, `rutba-helpdesk`. Descriptor
  usage in those apps is invisible to the meta-discovery pass. Worse than
  [tech-debt-cleanup.md](../tech-debt-cleanup.md) §4 records (it names only manufacturing).
  Fix: hand-add now, or generate from the manifest when it lands.
- **A2 — dead env keys** in [.env.development](../../../.env.development):
  `NEXT_PUBLIC_USERS_URL` and `RUTBA_USERS__PORT` (both point at 4022, which belongs to
  `rutba-admin`). Leftovers of the users→admin rekey. Delete.
- **A3 — `delivery` domain** in [domains.json](../../../packages/api-provider/config/domains.json)
  has no app, no workspace, no catalogue presence anywhere. Either it is a planned domain
  (then it needs a comment saying so, like `users` has) or it is vestigial (then retire it).
  Decision owed; nothing enforces either reading today.
- **A4 — [hostinger.config.js](../../../rutba-web-user/scripts/hostinger/hostinger.config.js)**
  has no `manufacturing` entry (nor the later apps). Scope: the Hostinger deploy path only.
- **A5 — [tech-debt-cleanup.md](../tech-debt-cleanup.md) §4 is itself stale**: of its five
  claims, three are already fixed — `scripts/js/env-config.js` has `NEXT_PUBLIC_MANUFACTURING_URL`,
  [roles.js](../../../packages/pos-shared/lib/roles.js) carries manufacturing in all three maps,
  and [rutba_log_rotate.sh](../../../scripts/rutba_log_rotate.sh) now reads
  `RUTBA_SERVICES` from the registry instead of a hand list. Only A1 and A4 remain. Updated in
  this commit.
- **A6 — `rutba-rider` hardcodes `-p 4012`** in its package.json scripts; every other app takes
  `PORT` from [load-env.js](../../../scripts/js/load-env.js). One divergent app, invisible until
  a port move. Normalize when the manifest lands.

## Deliberate divergences — the manifest must encode these, not "fix" them

- **D1 — `web` is a public app**: in `APP_URLS` and `APP_META` (`public: true`) but not in
  `VALID_APP_KEYS`, so it never gates access and always appears in catalogues. Manifest flag:
  `public`.
- **D2 — `users` is a deprecated domain alias** with no app: documented in both
  [roles.js](../../../packages/pos-shared/lib/roles.js) and
  [api/users.js](../../../packages/api-provider/api/users.js). Retires in P3 with the alias.
  Manifest: domains may exist without apps, flagged `deprecated`.
- **D3 — `accounts-ap` / `accounts-ar` / `accounts-viewer`** are authorization domains without
  frontends (per-policy role-scope convention). Same manifest rule as D2: the domain set is a
  superset of the app set, by design.
- **D4 — `pos-auth` / `pos-stock` / `pos-sale`** workspace directories vs app keys
  `auth` / `stock` / `sale`. The naming split no tool can see through. Manifest carries
  `workspacePath` separately from `key` now; the directories rename in P3 (D8 in the
  [program README](README.md)).
- **D5 — `marketplace-worker`** is a portless service (registry records `-`). Manifest:
  services may have no port.

## What this feeds

The manifest (`config/apps.manifest.json`, planned) gets one entry per app/service with:
`key`, `workspacePath`, `port` (nullable), `domain(s)`, `category`, `public`, `deprecated`.
`verify:wiring` then hard-fails on any surface disagreeing with it. A1/A2/A6 get fixed by
generation; D1–D5 become explicit flags instead of tribal knowledge.
