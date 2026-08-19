/**
 * Tests for ERP Core parties. No framework: `node packages/shared/core/parties/test.js`.
 *
 * The matchers are where correctness lives — a phone normaliser that is too
 * aggressive merges strangers, and one that is too timid leaves the estate with
 * its five party identities forever. Both failures are quiet, so both are
 * pinned here with the real formats this system receives.
 */

import assert from 'node:assert';

import {
    collapse,
    groupParties,
    matchKeys,
    normalizeEmail,
    normalizeName,
    normalizePhone,
    PARTY_ROLES,
    PARTY_SOURCES,
    toParty,
} from './index.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed += 1;
        console.log(`  ok   ${name}`);
    } catch (e) {
        failed += 1;
        console.log(`  FAIL ${name} :: ${e && e.message}`);
        if (process.env.VERBOSE) console.log(e && e.stack);
    }
}
function section(t) { console.log(`\n${t}`); }

const PERSON = 'api::person.person';
const CUSTOMER = 'api::customer.customer';
const SUPPLIER = 'api::supplier.supplier';
const EMPLOYEE = 'api::hr-employee.hr-employee';
const CONTACT = 'api::crm-contact.crm-contact';

section('normalisers');

test('email is lowercased and trimmed, and nothing cleverer', () => {
    assert.equal(normalizeEmail('  Ali@Rutba.PK '), 'ali@rutba.pk');
    // Deliberately NOT applying Gmail's dot/plus rules: those are one
    // provider's, and merging two customers on an assumption nobody can undo is
    // worse than leaving them apart.
    assert.notEqual(normalizeEmail('a.b@gmail.com'), normalizeEmail('ab@gmail.com'));
    assert.notEqual(normalizeEmail('ali+shop@x.com'), normalizeEmail('ali@x.com'));
});

test('a malformed address is not a match key', () => {
    for (const bad of ['', '   ', 'nope', '@x.com', 'a@', 'a@b@c', null, undefined, 42]) {
        assert.equal(normalizeEmail(bad), null, `accepted ${JSON.stringify(bad)}`);
    }
});

test('every way a Pakistani mobile gets written normalises to one key', () => {
    const same = [
        '03001234567', '0300-1234567', '0300 1234567', '(0300) 1234567',
        '+923001234567', '+92 300 1234567', '92 300 1234567', '00923001234567',
    ];
    const keys = new Set(same.map(normalizePhone));
    assert.equal(keys.size, 1, `expected one key, got ${[...keys].join(', ')}`);
    assert.equal([...keys][0], '3001234567');
});

test('different numbers stay different', () => {
    assert.notEqual(normalizePhone('03001234567'), normalizePhone('03001234568'));
    assert.notEqual(normalizePhone('+923001234567'), normalizePhone('+923011234567'));
});

test('a number too short to identify anybody is not a key', () => {
    // Nine digits or fewer would match across networks; a partial match here
    // merges strangers, so it is refused outright.
    for (const short of ['123456789', '042111', '1234', '', null, undefined]) {
        assert.equal(normalizePhone(short), null, `accepted ${JSON.stringify(short)}`);
    }
    assert.equal(normalizePhone(3001234567), '3001234567', 'a numeric phone is still a phone');
});

test('names case-fold and lose punctuation, but stay weak', () => {
    assert.equal(normalizeName("  Muhammad  Ali-Khan "), 'muhammad ali khan');
    assert.equal(normalizeName('M.A. Khan'), 'm a khan');
    assert.equal(normalizeName(''), null);
});

section('toParty');

test('each source contributes its own role and kind', () => {
    assert.equal(toParty(CUSTOMER, { id: 1, name: 'A' }).roles[0], 'customer');
    assert.equal(toParty(SUPPLIER, { id: 1, name: 'A' }).roles[0], 'supplier');
    assert.equal(toParty(EMPLOYEE, { id: 1, name: 'A' }).roles[0], 'employee');
    assert.equal(toParty(SUPPLIER, { id: 1, name: 'A' }).kind, 'organisation');
    assert.equal(toParty(EMPLOYEE, { id: 1, name: 'A' }).kind, 'person');
});

test('ids are source-qualified so two tables cannot collide', () => {
    assert.equal(toParty(CUSTOMER, { id: 7 }).id, 'customer:7');
    assert.equal(toParty(SUPPLIER, { id: 7 }).id, 'supplier:7');
    assert.notEqual(toParty(CUSTOMER, { id: 7 }).id, toParty(SUPPLIER, { id: 7 }).id);
});

test('an unmapped source throws instead of producing a roleless party', () => {
    assert.throws(() => toParty('api::branch.branch', { id: 1 }), /not a known party source/);
});

test('relations are read populated, as a bare id, or absent', () => {
    assert.equal(toParty(CONTACT, { id: 1, person: { id: 4 } }).links.personId, 4);
    assert.equal(toParty(CONTACT, { id: 1, person: 4 }).links.personId, 4);
    assert.equal(toParty(CONTACT, { id: 1 }).links.personId, null);
});

test('the spine points at itself', () => {
    const p = toParty(PERSON, { id: 4, name: 'Ali' });
    assert.equal(p.source.spine, true);
    assert.equal(p.links.personId, 4, 'a person IS the person it links to');
});

