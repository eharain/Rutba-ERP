#!/usr/bin/env node
'use strict';

/**
 * Smoke test for CompanyService (portal task E1) — no database required.
 *
 * The contract's tests cover tax arithmetic and sequence identity. What is only
 * testable here is the allocator's behaviour around its counter:
 *
 *   - the FIRST number handed out must be 1, not 2 — `next_value` is the next
 *     value, not the last one used, and an off-by-one is noticed only after the
 *     numbers have been printed;
 *   - a number must be consumed exactly once;
 *   - `peek` must not consume one.
 *
 * Atomicity itself cannot be proved against a stub — a single-threaded fake has
 * no race to lose. It is proved against real MySQL instead, by racing
 * concurrent allocations; see the commit message and §3 of
 * docs/todo/erp2-program/06-core-extraction.md.
 *
 *   node scripts/smoke-company.js
 */

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const connPath = require.resolve(path.join(ROOT, 'services/core/src/db/connection.js'));
const docsPath = require.resolve(path.join(ROOT, 'services/core/src/documents/index.js'));

// ── an in-memory sequences table ─────────────────────────────────────────
const sequences = new Map();

function seqQuery() {
  const state = {};
  const q = {
    where(w) { state.key = w.scope_key; return q; },
    first() { return Promise.resolve(sequences.has(state.key) ? { scope_key: state.key, next_value: sequences.get(state.key) } : undefined); },
    async insert(row) {
      if (sequences.has(row.scope_key)) throw new Error('Duplicate entry for PRIMARY');
      sequences.set(row.scope_key, row.next_value);
      return [1];
    },
    async update(patch) {
      // `next_value + 1`, expressed by the caller as a raw fragment.
      if (patch.next_value && patch.next_value.__increment) {
        sequences.set(state.key, (sequences.get(state.key) || 1) + 1);
      }
      return 1;
    },
  };
  return q;
}

const fakeDb = (table) => {
  if (table !== 'core_number_sequences') throw new Error(`unexpected table ${table}`);
  return seqQuery();
};
fakeDb.raw = (sql) => ({ __increment: /next_value \+ 1/.test(sql) });

const conn = new Module(connPath);
conn.filename = connPath;
conn.loaded = true;
conn.exports = {
  getDb: () => fakeDb,
  withTransaction: async (cb) => {
    const trx = (t) => fakeDb(t);
    trx.raw = fakeDb.raw;
    return cb(trx);
  },
  closeDb: async () => {},
};
require.cache[connPath] = conn;

// ── branches and tax rates ───────────────────────────────────────────────
const TABLES = {
  'api::branch.branch': [
    { id: 3, documentId: 'br3', name: 'Main Store', location_code: 'MS', location_type: 'store',
      is_default_location: true, is_active: true, po_prefix: 'MS', tax_rate: 0 },
    { id: 4, documentId: 'br4', name: 'Depot', location_code: 'DP', location_type: 'warehouse',
      is_active: true, tax_rate: 12 },
    { id: 5, documentId: 'br5', name: 'Old Shop', location_type: 'store', is_active: false },
  ],
  'api::acc-tax-rate.acc-tax-rate': [
    { id: 1, name: 'GST 17', code: 'GST17', rate: 17, type: 'Exclusive', scope: 'Sales', is_active: true },
    { id: 2, name: 'Input 12', code: 'IN12', rate: 12, type: 'Inclusive', scope: 'Purchases', is_active: true },
    { id: 3, name: 'Retired', rate: 5, type: 'Exclusive', scope: 'Both', is_active: false },
  ],
};

function matches(row, filters) {
  if (!filters) return true;
  if (filters.$and) return filters.$and.every((f) => matches(row, f));
  if (filters.$or) return filters.$or.some((f) => matches(row, f));
  for (const [field, cond] of Object.entries(filters)) {
    if (cond && cond.$eq !== undefined) {
      const v = row[field];
      const want = cond.$eq;
      if (typeof want === 'boolean') { if ((v !== false) !== want) return false; continue; }
      if (String(v ?? '') !== String(want)) return false;
    }
  }
  return true;
}

