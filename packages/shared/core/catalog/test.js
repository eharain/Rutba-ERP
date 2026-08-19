/**
 * Tests for ERP Core catalog. No framework: `node packages/shared/core/catalog/test.js`.
 *
 * Prices are where correctness lives here. Every one of these cases is a way
 * the estate's own columns already look — nulls, empty strings, zeros, junk
 * from imports, variants that price themselves and variants that do not — and
 * each has a wrong answer that is quiet: sell for nothing, sell at the parent's
 * price when the variant set its own, or refuse to sell something that is
 * priced perfectly well one level up.
 */

import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
    COUNTABLE_UNITS,
    MEASURED_UNITS,
    isCountable,
    isSellable,
    resolvePrice,
    toItem,
    toPrice,
    toUnit,
    unitPrice,
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
const productSchema = JSON.parse(readFileSync(
    join(REPO, 'services/strapi/src/api/product/content-types/product/schema.json'), 'utf8'));

section('vocabulary stays in step with the schema');

test('every unit_of_measure in the schema is classified countable or measured', () => {
    const schemaUnits = productSchema.attributes.unit_of_measure.enum;
    const known = new Set([...COUNTABLE_UNITS, ...MEASURED_UNITS]);
    const unclassified = schemaUnits.filter((u) => !known.has(u));
    assert.deepEqual(unclassified, [],
        'a unit added to the schema must be classified here, or divisibility silently guesses');
});

test('and this module invents no unit the schema does not have', () => {
    const schemaUnits = new Set(productSchema.attributes.unit_of_measure.enum);
    const invented = [...COUNTABLE_UNITS, ...MEASURED_UNITS].filter((u) => !schemaUnits.has(u));
    assert.deepEqual(invented, []);
});

section('toPrice — what counts as priced');

test('a positive number is a price, however it is spelled', () => {
    assert.equal(toPrice(500), 500);
    assert.equal(toPrice('500'), 500);
    assert.equal(toPrice('499.99'), 499.99);
});

test('zero is NOT a price — it means unset, and this is the whole rule', () => {
    assert.equal(toPrice(0), null);
    assert.equal(toPrice('0'), null);
    assert.equal(toPrice('0.00'), null);
});

test('null, undefined and empty string are unset', () => {
    assert.equal(toPrice(null), null);
    assert.equal(toPrice(undefined), null);
    assert.equal(toPrice(''), null);
    assert.equal(toPrice('   '), null);
});

test('import junk and negatives fall through rather than throwing', () => {
    assert.equal(toPrice('N/A'), null);
    assert.equal(toPrice('abc'), null);
    assert.equal(toPrice(-100), null);
    assert.equal(toPrice(NaN), null);
});

section('resolvePrice — positive-or-inherit across levels');

const parent = toItem({ id: 1, name: 'Roll', selling_price: 500, offer_price: 450, cost_price: 300 });
const pricedVariant = toItem({ id: 2, name: 'Roll - Red', is_variant: true, parent: 1, selling_price: 600 });
const unpricedVariant = toItem({ id: 3, name: 'Roll - Blue', is_variant: true, parent: 1, selling_price: 0 });

test('an item priced itself uses its own price', () => {
    const p = resolvePrice({ item: parent });
    assert.equal(p.selling, 500);
    assert.equal(p.sellingFrom, 'item');
});

test('a variant with a zero price inherits the parent — not "free"', () => {
    const p = resolvePrice({ item: unpricedVariant, parent });
    assert.equal(p.selling, 500, 'zero must inherit; ?? would sell this for nothing');
    assert.equal(p.sellingFrom, 'parent');
});

test('a variant that priced itself keeps its own price', () => {
    const p = resolvePrice({ item: pricedVariant, parent });
    assert.equal(p.selling, 600);
    assert.equal(p.sellingFrom, 'item');
});

test('a stock unit outranks both', () => {
    const unit = toUnit({ id: 9, product: 2, selling_price: 700 });
    const p = resolvePrice({ unit, item: pricedVariant, parent });
    assert.equal(p.selling, 700);
    assert.equal(p.sellingFrom, 'unit');
});

test('the offer becomes the effective price', () => {
    const p = resolvePrice({ item: parent });
    assert.equal(p.effective, 450);
    assert.equal(p.offer, 450);
});

test('no offer means the list price is what is paid', () => {
    const p = resolvePrice({ item: toItem({ id: 4, selling_price: 500 }) });
    assert.equal(p.effective, 500);
    assert.equal(p.offer, null);
});

test('priced nowhere reports unpriced, and never zero', () => {
    const p = resolvePrice({ item: toItem({ id: 5, name: 'Orphan' }) });
    assert.equal(p.selling, null);
    assert.equal(p.effective, null);
    assert.equal(p.unpriced, true, 'a caller must not be able to read this as free');
});

section('the level-mixing hazard is surfaced, not hidden');

