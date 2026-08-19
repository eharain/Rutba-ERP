#!/usr/bin/env node
'use strict';

/**
 * Smoke test for PostingService (portal task E1 × E2) — no database required.
 *
 * The contract's own tests cover balance, rounding and validation. What is only
 * testable here is the routing, and routing is where the expensive mistakes
 * live:
 *
 *   - reading "keys: null" (the stub's "everything") as "no keys" would divert
 *     every licensed org's real postings into a queue nobody watches;
 *   - gating on the accounts APP's key list instead of `erp.gl` would post to a
 *     general ledger for every org that bought only AP/AR;
 *   - a failed idempotency check would let a retried webhook capture one sale
 *     twice, which reconciles to a number nobody can explain.
 *
 * The fake `db` enforces the unique index for real, because idempotency that is
 * only checked in JavaScript is not idempotency.
 *
 *   node scripts/smoke-posting.js
 */

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const connPath = require.resolve(path.join(ROOT, 'services/core/src/db/connection.js'));

// ── an in-memory table that behaves like the migration's ─────────────────
const rows = [];
let nextId = 1;

function makeQuery() {
  const state = { where: {}, wheres: [], order: [], limit: null, group: null };
  const q = {
    where(a, op, b) {
      if (typeof a === 'object') Object.assign(state.where, a);
      else if (b !== undefined) state.wheres.push({ col: a, op, val: b });
      else state.wheres.push({ col: a, op: '=', val: op });
      return q;
    },
    whereIn(col, list) { state.wheres.push({ col, op: 'in', val: list }); return q; },
    orderBy(col) { state.order.push(col); return q; },
    limit(n) { state.limit = n; return q; },
    select() { return q; },
    count() { state.count = true; return q; },
    sum() { state.sum = true; return q; },
    groupBy(col) { state.group = col; return q; },
    first() { return Promise.resolve(matching()[0]); },
    async insert(row) {
      // The unique index, enforced — not merely checked above it.
      if (row.idempotency_key
        && rows.some((r) => r.idempotency_key === row.idempotency_key)) {
        throw new Error("ER_DUP_ENTRY: Duplicate entry for key 'idempotency_key'");
      }
      const created = { id: nextId++, ...row };
      rows.push(created);
      return [created.id];
    },
    async update(patch) {
      const hit = matching();
      hit.forEach((r) => Object.assign(r, patch));
      return hit.length;
    },
    then(resolve, reject) { return Promise.resolve(result()).then(resolve, reject); },
  };

  function matching() {
    return rows.filter((r) => {
      for (const [k, v] of Object.entries(state.where)) if (r[k] !== v) return false;
      for (const w of state.wheres) {
        if (w.op === 'in') { if (!w.val.includes(r[w.col])) return false; continue; }
        if (w.op === '>=' && !(r[w.col] >= w.val)) return false;
        if (w.op === '<=' && !(r[w.col] <= w.val)) return false;
        if (w.op === '=' && r[w.col] !== w.val) return false;
      }
      return true;
    });
  }

  function result() {
    let out = matching();
    if (state.group) {
      const by = new Map();
      for (const r of out) {
        const k = r[state.group];
        if (!by.has(k)) by.set(k, { [state.group]: k, entries: 0, debit_minor: 0 });
        const acc = by.get(k);
        acc.entries += 1;
        acc.debit_minor += r.total_debit_minor;
      }
      return [...by.values()];
    }
    if (state.order.length) {
      out = [...out].sort((a, b) => {
        for (const col of state.order) {
          if (a[col] < b[col]) return -1;
          if (a[col] > b[col]) return 1;
        }
        return 0;
      });
    }
    return state.limit ? out.slice(0, state.limit) : out;
  }

  return q;
}

const fakeDb = () => makeQuery();
const stub = new Module(connPath);
stub.filename = connPath;
stub.loaded = true;
stub.exports = { getDb: () => fakeDb, withTransaction: async (cb) => cb(fakeDb), closeDb: async () => {} };
require.cache[connPath] = stub;

const svc = require(path.join(ROOT, 'services/core/src/domain/posting/posting.service.js'));
const posting = require('@rutba/shared/core/posting');

// ── resolvers, as the real one answers ───────────────────────────────────
const resolverWith = (value) => ({ resolve: async () => value });
const stubResolver = resolverWith({ status: 'active', keys: null });          // "everything"
const glOnly = resolverWith({ status: 'active', keys: new Set(['erp.gl']) });
const apArOnly = resolverWith({ status: 'active', keys: new Set(['erp.ap-ar']) });
const revoked = resolverWith({ status: 'revoked', keys: new Set(['erp.gl']) });
const broken = { resolve: async () => { throw new Error('licence service unreachable'); } };

const sale = (over = {}) => posting.toEntry({
  date: '2026-08-20',
  source_type: 'POS Sale',
  source_id: 4210,
  lines: [{ account: 1, debit: 1150.75 }, { account: 2, credit: 1150.75 }],
  ...over,
});

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

