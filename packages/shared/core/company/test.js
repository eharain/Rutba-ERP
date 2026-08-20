/**
 * Tests for ERP Core company config. `node packages/shared/core/company/test.js`.
 *
 * Two areas where a wrong answer looks like a decision rather than a bug, and
 * so survives review: inclusive-vs-exclusive tax, which misstates every invoice
 * by exactly the tax; and sequence identity, where two counters that should be
 * separate quietly mint the same document number.
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    LOCATION_TYPES,
    NUMBER_SCHEMES,
    SEQUENCE_SCOPES,
    TAX_TYPES,
    formatNumber,
    parseNumber,
    resolveTaxRate,
    sequenceKey,
    splitTax,
    splitTaxMajor,
    toLocation,
    toTaxRate,
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
const schemaOf = (n) => JSON.parse(readFileSync(
    join(REPO, `services/strapi/src/api/${n}/content-types/${n}/schema.json`), 'utf8'));

section('vocabulary stays in step with the schema');

test('location types match branch.location_type', () => {
    assert.deepEqual([...LOCATION_TYPES], schemaOf('branch').attributes.location_type.enum);
});

test('tax types match acc-tax-rate.type', () => {
    assert.deepEqual([...TAX_TYPES], schemaOf('acc-tax-rate').attributes.type.enum);
});

test('every scheme declares a scope this module knows', () => {
    for (const [key, s] of Object.entries(NUMBER_SCHEMES)) {
        assert.ok(SEQUENCE_SCOPES.includes(s.scope), `${key} has scope ${s.scope}`);
        assert.ok(s.width > 0 && s.prefix, `${key} needs a prefix and a width`);
    }
});

section('locations');

test('a branch projects to a location', () => {
    const l = toLocation({
        id: 3, documentId: 'br3', name: 'Main Store', location_code: 'MS',
        location_type: 'store', is_default_location: true, po_prefix: 'MS',
    });
    assert.equal(l.id, 'branch:3');
    assert.equal(l.code, 'MS');
    assert.equal(l.isDefault, true);
    assert.equal(l.active, true, 'is_active absent means active, as the estate reads it');
});

test('an unknown location type falls back rather than passing through', () => {
    assert.equal(toLocation({ id: 1, location_type: 'moonbase' }).type, 'store');
});

test('a zero tax_rate on a branch means "not set", not zero-rated', () => {
    assert.equal(toLocation({ id: 1, tax_rate: 0 }).taxRate, null);
    assert.equal(toLocation({ id: 1, tax_rate: 17 }).taxRate, 17);
});

test('presentation fields are not projected', () => {
    const l = toLocation({ id: 1, companyName: 'Rutba', tiktok: '@rutba', invoiceTerms: '<p>x</p>' });
    assert.equal(l.companyName, undefined, 'a stock transfer must not be able to read a TikTok handle');
    assert.equal(l.tiktok, undefined);
});

test('toLocation refuses a non-record', () => {
    assert.throws(() => toLocation(null));
});

section('tax resolution');

test('the item wins over the location, which wins over the org', () => {
    const item = { taxRate: 5 };
    const location = { taxRate: 12 };
    assert.deepEqual(resolveTaxRate({ item, location, orgDefault: 17 }), { rate: 5, from: 'item' });
    assert.deepEqual(resolveTaxRate({ location, orgDefault: 17 }), { rate: 12, from: 'location' });
    assert.deepEqual(resolveTaxRate({ orgDefault: 17 }), { rate: 17, from: 'org' });
});

test('a zero at one level inherits the next, as with prices', () => {
    assert.deepEqual(resolveTaxRate({ item: { taxRate: 0 }, orgDefault: 17 }), { rate: 17, from: 'org' });
});

test('nothing configured anywhere is rate 0 from nowhere', () => {
    assert.deepEqual(resolveTaxRate({}), { rate: 0, from: null });
});

section('inclusive vs exclusive — the arithmetic that misstates invoices');

test('exclusive adds the tax on top', () => {
    // 1000.00 @ 17% → net 1000.00, tax 170.00, gross 1170.00
    assert.deepEqual(splitTax(100000, 17, 'Exclusive'),
        { net: 100000, tax: 17000, gross: 117000, rate: 17, type: 'Exclusive' });
});

test('inclusive takes the tax out of the amount', () => {
    // The same 1000.00 is now the GROSS. Treating it as exclusive would
    // overstate the invoice by 170.00 — and it would look like a price, not a bug.
    const s = splitTax(100000, 17, 'Inclusive');
    assert.equal(s.gross, 100000);
    assert.equal(s.tax, 14530);
    assert.equal(s.net, 85470);
});

test('net + tax === gross exactly, both ways', () => {
    for (const type of ['Inclusive', 'Exclusive']) {
        for (const amt of [1, 33, 999, 100000, 123457]) {
            for (const rate of [5, 17, 12.5]) {
                const s = splitTax(amt, rate, type);
                assert.equal(s.net + s.tax, s.gross, `${type} ${amt}@${rate}`);
            }
        }
    }
});

test('a zero rate is a no-op, not a division', () => {
    assert.deepEqual(splitTax(5000, 0, 'Inclusive'),
        { net: 5000, tax: 0, gross: 5000, rate: 0, type: 'Inclusive' });
});

test('an unknown type is treated as exclusive rather than guessed', () => {
    assert.equal(splitTax(100000, 17, 'nonsense').tax, 17000);
});

test('major-unit callers get money back, not paisa', () => {
    assert.deepEqual(splitTaxMajor(1000, 17, 'Exclusive'),
        { net: 1000, tax: 170, gross: 1170, rate: 17, type: 'Exclusive' });
});

test('a three-decimal currency keeps its third digit', () => {
    const s = splitTaxMajor(1.234, 10, 'Exclusive', 3);
    assert.equal(s.net, 1.234);
    assert.equal(s.gross, 1.357);
});

section('sequence identity — two counters that must never merge');

test('a global-ish yearly scheme keys by year', () => {
    assert.equal(sequenceKey('journal-entry', { date: '2026-08-20' }), 'journal-entry:y2026');
    assert.notEqual(
        sequenceKey('journal-entry', { date: '2026-01-01' }),
        sequenceKey('journal-entry', { date: '2027-01-01' }),
        'a yearly series restarts, so the counters must be distinct');
});

test('a branch-yearly scheme keys by both', () => {
    assert.equal(sequenceKey('invoice', { branchId: 3, date: '2026-08-20' }), 'invoice:b3:y2026');
});

test('two branches never share a counter', () => {
    assert.notEqual(
        sequenceKey('invoice', { branchId: 3, date: '2026-08-20' }),
        sequenceKey('invoice', { branchId: 4, date: '2026-08-20' }));
});

test('an unlocated document gets its own bucket, not branch 1\'s', () => {
    const none = sequenceKey('invoice', { date: '2026-08-20' });
    assert.equal(none, 'invoice:bnone:y2026');
    assert.notEqual(none, sequenceKey('invoice', { branchId: 1, date: '2026-08-20' }),
        'sharing a counter with a real branch would let the two mint the same number');
});

test('two schemes never share a counter even when they format alike', () => {
    assert.notEqual(sequenceKey('invoice', { branchId: 1, date: '2026-01-01' }),
        sequenceKey('purchase-order', { branchId: 1, date: '2026-01-01' }));
});

test('an unknown scheme is refused', () => {
    assert.throws(() => sequenceKey('nope', {}), /unknown number scheme/);
});

section('formatting and parsing');

test('a number carries its year, so two years cannot collide', () => {
    assert.equal(formatNumber('invoice', 1, { date: '2026-08-20' }), 'INV-2026-000001');
    assert.notEqual(
        formatNumber('invoice', 1, { date: '2026-08-20' }),
        formatNumber('invoice', 1, { date: '2027-08-20' }),
        'a series that restarts at 1 must say which year, or last year\'s 1 is this year\'s');
});

test('a location prefix overrides the scheme\'s', () => {
    assert.equal(formatNumber('purchase-order', 7, { date: '2026-08-20', prefixOverride: 'MS' }),
        'MS-2026-00007');
});

test('padding is the declared width', () => {
    assert.equal(formatNumber('journal-entry', 42, { date: '2026-08-20' }), 'JE-2026-000042');
});

test('a non-positive sequence is refused rather than formatted', () => {
    assert.throws(() => formatNumber('invoice', 0, {}), /positive integer/);
    assert.throws(() => formatNumber('invoice', -1, {}), /positive integer/);
    assert.throws(() => formatNumber('invoice', 'x', {}), /positive integer/);
});

test('a minted number parses back', () => {
    const n = formatNumber('invoice', 123, { date: '2026-08-20' });
    assert.deepEqual(parseNumber('invoice', n), { prefix: 'INV', year: 2026, seq: 123 });
});

test('an overridden prefix parses back too', () => {
    const n = formatNumber('purchase-order', 7, { date: '2026-08-20', prefixOverride: 'MS' });
    assert.deepEqual(parseNumber('purchase-order', n), { prefix: 'MS', year: 2026, seq: 7 });
});

test('something we did not mint is null, not an exception', () => {
    // The caller is usually asking "is this reference one of ours" — "no" is an
    // answer, not a failure.
    assert.equal(parseNumber('invoice', 'random text'), null);
    assert.equal(parseNumber('invoice', ''), null);
    assert.equal(parseNumber('invoice', null), null);
    assert.equal(parseNumber('nope', 'INV-2026-000001'), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
