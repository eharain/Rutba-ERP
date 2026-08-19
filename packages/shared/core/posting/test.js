/**
 * Tests for ERP Core posting. No framework: `node packages/shared/core/posting/test.js`.
 *
 * A ledger's failures are quiet by nature: an entry that is one paisa out still
 * looks like an entry, a double-posted sale looks like two valid sales, and a
 * float that drifted looks like rounding. Every case here is one of those.
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    ENTRY_STATUSES,
    POSTING_TARGETS,
    SOURCE_TYPES,
    balanceOf,
    fromMinor,
    idempotencyKey,
    postingTarget,
    toEntry,
    toExportPayload,
    toMinor,
    validateEntry,
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

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const entrySchema = JSON.parse(readFileSync(
    join(REPO, 'services/strapi/src/api/acc-journal-entry/content-types/acc-journal-entry/schema.json'), 'utf8'));

/** Two balanced lines, the smallest real entry. */
const sale = (over = {}) => toEntry({
    date: '2026-08-20',
    source_type: 'POS Sale',
    source_id: 4210,
    description: 'Counter sale',
    lines: [
        { account: 1, debit: 1150.75 },
        { account: 2, credit: 1150.75 },
    ],
    ...over,
});

section('vocabulary stays in step with the schema');

test('every source_type in the schema is known here', () => {
    const missing = entrySchema.attributes.source_type.enum.filter((v) => !SOURCE_TYPES.includes(v));
    assert.deepEqual(missing, [],
        'a source added to the schema and not here would fail validation for no actionable reason');
});

test('and this module invents no source the schema lacks', () => {
    const schemaTypes = new Set(entrySchema.attributes.source_type.enum);
    assert.deepEqual(SOURCE_TYPES.filter((v) => !schemaTypes.has(v)), []);
});

test('statuses match the schema', () => {
    assert.deepEqual([...ENTRY_STATUSES], entrySchema.attributes.status.enum);
});

section('money is integers');

test('major units convert to minor units exactly', () => {
    assert.equal(toMinor(1150.75), 115075);
    assert.equal(toMinor('1150.75'), 115075);
    assert.equal(toMinor(0), 0);
});

test('the classic float case does not drift', () => {
    // 0.1 + 0.2 !== 0.3 as floats; as minor units it is 10 + 20 === 30.
    assert.equal(toMinor(0.1) + toMinor(0.2), toMinor(0.3));
});

test('a half-paisa rounds away from zero, both directions', () => {
    // (1.005 * 100) is 100.49999999999999 in binary — naive rounding gives 100.
    assert.equal(toMinor(1.005), 101);
    assert.equal(toMinor(-1.005), -101, 'a credit and its reversing debit must not differ by one');
});

test('conversion round-trips', () => {
    for (const v of [0, 1, 1150.75, 999999.99, 0.01]) {
        assert.equal(fromMinor(toMinor(v)), v, `round trip failed for ${v}`);
    }
});

test('a three-decimal currency keeps its third digit', () => {
    assert.equal(toMinor(1.234, 3), 1234);
    assert.equal(fromMinor(toMinor(1.234, 3), 3), 1.234);
    // The trap this guards: the default scale silently truncates it.
    assert.equal(fromMinor(toMinor(1.234)), 1.23);
});

test('junk and blanks are zero, not NaN', () => {
    assert.equal(toMinor(null), 0);
    assert.equal(toMinor(''), 0);
    assert.equal(toMinor('abc'), 0);
    assert.equal(toMinor(undefined), 0);
});

section('balance is an integer comparison');

test('a balanced entry balances', () => {
    const b = balanceOf(sale());
    assert.equal(b.balanced, true);
    assert.equal(b.debit, 115075);
    assert.equal(b.difference, 0);
});

test('a one-paisa discrepancy is caught, not tolerated', () => {
    const off = sale({ lines: [{ account: 1, debit: 100.00 }, { account: 2, credit: 99.99 }] });
    const b = balanceOf(off);
    assert.equal(b.balanced, false);
    assert.equal(b.difference, 1, 'one paisa, in minor units');
});

test('amounts that would drift as floats still balance', () => {
    const thirds = toEntry({
        source_type: 'Manual',
        lines: [
            { account: 1, debit: 0.1 },
            { account: 1, debit: 0.2 },
            { account: 2, credit: 0.3 },
        ],
    });
    assert.equal(balanceOf(thirds).balanced, true, 'the exact case a float ledger gets wrong');
});

section('validation reports everything at once');

test('a good entry is valid', () => {
    const v = validateEntry(sale());
    assert.equal(v.valid, true);
    assert.deepEqual([...v.errors], []);
});

test('one line cannot be an entry', () => {
    const v = validateEntry(toEntry({ source_type: 'Manual', lines: [{ account: 1, debit: 10 }] }));
    assert.equal(v.valid, false);
    assert.ok(v.errors.some((e) => e.includes('at least two lines')));
});

test('a line with both a debit and a credit is refused', () => {
    const v = validateEntry(sale({
        lines: [{ account: 1, debit: 10, credit: 5 }, { account: 2, credit: 5 }],
    }));
    assert.ok(v.errors.some((e) => e.includes('both a debit and a credit')),
        'a collapsed pair hides which account was really debited');
});

