'use strict';

// notification-preference controller — per-user notification settings, now
// with a management surface in rutba-users.
//
// Scoping: a caller only touches their OWN rows unless they hold a users/auth
// admin app-role, in which case they may target any user (?userId= on find,
// `user` in the create body). All reads/writes go through the query layer:
// the content-API sanitizer silently drops filters on UP-user relations and
// rejects `user` in bodies (the mail-account owners discipline), so the core
// CRUD path can't scope these rows safely.

const { factories } = require('@strapi/strapi');
const { hasAppRole } = require('../../../utils/require-admin');

const UID = 'api::notification-preference.notification-preference';
const EDITABLE = ['category', 'in_app_enabled', 'email_enabled', 'minimum_priority'];

function pickEditable(body) {
  const out = {};
  for (const key of EDITABLE) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

let SCHEMA_CATEGORY_ENUM = null;
function categoryValues(strapi) {
  // rutba-core's compat strapi has no contentType registry — fall back to the
  // schema file itself (zero-copy, same source of truth).
  const fromRegistry = strapi.contentType?.(UID)?.attributes?.category?.enum;
  if (Array.isArray(fromRegistry) && fromRegistry.length) return fromRegistry;
  if (!SCHEMA_CATEGORY_ENUM) {
    SCHEMA_CATEGORY_ENUM = require('../content-types/notification-preference/schema.json').attributes.category.enum;
  }
  return SCHEMA_CATEGORY_ENUM;
}

module.exports = factories.createCoreController(UID, ({ strapi }) => {

  const isUsersAdmin = (userId) =>
    hasAppRole(strapi, userId, { domains: ['admin', 'users', 'auth'], levels: ['admin'] });

  /** Resolve the target user id: self, or any user for users/auth admins. */
  async function resolveTarget(ctx, requested) {
    const me = ctx.state.user;
    const target = Number(requested);
    if (!target || target === me.id) return me.id;
    if (!(await isUsersAdmin(me.id))) {
      ctx.forbidden('You may only manage your own notification preferences.');
      return null;
    }
    return target;
  }

  return {

    /** GET /notification-preferences[?userId=] — the target user's rows. */
    async find(ctx) {
      const me = ctx.state.user;
      if (!me) return ctx.unauthorized();
      const targetId = await resolveTarget(ctx, ctx.query?.userId);
      if (!targetId) return;
      // documents(), not db.query: rutba-core's compat query layer neither
      // filters nor writes relations — documents() is the cross-server path.
      const rows = await strapi.documents(UID).findMany({
        filters: { user: { id: targetId } },
        sort: 'category:asc',
      });
      return ctx.send({ data: rows, meta: { userId: targetId, categories: categoryValues(strapi) } });
    },

    /**
     * POST /notification-preferences — UPSERT by (user, category): the UI
     * toggles a category without caring whether a row exists yet. Body may
     * carry `user` (admins only); everyone else writes their own rows.
     */
    async create(ctx) {
      const me = ctx.state.user;
      if (!me) return ctx.unauthorized();
      const body = ctx.request.body?.data || ctx.request.body || {};
      const targetId = await resolveTarget(ctx, body.user);
      if (!targetId) return;

      const data = pickEditable(body);
      if (!data.category || !categoryValues(strapi).includes(data.category)) {
        return ctx.badRequest(`category must be one of: ${categoryValues(strapi).join(', ')}`);
      }

      const [existing] = await strapi.documents(UID).findMany({
        filters: { user: { id: targetId }, category: data.category },
      });

      // Fill schema defaults explicitly so a fresh row never carries nulls
      // where the schema says true/medium (core's compat skips defaults).
      const withDefaults = {
        in_app_enabled: true,
        email_enabled: true,
        minimum_priority: 'medium',
        ...data,
      };

      const row = existing
        ? await strapi.documents(UID).update({ documentId: existing.documentId, data })
        : await strapi.documents(UID).create({ data: { ...withDefaults, user: targetId } });

      return ctx.send({ data: row });
    },

    /** PUT /notification-preferences/:id — own row, or any row for admins. */
    async update(ctx) {
      const me = ctx.state.user;
      if (!me) return ctx.unauthorized();
      const row = await strapi.documents(UID).findOne({
        documentId: ctx.params.id,
        populate: { user: { fields: ['id'] } },
      });
      if (!row) return ctx.notFound();
      if (row.user?.id !== me.id && !(await isUsersAdmin(me.id))) {
        return ctx.forbidden('You may only manage your own notification preferences.');
      }
      const body = ctx.request.body?.data || ctx.request.body || {};
      const data = pickEditable(body);
      if (data.category && !categoryValues(strapi).includes(data.category)) {
        return ctx.badRequest(`category must be one of: ${categoryValues(strapi).join(', ')}`);
      }
      const updated = await strapi.documents(UID).update({ documentId: row.documentId, data });
      return ctx.send({ data: updated });
    },

    /** DELETE /notification-preferences/:id — falls back to category defaults. */
    async delete(ctx) {
      const me = ctx.state.user;
      if (!me) return ctx.unauthorized();
      const row = await strapi.documents(UID).findOne({
        documentId: ctx.params.id,
        populate: { user: { fields: ['id'] } },
      });
      if (!row) return ctx.notFound();
      if (row.user?.id !== me.id && !(await isUsersAdmin(me.id))) {
        return ctx.forbidden('You may only manage your own notification preferences.');
      }
      await strapi.documents(UID).delete({ documentId: row.documentId });
      return ctx.send({ ok: true });
    },
  };
});
