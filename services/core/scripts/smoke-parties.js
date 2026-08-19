#!/usr/bin/env node
'use strict';

/**
 * Smoke test for PartyService (portal task E1) — no database required.
 *
 * The documents() layer is replaced with fixture tables, so what is under test
 * is the half that has no other coverage: whether five differently-shaped
 * legacy tables are read with the right columns and the right relations
 * populated, and whether the merged result is ordered, capped and grouped the
 * way callers are told it is.
 *
 * The contract itself (`@rutba/shared/core/parties`) has its own tests; this
 * exercises it through real query shapes rather than re-testing it.
 *
 * The case worth watching is the last one: the same handset written two ways in
 * two different tables has to come back as ONE proposed party. That is the whole
 * promise of E1 in a single assertion.
 *
 *   node scripts/smoke-parties.js
 */

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const docsPath = require.resolve(path.join(ROOT, 'services/core/src/documents/index.js'));

// ── fixture tables ────────────────────────────────────────────────────────
// Ali Raza is deliberately three rows: a customer, a person, and a CRM contact
// that already resolves to the person. His phone is written differently in each.
const TABLES = {
  'api::customer.customer': [
    { id: 1, documentId: 'c1', name: 'Ali Raza', email: 'ALI@x.com', phone: '0300-123 4567', address: 'Lahore' },
    { id: 2, documentId: 'c2', name: 'Zara Khan', phone: '0301-9999999' },
    { id: 3, documentId: 'c3', phone: '0302-5555555' },
  ],
  'api::person.person': [
    { id: 44, documentId: 'p44', name: 'Ali Raza', email: 'ali@x.com', phone: '+92 300 1234567' },
  ],
  'api::crm-contact.crm-contact': [
    { id: 5, documentId: 'k5', name: 'A. Raza', person: { id: 44 } },
  ],
  'api::supplier.supplier': [
    { id: 7, documentId: 's7', name: 'Acme Textiles', contact_person: 'Sara Malik', email: 'sales@acme.pk', phone: '042-111-22-333' },
  ],
  'api::hr-employee.hr-employee': [
    { id: 3, documentId: 'e3', name: 'Bilal Ahmed', email: 'bilal@rutba.pk', phone: '0333-1112222' },
  ],
};

const seen = {};
function matches(row, filters) {
  if (!filters) return true;
  if (filters.$or) return filters.$or.some((f) => matches(row, f));
  for (const [field, cond] of Object.entries(filters)) {
    const val = row[field];
    if (cond.$eq !== undefined && String(val) !== String(cond.$eq)) return false;
    if (cond.$containsi !== undefined
      && !String(val ?? '').toLowerCase().includes(String(cond.$containsi).toLowerCase())) return false;
  }
  return true;
}

const stub = {
  documents: (uid) => ({
    findMany: async (params) => {
      seen[uid] = params;
      const rows = (TABLES[uid] || []).filter((r) => matches(r, params.filters));
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

const svc = require(path.join(ROOT, 'services/core/src/domain/parties/party.service.js'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

(async () => {
  // ── projection ──────────────────────────────────────────────────────────
  const cust = await svc.getById('customer:1');
  eq('getById projects through the contract',
     [cust.id, cust.kind, cust.roles, cust.displayName], ['customer:1', 'person', ['customer'], 'Ali Raza']);
  const sup = await svc.getById('supplier:7');
  eq('supplier is an organisation', [sup.kind, sup.roles], ['organisation', ['supplier']]);
  const emp = await svc.getById('hr-employee:3');
  eq('hyphenated source id round-trips', [emp.id, emp.roles], ['hr-employee:3', ['employee']]);
  eq('unknown source rejected', await svc.getById('widget:1'), null);
  eq('malformed id rejected', await svc.getById('customer:'), null);
  eq('missing row', await svc.getById('customer:999'), null);

  // Relations must be populated or every party looks unlinked — which would
  // silently drop the strongest match key there is.
  const crm = await svc.getById('crm-contact:5');
  eq('crm-contact resolves its person relation', crm.links.personId, 44);
  eq('person relation is populated in the query', seen['api::crm-contact.crm-contact'].populate, { person: true });

  // ── search ──────────────────────────────────────────────────────────────
  const all = await svc.search({});
  eq('search spans all five sources', all.sources.length, 5);
  eq('sorted by name, ties by id, nameless last', all.parties.map((p) => p.id),
     // 'A. Raza' < 'Acme Textiles' < 'Ali Raza'; the two Ali Raza rows tie on
     // name and fall through to the id, so customer:1 precedes person:44.
     ['crm-contact:5', 'supplier:7', 'customer:1', 'person:44', 'hr-employee:3', 'customer:2', 'customer:3']);

  const sups = await svc.search({ roles: ['supplier'] });
  eq('role narrows to its source', sups.parties.map((p) => p.id), ['supplier:7']);
  const bogus = await svc.search({ roles: ['not-a-role'] });
  eq('unknown role narrows to nothing, never widens', bogus.parties.length, 0);

  const bySara = await svc.search({ q: 'Sara' });
  eq('supplier findable by its contact person', bySara.parties.map((p) => p.id), ['supplier:7']);
  // contact_person only exists on supplier; filtering other tables on it would
  // be a query error rather than an empty result.
  eq('contact_person searched only where the column exists',
     seen['api::customer.customer'].filters.$or.map((f) => Object.keys(f)[0]), ['name', 'email', 'phone']);

  const capped = await svc.search({ limit: 2 });
  eq('limit caps the merged list', capped.parties.length, 2);
  eq('truncation is reported, not silent', capped.truncated, true);
  eq('each source gets the full limit, not a share', seen['api::customer.customer'].limit, 2);
  eq('limit clamped to MAX', (await svc.search({ limit: 9999 })).parties.length <= svc.MAX_LIMIT, true);

  // ── dedup proposal ──────────────────────────────────────────────────────
  const dup = await svc.duplicates();
  eq('every fixture row scanned', dup.scanned, 7);
  eq('one proposed party', dup.groups.length, 1);

  const group = dup.groups[0];
  eq('the three Ali Raza rows group together',
     group.members.map((m) => m.id).sort(), ['crm-contact:5', 'customer:1', 'person:44']);
  // THE POINT OF E1: one party, several roles, spread across three tables.
  eq('the group carries every role its members contribute', group.roles, ['contact', 'customer']);

  // '0300-123 4567' and '+92 300 1234567' are the same handset written two
  // ways in two tables. Matching on the trailing significant digits finds it;
  // comparing the raw strings would not.
  eq('matched across differently-formatted phone numbers',
     group.matchedOn.some((k) => k.startsWith('phone:')), true);
  eq('and on the explicit person relation',
     group.matchedOn.some((k) => k.startsWith('person:')), true);

  // A shared name alone must never group anybody.
  eq('unrelated rows stay unmatched', dup.unmatched, 4);
  eq('a complete sweep says so', dup.truncated, false);

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} party service assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