test('an empty line is refused', () => {
    const v = validateEntry(sale({
        lines: [{ account: 1, debit: 10 }, { account: 2, credit: 10 }, { account: 3 }],
    }));
    assert.ok(v.errors.some((e) => e.includes('neither a debit nor a credit')));
});

test('a line with no account is refused', () => {
    const v = validateEntry(sale({ lines: [{ debit: 10 }, { account: 2, credit: 10 }] }));
    assert.ok(v.errors.some((e) => e.includes('no account')));
});

test('a negative amount is refused rather than flipped', () => {
    const v = validateEntry(sale({ lines: [{ account: 1, debit: -10 }, { account: 2, credit: -10 }] }));
    assert.ok(v.errors.some((e) => e.includes('negative')));
});

test('an unknown source type is refused', () => {
    const v = validateEntry(toEntry({ source_type: 'Telepathy', lines: [] }));
    assert.ok(v.errors.some((e) => e.includes('unknown source type')));
});

test('all problems come back together, not one per attempt', () => {
    const v = validateEntry(sale({ lines: [{ debit: -1 }, { account: 2, credit: 5 }] }));
    assert.ok(v.errors.length >= 3, `expected several errors, got ${v.errors.length}`);
});

test('a malformed entry does not throw', () => {
    assert.equal(validateEntry(null).valid, false);
    assert.equal(validateEntry({}).valid, false);
});

test('toEntry never throws, so a caller can inspect instead of catching', () => {
    assert.doesNotThrow(() => toEntry());
    assert.doesNotThrow(() => toEntry({ lines: 'nonsense' }));
    assert.equal(toEntry({ lines: 'nonsense' }).lines.length, 0);
});

section('idempotency');

test('the same source document yields the same key', () => {
    assert.equal(idempotencyKey(sale()), 'POS Sale:4210');
    assert.equal(idempotencyKey(sale()), idempotencyKey(sale()));
});

test('different documents differ', () => {
    assert.notEqual(idempotencyKey(sale()), idempotencyKey(sale({ source_id: 4211 })));
});

test('a discriminator separates two postings for one document', () => {
    // A sale and its later payment are both "POS Sale:4210" without one.
    assert.equal(idempotencyKey(sale(), 'payment'), 'POS Sale:4210:payment');
});

test('a manual entry has no natural identity, and says so', () => {
    assert.equal(idempotencyKey(toEntry({ source_type: 'Manual' })), null,
        'null must read as "you decide", never as "safe to repeat"');
});

test('a source document with no id has no key', () => {
    assert.equal(idempotencyKey(sale({ source_id: null })), null);
});

section('routing — where E2 meets E1');

test('an org without erp.gl routes to the export queue', () => {
    assert.equal(postingTarget(false), POSTING_TARGETS.EXPORT_QUEUE);
});

test('an entitled org posts to the ledger', () => {
    assert.equal(postingTarget(true), POSTING_TARGETS.LEDGER);
});

test('UNKNOWN entitlement posts to the ledger, not the queue', () => {
    // Fail-open, matching the rest of the estate while no licence service
    // exists. Diverting a licensed org's real postings into a queue nobody
    // watches is far worse than posting one it turns out not to have paid for.
    assert.equal(postingTarget(undefined), POSTING_TARGETS.LEDGER);
    assert.equal(postingTarget(null), POSTING_TARGETS.LEDGER);
});

section('export payload');

test('amounts leave in major units, with the scale recorded', () => {
    const p = toExportPayload(sale());
    assert.equal(p.lines[0].debit, 1150.75, 'an accountant reads money, not paisa');
    assert.equal(p.scale, 2, 'recorded so the conversion is reversible without guessing');
});

test('the source document travels with it', () => {
    const p = toExportPayload(sale());
    assert.equal(p.source_type, 'POS Sale');
    assert.equal(p.source_id, 4210);
});

test('a payload survives a JSON round trip unchanged', () => {
    const p = toExportPayload(sale());
    assert.deepEqual(JSON.parse(JSON.stringify(p)), p, 'it is stored as JSON');
});

section('projection details');

test('an ISO timestamp is trimmed to a date', () => {
    assert.equal(toEntry({ date: '2026-08-20T13:45:00.000Z' }).date, '2026-08-20');
});

test('a populated relation resolves the same as a bare id', () => {
    assert.equal(toEntry({ branch: { id: 3 } }).branch, 3);
    assert.equal(toEntry({ branch: 3 }).branch, 3);
});

test('an account can be named by a mapping key instead of an id', () => {
    const e = toEntry({ source_type: 'Manual', lines: [{ account_key: 'sales.revenue', credit: 10 }] });
    assert.equal(e.lines[0].account, 'sales.revenue');
});

test('exchange rate defaults to 1, never to NaN', () => {
    assert.equal(toEntry({}).exchangeRate, 1);
    assert.equal(toEntry({ exchange_rate: 'abc' }).exchangeRate, 1);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
