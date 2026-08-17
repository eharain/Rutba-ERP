'use strict';

// Standalone unit tests for the CRM saved-segment engine — no Strapi runtime,
// no DB. Run: `node tests/crm-segment-engine.test.js`.
//
// This file exists because the engine compiles CLIENT-AUTHORED JSON into a
// query the database will run. The things worth pinning:
//
//   compile          — the whitelist. A definition naming a field outside the
//     catalog must throw, not fall through: passing an arbitrary filters
//     object to the query layer would let any CRM staffer traverse relations
//     (owners.resetPasswordToken, contact.person.user.password) and read the
//     whole graph a field at a time.
//   audienceFilter   — the send list. Re-expresses a segment as a filter on
//     `person`, so two leads for the same human are ONE recipient. Get this
//     wrong and a campaign mails someone once per lead they have.
//   compileSort      — must be a TOTAL order. Ties in a non-unique sort fall
//     in database-defined order, which can differ between the queries serving
//     page 1 and page 2; a consumer paging a whole audience then silently
//     skips people.
//   columnFields     — column selection must stay inside the whitelist, and
//     must not starve the person projection of name/email/phone.

const assert = require('assert');
const engine = require('../src/utils/crm-segment-engine');

let passed = 0;
let failed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log(`  ok   ${name}`); }
  catch (e) { failed += 1; console.log(`  FAIL ${name} :: ${e && e.message}`); }
}

// Assert that `fn` throws a ValidationError whose message mentions `needle`.
function rejects(fn, needle) {
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  assert.ok(threw, 'expected a throw, got none');
  assert.strictEqual(threw.name, 'ValidationError', `expected ValidationError, got ${threw.name}`);
  if (needle) assert.ok(String(threw.message).includes(needle), `message ${JSON.stringify(threw.message)} lacks ${JSON.stringify(needle)}`);
}

console.log('— compile: the whitelist —');

test('a simple rule compiles to the catalog path', () => {
  assert.deepStrictEqual(
    engine.compile('crm-lead', { rules: [{ field: 'status', op: 'eq', value: 'Won' }] }),
    { status: { $eq: 'Won' } },
  );
});

test('match:all and match:any pick $and / $or', () => {
  const rules = [
    { field: 'status', op: 'eq', value: 'Won' },
    { field: 'value', op: 'gte', value: 100 },
  ];
  assert.ok('$and' in engine.compile('crm-lead', { match: 'all', rules }));
  assert.ok('$or' in engine.compile('crm-lead', { match: 'any', rules }));
});

test('relation paths nest (activity type on a contact)', () => {
  assert.deepStrictEqual(
    engine.compile('crm-contact', { rules: [{ field: 'activity_type', op: 'eq', value: 'Call' }] }),
    { activities: { type: { $eq: 'Call' } } },
  );
});

test('an empty definition is "everyone", not an error', () => {
  assert.deepStrictEqual(engine.compile('person', {}), {});
  assert.deepStrictEqual(engine.compile('person', { rules: [] }), {});
});

test('a boolean field uses its purpose-built clause', () => {
  assert.deepStrictEqual(
    engine.compile('person', { rules: [{ field: 'is_registered', op: 'is_true' }] }),
    { user: { id: { $null: false } } },
  );
});

test('open_followup pins both conditions to ONE activity row', () => {
  // Two separate rules would AND at the contact level and could be satisfied
  // by two different activities — this field exists to avoid exactly that.
  assert.deepStrictEqual(
    engine.compile('crm-contact', { rules: [{ field: 'open_followup', op: 'is_true' }] }),
    { activities: { followup_at: { $notNull: true }, followup_done_at: { $null: true } } },
  );
});

test('REJECTS a field outside the catalog (relation escape)', () => {
  rejects(() => engine.compile('person', { rules: [{ field: 'owners.resetPasswordToken', op: 'eq', value: 'x' }] }), 'Unknown field');
  rejects(() => engine.compile('crm-lead', { rules: [{ field: 'contact.person.user.password', op: 'eq', value: 'x' }] }), 'Unknown field');
});

