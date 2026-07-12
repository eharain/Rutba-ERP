'use strict';

/**
 * Seed control endpoints (guarded by api-pro via packages/api-provider/api/seed.js,
 * domain `seed`). The seed engine is the single executor — the same code the CLI
 * runs — so UI-triggered and deploy-time seeding behave identically.
 *
 *   POST /api/seed/run     runSeed    (seed_admin)            — full/partial run
 *   GET  /api/seed/status  getStatus  (seed_admin/mgr/staff)  — registry + history
 *   GET  /api/seed/runs    listRuns   (seed_admin/mgr/staff)  — recent run rows
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { runSeeds, getStatus } = require('../../../seed/engine');
const { requireAppRole } = require('../../../utils/require-admin');

function actorLabel(ctx) {
    const u = ctx.state?.user;
    if (!u) return 'anonymous';
    return u.username || u.email || `user:${u.id}`;
}

// The api-pro interceptor skips requests that carry no app/role claim headers,
// and the UP grant admits every app user — so the role gate must live here.
// Server-side, DB-backed (never trusts X-Rutba-App-Role).
const requireSeedAdmin = (ctx) => requireAppRole(ctx, strapi, {
    domains: ['seed'],
    levels: ['admin'],
    message: 'The seed_admin role is required to run seeds',
});
const requireSeedMember = (ctx) => requireAppRole(ctx, strapi, {
    domains: ['seed'],
    message: 'A seed app role is required',
});

module.exports = createCoreController('api::seed-run.seed-run', ({ strapi }) => ({
    async runSeed(ctx) {
        if (!(await requireSeedAdmin(ctx))) return;
        // The generated api-provider client wraps the payload as { data: {...} }
        // (Strapi create convention); raw curl callers send it flat. Accept both.
        const raw = (ctx.request && ctx.request.body) || {};
        const body = raw && typeof raw.data === 'object' && raw.data !== null ? raw.data : raw;
        const mode = body.mode === 'full' ? 'full' : 'partial';

        const report = await runSeeds(strapi, {
            mode,
            only: body.only,
            skip: body.skip,
            categories: body.categories,
            essentialOnly: Boolean(body.essentialOnly),
            source: 'ui',
            triggeredBy: actorLabel(ctx),
        });

        // A seeder failure is a partial-success, not an HTTP error — the report
        // carries per-entry status so the UI can show exactly what failed.
        ctx.body = report;
    },

    async getStatus(ctx) {
        if (!(await requireSeedMember(ctx))) return;
        const limit = Math.min(Number(ctx.query?.limit) || 20, 100);
        ctx.body = await getStatus(strapi, { limit });
    },

    async listRuns(ctx) {
        if (!(await requireSeedMember(ctx))) return;
        const limit = Math.min(Number(ctx.query?.limit) || 50, 200);
        const { recentRuns } = await getStatus(strapi, { limit });
        ctx.body = recentRuns;
    },
}));
