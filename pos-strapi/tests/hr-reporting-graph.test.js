'use strict';

// Standalone unit tests for the HR authority graph — no Strapi runtime, no DB.
// Run: `node tests/hr-reporting-graph.test.js`.
//
// What these pin down is the one function that decides, across ~14 approval
// call sites, whose records a person may act on. The interesting cases are all
// about a line that LOOKS like authority but is not: an advisory dotted line, a
// lapsed one, a future-dated one. Getting any of those wrong hands someone the
// ability to approve another person's leave, silently.

const assert = require('assert');

// ── a filter evaluator good enough for the shapes hr-access actually sends ────
// Deliberately not a mock that returns canned rows: the date-window and
// grants_authority logic lives IN the filter, so a stub that ignored filters
// would pass while the real query let everything through.
function matchesCondition(value, cond) {
  if (cond === null || typeof cond !== 'object') return value === cond;
  for (const [op, operand] of Object.entries(cond)) {
    switch (op) {
      case '$eq': if (value !== operand) return false; break;
      case '$ne': if (value === operand) return false; break;
      case '$in': if (!operand.includes(value)) return false; break;
      case '$null':
        if (operand === true && value != null) return false;
        if (operand === false && value == null) return false;
        break;
      case '$lte': if (value == null || !(value <= operand)) return false; break;
      case '$gte': if (value == null || !(value >= operand)) return false; break;
      default: return false;
    }
  }
  return true;
}

function matches(row, filters) {
  for (const [key, cond] of Object.entries(filters || {})) {
    if (key === '$and') {
      if (!cond.every((sub) => matches(row, sub))) return false;
      continue;
    }
    if (key === '$or') {
      if (!cond.some((sub) => matches(row, sub))) return false;
      continue;
    }
    const value = row[key];
    // A relation filter reads through to the related row's documentId.
    if (cond && typeof cond === 'object' && cond.documentId !== undefined) {
      const relDocId = value && typeof value === 'object' ? value.documentId : value;
      if (!matchesCondition(relDocId, cond.documentId)) return false;
      continue;
    }
    if (!matchesCondition(value, cond)) return false;
  }
  return true;
}

function fakeStrapi(tables) {
  let queries = 0;
  return {
    queryCount: () => queries,
    documents: (uid) => ({
      findMany: async ({ filters }) => {
        queries += 1;
        return (tables[uid] || []).filter((r) => matches(r, filters));
      },
    }),
  };
}

const EMP = 'api::hr-employee.hr-employee';
const LINE = 'api::hr-reporting-line.hr-reporting-line';
const TEAM = 'api::hr-team.hr-team';

const { reportingLineDocIds, secondaryManagersFor } = require('../src/utils/hr-access');

const iso = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};

function emp(documentId, reportsTo) {
  return { documentId, name: documentId, reports_to: reportsTo ? { documentId: reportsTo } : null };
}
function line(employeeId, managerId, overrides = {}) {
  return {
    documentId: `l-${employeeId}-${managerId}`,
    employee: { documentId: employeeId },
    manager: { documentId: managerId },
    kind: 'Dotted',
    grants_authority: true,
    valid_from: null,
    valid_to: null,
    ...overrides,
  };
}

let passed = 0;
let failed = 0;
const pending = [];
function test(name, fn) {
  pending.push((async () => {
    try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
    catch (e) { failed += 1; console.log(`  FAIL ${name} :: ${e && e.message}`); }
  })());
}

// ── the primary line still works exactly as before ───────────────────────────

test('walks the primary reporting line transitively', async () => {
  const s = fakeStrapi({
    [EMP]: [emp('ceo'), emp('vp', 'ceo'), emp('lead', 'vp'), emp('ic', 'lead')],
    [LINE]: [],
  });
  const got = await reportingLineDocIds(s, 'ceo');
  assert.deepStrictEqual(got.sort(), ['ic', 'lead', 'vp']);
});

test('excludes the employee themselves', async () => {
  const s = fakeStrapi({ [EMP]: [emp('a'), emp('b', 'a')], [LINE]: [] });
  assert.deepStrictEqual(await reportingLineDocIds(s, 'a'), ['b']);
});

test('returns [] for someone with no reports', async () => {
  const s = fakeStrapi({ [EMP]: [emp('a'), emp('b', 'a')], [LINE]: [] });
  assert.deepStrictEqual(await reportingLineDocIds(s, 'b'), []);
});

// ── secondary lines: the whole point of the join content-type ────────────────

test('an active authority-granting dotted line adds its employee', async () => {
  const s = fakeStrapi({
    [EMP]: [emp('mgr'), emp('other')],
    [LINE]: [line('other', 'mgr')],
  });
  assert.deepStrictEqual(await reportingLineDocIds(s, 'mgr'), ['other']);
});

test('an ADVISORY dotted line grants nothing', async () => {
  const s = fakeStrapi({
    [EMP]: [emp('mgr'), emp('other')],
    [LINE]: [line('other', 'mgr', { grants_authority: false })],
  });
  assert.deepStrictEqual(await reportingLineDocIds(s, 'mgr'), []);
});

test('a lapsed line grants nothing', async () => {
  const s = fakeStrapi({
    [EMP]: [emp('mgr'), emp('other')],
    [LINE]: [line('other', 'mgr', { valid_from: iso(-30), valid_to: iso(-1) })],
  });
  assert.deepStrictEqual(await reportingLineDocIds(s, 'mgr'), []);
});

test('a future-dated line grants nothing yet', async () => {
  const s = fakeStrapi({
    [EMP]: [emp('mgr'), emp('other')],
    [LINE]: [line('other', 'mgr', { valid_from: iso(7) })],
  });
  assert.deepStrictEqual(await reportingLineDocIds(s, 'mgr'), []);
});

