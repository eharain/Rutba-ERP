/**
 * ERP Core — company config (portal task E1, final item).
 *
 * "Company config (locations, taxes, numbering) as core" is E1's fourth bullet
 * in Rutba-Portal `plan/11`. It never made it into this repo's own summary of
 * E1, which lists only parties/catalog/posting/interactions — so it is the last
 * piece, and the one nobody was tracking.
 *
 * Three things an organisation configures once and every module then depends on:
 *
 *   locations  where stock sits and where a sale happens (`branch`)
 *   taxes      what rate applies, and whether it is inside the price or on top
 *   numbering  what the documents are called
 *
 * ── What the measurement found ────────────────────────────────────────────
 *
 * Numbering is not a concept in this estate. It is FOUR incompatible schemes:
 *
 *   entry_number   `JE-000001` — server-side, "read the latest and add one".
 *                  Two concurrent posts read the same latest and mint the same
 *                  number; nothing detects it.
 *   invoice_no     minted IN THE BROWSER from branch+desk+user+clock, hex-packed.
 *                  Not sequential, not meaningful to a human, and it returns
 *                  null when browser state is missing — so a sale can be saved
 *                  with no invoice number at all.
 *   jw_number      `JW-` + a base-36 clock reading.
 *   bill_number    derived from whatever document caused it.
 *
 * Only the first is even trying to be a sequence. This package makes numbering
 * a declared scheme with a race-safe allocator behind it (the allocator is the
 * service's half — a contract cannot make anything atomic).
 *
 * Pure: no database, no HTTP, no framework.
 */

import { toMinor, fromMinor, DEFAULT_SCALE } from '../posting/index.js';

/** Mirrors `branch.location_type`. */
export const LOCATION_TYPES = Object.freeze([
    'warehouse', 'store', 'transit', 'virtual', 'supplier', 'customer',
]);

/** Mirrors `acc-tax-rate.type` and `.scope`. */
export const TAX_TYPES = Object.freeze(['Inclusive', 'Exclusive']);
export const TAX_SCOPES = Object.freeze(['Sales', 'Purchases', 'Both']);

/**
 * Where a sequence restarts.
 *
 * The scope IS the sequence's identity: `global` shares one counter across the
 * business, `branch` gives each location its own, and the `-yearly` variants
 * restart every calendar year — which is what most jurisdictions expect of an
 * invoice series, and what a single ever-climbing counter cannot provide.
 */
export const SEQUENCE_SCOPES = Object.freeze([
    'global', 'yearly', 'branch', 'branch-yearly',
]);

function cleanString(value) {
    if (typeof value !== 'string') return null;
    const t = value.trim();
    return t === '' ? null : t;
}

function relationId(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return value.trim() === '' ? null : value;
    if (typeof value === 'object') return value.id ?? null;
    return null;
}

/**
 * Project a `branch` row into a Location.
 *
 * `branch` carries two unrelated things: where the business operates, and how
 * the business presents itself (companyName, social handles, invoice terms).
 * Only the first is company config in the sense modules need, so only the first
 * is projected — a stock transfer does not care about a TikTok handle, and a
 * shape that carried one would invite modules to read it.
 */
export function toLocation(record) {
    if (!record || typeof record !== 'object') {
        throw new Error('core/company: toLocation needs a branch record');
    }
    return Object.freeze({
        id: `branch:${record.id}`,
        branchId: record.id ?? null,
        documentId: record.documentId ?? null,
        name: cleanString(record.name),
        code: cleanString(record.location_code),
        type: LOCATION_TYPES.includes(record.location_type) ? record.location_type : 'store',
        isDefault: record.is_default_location === true,
        active: record.is_active !== false,
        /** Per-location override; null means "use the org default". */
        taxRate: Number.isFinite(Number(record.tax_rate)) && Number(record.tax_rate) > 0
            ? Number(record.tax_rate) : null,
        /** Document-number prefix this location stamps on its purchase orders. */
        poPrefix: cleanString(record.po_prefix),
        currencyId: relationId(record.currency),
    });
}

