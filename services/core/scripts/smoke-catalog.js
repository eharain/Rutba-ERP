#!/usr/bin/env node
'use strict';

/**
 * Smoke test for CatalogService (portal task E1) — no database required.
 *
 * The contract's own tests cover the pricing arithmetic. What is only testable
 * here is the half that has to be right for that arithmetic to ever see the
 * truth: whether the queries LOAD the levels a price lives at.
 *
 * That is the failure this file is really about. A variant priced only on its
 * parent looks unpriced if the parent was not populated — and it looks unpriced
 * quietly, as a plausible number rather than an error. So the populate shapes
 * are asserted directly, and there is a case for the parent going missing.
 *
 *   node scripts/smoke-catalog.js
 */

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const docsPath = require.resolve(path.join(ROOT, 'services/core/src/documents/index.js'));

// ── fixture tables ────────────────────────────────────────────────────────
const PARENT = {
  id: 1, documentId: 'pr1', name: 'Cotton Roll', sku: 'ROLL', is_active: true,
  unit_of_measure: 'meter', divisible: true, selling_price: 5000, offer_price: 4500,
};

const TABLES = {
  'api::product.product': [
    PARENT,
    // Priced only by its parent — the case that breaks when parent is not loaded.
    { id: 2, documentId: 'pr2', name: 'Cotton Roll - Red', sku: 'ROLL-R', is_active: true,
      is_variant: true, parent: PARENT, unit_of_measure: 'meter', divisible: true, selling_price: 0 },
    // Prices itself.
    { id: 3, documentId: 'pr3', name: 'Cotton Roll - Blue', sku: 'ROLL-B', is_active: true,
      is_variant: true, parent: PARENT, unit_of_measure: 'meter', divisible: true, selling_price: 6000 },
    // Priced nowhere.
    { id: 4, documentId: 'pr4', name: 'Sample Swatch', sku: 'SWATCH', is_active: true },
    { id: 5, documentId: 'pr5', name: 'Retired Item', sku: 'OLD', is_active: false, selling_price: 100 },
  ],
  'api::stock-item.stock-item': [
    // 50m of the red variant. Product populated, its parent with it.
    { id: 11, documentId: 'si11', sku: 'R-1', status: 'InStock', sellable_units: 50,
      product: TABLE_PRODUCT(2) },
    // A unit that overrides the price outright.
    { id: 12, documentId: 'si12', sku: 'R-2', status: 'InStock', sellable_units: 50,
      selling_price: 7500, product: TABLE_PRODUCT(2) },
    // Orphan: no product at all.
    { id: 13, documentId: 'si13', sku: 'ORPH', status: 'InStock', selling_price: 900 },
  ],
};

function TABLE_PRODUCT(id) {
  // Built lazily below; placeholder replaced after TABLES is defined.
  return { __ref: id };
}

// Resolve the __ref placeholders into real populated product objects.
for (const row of TABLES['api::stock-item.stock-item']) {
  if (row.product && row.product.__ref) {
    row.product = TABLES['api::product.product'].find((p) => p.id === row.product.__ref);
  }
}

const seen = {};
function matches(row, filters) {
  if (!filters) return true;
  if (filters.$and) return filters.$and.every((f) => matches(row, f));
  if (filters.$or) return filters.$or.some((f) => matches(row, f));
  for (const [field, cond] of Object.entries(filters)) {
    const val = row[field];
    if (cond.$eq !== undefined && String(val ?? '') !== String(cond.$eq)) return false;
    if (cond.$containsi !== undefined
      && !String(val ?? '').toLowerCase().includes(String(cond.$containsi).toLowerCase())) return false;
  }
  return true;
}

/** Strip populated relations the query did NOT ask for — the point of the test. */
function applyPopulate(row, populate) {
  const out = { ...row };
  for (const key of ['parent', 'product']) {
    if (out[key] && typeof out[key] === 'object') {
      if (!populate || !populate[key]) { out[key] = out[key].id; continue; }
      const nested = populate[key];
      out[key] = nested && nested.populate
        ? applyPopulate(out[key], nested.populate)
        : applyPopulate(out[key], null);
    }
  }
  return out;
}