test('every declared role is one PARTY_ROLES knows', () => {
    for (const s of Object.values(PARTY_SOURCES)) {
        assert.ok(PARTY_ROLES.includes(s.role), `${s.role} is not a declared role`);
    }
});

section('grouping');

test('the same phone written two ways groups a customer with a supplier', () => {
    const parties = [
        toParty(CUSTOMER, { id: 1, name: 'Ali Traders', phone: '0300-1234567' }),
        toParty(SUPPLIER, { id: 2, name: 'ALI TRADERS', phone: '+92 300 1234567' }),
    ];
    const { groups, singletons } = groupParties(parties);
    assert.equal(groups.length, 1, 'should be one group');
    assert.equal(singletons.length, 0);
    assert.deepEqual(groups[0].roles, ['customer', 'supplier'], 'one party, two roles');
});

test('a shared NAME alone never groups anything', () => {
    const parties = [
        toParty(CUSTOMER, { id: 1, name: 'Muhammad Ali' }),
        toParty(CUSTOMER, { id: 2, name: 'muhammad ali' }),
    ];
    const { groups, singletons } = groupParties(parties);
    assert.equal(groups.length, 0, 'two people share a common name; that is not a merge');
    assert.equal(singletons.length, 2);
});

test('grouping is transitive across different key kinds', () => {
    // A~B by email, B~C by phone. All three are one party, not two pairs.
    const parties = [
        toParty(CUSTOMER, { id: 1, name: 'A', email: 'x@y.com' }),
        toParty(CONTACT, { id: 2, name: 'B', email: 'X@Y.com', phone: '03001234567' }),
        toParty(EMPLOYEE, { id: 3, name: 'C', phone: '+923001234567' }),
    ];
    const { groups } = groupParties(parties);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].members.length, 3);
    assert.deepEqual(groups[0].roles, ['contact', 'customer', 'employee']);
});

test('an explicit person link groups even with nothing else in common', () => {
    const parties = [
        toParty(PERSON, { id: 4, name: 'Ali' }),
        toParty(CONTACT, { id: 9, name: 'Completely Different', person: { id: 4 } }),
    ];
    const { groups } = groupParties(parties);
    assert.equal(groups.length, 1, 'an authoritative link outranks having nothing else in common');
});

test('unrelated parties stay apart', () => {
    const parties = [
        toParty(CUSTOMER, { id: 1, name: 'A', email: 'a@x.com', phone: '03001111111' }),
        toParty(SUPPLIER, { id: 2, name: 'B', email: 'b@x.com', phone: '03002222222' }),
        toParty(EMPLOYEE, { id: 3, name: 'C' }),
    ];
    const { groups, singletons } = groupParties(parties);
    assert.equal(groups.length, 0);
    assert.equal(singletons.length, 3);
});

test('records with no key at all never group with each other', () => {
    // The empty-key trap: two rows that both fail to produce a match key must
    // not be "equal because both are nothing".
    const parties = [
        toParty(CUSTOMER, { id: 1 }),
        toParty(CUSTOMER, { id: 2 }),
        toParty(SUPPLIER, { id: 3, phone: '123' }),   // too short to be a key
    ];
    const { groups, singletons } = groupParties(parties);
    assert.equal(groups.length, 0, 'absence of identity is not shared identity');
    assert.equal(singletons.length, 3);
});

test('the group reports which keys actually matched', () => {
    const parties = [
        toParty(CUSTOMER, { id: 1, name: 'A', email: 'x@y.com' }),
        toParty(SUPPLIER, { id: 2, name: 'B', email: 'x@y.com' }),
    ];
    const { groups } = groupParties(parties);
    assert.deepEqual(groups[0].matchedOn, ['email:x@y.com']);
    assert.deepEqual(groups[0].sources, [SUPPLIER, CUSTOMER].sort());
});

section('collapse');

test('the spine wins the field, not the newest record', () => {
    const group = groupParties([
        toParty(CUSTOMER, { id: 1, name: 'Stale Import', email: 'x@y.com' }),
        toParty(PERSON, { id: 4, name: 'Corrected Name', email: 'x@y.com' }),
    ]).groups[0];
    const one = collapse(group);
    assert.equal(one.displayName, 'Corrected Name', 'a stale import must not overwrite the spine');
    assert.equal(one.links.personId, 4);
});

test('a collapsed party carries every role and every source', () => {
    const group = groupParties([
        toParty(CUSTOMER, { id: 1, name: 'A', phone: '03001234567' }),
        toParty(SUPPLIER, { id: 2, name: 'A Ltd', phone: '03001234567' }),
        toParty(EMPLOYEE, { id: 3, name: 'A', phone: '03001234567' }),
    ]).groups[0];
    const one = collapse(group);
    assert.deepEqual(one.roles, ['customer', 'employee', 'supplier']);
    assert.equal(one.sources.length, 3);
    assert.equal(one.kind, 'organisation', 'any organisation source makes the party one');
});

test('collapse fills a missing field from whichever source has it', () => {
    const group = groupParties([
        toParty(PERSON, { id: 4, name: 'Ali', phone: '03001234567' }),
        toParty(CUSTOMER, { id: 1, name: 'Ali', phone: '03001234567', email: 'ali@x.com' }),
    ]).groups[0];
    const one = collapse(group);
    assert.equal(one.email, 'ali@x.com', 'the spine has no email; the customer does');
    assert.equal(one.displayName, 'Ali');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
