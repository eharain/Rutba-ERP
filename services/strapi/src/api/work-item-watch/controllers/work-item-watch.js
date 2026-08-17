'use strict';

/**
 * work-item-watch controller.
 *
 * `toggle` is the only write path: the authenticated user watches/unwatches an
 * item. It's idempotent — a second call removes the existing row. Reads use the
 * core `find` (filtered by entity_uid + target_document_id, or by user for a
 * "my watched items" view).
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');
const { logActivity } = require('../../../utils/work-item-activity');

const WATCH_UID = 'api::work-item-watch.work-item-watch';

module.exports = createCoreController(WATCH_UID, ({ strapi }) => ({
  async toggle(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const entity_uid = String(body.entity_uid || '').trim();
    const target_document_id = String(body.target_document_id || '').trim();
    if (!entity_uid || !target_document_id) return ctx.badRequest('entity_uid and target_document_id are required');

    const existing = await strapi.db.query(WATCH_UID).findMany({
      where: { entity_uid, target_document_id, user: user.id },
      limit: 1,
    });

    if (existing.length) {
      await strapi.documents(WATCH_UID).delete({ documentId: existing[0].documentId });
      await logActivity(strapi, {
        entityUid: entity_uid, documentId: target_document_id, kind: 'unwatch',
        summary: `${user.username || user.email || 'Someone'} stopped watching`, actor: user,
      });
      return { data: { watching: false } };
    }

    await strapi.documents(WATCH_UID).create({
      data: {
        entity_uid,
        target_document_id,
        user_label: user.username || user.email || null,
        user: user.documentId,
      },
    });
    await logActivity(strapi, {
      entityUid: entity_uid, documentId: target_document_id, kind: 'watch',
      summary: `${user.username || user.email || 'Someone'} started watching`, actor: user,
    });
    return { data: { watching: true } };
  },
}));
