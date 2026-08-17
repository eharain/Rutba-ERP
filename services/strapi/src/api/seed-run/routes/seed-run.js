'use strict';

/**
 * Only custom /seed/* routes are exposed — no default CRUD surface for the audit
 * content-type. api-pro (denyByDefault) gates every route via the `seed` domain
 * descriptor; UP grants come from CUSTOM_ACTIONS in src/seed/up-permissions-seed.js.
 */
module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/seed/run',
            handler: 'api::seed-run.seed-run.runSeed',
        },
        {
            method: 'GET',
            path: '/seed/status',
            handler: 'api::seed-run.seed-run.getStatus',
        },
        {
            method: 'GET',
            path: '/seed/runs',
            handler: 'api::seed-run.seed-run.listRuns',
        },
    ],
};
