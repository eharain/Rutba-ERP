'use strict';

/**
 * Helpers used by the stock-input process action.
 * Mirrors the logic from the external import scripts
 * (excel-to-stock-inputs / import-excel-to-strapi-final).
 */

function slugify(name) {
  return (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatName(name) {
  return (name || '').toString().trim();
}

function cleanForComparing(name) {
  return (name || '').toString().trim().toLowerCase();
}

function findByName(list, name) {
  if (!name || !list) return null;
  const clean = cleanForComparing(name);
  return list.find((item) => cleanForComparing(item.name) === clean) || null;
}

function findByOrderId(list, orderId) {
  if (!orderId || !list) return null;
  const clean = cleanForComparing(orderId);
  return list.find((item) => cleanForComparing(item.orderId) === clean) || null;
}

module.exports = {
  slugify,
  formatName,
  findByName,
  findByOrderId,
};
