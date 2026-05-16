'use strict';

const { factories } = require('@strapi/strapi');
const { ensureUser } = require('../../../utils/ensure-user');

const UID = 'api::address.address';
const PERSON_UID = 'api::person.person';

const ADDRESS_FIELDS = [
  'label',
  'line1',
  'line2',
  'city',
  'state',
  'country',
  'zip_code',
  'recipient_name',
  'recipient_phone',
];

function pickAddressFields(input = {}) {
  const out = {};
  for (const f of ADDRESS_FIELDS) {
    if (input[f] !== undefined && input[f] !== null) {
      out[f] = typeof input[f] === 'string' ? input[f].trim() : input[f];
    }
  }
  return out;
}

function sanitizeOut(row) {
  if (!row) return row;
  const { person, ...rest } = row;
  return rest;
}

async function clearDefaultsForPerson(strapi, personId, exceptDocumentId) {
  const others = await strapi.documents(UID).findMany({
    filters: {
      person: { id: { $eq: personId } },
      is_default: { $eq: true },
      ...(exceptDocumentId ? { documentId: { $ne: exceptDocumentId } } : {}),
      archived_at: { $null: true },
    },
    fields: ['documentId'],
  });
  for (const row of others) {
    await strapi.documents(UID).update({
      documentId: row.documentId,
      data: { is_default: false },
    });
  }
}

async function findOwnedAddress(strapi, documentId, userId) {
  const row = await strapi.documents(UID).findOne({
    documentId,
    populate: { person: { populate: { user: { fields: ['id'] } } } },
  });
  if (!row) return null;
  if (row.person?.user?.id !== userId) return null;
  if (row.archived_at) return null;
  return row;
}

module.exports = factories.createCoreController(UID, ({ strapi }) => ({

  // GET /me/addresses
  async list(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const rows = await strapi.documents(UID).findMany({
      filters: {
        person: { user: { id: { $eq: user.id } } },
        archived_at: { $null: true },
      },
      sort: ['is_default:desc', 'createdAt:asc'],
    });

    ctx.send({ data: rows.map(sanitizeOut) });
  },

  // POST /me/addresses
  async createForMe(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const body = ctx.request.body?.data || ctx.request.body || {};
    const data = pickAddressFields(body);

    if (!data.line1) {
      return ctx.badRequest('line1 is required');
    }

    const person = await strapi
      .service(PERSON_UID)
      .ensureForUser(user);
    if (!person) return ctx.internalServerError('Could not resolve person');

    const existing = await strapi.documents(UID).findMany({
      filters: {
        person: { id: { $eq: person.id } },
        archived_at: { $null: true },
      },
      fields: ['documentId'],
      pagination: { pageSize: 1 },
    });

    const makeDefault = body.is_default === true || existing.length === 0;

    const created = await strapi.documents(UID).create({
      data: {
        ...data,
        is_default: makeDefault,
        person: { id: person.id },
      },
    });

    if (makeDefault) {
      await clearDefaultsForPerson(strapi, person.id, created.documentId);
    }

    ctx.send({ data: sanitizeOut(created) });
  },

  // PUT /me/addresses/:documentId
  async updateForMe(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const { documentId } = ctx.params;
    const owned = await findOwnedAddress(strapi, documentId, user.id);
    if (!owned) return ctx.notFound('Address not found');

    const body = ctx.request.body?.data || ctx.request.body || {};
    const data = pickAddressFields(body);
    const wantDefault = body.is_default === true;

    const updated = await strapi.documents(UID).update({
      documentId,
      data: {
        ...data,
        ...(wantDefault ? { is_default: true } : {}),
      },
    });

    if (wantDefault) {
      await clearDefaultsForPerson(strapi, owned.person.id, documentId);
    }

    ctx.send({ data: sanitizeOut(updated) });
  },

  // DELETE /me/addresses/:documentId — soft delete
  async deleteForMe(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const { documentId } = ctx.params;
    const owned = await findOwnedAddress(strapi, documentId, user.id);
    if (!owned) return ctx.notFound('Address not found');

    await strapi.documents(UID).update({
      documentId,
      data: {
        archived_at: new Date(),
        is_default: false,
      },
    });

    if (owned.is_default) {
      const next = await strapi.documents(UID).findMany({
        filters: {
          person: { id: { $eq: owned.person.id } },
          archived_at: { $null: true },
          documentId: { $ne: documentId },
        },
        sort: ['createdAt:asc'],
        fields: ['documentId'],
        pagination: { pageSize: 1 },
      });
      if (next[0]) {
        await strapi.documents(UID).update({
          documentId: next[0].documentId,
          data: { is_default: true },
        });
      }
    }

    ctx.send({ data: { documentId, archived: true } });
  },

  // POST /me/addresses/:documentId/make-default
  async makeDefault(ctx) {
    const user = await ensureUser(ctx, strapi);
    if (!user) return;

    const { documentId } = ctx.params;
    const owned = await findOwnedAddress(strapi, documentId, user.id);
    if (!owned) return ctx.notFound('Address not found');

    const updated = await strapi.documents(UID).update({
      documentId,
      data: { is_default: true },
    });
    await clearDefaultsForPerson(strapi, owned.person.id, documentId);

    ctx.send({ data: sanitizeOut(updated) });
  },
}));
