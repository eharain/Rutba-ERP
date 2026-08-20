#!/usr/bin/env node
'use strict';

/**
 * Smoke test for InteractionService (portal task E1) — no database required.
 *
 * The contract's tests cover what an interaction is. What is only testable here
 * is the fan-out: a subject's history lives in up to nine tables, and the ways
 * that goes wrong are all quiet.
 *
 *   - Query the wrong set of tables and the timeline looks complete while
 *     missing half of itself.
 *   - Let one source's failure propagate and a missing module empties a
 *     customer screen the other eight could have filled.
 *   - Forget to populate the actor relation and every entry reads "someone did
 *     something".
 *
 *   node scripts/smoke-interactions.js
 */

const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const docsPath = require.resolve(path.join(ROOT, 'services/core/src/documents/index.js'));

const CRM = 'api::crm-activity.crm-activity';
const HR = 'api::hr-lifecycle-event.hr-lifecycle-event';
const ORDER_MSG = 'api::order-message.order-message';
const WI_ACT = 'api::work-item-activity.work-item-activity';
const WI_COM = 'api::work-item-comment.work-item-comment';
/** uids that should throw, so failure isolation can be aimed where it matters. */
const FAILING = new Set();

const TABLES = {
  [CRM]: [
    { id: 1, type: 'Call', date: '2026-08-20T09:00:00Z', subject: 'Chased invoice',
      person: { id: 44 }, actor: { id: 8, username: 'sara' } },
    { id: 2, type: 'Email', date: '2026-08-18T15:00:00Z', person: { id: 44 } },
    { id: 3, type: 'Note', date: '2026-08-19T10:00:00Z', person: { id: 99 } },
  ],
  [HR]: [
    { id: 10, type: 'Promotion', effective_date: '2026-08-01', employee: { id: 3 } },
  ],
  [ORDER_MSG]: [
    { id: 20, sender_type: 'customer', message: 'where is it?', sent_at: '2026-08-20T12:00:00Z',
      order: { id: 77 } },
  ],
  [WI_ACT]: [
    { id: 30, entity_uid: 'api::sale-order.sale-order', target_document_id: 'ord-1',
      kind: 'transition', summary: 'Draft → Confirmed', createdAt: '2026-08-20T13:00:00Z' },
  ],
  [WI_COM]: [
    { id: 40, entity_uid: 'api::sale-order.sale-order', target_document_id: 'ord-1',
      body: 'customer called', createdAt: '2026-08-20T14:00:00Z', author_label: 'Bilal' },
  ],
  // Deliberately absent from TABLES: mail_messages stands in for a module this
  // instance does not have installed.
};

const seen = {};
function matches(row, filters) {
  if (!filters) return true;
  for (const [field, cond] of Object.entries(filters)) {
    if (cond && typeof cond === 'object' && cond.id && cond.id.$eq !== undefined) {
      const rel = row[field];
      const id = rel && typeof rel === 'object' ? rel.id : rel;
      if (String(id) !== String(cond.id.$eq)) return false;
      continue;
    }
    if (cond && cond.$eq !== undefined && String(row[field] ?? '') !== String(cond.$eq)) return false;
  }
  return true;
}

const stub = {
  documents: (uid) => ({
    findMany: async (params) => {
      seen[uid] = params;
      if (FAILING.has(uid)) throw new Error(`Table for ${uid} does not exist`);
      const rows = (TABLES[uid] || []).filter((r) => matches(r, params.filters));
      return params.limit ? rows.slice(0, params.limit) : rows;
    },
  }),
  getRegistry: () => ({}),
  useDocumentMiddleware: () => {},
  mapFileRow: (r) => r,
};

const m = new Module(docsPath);
m.filename = docsPath;
m.loaded = true;
m.exports = stub;
require.cache[docsPath] = m;

const svc = require(path.join(ROOT, 'services/core/src/domain/interactions/interaction.service.js'));

const fail = [];
let count = 0;
const eq = (n, got, want) => {
  count += 1;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail.push(`${n}\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`);
  }
};