/** Project an `acc-tax-rate` row. */
export function toTaxRate(record) {
    if (!record || typeof record !== 'object') {
        throw new Error('core/company: toTaxRate needs an acc-tax-rate record');
    }
    const rate = Number(record.rate);
    return Object.freeze({
        id: `acc-tax-rate:${record.id}`,
        taxRateId: record.id ?? null,
        name: cleanString(record.name),
        code: cleanString(record.code),
        /** Percent, as stored. 17 means 17%. */
        rate: Number.isFinite(rate) ? rate : 0,
        type: TAX_TYPES.includes(record.type) ? record.type : 'Exclusive',
        scope: TAX_SCOPES.includes(record.scope) ? record.scope : 'Both',
        active: record.is_active !== false,
    });
}

/**
 * Which rate applies, most specific first: the item's own, then the location's,
 * then the organisation default.
 *
 * Same positive-or-inherit rule as catalog pricing, and for the same reason: a
 * `tax_rate` of 0 in these columns means "not set here", not "zero-rated". A
 * genuinely zero-rated item is modelled by a tax rate whose `rate` is 0 —
 * an explicit record — never by leaving a column blank.
 */
export function resolveTaxRate({ item = null, location = null, orgDefault = null } = {}) {
    const levels = [
        ['item', item && item.taxRate],
        ['location', location && location.taxRate],
        ['org', orgDefault],
    ];
    for (const [level, value] of levels) {
        const n = Number(value);
        if (Number.isFinite(n) && n > 0) return Object.freeze({ rate: n, from: level });
    }
    return Object.freeze({ rate: 0, from: null });
}

/**
 * Split an amount into net, tax and gross — in MINOR UNITS.
 *
 * The type is the whole point and it is the thing most often got wrong:
 *
 *   Exclusive  the amount IS the net; tax is added on top.
 *              1000 @ 17% → net 1000, tax 170, gross 1170
 *   Inclusive  the amount is the gross; the tax is already inside it.
 *              1000 @ 17% → net 855, tax 145, gross 1000
 *
 * Treating an inclusive price as exclusive overstates every invoice by the tax
 * — and the error looks like a pricing decision rather than a bug, so it
 * survives review.
 *
 * Minor units in and out, and `net + tax === gross` exactly, because the tax is
 * derived and the net is the remainder rather than both being rounded
 * independently. Rounding each separately is how a total ends up one paisa off
 * its own lines.
 */
export function splitTax(amountMinor, ratePercent, type = 'Exclusive') {
    const amount = Math.round(Number(amountMinor) || 0);
    const rate = Number(ratePercent);
    if (!Number.isFinite(rate) || rate <= 0) {
        return Object.freeze({ net: amount, tax: 0, gross: amount, rate: 0, type });
    }
    if (type === 'Inclusive') {
        const gross = amount;
        const tax = Math.round(gross - gross / (1 + rate / 100));
        return Object.freeze({ net: gross - tax, tax, gross, rate, type });
    }
    const net = amount;
    const tax = Math.round(net * (rate / 100));
    return Object.freeze({ net, tax, gross: net + tax, rate, type: 'Exclusive' });
}

/** Convenience for callers holding major units. Scale travels, as in posting. */
export function splitTaxMajor(amount, ratePercent, type = 'Exclusive', scale = DEFAULT_SCALE) {
    const s = splitTax(toMinor(amount, scale), ratePercent, type);
    return Object.freeze({
        net: fromMinor(s.net, scale),
        tax: fromMinor(s.tax, scale),
        gross: fromMinor(s.gross, scale),
        rate: s.rate,
        type: s.type,
    });
}