const docs = new Module(docsPath);
docs.filename = docsPath;
docs.loaded = true;
docs.exports = {
  documents: (uid) => ({
    findMany: async (params) => (TABLES[uid] || []).filter((r) => matches(r, params.filters)),
  }),
  getRegistry: () => ({}),
  useDocumentMiddleware: () => {},
  mapFileRow: (r) => r,
};
require.cache[docsPath] = docs;

const svc = require(path.join(ROOT, 'services/core/src/domain/company/company.service.js'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

(async () => {
  // ── locations ───────────────────────────────────────────────────────────
  const locs = await svc.locations();
  eq('retired locations are hidden by default', locs.map((l) => l.branchId), [3, 4]);
  eq('and can be asked for', (await svc.locations({ activeOnly: false })).length, 3);

  const def = await svc.defaultLocation();
  eq('the flagged default is found', def.branchId, 3);
  eq('its prefix comes with it', def.poPrefix, 'MS');

  // ── tax ─────────────────────────────────────────────────────────────────
  const sales = await svc.taxRates({ scope: 'Sales' });
  eq('a scoped query finds its rate', sales.map((r) => r.code), ['GST17']);
  eq('retired rates are excluded', sales.some((r) => r.name === 'Retired'), false);

  const purchases = await svc.taxRates({ scope: 'Purchases' });
  eq('and the inclusive purchase rate keeps its type',
     purchases.map((r) => [r.code, r.type]), [['IN12', 'Inclusive']]);

  const depot = locs.find((l) => l.branchId === 4);
  const atDepot = await svc.taxFor({ location: depot, scope: 'Sales' });
  eq('a location override beats the org default', [atDepot.rate, atDepot.from], [12, 'location']);

  const atMain = await svc.taxFor({ location: def, scope: 'Sales' });
  eq('a branch with tax_rate 0 inherits the org default', [atMain.rate, atMain.from], [17, 'org']);
  eq('and the TYPE travels with the rate', atMain.type, 'Exclusive');

  const itemRate = await svc.taxFor({ item: { taxRate: 5 }, location: depot, scope: 'Sales' });
  eq('the item still wins', [itemRate.rate, itemRate.from], [5, 'item']);

  // ── numbering ───────────────────────────────────────────────────────────
  const first = await svc.nextNumber('journal-entry', { date: '2026-08-20' });
  eq('the FIRST number is 1, not 2', first.seq, 1);
  eq('and it is formatted', first.number, 'JE-2026-000001');

  const second = await svc.nextNumber('journal-entry', { date: '2026-08-20' });
  eq('a number is consumed exactly once', second.seq, 2);

  const peeked = await svc.peekSequence('journal-entry', { date: '2026-08-20' });
  eq('peek reports what is next', peeked.next, 3);
  eq('and does NOT consume it', (await svc.nextNumber('journal-entry', { date: '2026-08-20' })).seq, 3);

  // Scoping: separate counters really are separate.
  const inv3 = await svc.nextNumber('invoice', { location: def, date: '2026-08-20' });
  const inv4 = await svc.nextNumber('invoice', { location: depot, date: '2026-08-20' });
  eq('each branch starts its own series at 1', [inv3.seq, inv4.seq], [1, 1]);
  eq('and the numbers differ', inv3.number !== inv4.number, true);
  eq('a location prefix reaches the number', inv3.number, 'MS-2026-000001');

  const nextYear = await svc.nextNumber('invoice', { location: def, date: '2027-01-02' });
  eq('a new year restarts the series', nextYear.seq, 1);
  eq('and says which year, so it cannot collide', nextYear.number, 'MS-2027-000001');

  eq('peek on an untouched counter reports 1',
     (await svc.peekSequence('sale-return', { date: '2026-08-20' })).next, 1);

  let threw = null;
  try { await svc.nextNumber('nope', {}); } catch (e) { threw = e.message; }
  eq('an unknown scheme is refused', /unknown number scheme/.test(threw || ''), true);

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} company service assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