const stub = {
  documents: (uid) => ({
    findMany: async (params) => {
      seen[uid] = params;
      const rows = (TABLES[uid] || [])
        .filter((r) => matches(r, params.filters))
        .map((r) => applyPopulate(r, params.populate));
      // Honour `sort` so an assertion about result ORDER is really an
      // assertion about the sort the service asked for. A stub that ignored it
      // would let the service drop its sort entirely and stay green.
      if (params.sort) {
        const [field, dir] = String(params.sort).split(':');
        rows.sort((a, b) => String(a[field] ?? '').localeCompare(String(b[field] ?? ''))
          * (dir === 'desc' ? -1 : 1));
      }
      return params.limit ? rows.slice(0, params.limit) : rows;
    },
  }),
  getRegistry: () => ({}),
  useDocumentMiddleware: () => {},
  mapFileRow: (r) => r,
};

const stubModule = new Module(docsPath);
stubModule.filename = docsPath;
stubModule.loaded = true;
stubModule.exports = stub;
require.cache[docsPath] = stubModule;

const svc = require(path.join(ROOT, 'services/core/src/domain/catalog/catalog.service.js'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

(async () => {
  // ── the levels are actually loaded ──────────────────────────────────────
  const red = await svc.getItem(2);
  eq('a variant priced only by its parent resolves to the parent price', red.price.selling, 5000);
  eq('and reports where that came from', red.price.sellingFrom, 'parent');
  eq('the parent was populated, not left as an id', seen['api::product.product'].populate, { parent: true });
  eq('so the price is not flagged incomplete', red.priceIncomplete, false);

  const blue = await svc.getItem(3);
  eq('a variant that prices itself keeps its own', [blue.price.selling, blue.price.sellingFrom], [6000, 'item']);
  // The parent offers 4500 against the variant's own 6000 — inherited across
  // levels, exactly as apps/sales/marketplace does today, and flagged.
  eq('an offer inherited across levels is flagged', blue.price.mixedLevels, true);

  const swatch = await svc.getItem(4);
  eq('an unpriced item says so rather than reading as free',
     [swatch.price.selling, swatch.price.unpriced, swatch.sellable], [null, true, false]);

  eq('unknown id', await svc.getItem(999), null);
  eq('missing id', await svc.getItem(null), null);

  const byDoc = await svc.getItemByDocumentId('pr2');
  eq('addressable by documentId too', byDoc.productId, 2);

  // ── search ──────────────────────────────────────────────────────────────
  const found = await svc.search({ q: 'Cotton' });
  eq('search finds parent and variants', found.items.map((i) => i.productId), [1, 3, 2]);
  eq('every result is priced', found.items.every((i) => i.price.selling > 0), true);

  const activeFilter = seen['api::product.product'].filters.$and;
  eq('active-only is the default', activeFilter.some((c) => c.is_active), true);
  const withRetired = await svc.search({ activeOnly: false });
  eq('and can be turned off', withRetired.items.some((i) => i.productId === 5), true);

  const parentsOnly = await svc.search({ variants: false });
  eq('variants can be excluded', parentsOnly.items.every((i) => !i.isVariant), true);

  const all = await svc.search({ activeOnly: false });
  eq('unpriced rows are counted, because someone has to fix them', all.unpriced, 1);

  eq('limit is clamped', (await svc.search({ limit: 9999 })).items.length <= svc.MAX_LIMIT, true);

  // ── priceForUnit: the three-level read ──────────────────────────────────
  const u = await svc.priceForUnit(11);
  eq('the unit read populates product AND its parent',
     seen['api::stock-item.stock-item'].populate, { product: { populate: { parent: true } } });
  // 50m roll priced 5000 by the parent, offered at 4500 → 90/m.
  eq('divisible: the parent price is divided by the unit length', u.price.selling, 100);
  eq('and the offer with it', [u.price.offer, u.price.effective], [90, 90]);
  eq('divided by what, stated', u.price.perUnits, 50);
  eq('nothing missing', [u.itemMissing, u.priceIncomplete], [false, false]);

  const override = await svc.priceForUnit(12);
  eq('a unit that prices itself outranks both levels',
     [override.price.selling, override.price.sellingFrom], [150, 'unit']);

  const orphan = await svc.priceForUnit(13);
  eq('an orphaned unit still answers with its own price', orphan.price.selling, 900);
  eq('but says the item is missing rather than pretending', orphan.itemMissing, true);

  eq('unknown unit', await svc.priceForUnit(999), null);

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} catalog service assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