(async () => {
  // ── which tables answer for which subject ───────────────────────────────
  eq('party ids parse back to their source', svc.parsePartyId('person:44'),
     { uid: 'api::person.person', id: '44' });
  eq('a non-party prefix does not', svc.parsePartyId('sale:1'), null);
  eq('malformed ids do not', [svc.parsePartyId('person:'), svc.parsePartyId('nope')], [null, null]);

  // Derived from the contract, so a source that starts pointing at people is
  // reachable without anyone updating a second map.
  eq('crm-activity answers for a person',
     svc.sourcesTargeting('api::person.person').map((s) => s.uid), [CRM]);
  eq('hr-lifecycle-event answers for an employee',
     svc.sourcesTargeting('api::hr-employee.hr-employee').map((s) => s.uid), [HR]);
  eq('nothing answers for a record type no source names',
     svc.sourcesTargeting('api::widget.widget'), []);
  eq('the polymorphic pair is found', svc.polymorphicSources().sort(), [WI_COM, WI_ACT].sort());

  // ── a party's timeline ──────────────────────────────────────────────────
  const tl = await svc.timelineForParty('person:44');
  eq('only this party\'s interactions', tl.interactions.map((i) => i.source.id), [1, 2]);
  eq('newest first', tl.interactions[0].occurredAt, '2026-08-20T09:00:00.000Z');
  // Every subject candidate, not just the filtered one: the projection picks
  // the most specific that resolved, so the same row must not report a
  // different subject depending on how it was found.
  eq('the actor and every subject candidate were populated', seen[CRM].populate,
     { person: true, contact: true, lead: true, actor: true });
  eq('so entries carry a real actor label', tl.interactions[0].actor.label, 'sara');
  eq('and the party id is carried through', tl.interactions[0].subject.partyId, 'person:44');

  const other = await svc.timelineForParty('person:99');
  eq('a different party gets a different timeline', other.interactions.map((i) => i.source.id), [3]);

  const emp = await svc.timelineForParty('hr-employee:3');
  eq('an employee timeline reads the HR source', emp.interactions.map((i) => i.source.id), [10]);
  eq('and no others', emp.sources, [HR]);

  eq('an unknown party id yields nothing, not everything',
     (await svc.timelineForParty('person:12345')).interactions.length, 0);
  eq('a malformed party id is refused', (await svc.timelineForParty('rubbish')).interactions, []);

  // ── a record's timeline: both shapes at once ────────────────────────────
  const order = await svc.timelineForRecord('api::sale-order.sale-order', { id: 77, documentId: 'ord-1' });
  eq('relation AND polymorphic sources are both read',
     order.interactions.map((i) => i.source.id).sort((a, b) => a - b), [20, 30, 40]);
  eq('newest first across the two shapes',
     order.interactions.map((i) => i.source.id), [40, 30, 20]);
  eq('the polymorphic query filtered on the record, not the whole table',
     seen[WI_ACT].filters,
     { entity_uid: { $eq: 'api::sale-order.sale-order' }, target_document_id: { $eq: 'ord-1' } });

  const byIdOnly = await svc.timelineForRecord('api::sale-order.sale-order', { id: 77 });
  eq('without a documentId only the relation sources are read',
     byIdOnly.interactions.map((i) => i.source.id), [20]);

  // ── one bad source must not empty the timeline ──────────────────────────
  // A module this instance does not have installed: its table is missing and
  // the query throws. The other sources still have to fill the timeline.
  FAILING.add(WI_COM);
  const degraded = await svc.timelineForRecord('api::sale-order.sale-order', { id: 77, documentId: 'ord-1' });
  eq('a failing source does not empty a timeline the others can fill',
     degraded.interactions.map((i) => i.source.id), [30, 20]);
  FAILING.delete(WI_COM);

  // And prove the assertion above is not vacuous — with it working, 40 is back.
  const whole = await svc.timelineForRecord('api::sale-order.sale-order', { id: 77, documentId: 'ord-1' });
  eq('and the failure was the only thing missing', whole.interactions.map((i) => i.source.id), [40, 30, 20]);

  // ── bounds ──────────────────────────────────────────────────────────────
  const capped = await svc.timelineForParty('person:44', { limit: 1 });
  eq('the limit caps the merged result', capped.interactions.length, 1);
  // Detectable only because each source is asked for one row more than needed;
  // otherwise a single-source timeline reports false however much is behind it.
  eq('and truncation is reported rather than implied', capped.truncated, true);
  eq('limit is clamped to MAX',
     (await svc.timelineForParty('person:44', { limit: 99999 })).interactions.length <= svc.MAX_LIMIT, true);
  eq('a full timeline is not marked truncated', tl.truncated, false);

  console.log(fail.length ? `FAIL ${fail.length}/${count}:\n  - ` + fail.join('\n  - ') : `PASS all ${count} interaction service assertions`);
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('THREW:', e.stack); process.exit(1); });