test('an offer inherited from a differently-priced level is flagged', () => {
    // Variant sells for 600 of its own; the parent offers 450. Today the offer
    // is inherited — preserved deliberately, and reported.
    const p = resolvePrice({ item: pricedVariant, parent });
    assert.equal(p.selling, 600);
    assert.equal(p.offer, 450);
    assert.equal(p.sellingFrom, 'item');
    assert.equal(p.offerFrom, 'parent');
    assert.equal(p.mixedLevels, true, 'the caller has to be able to see this happened');
});

test('same-level prices are not flagged as mixed', () => {
    const p = resolvePrice({ item: parent });
    assert.equal(p.mixedLevels, false);
});

test('an offer at or above list is reported but still applied', () => {
    const odd = toItem({ id: 6, selling_price: 500, offer_price: 500 });
    const p = resolvePrice({ item: odd });
    assert.equal(p.offerIsNotADiscount, true);
    assert.equal(p.effective, 500, 'behaviour unchanged — only the observation is new');
});

section('units of measure and divisibility');

test('measured units are not countable; everything else is', () => {
    assert.equal(isCountable('meter'), false);
    assert.equal(isCountable('kg'), false);
    assert.equal(isCountable('piece'), true);
    assert.equal(isCountable('box'), true);
});

test('an unknown unit is treated as countable — the conservative branch', () => {
    assert.equal(isCountable('parsec'), true, 'refuse fractions rather than invent them');
});

test('divisible is ignored on a countable item', () => {
    const boxed = toItem({ id: 7, unit_of_measure: 'box', divisible: true });
    assert.equal(boxed.divisible, false, 'nobody may sell a third of a box');
});

test('divisible holds on a measured item', () => {
    const roll = toItem({ id: 8, unit_of_measure: 'meter', divisible: true });
    assert.equal(roll.divisible, true);
});

section('unitPrice — per measure, for divisible stock');

const rollItem = toItem({ id: 10, unit_of_measure: 'meter', divisible: true, selling_price: 5000 });

test('a 50-metre roll priced 5000 is 100 per metre', () => {
    const unit = toUnit({ id: 11, product: 10, sellable_units: 50 });
    const p = unitPrice({ unit, item: rollItem });
    assert.equal(p.effective, 100);
    assert.equal(p.perUnits, 50);
});

test('the offer is divided too, not left as a total', () => {
    const offered = toItem({ id: 12, unit_of_measure: 'meter', divisible: true, selling_price: 5000, offer_price: 4000 });
    const unit = toUnit({ id: 13, product: 12, sellable_units: 50 });
    const p = unitPrice({ unit, item: offered });
    assert.equal(p.selling, 100);
    assert.equal(p.offer, 80);
    assert.equal(p.effective, 80);
});

test('a non-divisible item is never divided — one unit IS the thing', () => {
    const boxed = toItem({ id: 14, unit_of_measure: 'box', selling_price: 5000 });
    const unit = toUnit({ id: 15, product: 14, sellable_units: 12 });
    assert.equal(unitPrice({ unit, item: boxed }).effective, 5000);
});

test('a divisible unit of unknown length keeps the total rather than guessing', () => {
    const unit = toUnit({ id: 16, product: 10 });
    const p = unitPrice({ unit, item: rollItem });
    assert.equal(p.effective, 5000, 'an unknown roll length is unknown');
    assert.equal(p.perUnits, undefined);
});

section('projection');

test('a variant reports both its flag and its parent', () => {
    assert.equal(pricedVariant.isVariant, true);
    assert.equal(pricedVariant.parentId, 1);
});

test('a populated parent relation resolves the same as a bare id', () => {
    const populated = toItem({ id: 17, is_variant: true, parent: { id: 1, name: 'Roll' } });
    assert.equal(populated.parentId, 1);
});

test('defaults match the schema, not undefined', () => {
    const bare = toItem({ id: 18 });
    assert.equal(bare.kind, 'finished_good');
    assert.equal(bare.unitOfMeasure, 'piece');
    assert.equal(bare.trackMode, 'serialized');
    assert.equal(bare.active, true, 'is_active absent means active, as the estate reads it');
});

test('a stock unit knows which item it belongs to', () => {
    const unit = toUnit({ id: 19, product: { id: 10 }, status: 'InStock' });
    assert.equal(unit.itemId, 10);
    assert.equal(unit.status, 'InStock');
});

test('toItem and toUnit refuse a non-record rather than producing an empty one', () => {
    assert.throws(() => toItem(null));
    assert.throws(() => toUnit('nope'));
});

section('isSellable — catalog reasons only');

test('an inactive item is not sellable', () => {
    assert.equal(isSellable(toItem({ id: 20, is_active: false, selling_price: 100 })), false);
});

test('an unpriced item is not sellable', () => {
    assert.equal(isSellable(toItem({ id: 21, selling_price: 0 })), false);
});

test('an active priced item is sellable regardless of stock', () => {
    // Stock is erp.stock's question; this must not start answering it.
    assert.equal(isSellable(toItem({ id: 22, selling_price: 100 })), true);
});

test('a variant inheriting its price is sellable', () => {
    assert.equal(isSellable(unpricedVariant, resolvePrice({ item: unpricedVariant, parent })), true);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
