'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const UID = 'api::cmp-audience.cmp-audience';

function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  /**
   * POST /cmp-audiences/:documentId/resolve
   * Run the resolver and return the total plus a small sample — the composer's
   * "N recipients" check. Also refreshes the cached member_count.
   */
  async resolveMembers(ctx) {
    const user = await requireAppRole(ctx, strapi, {
      domains: ['campaigns'],
      levels: ['admin', 'manager', 'staff'],
    });
    if (!user) return;
    try {
      const { members, total } = await strapi.service(UID).resolve(ctx.params.documentId);
      return ctx.send({
        total,
        sample: members.slice(0, 20),
        mergeKeys: members.length ? Object.keys(members[0].mergeData || {}) : [],
      });
    } catch (e) {
      return fail(ctx, e);
    }
  },
}));
