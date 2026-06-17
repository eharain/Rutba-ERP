# Tech-debt & cleanup backlog

Cross-cutting cleanup items surfaced during the 2026-06 documentation audit. These are dead code / stale config / config-drift items that have **no home in a module spec** (module-specific open work lives in the respective `docs/todo/` specs). None are blocking; they're tracked here so they aren't lost.

---

## 1. Remove the dead `dev:desk` script (pos-desk retired) — ✅ Done (2026-06)

Removed `dev:desk` from `package.json`, and the dangling `rutba_pos_desk` service from `scripts/rutba_services.sh`, `scripts/setup-systemd-services.sh`, and `scripts/rutba_log_rotate.sh` (the `SERVICES` list + `SVC_CMD`/`SVC_DESC` maps). Deleted the legacy launch scripts `rutba-web-user/scripts/{start-pos-desk-forever.sh, setup-and-start-pos-desk.sh, setup-and-start-pos-desk.bat}`.

- **Left (cosmetic, harmless):** `.gitignore` `/pos-desk` entries; the `// /pos-desk/…` path comments at the top of some `pos-stock` files; the `pos-desk` example claim in `packages/strapi-api-pro/admin/src/pages/Policies.jsx`; and the defensive `${prefix}:desk` entries in the `run-all.js`/`run-app.js` EXCLUDED sets.

## 2. Delete the vestigial api-provider server-proxy code — ✅ Done (2026-06)

Server-side scope enforcement is done via the api-pro **seeder** (DB policy rows) + **request-interceptor**, not via generated per-entity handlers. Removed:

- Deleted `packages/api-provider/providers/createStrapiProxy.js` (no-op passthrough) and `packages/api-provider/server/index.js` (the ~60 unused `*Server` exports); removed the `"./server"` entry from `packages/api-provider/package.json` `exports`; dropped `packages/api-provider/server` from the scan lists in `validate-endpoint-usage.mjs` and `rewrite-legacy-alias-calls.mjs`.

- **NOT removed — `createClientProxy.js`:** it is **not fully unused** — the scaffolder (`scripts/scaffold-endpoint-providers.mjs`) still references it as a migration target (detecting/rewriting old generated files). Retire it together with that migration code once it's confirmed every generated client is already inline. (Named-policy follow-up #7.)
- **Also stale:** `packages/api-provider/README.md` still documents a `buildAccessGuardProPayload` helper at `server/access-guard/index.js` — a file that no longer exists. Clean up that section.

## 3. Uninstall `swiper` (SHOP-PAGE-REDESIGN step 14)

The shop redesign replaced Swiper with a custom `ScrollSlider`, but `rutba-web/package.json` still depends on `swiper@^10.3.1`, still imported by `components/home/hero-slider.tsx`, `components/home/collection-list.tsx`, and `components/brands/index.tsx`.

- **Action:** migrate those three components to `ScrollSlider`, then `npm uninstall swiper`. (See [`SHOP-PAGE-REDESIGN-PLAN.md`](../SHOP-PAGE-REDESIGN-PLAN.md) step 14.)

## 4. Finish wiring `rutba-manufacturing` into config surfaces

`rutba-manufacturing` (port 4014) was added after the other apps and is still missing from several config surfaces that enumerate apps (the `rutba-ess` build-infra pass mirrored these for ess but left manufacturing as a pre-existing gap):

- `scripts/js/env-config.js` — no `NEXT_PUBLIC_MANUFACTURING_URL` in `GLOBAL_VARS`.
- `packages/pos-shared/lib/roles.js` — `manufacturing` missing from `APP_URLS`, `VALID_APP_KEYS`, `APP_META` (so it won't appear in the cross-app switcher).
- `rutba-web-user/scripts/hostinger/hostinger.config.js` — no `manufacturing` app entry.
- `packages/api-provider/scripts/discover-descriptor-meta.mjs` — `rutba-manufacturing` not in `APP_FOLDERS`.
- `scripts/rutba_log_rotate.sh` — `rutba_manufacturing` not in the `SERVICES` list (also missing rider/order-management/social).

- **Action:** mirror the `rutba-hr` / `rutba-ess` entries for `manufacturing` across those files (pick the existing 4014 port).

## 5. Review/remove stray scratch docs

`packages/api-provider/temp/` holds `COMBINED_ENDPOINTS_README.md`, `IMPLEMENTATION_SUMMARY.md`, and `README.md` — these look like scratch/obsolete artifacts.

- **Action:** confirm dead and delete, or move under `docs/` if any are worth keeping.

## 6. (Optional) Archive shipped / historical docs

The shipped `docs/todo/` specs and the 2026-05-15 pre-deploy snapshots are bannered in place (status updated, originals retained for rationale/audit trail). If a cleaner layout is wanted, move completed specs to `docs/done/` and the dated snapshots to `docs/archive/`.

---

> Module-specific open work is tracked in its own spec: accounting frontend pages (Bills / Banking & Registers / Tax & Periods) in [`accounting-completion-spec.md`](accounting-completion-spec.md); production-labour capitalization in [`payroll-module-implementation.md`](payroll-module-implementation.md) §7.3; address-book fold-on-login in [`address-book-server-side.md`](address-book-server-side.md).