test('REJECTS an operator that does not apply to the field type', () => {
  rejects(() => engine.compile('person', { rules: [{ field: 'name', op: 'gt', value: 1 }] }), 'does not apply');
});

test('REJECTS an unknown operator and an unknown entity', () => {
  rejects(() => engine.compile('person', { rules: [{ field: 'name', op: 'sqlinject', value: 'x' }] }), 'Unknown operator');
  rejects(() => engine.compile('sale-order', {}), 'Unknown segment entity');
});

test('REJECTS a missing value rather than compiling a null match', () => {
  rejects(() => engine.compile('person', { rules: [{ field: 'name', op: 'eq' }] }), 'needs a value');
  rejects(() => engine.compile('crm-lead', { rules: [{ field: 'value', op: 'between', value: [1] }] }), 'two values');
  rejects(() => engine.compile('person', { rules: [{ field: 'name', op: 'in', value: '' }] }), 'at least one value');
});

test('REJECTS nesting deeper than one level', () => {
  rejects(
    () => engine.compile('person', { groups: [{ groups: [{ rules: [{ field: 'name', op: 'eq', value: 'a' }] }] }] }),
    'one level',
  );
});

test('REJECTS more rules than the cap', () => {
  const rules = Array.from({ length: 41 }, () => ({ field: 'name', op: 'eq', value: 'x' }));
  rejects(() => engine.compile('person', { rules }), 'at most');
});

test('in_last_days needs a positive number', () => {
  rejects(() => engine.compile('crm-contact', { rules: [{ field: 'activity_at', op: 'in_last_days', value: 0 }] }), 'positive');
  rejects(() => engine.compile('crm-contact', { rules: [{ field: 'activity_at', op: 'in_last_days', value: 'soon' }] }), 'positive');
});

test('a bad date is rejected, not coerced to Invalid Date', () => {
  rejects(() => engine.compile('person', { rules: [{ field: 'created_at', op: 'before', value: 'not-a-date' }] }), 'not a valid date');
});

console.log('— audienceFilter: the send list —');

test('a lead segment becomes a PERSON query (one row per human)', () => {
  const f = engine.audienceFilter('crm-lead', { rules: [{ field: 'status', op: 'eq', value: 'Won' }] });
  // Prefixed onto person, so two leads for one human collapse to one row.
  assert.deepStrictEqual(f.crm_contacts, { leads: { status: { $eq: 'Won' } } });
});

test('a contact segment prefixes with crm_contacts', () => {
  const f = engine.audienceFilter('crm-contact', { rules: [{ field: 'company', op: 'contains', value: 'Textile' }] });
  assert.deepStrictEqual(f.crm_contacts, { company: { $containsi: 'Textile' } });
});

test('a person segment needs no prefix', () => {
  const f = engine.audienceFilter('person', { rules: [{ field: 'name', op: 'eq', value: 'Ali' }] });
  assert.deepStrictEqual(f.name, { $eq: 'Ali' });
  assert.strictEqual(f.crm_contacts, undefined);
});

test('merged-away duplicates are always excluded', () => {
  for (const entity of engine.ENTITIES) {
    const f = engine.audienceFilter(entity, {});
    assert.deepStrictEqual(f.merged_into, { id: { $null: true } }, `entity ${entity}`);
  }
});

test('channel restricts to contactable identities', () => {
  assert.deepStrictEqual(engine.audienceFilter('person', {}, { channel: 'email' }).email, { $notNull: true, $ne: '' });
  assert.deepStrictEqual(engine.audienceFilter('person', {}, { channel: 'phone' }).phone, { $notNull: true, $ne: '' });
  assert.ok(Array.isArray(engine.audienceFilter('person', {}, { channel: 'any' }).$or));
  // 'none' answers "how many humans does this reach at all".
  const f = engine.audienceFilter('person', {}, { channel: 'none' });
  assert.strictEqual(f.email, undefined);
  assert.strictEqual(f.phone, undefined);
});

