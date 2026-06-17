'use strict';

/**
 * work-item-activity controller.
 *
 * Reads use the core `find`/`findOne`. The custom `assign` action sets the
 * assignee on a work item generically (any allow-listed entity that carries an
 * `assignee` relation) and records the change in the audit trail.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const { ensureUser } = require('../../../utils/ensure-user');
const { logActivity } = require('../../../utils/work-item-activity');

// Only entities that actually have an `assignee` relation may be assigned
// through this generic endpoint — never trust an arbitrary entity_uid.
const ASSIGNABLE = new Set([
  'api::mfg-work-order.mfg-work-order',
  'api::sale-order.sale-order',
  'api::return-request.return-request',
]);

module.exports = createCoreController('api::work-item-activity.work-item-activity', ({ strapi }) => ({
  async assign(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const entity_uid = String(body.entity_uid || '').trim();
    const target_document_id = String(body.target_document_id || '').trim();
    const assigneeDocId = body.assignee_document_id ? String(body.assignee_document_id).trim() : null;

    if (!ASSIGNABLE.has(entity_uid)) return ctx.badRequest('entity_uid is not an assignable work item');
    if (!target_document_id) return ctx.badRequest('target_document_id is required');

    try {
      const before = await strapi.documents(entity_uid).findOne({
        documentId: target_document_id,
        populate: { assignee: { fields: ['id', 'documentId', 'name'] } },
      });
      if (!before) return ctx.notFound('Work item not found');

      const updated = await strapi.documents(entity_uid).update({
        documentId: target_document_id,
        data: { assignee: assigneeDocId || null },
        populate: { assignee: { fields: ['id', 'documentId', 'name'] } },
      });

      const toName = updated?.assignee?.name || null;
      const fromName = before?.assignee?.name || null;
      await logActivity(strapi, {
        entityUid: entity_uid,
        documentId: target_document_id,
        kind: assigneeDocId ? 'assigned' : 'unassigned',
        summary: assigneeDocId
          ? `Assigned to ${toName || 'someone'}${fromName ? ` (was ${fromName})` : ''}`
          : `Unassigned${fromName ? ` (was ${fromName})` : ''}`,
        from: fromName,
        to: toName,
        actor: user,
      });

      return { data: { assignee: updated?.assignee || null } };
    } catch (err) {
      return ctx.throw(err.status || 500, err.message);
    }
  },
}));
