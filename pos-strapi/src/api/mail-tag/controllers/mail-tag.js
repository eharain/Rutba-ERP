'use strict';

// Tag registry. Every mail role reads (the client needs names/colors to
// render chips); admin/manager write. The slug is generated once from the
// name and never changes — it IS the IMAP keyword stored on messages, so
// renaming a tag must not orphan what's already tagged.

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole } = require('../../../utils/require-admin');

const UID = 'api::mail-tag.mail-tag';

const readGate = (ctx, strapi) =>
  requireAppRole(ctx, strapi, { domains: ['mail'], levels: ['admin', 'manager', 'staff'] });
const writeGate = (ctx, strapi) =>
  requireAppRole(ctx, strapi, { domains: ['mail'], levels: ['admin', 'manager'] });

function slugify(name) {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 37);
  return base ? `rt_${base}` : null;
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  async find(ctx) {
    const user = await readGate(ctx, strapi);
    if (!user) return;
    const rows = await strapi.db.query(UID).findMany({ orderBy: { name: 'asc' }, limit: 200 });
    return ctx.send({ data: rows });
  },

  async findOne(ctx) {
    const user = await readGate(ctx, strapi);
    if (!user) return;
    return super.findOne(ctx);
  },

  async create(ctx) {
    const user = await writeGate(ctx, strapi);
    if (!user) return;
    const data = { ...(ctx.request.body?.data || ctx.request.body || {}) };
    const slug = slugify(data.name);
    if (!slug) return ctx.send({ error: 'mail_bad_tag', message: 'A tag needs a name with letters or digits.' }, 400);
    data.slug = slug;
    try {
      const row = await strapi.documents(UID).create({ data });
      return ctx.send({ data: row }, 201);
    } catch (e) {
      return ctx.send({ error: 'mail_tag_exists', message: `A tag with keyword '${slug}' already exists.` }, 409);
    }
  },

  async update(ctx) {
    const user = await writeGate(ctx, strapi);
    if (!user) return;
    const data = { ...(ctx.request.body?.data || ctx.request.body || {}) };
    delete data.slug; // immutable — the keyword lives on tagged messages
    ctx.request.body = { data };
    return super.update(ctx);
  },

  async delete(ctx) {
    const user = await writeGate(ctx, strapi);
    if (!user) return;
    // Messages keep the orphaned keyword server-side; harmless, invisible
    // once no registry row maps it to a chip.
    return super.delete(ctx);
  },
}));
