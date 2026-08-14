'use strict';

// Integration tests for the campaigns↔CRM seam: cmp-audience `source: 'segment'`
// resolving through the CRM segment engine. No Strapi runtime, no DB — a small
// in-memory mock stands in for documents()/db.query().
// Run: `node tests/cmp-audience-segment.test.js`.
//
// This seam is where a mistake mails real people, so the cases that matter:
//
//   the runner's call shape — cmp-campaign resolves with `campaign.audience`,
//     an object loaded with `populate: { audience: true }`. That is SHALLOW:
//     `.segment` is absent even when source is 'segment'. If the resolver
//     trusted the object it would report "no segment linked" and every
//     scheduled campaign on a segment audience would fail at send time.
//   engine-compiled filters — the filter handed to the query layer must come
//     from the whitelisted catalog, not from a json column on the row.
//   unreachable + duplicate recipients — dropped before anything sends.
//   a segment that stopped compiling — a 400 naming the segment, not a 500.

const assert = require('assert');
const Module = require('module');

// The service is a Strapi factory; stub the factory so it can be built without
// the framework. Same trick the other service-level tests would need.
const originalLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@strapi/strapi') return { factories: { createCoreService: (uid, fn) => fn } };
  return originalLoad.call(this, request, ...rest);
};
const buildService = require('../src/api/cmp-audience/services/cmp-audience.js');
Module._load = originalLoad;

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try { await fn(); passed += 1; console.log(`  ok   ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} :: ${e && e.message}`); }
}

const SEGMENT = {
  documentId: 's1',
  name: 'Won leads',
  entity: 'crm-lead',
  definition: { rules: [{ field: 'status', op: 'eq', value: 'Won' }] },
};

/**
 * @param audienceRow what findOne returns when the relation is NOT populated
 * @param segment     what findOne returns for `segment` when it IS populated
 */
function makeStrapi(audienceRow, segment, persons) {
  const state = { refetched: false, filters: null, updated: null };
  const strapi = {
    documents: () => ({
      findOne: async ({ populate }) => {
        if (populate && populate.segment) { state.refetched = true; return { ...audienceRow, segment }; }
        return audienceRow;
      },
      findMany: async ({ filters }) => { state.filters = filters; return persons; },
    }),
    db: { query: () => ({ update: async ({ data }) => { state.updated = data; } }) },
  };
  return { svc: buildService({ strapi }), state };
}

const PEOPLE = [
  { id: 1, documentId: 'p1', name: 'Ali', email: 'ali@x.com', phone: '0300' },
  { id: 2, documentId: 'p2', name: 'Sara', email: 'SARA@x.com', phone: null },
  { id: 3, documentId: 'p3', name: 'Dup', email: 'ali@X.com', phone: null },   // same human, different case
  { id: 4, documentId: 'p4', name: 'NoMail', email: '', phone: '0311' },
  { id: 5, documentId: 'p5', name: 'Broken', email: 'not-an-email', phone: null },
];

