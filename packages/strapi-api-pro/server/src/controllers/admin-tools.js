'use strict';

// Admin-only tools controller â€” operations that affect the whole plugin's
// state (seed, reset, etc.). Mount under /api-pro/admin/* in routes.

module.exports = {
  async seed(ctx) {
    try {
      const result = await strapi.plugin('api-pro').service('seeder').runFullSeed(strapi);
      if (!result.ok) {
        ctx.status = 500;
        ctx.body = { error: { code: 'SEED_FAILED', message: result.error || 'Seed failed' } };
        return;
      }
      ctx.body = { data: result };
    } catch (error) {
      strapi.log.error(`[api-pro admin-tools] seed failed: ${error?.stack || error?.message}`);
      ctx.status = 500;
      ctx.body = { error: { code: 'SEED_EXCEPTION', message: error?.message || 'Seed crashed' } };
    }
  },
};
