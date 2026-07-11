'use strict';

const { errors } = require('@strapi/utils');

// ── Pay-later lock enforcement ────────────────────────────────────────────
// Once a sale is marked "pay later" it is frozen: its line items cannot be
// added, changed, or removed — the only exits are Checkout (which records
// payment + releases stock, and never writes sale-items) or Unlock. This
// guard is the server-side backstop behind the UI edit-lock. It fails OPEN
// when the parent sale can't be resolved, so it never blocks normal saves.

const LOCK_MESSAGE =
  'This sale is marked Pay Later and is locked. Unlock it before changing its items.';

// Pull a sale id/documentId out of a create payload's `sale` relation, which
// may arrive as a scalar, a string documentId, or a connect/set descriptor.
function saleRefFromData(data) {
  const rel = data?.sale;
  if (rel == null) return null;
  if (typeof rel === 'number' || typeof rel === 'string') return rel;
  const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);
  const entry = pick(rel.connect) ?? pick(rel.set) ?? null;
  if (entry == null) return null;
  return typeof entry === 'object' ? (entry.documentId ?? entry.id) : entry;
}

async function saleIsLocked(saleRef) {
  if (saleRef == null) return false;
  const where =
    typeof saleRef === 'string' && !/^\d+$/.test(saleRef)
      ? { documentId: saleRef }
      : { id: saleRef };
  const sale = await strapi.db
    .query('api::sale.sale')
    .findOne({ where, select: ['id', 'pay_later'] });
  return !!sale?.pay_later;
}

async function saleLockedForSaleItem(saleItemId) {
  if (!saleItemId) return false;
  const row = await strapi.db.query('api::sale-item.sale-item').findOne({
    where: { id: saleItemId },
    populate: { sale: { select: ['id', 'pay_later'] } },
  });
  return !!row?.sale?.pay_later;
}

module.exports = {
  async beforeCreate(event) {
    const locked = await saleIsLocked(saleRefFromData(event.params?.data));
    if (locked) throw new errors.ApplicationError(LOCK_MESSAGE);
  },

  async beforeUpdate(event) {
    const locked = await saleLockedForSaleItem(event.params?.where?.id);
    if (locked) throw new errors.ApplicationError(LOCK_MESSAGE);
  },

  async beforeDelete(event) {
    const locked = await saleLockedForSaleItem(event.params?.where?.id);
    if (locked) throw new errors.ApplicationError(LOCK_MESSAGE);
  },
};