(async () => {
  // ── entitlement reading ─────────────────────────────────────────────────
  eq('keys:null means EVERYTHING, not nothing', await svc.isLedgerEntitled(stubResolver), true);
  eq('erp.gl held', await svc.isLedgerEntitled(glOnly), true);
  eq('erp.ap-ar alone does NOT grant the ledger', await svc.isLedgerEntitled(apArOnly), false);
  eq('revoked denies even with the key', await svc.isLedgerEntitled(revoked), false);
  eq('an unreachable licence service is unknown, not denied', await svc.isLedgerEntitled(broken), null);
  eq('no resolver at all is unknown', await svc.isLedgerEntitled(null), null);

  // ── routing ─────────────────────────────────────────────────────────────
  const entitled = await svc.capture(sale(), { resolver: glOnly });
  eq('an entitled org routes to the ledger', entitled.target, 'ledger');
  eq('and nothing is captured — the caller posts it', entitled.captured, false);

  const unknown = await svc.capture(sale({ source_id: 1 }), { resolver: broken });
  eq('unknown entitlement routes to the ledger (fail open)', unknown.target, 'ledger');

  const queued = await svc.capture(sale({ source_id: 2 }), { resolver: apArOnly });
  eq('an unentitled org routes to the export queue', queued.target, 'export-queue');
  eq('and the entry is captured rather than lost', queued.captured, true);
  eq('with its source identity', queued.key, 'POS Sale:2');

  // ── validation gates both arms ──────────────────────────────────────────
  const bad = await svc.capture(sale({ source_id: 3, lines: [{ account: 1, debit: 10 }] }), { resolver: apArOnly });
  eq('an invalid entry is refused, not queued', [bad.target, bad.valid], [null, false]);
  eq('and says why', bad.errors.length > 0, true);
  eq('nothing was written', rows.filter((r) => r.source_id === 3).length, 0);

  // ── idempotency ─────────────────────────────────────────────────────────
  const again = await svc.capture(sale({ source_id: 2 }), { resolver: apArOnly });
  eq('the same document captures once', [again.captured, again.duplicate], [false, true]);
  eq('and points at the original row', again.id, queued.id);
  eq('one row, not two', rows.filter((r) => r.idempotency_key === 'POS Sale:2').length, 1);

  const withDisc = await svc.capture(sale({ source_id: 2 }), { resolver: apArOnly, discriminator: 'payment' });
  eq('a discriminator separates two postings of one document', withDisc.captured, true);
  eq('under its own key', withDisc.key, 'POS Sale:2:payment');

  // The unique index is the real enforcement — prove it by racing the SELECT.
  const raceEntry = sale({ source_id: 77 });
  const [a, b] = await Promise.all([svc.enqueue(raceEntry), svc.enqueue(raceEntry)]);
  eq('a race still captures once', [a.captured, b.captured].filter(Boolean).length, 1);
  eq('the loser reports the winner rather than throwing', a.id, b.id);

  // Manual entries have no identity and must not collapse into one another.
  const m1 = await svc.enqueue(posting.toEntry({
    source_type: 'Manual', date: '2026-08-01',
    lines: [{ account: 1, debit: 5 }, { account: 2, credit: 5 }],
  }));
  const m2 = await svc.enqueue(posting.toEntry({
    source_type: 'Manual', date: '2026-08-02',
    lines: [{ account: 3, debit: 9 }, { account: 4, credit: 9 }],
  }));
  eq('two unrelated manual entries stay two rows', [m1.captured, m2.captured], [true, true]);
  eq('neither has a key', [m1.key, m2.key], [null, null]);

  // ── the queue ───────────────────────────────────────────────────────────
  const pending = await svc.listPending();
  eq('everything captured is pending', pending.length, rows.length);
  eq('oldest first', pending[0].entryDate, '2026-08-01');
  eq('payloads come back parsed', typeof pending.at(-1).payload, 'object');
  eq('and read as money, not paisa', pending.find((p) => p.sourceId === 2).payload.lines[0].debit, 1150.75);
  eq('while the totals stay exact integers',
     pending.find((p) => p.sourceId === 2).totalDebitMinor, 115075);

  const summary = await svc.pendingSummary();
  eq('the summary groups by source', summary.find((s) => s.sourceType === 'Manual').entries, 2);

  const moved = await svc.markResolved([queued.id], 'exported');
  eq('a pending row resolves', moved, 1);
  eq('and leaves the queue', (await svc.listPending()).some((p) => p.id === queued.id), false);

  const twice = await svc.markResolved([queued.id], 'posted');
  eq('a settled row cannot be re-resolved — it would be counted twice', twice, 0);

  let threw = null;
  try { await svc.markResolved([1], 'nonsense'); } catch (e) { threw = e.message; }
  eq('an unknown resolution is refused', /not a resolution/.test(threw || ''), true);

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} posting service assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
