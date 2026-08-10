'use strict';

// Imported-message reads + link/triage actions. Access rule: the caller must
// be able to access the message's ACCOUNT (mail-account service canAccess).
// Handler names start with api-pro-whitelisted verbs (create/remove/assign/set).

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole, hasAppRole } = require('../../../utils/require-admin');

const UID = 'api::mail-message.mail-message';
const ACC_UID = 'api::mail-account.mail-account';
const ALL_LEVELS = ['admin', 'manager', 'staff'];

const gate = (ctx, strapi, levels) => requireAppRole(ctx, strapi, { domains: ['mail'], levels });

function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

module.exports = createCoreController(UID, ({ strapi }) => {

  const isMailAdmin = (userId) => hasAppRole(strapi, userId, { domains: ['mail'], levels: ['admin'] });

  /** Load a message and authorize via its account. */
  async function ensureMessageAccess(ctx, user, documentId) {
    const message = await strapi.documents(UID).findOne({
      documentId,
      populate: { account: true, links: true, attachments: true },
    });
    if (!message) {
      ctx.send({ error: 'not_found', message: 'Mail message not found.' }, 404);
      return null;
    }
    if (await isMailAdmin(user.id)) return message;
    const account = message.account
      ? await strapi.service(ACC_UID).loadWithOwners(message.account.documentId)
      : null;
    if (account && (await strapi.service(ACC_UID).canAccess(user.id, account))) return message;
    ctx.forbidden('You do not have access to this message.');
    return null;
  }

  return {

    async find(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      if (!(await isMailAdmin(user.id))) {
        // Scope to accessible accounts. The account relation is a plain api::
        // relation, so this filter survives content-API sanitization (unlike
        // UP-user relations).
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
              { account: { documentId: { $in: ids } } },
            ],
          },
        };
      }
      return super.find(ctx);
    },

    async findOne(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const documentId = ctx.params?.documentId ?? ctx.params?.id;
      if (!(await ensureMessageAccess(ctx, user, documentId))) return;
      return super.findOne(ctx);
    },

    /** POST /mail-messages/:documentId/links  Body: {entityUid, targetDocumentId, kind} */
    async createLink(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const message = await ensureMessageAccess(ctx, user, ctx.params.documentId);
      if (!message) return;
      try {
        const link = await strapi.service(UID).addLink(message, ctx.request.body || {}, user);
        return ctx.send({ ok: true, link });
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-messages/:documentId/links/:linkDocumentId/remove */
    async removeLink(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const message = await ensureMessageAccess(ctx, user, ctx.params.documentId);
      if (!message) return;
      try {
        return ctx.send(await strapi.service(UID).removeLink(ctx.params.linkDocumentId, user));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-messages/:documentId/assign  Body: {assignTo} (null/empty = unassign) */
    async assignMessage(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const message = await ensureMessageAccess(ctx, user, ctx.params.documentId);
      if (!message) return;
      try {
        return ctx.send(await strapi.service(UID).assign(message, (ctx.request.body || {}).assignTo, user));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-messages/:documentId/triage-status  Body: {status} */
    async setTriageStatus(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const message = await ensureMessageAccess(ctx, user, ctx.params.documentId);
      if (!message) return;
      try {
        return ctx.send(await strapi.service(UID).setTriage(message, (ctx.request.body || {}).status, user));
      } catch (e) {
        return fail(ctx, e);
      }
    },
  };
});
