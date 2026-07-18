'use strict';

const { resolveHrRolesForUser } = require('./utils/hr-role-provider');
const { validateBomWrite, BOM_UID: MFG_BOM_UID } = require('./api/mfg-bom/bom-typing-validator');
const { runPhase2: runWarehouseBranchPhase2 } = require('./utils/warehouse-branch-migration');

// ─── Seeding is decoupled from server startup ────────────────────────────
// All seeding — system data, reference data, backfills, and the former
// bootstrap "ensure" singletons (UP roles/default_role, site-setting, email
// FROM, email confirmation) — now lives in src/seed/registry.js and runs via
// the standalone seed engine: the CLI (`npm run seed`) or the guarded seed
// control app. The server no longer seeds on boot. The old in-bootstrap
// background pipeline raced the dev-mode reload watcher, which destroyed the DB
// pool ("Unable to acquire a connection") and unbound the global `strapi`
// mid-run ("strapi is not defined"). Strapi's own database/migrations/* still
// run natively at boot (Strapi-owned, run-once).

module.exports = {
    register({ strapi }) {
        // Enforce mfg-bom input/output KIND typing at the document layer, where
        // nested component relations are visible before the write (a db lifecycle
        // can't see them). Blocks Active BOMs with mistyped inputs/outputs; warns
        // on Draft. See src/api/mfg-bom/bom-typing-validator.js.
        strapi.documents.use(async (context, next) => {
            if (context.uid === MFG_BOM_UID && (context.action === 'create' || context.action === 'update')) {
                await validateBomWrite(strapi, {
                    action: context.action,
                    data: context.params?.data,
                    documentId: context.params?.documentId,
                });
            }
            return next();
        });
    },

    async bootstrap({ strapi }) {
        // ─── Warehouse → Branch consolidation, Phase 2 ───────────────
        // Copies the (entity, branch) links + branch location fields stashed by
        // database/migrations/2026.07.17…warehouse-to-branch-merge.js into the
        // new *_branch_lnk tables that schema sync just created, then drops the
        // temps. Guarded + idempotent — a no-op on steady-state boots.
        try {
            await runWarehouseBranchPhase2(strapi);
        } catch (err) {
            strapi.log.error('[wh2br] Phase 2 failed (temps left for retry on next boot): ' + err.message);
        }

        // ─── Register HR team-role provider with api-pro ─────────────
        // Runtime wiring (NOT seeding): api-pro merges these into
        // /me/permissions per request. api-pro's bootstrap runs before this
        // (plugin bootstraps fire before the app's), so strapi.apiPro is
        // normally available here. Guard anyway so this is safe when api-pro is
        // disabled.
        try {
            if (typeof strapi.apiPro?.registerRoleProvider === 'function') {
                strapi.apiPro.registerRoleProvider(resolveHrRolesForUser);
                strapi.log.info('[bootstrap] Registered HR role provider with api-pro');
            } else {
                strapi.log.warn('[bootstrap] api-pro.registerRoleProvider unavailable; HR roles will not be merged into /me/permissions');
            }
        } catch (err) {
            strapi.log.error('[bootstrap] HR role provider registration failed: ' + err.message);
        }
    },
};
