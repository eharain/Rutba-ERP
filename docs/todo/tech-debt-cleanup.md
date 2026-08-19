# Tech-debt & cleanup backlog

<!-- verify-docs: removed packages/api-provider/providers/createStrapiProxy.js packages/api-provider/server/index.js server/access-guard/index.js -->
<!-- verify-docs: planned docs/done/ docs/archive/ -->
<!-- The removed/ paths are named as a record of what section 2 deleted. -->

Cross-cutting cleanup items surfaced during the 2026-06 documentation audit. These are dead code / stale config / config-drift items that have **no home in a module spec** (module-specific open work lives in the respective `docs/todo/` specs). None are blocking; they're tracked here so they aren't lost.

---

## 1. Remove the dead `dev:desk` script (pos-desk retired) — ✅ Done (2026-06)

Removed `dev:desk` from `package.json`, and the dangling `rutba_pos_desk` service from `scripts/rutba_services.sh`, `scripts/setup-systemd-services.sh`, and `scripts/rutba_log_rotate.sh` (the `SERVICES` list + `SVC_CMD`/`SVC_DESC` maps). Deleted the legacy launch scripts `apps/sales/portal/scripts/{start-pos-desk-forever.sh, setup-and-start-pos-desk.sh, setup-and-start-pos-desk.bat}`.

- **Left (cosmetic, harmless):** `.gitignore` `/pos-desk` entries; the `// /pos-desk/…` path comments at the top of some `apps/inventory/stock` files; the `pos-desk` example claim in `packages/strapi-api-pro/admin/src/pages/Policies.jsx`; and the defensive `${prefix}:desk` entries in the `run-all.js`/`run-app.js` EXCLUDED sets.

## 2. Delete the vestigial api-provider server-proxy code — ✅ Done (2026-06)

Server-side scope enforcement is done via the api-pro **seeder** (DB policy rows) + **request-interceptor**, not via generated per-entity handlers. Removed:

- Deleted `packages/api-provider/providers/createStrapiProxy.js` (no-op passthrough) and `packages/api-provider/server/index.js` (the ~60 unused `*Server` exports); removed the `"./server"` entry from `packages/api-provider/package.json` `exports`; dropped `packages/api-provider/server` from the scan lists in `validate-endpoint-usage.mjs` and `rewrite-legacy-alias-calls.mjs`.

- **NOT removed — `createClientProxy.js`:** it is **not fully unused** — the scaffolder (`scripts/scaffold-endpoint-providers.mjs`) still references it as a migration target (detecting/rewriting old generated files). Retire it together with that migration code once it's confirmed every generated client is already inline. (Named-policy follow-up #7.)
- **Also stale:** `packages/api-provider/README.md` still documents a `buildAccessGuardProPayload` helper at `server/access-guard/index.js` — a file that no longer exists. Clean up that section.

## 3. Uninstall `swiper` (SHOP-PAGE-REDESIGN step 14)

The shop redesign replaced Swiper with a custom `ScrollSlider`, but `apps/content/storefront/package.json` still depends on `swiper@^10.3.1`, still imported by `components/home/hero-slider.tsx`, `components/home/collection-list.tsx`, and `components/brands/index.tsx`.

- **Action:** migrate those three components to `ScrollSlider`, then `npm uninstall swiper`. (See `(removed — shipped)` step 14.)

## 4. Finish wiring `apps/inventory/manufacturing` into config surfaces

`apps/inventory/manufacturing` (port 4014) was added after the other apps and was missing from several
config surfaces. **Re-measured 2026-08-17** (see the fuller
[registry drift report](erp2-program/01-registry-drift-report.md)): three of the five gaps have
since been fixed — `scripts/js/env-config.js` has `NEXT_PUBLIC_MANUFACTURING_URL`,
`packages/shared/lib/roles.js` carries `manufacturing` in `APP_URLS`/`VALID_APP_KEYS`/`APP_META`,
and `scripts/rutba_log_rotate.sh` now reads `RUTBA_SERVICES` from the registry. Still open:

- `packages/api-provider/scripts/discover-descriptor-meta.mjs` — `APP_FOLDERS` is missing
  `apps/inventory/manufacturing` **and seven other late apps** (marketplace, inventory, seed, campaigns,
  mail, admin, helpdesk).
- `apps/sales/portal/scripts/hostinger/hostinger.config.js` — no `manufacturing` app entry.

- **Action:** both are subsumed by the P0 app manifest (drift report, "What this feeds") —
  fix by generation, or hand-add if the manifest slips.

## 5. Review/remove stray scratch docs — ✅ done (2026-08-17)

`packages/api-provider/temp/` held `COMBINED_ENDPOINTS_README.md`, `IMPLEMENTATION_SUMMARY.md`,
`README.md` and three `combined-endpoints*` files — scratch from an abandoned combined-endpoints
experiment, all untracked. Deleted; the directory's `.gitignore`/`.gitkeep` remain.

- **Action:** confirm dead and delete, or move under `docs/` if any are worth keeping.

## 6. (Optional) Archive shipped / historical docs

The shipped `docs/todo/` specs and the 2026-05-15 pre-deploy snapshots are bannered in place (status updated, originals retained for rationale/audit trail). If a cleaner layout is wanted, move completed specs to `docs/done/` and the dated snapshots to `docs/archive/`.

---

> Module-specific open work is tracked in its own spec: accounting frontend pages (Bills / Banking & Registers / Tax & Periods) in [`accounting-completion-spec.md`](accounting-completion-spec.md); production-labour capitalization in `(removed — shipped)` §7.3; address-book fold-on-login in `(removed — shipped)`.
