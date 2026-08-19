/**
 * ERP Core — catalog (portal task E1, second package).
 *
 * The measurement that opened E1 (06-core-extraction.md §1) found items are
 * already ONE identity: `product` is the item, `stock-item` is a physical unit
 * of one, and every module points at the same rows. So unlike parties, there is
 * nothing here to unify.
 *
 * What is not one thing is **the price**. A sellable thing in this estate can
 * carry a price at three levels — the stock unit, the product, and the parent
 * product a variant hangs off — and each level may leave it null, empty or
 * zero. Resolving that is a rule, the rule is subtle, and today it lives in
 * exactly one module (apps/sales/marketplace) with a comment calling it a
 * "convention" that nothing enforces. Every other surface re-derives some part
 * of it inline. That is the private copy the brief forbids; this package is
 * where it stops.
 *
 * Pure by construction — no database, no HTTP, no framework — so the same
 * arithmetic runs in a Next bundle and in services/core.
 *
 * ── The rule, stated once ─────────────────────────────────────────────────
 *
 * **Positive-or-inherit.** A price counts as SET only if it parses to a number
 * greater than zero. Null, undefined, '', 0, '0.00' and junk all mean "not
 * priced at this level", and resolution moves outward: unit → product →
 * parent.
 *
 * Zero meaning "unset" rather than "free" is the part worth being explicit
 * about, because it is where `??` and `||` both go wrong. `??` keeps a 0 and
 * sells the thing for nothing; `||` happens to skip 0 but also skips a
 * legitimate... nothing, since no price here is legitimately zero — which is
 * exactly why the estate's own convention is spelled "positive-or-parent" and
 * not "nullish". Free items are modelled by a zero-value sale line, never by a
 * zero catalog price.
 */

/** What kind of thing this item is. Mirrors `product.kind`. */
export const ITEM_KINDS = Object.freeze([
    'raw_material', 'consumable', 'semi_finished', 'finished_good', 'service',
]);

/**
 * Units of measure, split by whether a unit is COUNTABLE or MEASURED.
 *
 * The split is not decoration: a countable item can only move in whole units,
 * a measured one can be cut, and `divisible` only makes sense for the second.
 * Kept as two lists rather than a flag per unit so that adding a unit forces a
 * decision about which it is.
 *
 * These mirror `product.unit_of_measure`. They are the vocabulary this module
 * REASONS about, not a list for a dropdown to render — enum lists for UI come
 * from the schema at runtime. `test.js` asserts these two lists still cover the
 * schema exactly, so a unit added there fails a test instead of silently
 * landing in whichever branch the code happens to take.
 */
export const COUNTABLE_UNITS = Object.freeze(['piece', 'dozen', 'set', 'box', 'cone', 'roll']);
export const MEASURED_UNITS = Object.freeze(['meter', 'yard', 'kg', 'gram']);
export const UNITS_OF_MEASURE = Object.freeze([...COUNTABLE_UNITS, ...MEASURED_UNITS].sort());

/** How stock is tracked. Mirrors `product.track_mode`. */
export const TRACK_MODES = Object.freeze(['serialized', 'bulk']);

/** The levels a price can be defined at, outermost last. */
export const PRICE_LEVELS = Object.freeze(['unit', 'item', 'parent']);

export const CATALOG_SOURCES = Object.freeze({
    'api::product.product': Object.freeze({ shape: 'item' }),
    'api::stock-item.stock-item': Object.freeze({ shape: 'unit' }),
});

/**
 * Parse a price. Returns a positive number, or null for every way this estate
 * says "not priced": null, undefined, '', '0', 0, negatives, and non-numeric
 * junk such as 'N/A' that has reached these columns through imports.
 *
 * Negative is null rather than an error on purpose — a negative price is bad
 * data, and the caller's next step should be to fall back to the level above,
 * not to crash a product page.
 */