(async () => {
  console.log('— the campaign runner\'s call shape —');

  await test('resolves when handed a SHALLOW audience object (populate: { audience: true })', async () => {
    // cmp-campaign passes campaign.audience, which never carries `.segment`.
    const { svc, state } = makeStrapi({ documentId: 'a1', source: 'segment' }, SEGMENT, [PEOPLE[0]]);
    const { total } = await svc.resolve({ documentId: 'a1', source: 'segment' });
    assert.strictEqual(state.refetched, true, 'should have re-fetched the segment relation');
    assert.strictEqual(total, 1);
  });

  await test('resolves when handed a documentId string', async () => {
    const { svc, total } = { ...makeStrapi({ documentId: 'a1', source: 'segment' }, SEGMENT, [PEOPLE[0]]) };
    const res = await svc.resolve('a1');
    assert.strictEqual(res.total, 1);
  });

  await test('uses an already-populated segment without re-fetching', async () => {
    const { svc, state } = makeStrapi({ documentId: 'a1', source: 'segment' }, SEGMENT, [PEOPLE[0]]);
    await svc.resolve({ documentId: 'a1', source: 'segment', segment: SEGMENT });
    assert.strictEqual(state.refetched, false, 'should not have re-fetched');
  });

  console.log('— what reaches the query layer —');

  await test('the filter is engine-compiled, not a json column off the row', async () => {
    const { svc, state } = makeStrapi({ documentId: 'a1', source: 'segment' }, SEGMENT, [PEOPLE[0]]);
    await svc.resolve('a1');
    // A lead segment must resolve as a PERSON query prefixed through the
    // relation — that is what makes two leads for one human a single send.
    assert.deepStrictEqual(state.filters.crm_contacts, { leads: { status: { $eq: 'Won' } } });
    assert.deepStrictEqual(state.filters.merged_into, { id: { $null: true } });
    assert.deepStrictEqual(state.filters.email, { $notNull: true, $ne: '' });
  });

  console.log('— who actually gets mail —');

  await test('drops unusable addresses and de-duplicates case-insensitively', async () => {
    const { svc } = makeStrapi({ documentId: 'a1', source: 'segment' }, SEGMENT, PEOPLE);
    const { members, total } = await svc.resolve('a1');
    const emails = members.map((m) => m.email);
    assert.strictEqual(total, 2, `expected Ali + Sara, got ${JSON.stringify(emails)}`);
    assert.ok(emails.includes('ali@x.com'));
    assert.ok(emails.includes('SARA@x.com'));
    // ali@X.com is the same human, '' and 'not-an-email' are unusable.
    assert.ok(!emails.includes('ali@X.com'));
  });

  await test('merge_mapping still applies, so templates see the same keys as other sources', async () => {
    const { svc } = makeStrapi(
      { documentId: 'a1', source: 'segment', merge_mapping: { first_name: 'name' } },
      SEGMENT,
      [PEOPLE[0]],
    );
    const { members } = await svc.resolve('a1');
    assert.strictEqual(members[0].mergeData.first_name, 'Ali');
    assert.strictEqual(members[0].mergeData.email, 'ali@x.com');
  });

  await test('refreshes the advisory member_count cache', async () => {
    const { svc, state } = makeStrapi({ documentId: 'a1', source: 'segment' }, SEGMENT, [PEOPLE[0]]);
    await svc.resolve('a1');
    assert.strictEqual(state.updated.member_count, 1);
    assert.ok(state.updated.last_resolved_at instanceof Date);
  });

  console.log('— failure modes —');

  await test("source 'segment' with nothing linked is a 400, not a crash", async () => {
    const { svc } = makeStrapi({ documentId: 'a1', source: 'segment' }, null, []);
    await assert.rejects(
      () => svc.resolve('a1'),
      (e) => e.status === 400 && e.code === 'audience_no_segment',
    );
  });

  await test('a segment that no longer compiles is a 400 naming the segment', async () => {
    const stale = { ...SEGMENT, definition: { rules: [{ field: 'gone_field', op: 'eq', value: 'x' }] } };
    const { svc } = makeStrapi({ documentId: 'a1', source: 'segment' }, stale, []);
    await assert.rejects(
      () => svc.resolve('a1'),
      (e) => e.status === 400 && e.code === 'audience_bad_segment' && e.message.includes('Won leads'),
    );
  });

  await test('an unknown source is rejected rather than silently sending to nobody', async () => {
    const { svc } = makeStrapi({ documentId: 'a1', source: 'nonsense' }, null, []);
    await assert.rejects(() => svc.resolve('a1'), (e) => e.status === 400 && e.code === 'audience_bad_source');
  });

  console.log('— the other sources still work —');

  await test("source 'static' is untouched by the segment wiring", async () => {
    const { svc } = makeStrapi(
      { documentId: 'a1', source: 'static', static_members: [{ email: 'x@y.com', mergeData: { name: 'X' } }] },
      null, [],
    );
    const { members, total } = await svc.resolve('a1');
    assert.strictEqual(total, 1);
    assert.strictEqual(members[0].mergeData.name, 'X');
  });

  await test("source 'filter' is untouched by the segment wiring", async () => {
    const { svc, state } = makeStrapi(
      { documentId: 'a1', source: 'filter', entity: 'crm-contact', filter_json: { company: { $eq: 'Acme' } } },
      null,
      [{ name: 'Ali', email: 'ali@x.com' }],
    );
    const { total } = await svc.resolve('a1');
    assert.strictEqual(total, 1);
    // Unchanged behaviour: this source still passes its json straight through.
    assert.deepStrictEqual(state.filters, { company: { $eq: 'Acme' } });
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
