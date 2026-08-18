/**
 * SeedEndpoints — the guarded seed control surface.
 *
 * Anchored on api::seed-run.seed-run (the audit content-type) so api-pro can
 * attach method policies; served by src/api/seed-run in services/strapi. Domain
 * `seed`; run is admin-only, status/history readable by the whole seed domain.
 */
export const SeedEndpoints = {
    meta: {
        uid: 'api::seed-run.seed-run',
        domains: ['seed'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** Run the seed engine. body: { mode:'full'|'partial', only?, skip?, categories?, essentialOnly? } */
    runSeed: (data) => ({
        path: '/seed/run',
        action: 'runSeed',
        method: 'post',
        apps: ['seed'],
        approle: ['admin'],
        // The engine runs the whole registry inline and returns the report at the
        // end — there is no job id to poll, so the request is held open for the
        // entire run. A full run walks every seeder (industry packs, tailoring
        // demo data, templates) and is measured in minutes, not seconds. Fifteen
        // minutes is the widest bound here and it is still a bound: a seed that
        // has genuinely wedged eventually fails instead of pinning the tab.
        timeoutMs: 900_000,
        data,
    }),

    /** Registry metadata + recent run history. */
    getStatus: ({ limit } = {}) => ({
        path: `/seed/status${limit ? `?limit=${limit}` : ''}`,
        action: 'getStatus',
        method: 'get',
        apps: ['seed'],
        approle: ['admin', 'manager', 'staff'],
    }),

    /** Recent seed-run audit rows. */
    listRuns: ({ limit } = {}) => ({
        path: `/seed/runs${limit ? `?limit=${limit}` : ''}`,
        action: 'listRuns',
        method: 'get',
        apps: ['seed'],
        approle: ['admin', 'manager', 'staff'],
    }),
};
