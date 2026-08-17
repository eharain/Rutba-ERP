'use strict';

/**
 * POST /mfg-material-lots/recompute
 *
 * Manager-triggered reconciliation: rebuild every lot's quantity_remaining +
 * derived status from the immutable mfg-material-issue ledger. The issue
 * lifecycle keeps balances fresh during normal operation — this exists for
 * post-migration backfill or drift reconciliation. Idempotent.
 *
 * Auth is manual (route is auth:false): a manufacturing manager/admin only.
 */

const { ensureUser, isManufacturingManager } = require('../../../utils/mfg-auth');

const LOT_UID = 'api::mfg-material-lot.mfg-material-lot';

module.exports = {
  async run(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const ok = await isManufacturingManager(user.id, strapi);
    if (!ok) return ctx.forbidden('Only a manufacturing manager can recompute material lots');

    const summary = await strapi.service(LOT_UID).recomputeAllLots();

    strapi.log.info(
      `[mfg-material-lots/recompute] by ${user.email || user.username || user.id} — ` +
      `processed=${summary.processed} corrected=${summary.corrected} ms=${summary.durationMs}`
    );

    return ctx.send({ success: true, ...summary });
  },
};
