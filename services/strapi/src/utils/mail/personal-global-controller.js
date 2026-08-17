'use strict';

// Controller factory for the mail module's personal/global collections
// (mail-contact address book, mail-snippet canned replies). One access model:
//
//   read   — every mail role sees GLOBAL rows plus their OWN personal rows;
//            nobody (admins included) browses someone else's personal rows.
//   write  — personal rows: the owner alone (owner = creator, set
//            server-side, never from the client body); global rows:
//            mail admin/manager.
//
// All owner filtering runs through db.query — UP-user relation filters are
// silently DROPPED by the content-API query layer, so ctx.query must never
// carry them (the mail-account owners discipline).

const { requireAppRole } = require('../require-admin');

const ALL_LEVELS = ['admin', 'manager', 'staff'];
const MANAGE_LEVELS = ['admin', 'manager'];

function makePersonalGlobalController(UID, { searchFields = ['name'], sanitize } = {}) {
  return ({ strapi }) => {
    const gate = (ctx, levels) => requireAppRole(ctx, strapi, { domains: ['mail'], levels });

    const load = (documentId) =>
      strapi.db.query(UID).findOne({
        where: { documentId },
        populate: { owners: { select: ['id'] } },
      });

    const isOwner = (row, userId) => (row.owners || []).some((o) => o.id === userId);

    const serialize = (row) => {
      const { owners, ...rest } = row;
      return rest;
    };

    async function canWrite(ctx, user, row) {
      if (row.scope === 'global') {
        const manager = await requireAppRole(ctx, strapi, { domains: ['mail'], levels: MANAGE_LEVELS });
        return Boolean(manager);
      }
      if (!isOwner(row, user.id)) {
        ctx.forbidden('This entry belongs to another user.');
        return false;
      }
      return true;
    }

    return {
      async find(ctx) {
        const user = await gate(ctx, ALL_LEVELS);
        if (!user) return;
        const { q, scope } = ctx.query;
        const page = Math.max(1, Number(ctx.query.page) || 1);
        const pageSize = Math.min(200, Math.max(1, Number(ctx.query.pageSize) || 50));

        const visibility = scope === 'global'
          ? { scope: 'global' }
          : scope === 'personal'
            ? { scope: 'personal', owners: { id: user.id } }
            : { $or: [{ scope: 'global' }, { scope: 'personal', owners: { id: user.id } }] };
        const term = typeof q === 'string' ? q.trim() : '';
        const where = term
          ? { $and: [visibility, { $or: searchFields.map((f) => ({ [f]: { $containsi: term } })) }] }
          : visibility;

        const [rows, total] = await Promise.all([
          strapi.db.query(UID).findMany({
            where,
            orderBy: { name: 'asc' },
            offset: (page - 1) * pageSize,
            limit: pageSize,
          }),
          strapi.db.query(UID).count({ where }),
        ]);
        return ctx.send({ data: rows.map(serialize), meta: { pagination: { page, pageSize, total } } });
      },

      async findOne(ctx) {
        const user = await gate(ctx, ALL_LEVELS);
        if (!user) return;
        const row = await load(ctx.params.documentId ?? ctx.params.id);
        if (!row) return ctx.send({ error: 'not_found' }, 404);
        if (row.scope !== 'global' && !isOwner(row, user.id)) {
          return ctx.forbidden('This entry belongs to another user.');
        }
        return ctx.send({ data: serialize(row) });
      },

      async create(ctx) {
        const user = await gate(ctx, ALL_LEVELS);
        if (!user) return;
        const body = { ...(ctx.request.body?.data || ctx.request.body || {}) };
        delete body.owners;
        const scope = body.scope === 'global' ? 'global' : 'personal';
        if (scope === 'global') {
          const manager = await gate(ctx, MANAGE_LEVELS);
          if (!manager) return;
        }
        if (sanitize) sanitize(body);
        const row = await strapi.documents(UID).create({ data: { ...body, scope } });
        if (scope === 'personal') {
          await strapi.db.query(UID).update({ where: { documentId: row.documentId }, data: { owners: [user.id] } });
        }
        return ctx.send({ data: row }, 201);
      },

      async update(ctx) {
        const user = await gate(ctx, ALL_LEVELS);
        if (!user) return;
        const documentId = ctx.params.documentId ?? ctx.params.id;
        const row = await load(documentId);
        if (!row) return ctx.send({ error: 'not_found' }, 404);
        if (!(await canWrite(ctx, user, row))) return;

        const body = { ...(ctx.request.body?.data || ctx.request.body || {}) };
        delete body.owners;
        // Promoting to global publishes it company-wide — manager territory.
        if (body.scope === 'global' && row.scope !== 'global') {
          const manager = await gate(ctx, MANAGE_LEVELS);
          if (!manager) return;
        }
        if (sanitize) sanitize(body);
        const updated = await strapi.documents(UID).update({ documentId, data: body });
        if (body.scope === 'global' && row.scope !== 'global') {
          await strapi.db.query(UID).update({ where: { documentId }, data: { owners: [] } });
        } else if (body.scope === 'personal' && row.scope !== 'personal') {
          await strapi.db.query(UID).update({ where: { documentId }, data: { owners: [user.id] } });
        }
        return ctx.send({ data: updated });
      },

      async delete(ctx) {
        const user = await gate(ctx, ALL_LEVELS);
        if (!user) return;
        const documentId = ctx.params.documentId ?? ctx.params.id;
        const row = await load(documentId);
        if (!row) return ctx.send({ error: 'not_found' }, 404);
        if (!(await canWrite(ctx, user, row))) return;
        await strapi.documents(UID).delete({ documentId });
        return ctx.send({ ok: true });
      },
    };
  };
}

module.exports = { makePersonalGlobalController };
