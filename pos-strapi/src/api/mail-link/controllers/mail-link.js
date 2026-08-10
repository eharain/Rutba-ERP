'use strict';

// Link reads power the CRM/order "Mail" timelines. Writes go through the
// mail-message service (createLink/removeLink) — the core create/update/delete
// on this CT stay unrouted below.

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole, hasAppRole } = require('../../../utils/require-admin');

const UID = 'api::mail-link.mail-link';
const ACC_UID = 'api::mail-account.mail-account';

module.exports = createCoreController(UID, ({ strapi }) => ({

  async find(ctx) {
    const user = await requireAppRole(ctx, strapi, { domains: ['mail'], levels: ['admin', 'manager', 'staff'] });
    if (!user) return;
    if (!(await hasAppRole(strapi, user.id, { domains: ['mail'], levels: ['admin'] }))) {
      const ids = await strapi.service(ACC_UID).accessibleAccountIds(user.id);
      if (ids.length === 0) {
        return ctx.send({ data: [], meta: { pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 } } });
      }
      const q = ctx.query || {};
      ctx.query = {
        ...q,
        filters: {
          $and: [
            ...(q.filters ? [q.filters] : []),
            { mail_message: { account: { documentId: { $in: ids } } } },
          ],
        },
      };
    }
    return super.find(ctx);
  },
}));
