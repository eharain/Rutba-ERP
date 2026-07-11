'use strict';

/**
 * sale controller
 *
 * Custom actions live on the CORE controller so their route handlers are
 * `sale.<action>` — i.e. `api::sale.sale.<action>`. That keeps the api-pro
 * interceptor out of the way (it only engages on fully-qualified `::` handlers)
 * while the UP route permission (`api::sale.sale.checkout|markPayLater|
 * unlockPayLater`, granted in up-permissions-seed) does the coarse gate. The
 * pay-later lock/unlock additionally require an admin/manager app-role.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { markPayLater, unlockPayLater } = require('./pay-later');
const { checkout } = require('./checkout');
const { roleLevelsFor } = require('../../../utils/app-roles');

// Pay Later lock/unlock is an ADMIN-only action (matches the client gate).
// roleLevelsFor reads the user's real app_roles; a Strapi super-admin carries
// every level.
async function requireSaleAdmin(ctx) {
  const user = ctx.state?.user;
  if (!user) {
    ctx.unauthorized('Authentication required');
    return false;
  }
  const levels = await roleLevelsFor(user.id, strapi);
  if (!levels.has('admin')) {
    ctx.forbidden('Only an admin can lock or unlock a pay-later order');
    return false;
  }
  return true;
}

module.exports = createCoreController('api::sale.sale', () => ({
  async checkout(ctx) {
    return checkout(ctx);
  },

  async markPayLater(ctx) {
    if (!(await requireSaleAdmin(ctx))) return;
    return markPayLater(ctx);
  },

  async unlockPayLater(ctx) {
    if (!(await requireSaleAdmin(ctx))) return;
    return unlockPayLater(ctx);
  },
}));