export function toPrice(value) {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

/** First value that is a real price, in the order given. */
function firstPrice(...values) {
    for (const v of values) {
        const p = toPrice(v);
        if (p !== null) return p;
    }
    return null;
}

function cleanString(value) {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t === '' ? null : t;
}

/** Relations arrive populated, as a bare id, or absent. Accept all three. */
function relationId(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.trim() === '' ? null : value;
    if (typeof value === 'object') return value.id ?? null;
    return null;
}

/** True when this unit of measure can only move in whole units. */
export function isCountable(unitOfMeasure) {
    // Unknown units are treated as countable: it is the conservative branch —
    // it refuses fractional quantities rather than inventing them for a unit
    // nobody has classified.
    return !MEASURED_UNITS.includes(unitOfMeasure);
}

/**
 * Turn a `product` row into a catalog Item.
 *
 * A variant is an Item too, with `parentId` set — the estate models variants as
 * products with a `parent`, and flattening that here would lose the level the
 * price rule needs.
 */
export function toItem(record) {
    if (!record || typeof record !== 'object') {
        throw new Error('core/catalog: toItem needs a product record');
    }
    const unitOfMeasure = cleanString(record.unit_of_measure) || 'piece';
    return Object.freeze({
        id: `product:${record.id}`,
        productId: record.id ?? null,
        documentId: record.documentId ?? null,
        name: cleanString(record.name),
        sku: cleanString(record.sku),
        barcode: cleanString(record.barcode),
        kind: cleanString(record.kind) || 'finished_good',
        unitOfMeasure,
        countable: isCountable(unitOfMeasure),
        trackMode: cleanString(record.track_mode) || 'serialized',
        // Variants: `isVariant` is the flag the estate sets, `parentId` is what
        // the price rule actually needs. Both are reported — a row with one and
        // not the other is a data problem worth being able to see.
        isVariant: record.is_variant === true,
        parentId: relationId(record.parent),
        active: record.is_active !== false,
        /**
         * Divisible items are sold in fractions of a stock unit (a roll cut to
         * length). Only meaningful for a measured unit — a `divisible` flag on
         * a boxed item is data noise, and honouring it would let someone sell
         * a third of a box.
         */
        divisible: record.divisible === true && !isCountable(unitOfMeasure),
        prices: Object.freeze({
            selling: toPrice(record.selling_price),
            offer: toPrice(record.offer_price),
            cost: toPrice(record.cost_price),
        }),
        taxRate: Number.isFinite(Number(record.tax_rate)) ? Number(record.tax_rate) : null,
    });
}

/**
 * Turn a `stock-item` row into a Unit — one physical instance of an Item, which
 * may carry its own price.
 *
 * `sellableUnits` is how much saleable quantity this unit started with, used to
 * derive a per-measure price for divisible items.
 */
export function toUnit(record) {
    if (!record || typeof record !== 'object') {
        throw new Error('core/catalog: toUnit needs a stock-item record');
    }
    const sellable = Number(record.sellable_units);
    const sold = Number(record.units_sold);
    return Object.freeze({
        id: `stock-item:${record.id}`,
        stockItemId: record.id ?? null,
        documentId: record.documentId ?? null,
        itemId: relationId(record.product),
        sku: cleanString(record.sku),
        barcode: cleanString(record.barcode),
        status: cleanString(record.status) || 'InStock',
        sellableUnits: Number.isFinite(sellable) && sellable > 0 ? sellable : null,
        unitsSold: Number.isFinite(sold) && sold > 0 ? sold : 0,
        prices: Object.freeze({
            selling: toPrice(record.selling_price),
            offer: toPrice(record.offer_price),
            cost: toPrice(record.cost_price),
        }),
    });
}

/**
 * Resolve what something actually costs, across up to three levels.
 *
 * Pass whichever levels exist — `resolvePrice({ item })` for a plain product,
 * `resolvePrice({ item, parent })` for a variant, `resolvePrice({ unit, item })`
 * when a specific stock unit is being sold.
 *
 * Returns the resolved figures AND where each came from, because the levels
 * disagreeing is the interesting case and a bare number hides it.
 *
 * ── A hazard this deliberately preserves ──────────────────────────────────
 *
 * `selling` and `offer` resolve INDEPENDENTLY. A variant priced 600 with no
 * offer of its own, hanging off a parent priced 500 with an offer of 450, comes
 * back selling 600 / offer 450 — an offer inherited from a differently-priced
 * level. That is what apps/sales/marketplace does today and therefore what the
 * catalog does today; changing it here would quietly reprice live listings, and
 * a pricing change is not something a refactor should smuggle in.
 *
 * It is surfaced rather than hidden: when the two come from different levels,
 * `mixedLevels` is true, and `offer >= selling` sets `offerIsNotADiscount`. A
 * caller that wants the stricter same-level rule can see both and decide. The
 * decision itself belongs to whoever owns pricing, and it is written up in the
 * catalog section of docs/todo/erp2-program/06-core-extraction.md.
 */
export function resolvePrice({ unit = null, item = null, parent = null } = {}) {
    const levels = [
        ['unit', unit],
        ['item', item],
        ['parent', parent],
    ].filter(([, source]) => source && source.prices);

    const pick = (field) => {
        for (const [level, source] of levels) {
            const p = toPrice(source.prices[field]);
            if (p !== null) return { value: p, level };
        }
        return { value: null, level: null };
    };

    const selling = pick('selling');
    const offer = pick('offer');
    const cost = pick('cost');

    // The offer only applies if there is something to discount.
    const effective = selling.value === null
        ? null
        : (offer.value !== null ? offer.value : selling.value);

    return Object.freeze({
        selling: selling.value,
        offer: offer.value,
        cost: cost.value,
        /** What a customer pays: the offer when there is one, else the list price. */
        effective,
        sellingFrom: selling.level,
        offerFrom: offer.level,
        costFrom: cost.level,
        /** Priced nowhere in the chain — a caller must not treat this as free. */
        unpriced: selling.value === null,
        mixedLevels: Boolean(
            selling.level && offer.level && selling.level !== offer.level
        ),
        /**
         * An "offer" at or above the list price. Real in this data (imports and
         * hand edits both produce it) and reported rather than corrected — the
         * effective price is still the offer, exactly as today.
         */
        offerIsNotADiscount: Boolean(
            selling.value !== null && offer.value !== null && offer.value >= selling.value
        ),
    });
}

/**
 * Price for ONE unit of measure, for a divisible item.
 *
 * A 50-metre roll priced 5000 is 100 per metre. The stock unit carries the
 * total, `sellableUnits` carries how much is in it, and every surface that
 * needs a per-metre figure has been dividing inline.
 *
 * Non-divisible items return the resolved price unchanged: one unit IS the
 * thing. A divisible unit with no `sellableUnits` also returns it unchanged
 * rather than dividing by a guessed 1 — an unknown roll length is unknown, and
 * a confidently wrong per-metre price is worse than the total.
 */
export function unitPrice({ unit = null, item = null, parent = null } = {}) {
    const resolved = resolvePrice({ unit, item, parent });
    if (!item || !item.divisible) return resolved;
    const per = unit && unit.sellableUnits;
    if (!per || per <= 0) return resolved;
    const divide = (v) => (v === null ? null : v / per);
    return Object.freeze({
        ...resolved,
        selling: divide(resolved.selling),
        offer: divide(resolved.offer),
        cost: divide(resolved.cost),
        effective: divide(resolved.effective),
        /** What the division was by, so a caller can show "per metre" honestly. */
        perUnits: per,
    });
}

/**
 * Is this item sellable at all, as far as the CATALOG is concerned?
 *
 * Deliberately narrow: active, priced, and not a service masquerading as stock.
 * It says nothing about whether any is IN STOCK — that is `erp.stock`'s
 * question, its answer lives in stock-item rows, and pulling it in here is
 * exactly the coupling the product module has been kept clean of.
 */
export function isSellable(item, priced = null) {
    if (!item || !item.active) return false;
    const resolved = priced || resolvePrice({ item });
    return !resolved.unpriced;
}
