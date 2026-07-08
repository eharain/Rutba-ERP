'use strict';

/**
 * Helpers for the bulk stock-item import/update actions
 * (stock-item.resolveBulkStock / stock-item.processBulkStock).
 *
 * Product matching mirrors stock-input/services/process-helpers.js; the barcode
 * helpers implement the three generation modes agreed for the Stock Items Import
 * screen (see docs/ / plan): the entered barcode is the *product* barcode and each
 * stock item gets a UNIQUE derived barcode.
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

/**
 * Case-insensitive "contains" candidates, best-effort ranked (exact-ish first),
 * capped to `limit`. Used to offer the user a shortlist when there's no exact match.
 */
function findCandidates(list, name, limit = 5) {
  if (!name || !list) return [];
  const clean = cleanForComparing(name);
  if (!clean) return [];
  const hits = list.filter((item) => cleanForComparing(item.name).includes(clean));
  hits.sort((a, b) => {
    const an = cleanForComparing(a.name);
    const bn = cleanForComparing(b.name);
    // shorter / starts-with ranked higher
    const aStarts = an.startsWith(clean) ? 0 : 1;
    const bStarts = bn.startsWith(clean) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return an.length - bn.length;
  });
  return hits.slice(0, limit);
}

function zeroPad(n, width = 3) {
  return String(n).padStart(width, '0');
}

/**
 * Normalize a barcode-generation mode from a variety of inputs (explicit string,
 * an Excel control column, or a legacy `useIndex` boolean), falling back to a
 * sensible default from quantity + whether a base barcode is present.
 *
 * @returns {'indexed'|'auto'|'distinct'}
 */
function normalizeMode(rawMode, row = {}) {
  const raw = (rawMode ?? row.barcodeMode ?? row.mode ?? '').toString().trim().toLowerCase();
  if (raw) {
    // 'product' — the entered barcode is the manufacturer/EAN code; store it on
    // the product only (scannable at POS) and do NOT mint per-unit stock items.
    if (raw.includes('product') || raw.includes('manufact') || raw.includes('ean') || raw.includes('upc') || raw.includes('attach')) return 'product';
    if (raw.includes('index')) return 'indexed';
    if (raw.includes('distinct') || raw.includes('exact') || raw.includes('single') || raw.includes('one')) return 'distinct';
    if (raw.includes('auto') || raw.includes('new') || raw.includes('generat')) return 'auto';
    if (raw.includes('share') || raw.includes('same')) return 'indexed'; // shared product barcode -> indexed unit barcodes
  }
  // Legacy / checkbox style
  if (row.useIndex === true || row.useIndex === 'true') return 'indexed';

  const qty = Math.max(1, Number(row.quantity) || 1);
  const base = (row.barcode ?? row.productBarcode ?? '').toString().trim();
  if (qty <= 1 && base) return 'distinct';
  if (base) return 'indexed';
  return 'auto';
}

/**
 * base = product barcode (or sku) -> "base-001", "base-002", ... (unique per unit).
 */
function computeIndexedBarcodes(base, quantity) {
  const out = [];
  const qty = Math.max(1, Number(quantity) || 1);
  for (let i = 1; i <= qty; i++) out.push(`${base}-${zeroPad(i)}`);
  return out;
}

/**
 * Auto scheme (no meaningful base) — a per-row seed + padded index, mirroring the
 * stock-input process handler's base36 approach. `seedExtra` keeps parallel rows apart.
 */
function computeAutoBarcodes(quantity, seedExtra = 0) {
  const out = [];
  const qty = Math.max(1, Number(quantity) || 1);
  const seed = (Date.now().toString(36) + Number(seedExtra).toString(36));
  for (let i = 1; i <= qty; i++) out.push(`${seed}${zeroPad(i)}`);
  return out;
}

/**
 * Deterministic (resolve/preview) barcode list for a row. Auto mode returns [] —
 * those codes are generated fresh at process time and can't collide, so there's
 * nothing to preview or existence-check.
 */
function previewBarcodes(mode, base, quantity) {
  if (mode === 'distinct') return base ? [base] : [];
  if (mode === 'indexed' && base) return computeIndexedBarcodes(base, quantity);
  return [];
}

module.exports = {
  slugify,
  formatName,
  cleanForComparing,
  findByName,
  findCandidates,
  zeroPad,
  normalizeMode,
  computeIndexedBarcodes,
  computeAutoBarcodes,
  previewBarcodes,
};
