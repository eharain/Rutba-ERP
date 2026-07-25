'use strict';

/**
 * stock-alert transitions — acknowledge / dismiss / run-now.
 *
 *   POST /stock-alerts/:id/acknowledge — I've seen it / I'm on it. Any inventory
 *        or stock app-role (incl. staff).
 *   POST /stock-alerts/:id/dismiss     — ignore it (won't nag while still low).
 *        Manager / admin only.
 *   POST /stock-alerts/run-now         — run the low-stock scan now instead of
 *        waiting for the daily cron. Manager / admin only.
 *
 * Auth is manual (auth:false routes) — same pattern as stock-adjustment/transitions.
 */

const { requireAppRole } = require('../../../utils/require-admin');

const ALERT_UID = 'api::stock-alert.stock-alert';

const requireMember = (ctx, strapi) => requireAppRole(ctx, strapi, { domains: ['inventory', 'stock'] });
const requireManager = (ctx, strapi) => requireAppRole(ctx, strapi, { domains: ['inventory', 'stock'], levels: ['admin', 'manager'] });

module.exports = {
  // POST /stock-alerts/:id/acknowledge
  async acknowledge(ctx) {
    const user = await requireMember(ctx, strapi);
    if (!user) return;
    const res = await strapi.service(ALERT_UID).acknowledge(ctx.params.id, user.id);
    if (res.notFound) return ctx.notFound('Alert not found');
    if (res.invalid) return ctx.badRequest(`Cannot acknowledge an alert in status ${res.status}`);
    return ctx.send({ success: true, ...res });
  },

  // POST /stock-alerts/:id/dismiss
  async dismiss(ctx) {
    const user = await requireManager(ctx, strapi);
    if (!user) return;
    const body = ctx.request.body || {};
    const notes = body?.data?.notes ?? body?.notes ?? null;
    const res = await strapi.service(ALERT_UID).dismiss(ctx.params.id, user.id, notes);
    if (res.notFound) return ctx.notFound('Alert not found');
    if (res.invalid) return ctx.badRequest(`Cannot dismiss an alert in status ${res.status}`);
    return ctx.send({ success: true, ...res });
  },

  // POST /stock-alerts/run-now
  async runNow(ctx) {
    const user = await requireManager(ctx, strapi);
    if (!user) return;
    const summary = await strapi.service(ALERT_UID).syncLowStockAlerts({ actorId: user.id });
    return ctx.send({ success: true, ...summary });
  },
};