test('a line whose window is open today does grant', async () => {
  const s = fakeStrapi({
    [EMP]: [emp('mgr'), emp('other')],
    [LINE]: [line('other', 'mgr', { valid_from: iso(-1), valid_to: iso(1) })],
  });
  assert.deepStrictEqual(await reportingLineDocIds(s, 'mgr'), ['other']);
});

test('authority reaches through a dotted line to that person\'s own reports', async () => {
  // matrix: mgr has a dotted line over `head`, who has a solid report `junior`.
  const s = fakeStrapi({
    [EMP]: [emp('mgr'), emp('head'), emp('junior', 'head')],
    [LINE]: [line('head', 'mgr')],
  });
  assert.deepStrictEqual((await reportingLineDocIds(s, 'mgr')).sort(), ['head', 'junior']);
});

test('a mixed solid → dotted → solid chain resolves in one walk', async () => {
  const s = fakeStrapi({
    [EMP]: [emp('top'), emp('mid', 'top'), emp('matrixed'), emp('leaf', 'matrixed')],
    [LINE]: [line('matrixed', 'mid')],
  });
  assert.deepStrictEqual(
    (await reportingLineDocIds(s, 'top')).sort(),
    ['leaf', 'matrixed', 'mid'],
  );
});

// ── termination ──────────────────────────────────────────────────────────────

test('a cycle in the primary line terminates', async () => {
  const s = fakeStrapi({ [EMP]: [emp('a', 'b'), emp('b', 'a')], [LINE]: [] });
  const started = Date.now();
  const got = await reportingLineDocIds(s, 'a');
  assert.ok(Date.now() - started < 2000, 'walk should terminate quickly');
  assert.deepStrictEqual(got, ['b']);
});

test('a cycle THROUGH a secondary line terminates', async () => {
  // a --solid--> b --dotted--> a : the loop only exists across both edge types,
  // which is exactly the case a per-edge visited-set would miss.
  const s = fakeStrapi({
    [EMP]: [emp('a'), emp('b', 'a')],
    [LINE]: [line('a', 'b')],
  });
  const started = Date.now();
  const got = await reportingLineDocIds(s, 'a');
  assert.ok(Date.now() - started < 2000, 'walk should terminate quickly');
  assert.deepStrictEqual(got, ['b']);
});

test('a deep chain stops at the depth bound rather than running away', async () => {
  const chain = [emp('e0')];
  for (let i = 1; i <= 40; i++) chain.push(emp(`e${i}`, `e${i - 1}`));
  const s = fakeStrapi({ [EMP]: chain, [LINE]: [] });
  const got = await reportingLineDocIds(s, 'e0');
  assert.strictEqual(got.length, 10, 'MAX_GRAPH_DEPTH levels, one node per level');
});

// ── the chart annotation ─────────────────────────────────────────────────────

test('secondaryManagersFor reports advisory lines too, flagged', async () => {
  const s = fakeStrapi({
    [LINE]: [
      line('ic', 'boss'),
      line('ic', 'advisor', { grants_authority: false, kind: 'Dotted' }),
      line('ic', 'expired', { valid_to: iso(-1) }),
    ],
  });
  const map = await secondaryManagersFor(s, ['ic']);
  const got = (map.get('ic') || []).map((m) => `${m.documentId}:${m.grants_authority}`).sort();
  // The lapsed one is gone; the advisory one is present but marked.
  assert.deepStrictEqual(got, ['advisor:false', 'boss:true']);
});

test('secondaryManagersFor returns an empty map for no input', async () => {
  const s = fakeStrapi({ [LINE]: [] });
  assert.strictEqual((await secondaryManagersFor(s, [])).size, 0);
  assert.strictEqual((await secondaryManagersFor(s, null)).size, 0);
});

// ── the two safety defaults, which are easy to flip back by accident ─────────

test('grants_authority defaults to FALSE in the schema', () => {
  const fs = require('fs');
  const path = require('path');
  const schema = JSON.parse(fs.readFileSync(
    path.join(__dirname, '../src/api/hr-reporting-line/content-types/hr-reporting-line/schema.json'),
    'utf8',
  ));
  // A permission column that defaults to true gets granted by whoever forgets
  // to send the field. Recording a dotted line must change nothing until
  // someone deliberately says it should.
  assert.strictEqual(schema.attributes.grants_authority.default, false);
});

test('hr-reporting-lines is HR-only, reads included', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../../packages/api-provider/api/hr-reporting-lines.js'),
    'utf8',
  );
  // rutba-core serves seeded CRUD through a generic handler that never reaches
  // the pos-strapi controller, so a controller-side scope narrowing would apply
  // on :4010 and silently not on :4020. The api-pro policy is the only gate
  // that holds on both — it must not be widened to staff/user.
  assert.ok(!/'staff'/.test(src), 'no staff-level access');
  assert.ok(!/'user'/.test(src), 'no user-level access');
  assert.ok(!/'ess'/.test(src), 'not exposed to the ESS app');
});

// ── the constraint that must survive every change here ───────────────────────

test('hr-grievance does not use the manager scope', () => {
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(
    path.join(__dirname, '../src/api/hr-grievance/controllers/hr-grievance.js'),
    'utf8',
  );
  // A grievance is frequently ABOUT the reporting manager. Routing it to them
  // defeats the purpose, so the queue stays HR-claim only — no matter what the
  // reporting line grows to mean elsewhere.
  assert.ok(
    !/managedReportDocIds|reportingLineDocIds|teamManagedDocIds/.test(src),
    'hr-grievance must not scope by manager',
  );
});

Promise.all(pending).then(() => {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
});
