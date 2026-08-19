/**
 * ERP Core — posting (portal task E1, third package).
 *
 * The contract every money-moving module emits into. A sale, a purchase
 * receipt, a payroll run and a cash-register close are wildly different events
 * that all end the same way: a balanced set of debits and credits, attributable
 * to the document that caused it.
 *
 * The estate already has a working double-entry ledger and an engine that posts
 * to it (`services/strapi/.../acc-journal-entry/services/accounting.js`). This
 * package is NOT a second ledger. It is the shape that reaches one — validated
 * before anything touches a database, in a module with no database to touch.
 *
 * Two things follow from that, and they are the reason it exists:
 *
 *  1. **A caller can be told it is wrong before it writes anything.** Today an
 *     unbalanced entry is discovered inside the posting engine, mid-operation,
 *     after the sale it belongs to has already been written. Validation that
 *     needs a database cannot run at the point the entry is built.
 *
 *  2. **An entry is still valuable when there is nowhere to post it.** Under
 *     the suite model an org may not have licensed `erp.gl` — but it still made
 *     the sale, and its accountant still needs the numbers. The brief calls for
 *     an export-queue fallback, and a fallback needs a portable entry shape
 *     that does not assume the ledger's tables exist. That is this.
 *
 * ── Money is integers here ────────────────────────────────────────────────
 *
 * Amounts are carried as MINOR UNITS (paisa, cents) — integers — and never as
 * floats. `0.1 + 0.2 !== 0.3` is not a curiosity in a ledger; it is an entry
 * that fails its own balance check for no visible reason. The existing engine
 * copes by rounding to cents at the moment of comparison, which works for the
 * comparison and leaves every intermediate sum drifting. Converting once, at
 * the edge, is cheaper and total.
 */

/**
 * Where an entry came from. Mirrors `acc-journal-entry.source_type`, and
 * `test.js` asserts it still does — a source added to the schema and not here
 * would be rejected by validation for no reason a caller could act on.
 */
export const SOURCE_TYPES = Object.freeze([
    'POS Sale', 'Sale Return', 'Purchase Order', 'Purchase Receipt',
    'Purchase Return', 'Web Order', 'Cash Register Open', 'Cash Register Close',
    'Cash Register Transaction', 'Inventory Adjustment', 'Expense',
    'Invoice Payment', 'Bill Payment', 'Web Order Payment', 'Payroll Run',
    'Payroll Payment', 'Employee Advance', 'Production Labor',
    'Statutory Remittance', 'Manual',
]);

/** Mirrors `acc-journal-entry.status`. */
export const ENTRY_STATUSES = Object.freeze(['Draft', 'Posted', 'Reversed']);

/**
 * Where a validated entry should go. The choice is an ENTITLEMENT decision, not
 * an accounting one — see `postingTarget`.
 */
export const POSTING_TARGETS = Object.freeze({
    /** The org licensed erp.gl; the entry belongs in the ledger. */
    LEDGER: 'ledger',
    /** It did not. Capture the entry so the numbers are not lost. */
    EXPORT_QUEUE: 'export-queue',
});

/**
 * Minor units per major unit. Two for PKR and every currency this estate
 * currently handles.
 *
 * It is a parameter rather than a constant because it is exactly the kind of
 * assumption that is invisible until it is wrong: a three-decimal currency
 * (KWD, BHD) silently loses a digit per amount, and the loss looks like
 * rounding rather than like a bug. Callers in a three-decimal jurisdiction pass
 * `scale: 3`, and `toMinor`/`fromMinor` stay each other's inverse.
 */
export const DEFAULT_SCALE = 2;

/**
 * Convert a major-unit amount to integer minor units.
 *
 * Rounds half away from zero, matching how invoices are rounded by hand.
 * `Math.round` alone rounds -0.5 towards +0, so a credit and the debit that
 * reverses it could differ by one paisa.
 */
export function toMinor(value, scale = DEFAULT_SCALE) {
    if (value === null || value === undefined || value === '') return 0;
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    const factor = 10 ** scale;
    // Scale first, then nudge off the binary representation before rounding:
    // (1.005 * 100) is 100.49999999999999, and rounding that gives 100 for an
    // amount every human would call 1.01.
    const scaled = Number((n * factor).toFixed(6));
    return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Back to major units, for display and for handing to the ledger's columns. */
export function fromMinor(minor, scale = DEFAULT_SCALE) {
    if (!Number.isFinite(Number(minor))) return 0;
    return Number(minor) / 10 ** scale;
}

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

function toDateOnly(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        // Already yyyy-mm-dd, or an ISO timestamp to trim.
        const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
        return m ? m[1] : null;
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
    }
    return null;
}

/**
 * Normalise one line. `account` is whatever identifies a ledger account to the
 * caller — an id, a documentId, or a mapping key from `acc-account-mapping`.
 * Resolution is the service's job; the contract only insists there IS one.
 */
function toLine(raw, scale) {
    const debit = toMinor(raw && raw.debit, scale);
    const credit = toMinor(raw && raw.credit, scale);
    return Object.freeze({
        account: relationId(raw && raw.account) ?? cleanString(raw && raw.account_key),
        debit,
        credit,
        description: cleanString(raw && raw.description),
        taxRate: Number.isFinite(Number(raw && raw.tax_rate)) ? Number(raw.tax_rate) : null,
        taxAmount: toMinor(raw && raw.tax_amount, scale),
    });
}

/**
 * Build a journal entry from a module's own terms.
 *
 * Deliberately does NOT throw on bad input — it normalises what it was given
 * and `validateEntry` reports the problems. A constructor that throws forces
 * every caller into a try/catch and tends to produce the very thing this is
 * meant to prevent: an entry built, thrown on, and abandoned halfway through a
 * sale that already happened. Build, inspect, then decide.
 */
