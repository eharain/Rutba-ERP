'use strict';

/**
 * work-item-comment controller.
 *
 * `create` is overridden to stamp the author from the authenticated user
 * (clients only send entity_uid, target_document_id, body) and to mirror the
 * comment into the work-item audit trail. Other actions use the core handlers.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { logActivity } = require('../../../utils/work-item-activity');

module.exports = createCoreController('api::work-item-comment.work-item-comment', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state?.user;
    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const entity_uid = String(body.entity_uid || '').trim();
    const target_document_id = String(body.target_document_id || '').trim();
    const text = String(body.body || '').trim();
    if (!entity_uid || !target_document_id) return ctx.badRequest('entity_uid and target_document_id are required');
    if (!text) return ctx.badRequest('body is required');

    const author_label = user?.username || user?.email || null;
    const created = await strapi.documents('api::work-item-comment.work-item-comment').create({
      data: {
        entity_uid,
        target_document_id,
        body: text,
        author_label,
        ...(user?.documentId ? { author: user.documentId } : {}),
      },
      populate: { author: { fields: ['id', 'username', 'email'] } },
    });

    await logActivity(strapi, {
      entityUid: entity_uid,
      documentId: target_document_id,
      kind: 'comment',
      summary: `${author_label || 'Someone'} commented`,
      actor: user,
      data: { excerpt: text.slice(0, 140) },
    });

    return { data: created };
  },
}));