test('audienceFilter enforces the same whitelist as compile', () => {
  rejects(() => engine.audienceFilter('crm-lead', { rules: [{ field: 'contact.person.user.password', op: 'eq', value: 'x' }] }), 'Unknown field');
  rejects(() => engine.audienceFilter('nope', {}), 'Unknown segment entity');
});

console.log('— compileSort: paging safety —');

test('the default sort is a total order', () => {
  assert.deepStrictEqual(engine.compileSort('person', []), { createdAt: 'desc', id: 'desc' });
});

test('an explicit sort still ends on id', () => {
  assert.deepStrictEqual(engine.compileSort('crm-lead', [{ field: 'name', dir: 'asc' }]), { name: 'asc', id: 'asc' });
  assert.deepStrictEqual(engine.compileSort('crm-lead', [{ field: 'status', dir: 'desc' }]), { status: 'desc', id: 'asc' });
});

test('a sort on a non-column field is ignored, not passed through', () => {
  assert.deepStrictEqual(engine.compileSort('person', [{ field: 'city', dir: 'asc' }]), { createdAt: 'desc', id: 'desc' });
});

console.log('— columnFields: display selection —');

test('selected columns are honoured', () => {
  assert.deepStrictEqual(engine.columnFields('crm-lead', ['name', 'status']).keys, ['name', 'status']);
});

test('columns outside the whitelist are dropped', () => {
  assert.deepStrictEqual(engine.columnFields('crm-lead', ['name', 'owners', '$$hack']).keys, ['name']);
});

test('no selection means every column', () => {
  assert.deepStrictEqual(engine.columnFields('person', []).keys, engine.allowedColumns('person'));
});

test('a narrow person selection still fetches the identity fields', () => {
  // The audience projection reads name/email/phone off the row; selecting only
  // `created_at` would otherwise return a nameless, unreachable member.
  const { keys, paths } = engine.columnFields('person', ['created_at']);
  assert.deepStrictEqual(keys, ['created_at']);
  for (const p of ['name', 'email', 'phone']) assert.ok(paths.includes(p), `paths missing ${p}`);
});

test('relation-traversing fields are never offered as columns', () => {
  // A filter can walk a relation; a grid cell cannot.
  assert.ok(!engine.allowedColumns('person').includes('city'));
  assert.ok(!engine.allowedColumns('crm-contact').includes('activity_type'));
});

console.log('— describe: what the builder renders —');

test('every entity describes fields, operators and enum sources', () => {
  const { entities } = engine.describeAll();
  assert.strictEqual(entities.length, engine.ENTITIES.length);
  for (const e of entities) {
    assert.ok(e.fields.length > 0, `${e.entity} has no fields`);
    for (const f of e.fields) {
      assert.ok(f.operators.length > 0, `${e.entity}.${f.key} offers no operators`);
      // Every operator offered must actually compile for that field type.
      for (const op of f.operators) {
        assert.ok(typeof op.key === 'string' && op.label, `${e.entity}.${f.key} has a malformed operator`);
      }
    }
  }
});

test('enum-typed fields name a /enums source so no frontend hardcodes a list', () => {
  const lead = engine.describe('crm-lead');
  const status = lead.fields.find((f) => f.key === 'status');
  assert.deepStrictEqual(status.enum_source, { name: 'crm-lead', field: 'status' });
});

test('every operator the catalog offers actually compiles', () => {
  // Guards against the picker offering an operator that 400s on use.
  const sample = { string: 'x', number: '1', enum: 'Won', date: '2026-01-01', boolean: null };
  for (const entity of engine.ENTITIES) {
    for (const f of engine.describe(entity).fields) {
      for (const op of f.operators) {
        const rule = { field: f.key, op: op.key };
        if (op.arity === 1) rule.value = op.key.includes('days') ? 7 : sample[f.type];
        if (op.arity === 2) { rule.value = sample[f.type]; rule.value2 = sample[f.type]; }
        if (op.arity === 'many') rule.value = [sample[f.type]];
        assert.doesNotThrow(
          () => engine.compile(entity, { rules: [rule] }),
          `${entity}.${f.key} ${op.key} is offered but does not compile`,
        );
      }
    }
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