export function toEntry(input = {}) {
    const scale = Number.isInteger(input.scale) ? input.scale : DEFAULT_SCALE;
    const lines = Array.isArray(input.lines) ? input.lines.map((l) => toLine(l, scale)) : [];
    return Object.freeze({
        date: toDateOnly(input.date) || toDateOnly(new Date()),
        description: cleanString(input.description),
        reference: cleanString(input.reference),
        sourceType: cleanString(input.source_type) || 'Manual',
        sourceId: input.source_id ?? null,
        sourceRef: cleanString(input.source_ref),
        branch: relationId(input.branch),
        currency: relationId(input.currency),
        exchangeRate: Number.isFinite(Number(input.exchange_rate)) ? Number(input.exchange_rate) : 1,
        postedBy: cleanString(input.posted_by),
        scale,
        lines: Object.freeze(lines),
    });
}

/**
 * Sum an entry in minor units.
 *
 * `balanced` is an integer comparison, which is the point: no epsilon, no
 * "close enough", no rounding at the moment of truth.
 */
export function balanceOf(entry) {
    const lines = (entry && entry.lines) || [];
    let debit = 0;
    let credit = 0;
    for (const l of lines) {
        debit += l.debit;
        credit += l.credit;
    }
    return Object.freeze({
        debit,
        credit,
        difference: debit - credit,
        balanced: debit === credit,
    });
}

/**
 * Everything wrong with an entry, all at once.
 *
 * A list rather than a throw-on-first: a caller fixing a generator wants to see
 * that three lines are malformed, not to discover them one deploy at a time.
 */
export function validateEntry(entry) {
    const errors = [];
    if (!entry || !Array.isArray(entry.lines)) {
        return Object.freeze({ valid: false, errors: ['entry has no lines'], balance: null });
    }

    if (!entry.date) errors.push('entry has no date');
    if (!SOURCE_TYPES.includes(entry.sourceType)) {
        errors.push(`unknown source type '${entry.sourceType}'`);
    }

    // Two lines is the floor for double entry: one line cannot balance.
    if (entry.lines.length < 2) errors.push('a journal entry needs at least two lines');

    entry.lines.forEach((l, i) => {
        const at = `line ${i + 1}`;
        if (l.account === null || l.account === undefined || l.account === '') {
            errors.push(`${at}: no account`);
        }
        if (l.debit < 0 || l.credit < 0) errors.push(`${at}: negative amount`);
        // Both sides on one line is not "a net amount", it is two lines someone
        // collapsed — and it hides which account was really debited.
        if (l.debit > 0 && l.credit > 0) errors.push(`${at}: has both a debit and a credit`);
        if (l.debit === 0 && l.credit === 0) errors.push(`${at}: has neither a debit nor a credit`);
    });

    const balance = balanceOf(entry);
    if (!balance.balanced) {
        errors.push(
            `entry does not balance: debits ${balance.debit} vs credits ${balance.credit} `
            + `(minor units, difference ${balance.difference})`
        );
    }

    return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), balance });
}

/**
 * A stable key for "this document's posting".
 *
 * The failure it prevents is double-posting: a retried webhook, a re-run
 * migration, or a user double-clicking Complete produces the same sale twice in
 * the ledger, and the second one is silent because both are individually valid.
 * The existing engine has `findBySource(source_type, source_id)` for exactly
 * this, and this makes the same identity explicit and portable — the export
 * queue needs it too, and it has no `findBySource`.
 *
 * A `Manual` entry has no source document and therefore no natural identity, so
 * it gets none: null means "the caller must decide", not "safe to repeat".
 */
export function idempotencyKey(entry, discriminator = null) {
    if (!entry) return null;
    if (entry.sourceType === 'Manual') return null;
    if (entry.sourceId === null || entry.sourceId === undefined || entry.sourceId === '') return null;
    const base = `${entry.sourceType}:${entry.sourceId}`;
    return discriminator ? `${base}:${discriminator}` : base;
}

/**
 * Where should this entry go? (portal task E2 meets E1.)
 *
 * The only question is whether the org licensed the general ledger. It is
 * pure — the caller passes the decision its entitlement gate already made — so
 * that this module keeps no opinion about how entitlement is resolved and no
 * dependency on the resolver.
 *
 * Unknown entitlement routes to the LEDGER, matching the fail-open rule the
 * rest of the estate uses while no licence service exists. The alternative
 * would divert a licensed org's real postings into an export queue nobody is
 * watching, which is a far worse failure than posting an entry the org turns
 * out not to have paid for.
 */
export function postingTarget(glEntitled) {
    return glEntitled === false ? POSTING_TARGETS.EXPORT_QUEUE : POSTING_TARGETS.LEDGER;
}

/**
 * The entry as a plain, portable object — what the export queue stores.
 *
 * Amounts go out in MAJOR units so the file an accountant eventually receives
 * reads like money, with the scale recorded alongside so the conversion is
 * reversible and never has to be guessed from the values.
 */
export function toExportPayload(entry) {
    return {
        date: entry.date,
        description: entry.description,
        reference: entry.reference,
        source_type: entry.sourceType,
        source_id: entry.sourceId,
        source_ref: entry.sourceRef,
        branch: entry.branch,
        currency: entry.currency,
        exchange_rate: entry.exchangeRate,
        scale: entry.scale,
        lines: entry.lines.map((l) => ({
            account: l.account,
            debit: fromMinor(l.debit, entry.scale),
            credit: fromMinor(l.credit, entry.scale),
            description: l.description,
            tax_rate: l.taxRate,
            tax_amount: fromMinor(l.taxAmount, entry.scale),
        })),
    };
}