/**
 * The document-number schemes this estate mints, declared in one place.
 *
 * `key` is what the allocator counts under. `prefix` may be overridden per
 * location (a branch's `po_prefix`); `width` is the zero-padding; `datePart`
 * inserts a year or year-month segment, which is also what makes a yearly scope
 * meaningful — a number that restarts at 1 each year must SAY which year, or
 * last year's invoice 1 and this year's are indistinguishable.
 */
export const NUMBER_SCHEMES = Object.freeze({
    'journal-entry': Object.freeze({ prefix: 'JE', width: 6, scope: 'yearly', datePart: 'year' }),
    invoice: Object.freeze({ prefix: 'INV', width: 6, scope: 'branch-yearly', datePart: 'year' }),
    'purchase-order': Object.freeze({ prefix: 'PO', width: 5, scope: 'branch-yearly', datePart: 'year' }),
    'sale-return': Object.freeze({ prefix: 'SR', width: 5, scope: 'branch-yearly', datePart: 'year' }),
    'job-work': Object.freeze({ prefix: 'JW', width: 5, scope: 'yearly', datePart: 'year' }),
});

function yearOf(date) {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    return Number.isNaN(d.getTime()) ? null : d.getUTCFullYear();
}

/**
 * The key a sequence counts under — the identity of the counter itself.
 *
 * Returned separately from the formatted number because the allocator needs it
 * before it knows the value, and because two schemes that format alike must
 * still never share a counter.
 */
export function sequenceKey(schemeKey, { branchId = null, date = null } = {}) {
    const scheme = NUMBER_SCHEMES[schemeKey];
    if (!scheme) throw new Error(`core/company: unknown number scheme '${schemeKey}'`);
    const parts = [schemeKey];
    if (scheme.scope === 'branch' || scheme.scope === 'branch-yearly') {
        // A null branch is its own bucket, not a merge into branch 1: an
        // unlocated document sharing a counter with a real branch would let the
        // two mint the same number.
        parts.push(`b${branchId === null || branchId === undefined ? 'none' : branchId}`);
    }
    if (scheme.scope === 'yearly' || scheme.scope === 'branch-yearly') {
        parts.push(`y${yearOf(date) ?? 'none'}`);
    }
    return parts.join(':');
}

/**
 * Render a sequence value as the document number.
 *
 * `prefixOverride` is how a location's own prefix reaches the number without
 * the scheme having to know about branches.
 */
export function formatNumber(schemeKey, seq, { date = null, prefixOverride = null } = {}) {
    const scheme = NUMBER_SCHEMES[schemeKey];
    if (!scheme) throw new Error(`core/company: unknown number scheme '${schemeKey}'`);
    const n = parseInt(seq, 10);
    if (!Number.isFinite(n) || n <= 0) {
        throw new Error(`core/company: sequence value must be a positive integer, got ${seq}`);
    }
    const parts = [cleanString(prefixOverride) || scheme.prefix];
    if (scheme.datePart === 'year') {
        const y = yearOf(date);
        if (y) parts.push(String(y));
    }
    parts.push(String(n).padStart(scheme.width, '0'));
    return parts.join('-');
}

/**
 * Recognise a number this estate minted, so it can be validated or traced back.
 *
 * Returns null rather than throwing for anything unrecognised — the common
 * caller is checking whether a user-supplied reference looks like one of ours,
 * and "no" is an answer, not an error.
 */
export function parseNumber(schemeKey, value) {
    const scheme = NUMBER_SCHEMES[schemeKey];
    if (!scheme || typeof value !== 'string') return null;
    const parts = value.trim().split('-');
    if (parts.length < 2) return null;
    const seq = parseInt(parts[parts.length - 1], 10);
    if (!Number.isFinite(seq) || seq <= 0) return null;
    const year = scheme.datePart === 'year' && parts.length >= 3
        ? parseInt(parts[parts.length - 2], 10) : null;
    return Object.freeze({
        prefix: parts.slice(0, scheme.datePart === 'year' && parts.length >= 3 ? -2 : -1).join('-'),
        year: Number.isFinite(year) ? year : null,
        seq,
    });
}
