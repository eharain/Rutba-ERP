'use strict';

/**
 * CompanyService — the storage half of ERP Core company config (portal E1).
 *
 * Locations and tax rates are ordinary reads. `nextNumber` is the reason this
 * file exists, and it is the one thing here that cannot be done in the pure
 * contract: allocating a document number safely needs a database to serialise
 * the increment.
 *
 * ── What it replaces ─────────────────────────────────────────────────────
 *
 * `accounting.generateEntryNumber()` reads the latest entry, parses its
 * trailing digits and adds one. Two posts landing together read the same latest
 * and mint the same number, and nothing detects it — `entry_number` carries no
 * unique index. The books end up with two JE-000042s and no way to say which
 * line belonged to which.
 *
 * This does the increment in the database, in one statement, and reads back
 * what it was given. No read-then-write, so there is no window to lose.
 *
 * READ-ONLY for locations and taxes: branches are administered by the console,
 * tax rates by accounts. `nextNumber` is the only writer, and all it writes is
 * its own counter.
 */

const { getDb, withTransaction } = require('../../db/connection');
const { documents } = require('../../documents');
const {
  NUMBER_SCHEMES,
  formatNumber,
  sequenceKey,
  resolveTaxRate,
  toLocation,
  toTaxRate,
} = require('@rutba/shared/core/company');

const BRANCH_UID = 'api::branch.branch';
const TAX_RATE_UID = 'api::acc-tax-rate.acc-tax-rate';
const SEQUENCES = 'core_number_sequences';

/** Bounded, so a genuinely stuck lock surfaces instead of spinning forever. */
const MAX_ALLOCATE_RETRIES = 5;

/**
 * Locations, active first.
 *
 * `activeOnly` defaults true: the overwhelmingly common caller is a picker, and
 * offering a retired warehouse to receive stock is a worse default than hiding
 * one an administrator was looking for.
 */
async function locations(options = {}) {
  const filters = options.activeOnly === false ? undefined : { is_active: { $eq: true } };
  const rows = await documents(BRANCH_UID).findMany({
    ...(filters ? { filters } : {}),
    populate: { currency: true },
    sort: 'name:asc',
  });
  return rows.map(toLocation);
}

/**
 * The default location, or null.
 *
 * Null rather than "the first one" when none is flagged: silently electing an
 * arbitrary branch as the default is how stock lands in the wrong warehouse,
 * and the fix — flagging one — is a thirty-second admin task that only happens
 * if somebody is told.
 */
async function defaultLocation() {
  const all = await locations({ activeOnly: true });
  return all.find((l) => l.isDefault) || null;
}

/** Active tax rates, optionally narrowed to a scope. */
async function taxRates(options = {}) {
  const clauses = [{ is_active: { $eq: true } }];
  if (options.scope) {
    // A `Both` rate applies to sales AND purchases, so a scoped query has to
    // include it or every org that configured one rate sees none.
    clauses.push({ $or: [{ scope: { $eq: options.scope } }, { scope: { $eq: 'Both' } }] });
  }
  const rows = await documents(TAX_RATE_UID).findMany({
    filters: { $and: clauses },
    sort: 'name:asc',
  });
  return rows.map(toTaxRate);
}

/**
 * Which rate applies to an item at a location.
 *
 * The org default comes from the first active rate matching the scope, which is
 * the estate's current de-facto behaviour; a configured "default rate" field
 * would be better and is an admin change, not a code one.
 */
async function taxFor({ item = null, location = null, scope = 'Sales' } = {}) {
  const rates = await taxRates({ scope });
  const orgDefault = rates.length ? rates[0].rate : null;
  const resolved = resolveTaxRate({ item, location, orgDefault });
  const applied = rates.find((r) => r.rate === resolved.rate) || null;
  return {
    ...resolved,
    // The TYPE matters as much as the rate — inclusive and exclusive of the
    // same percentage produce different invoices — so it travels with it.
    type: applied ? applied.type : 'Exclusive',
    taxRate: applied,
  };
}

/**
 * Create the counter row if it is not there yet — in its OWN committed
 * transaction, which is not a detail.
 *
 * Doing this inside the allocating transaction DEADLOCKS under real
 * concurrency, and it did: forty simultaneous allocations of a fresh scheme all
 * SELECT, all see nothing, and all attempt the same INSERT. One wins; the rest
 * block on the duplicate-key check while holding insert-intention locks, then
 * try to take the row lock for the UPDATE, and InnoDB kills one to break the
 * cycle. Committing the insert on its own releases those locks immediately, so
 * the UPDATE below only ever contends on a row that already exists — which is
 * ordinary row-lock queueing, not a cycle.
 *
 * A losing INSERT is expected and silent: the row existing is the goal, and
 * which caller created it does not matter.
 */
async function ensureSequenceRow(key) {
  const db = getDb();
  const existing = await db(SEQUENCES).where({ scope_key: key }).first('scope_key');
  if (existing) return;
  try {
    const now = new Date();
    await db(SEQUENCES).insert({ scope_key: key, next_value: 1, created_at: now, updated_at: now });
  } catch (err) {
    if (!/duplicate|unique/i.test(err.message || '')) throw err;
  }
}

/**
 * Take one number: increment, then read back inside the same transaction so the
 * row lock the UPDATE took is still held and nobody can have moved it between
 * the two statements. This is the part that cannot be done in JavaScript.
 *
 * Deadlock is retried rather than surfaced. Under contention InnoDB will
 * occasionally choose a victim even on well-ordered work, and the documented
 * response is to replay the transaction — a caller who asked for an invoice
 * number should get one, not a database error.
 */
async function allocate(key, attempt = 0) {
  try {
    return await withTransaction(async (trx) => {
      await trx(SEQUENCES).where({ scope_key: key })
        .update({ next_value: trx.raw('next_value + 1'), updated_at: new Date() });
      const row = await trx(SEQUENCES).where({ scope_key: key }).first('next_value');
      if (!row) throw new Error(`core/company: sequence '${key}' vanished mid-allocation`);
      return Number(row.next_value) - 1;
    });
  } catch (err) {
    if (attempt < MAX_ALLOCATE_RETRIES && /deadlock|lock wait timeout/i.test(err.message || '')) {
      return allocate(key, attempt + 1);
    }
    throw err;
  }
}

/**
 * Allocate the next document number for a scheme.
 *
 * Atomic by construction: the row is created if missing, then incremented and
 * read back inside one transaction. The UPDATE takes a row lock for its own
 * duration, so two callers serialise on it rather than both reading the same
 * value — which is exactly what the old read-then-add-one could not do.
 *
 * @param {string} schemeKey  a key of NUMBER_SCHEMES
 * @param {object} [options]
 * @param {object} [options.location] a Location, whose `poPrefix` overrides the
 *   scheme's prefix and whose branch scopes the counter
 * @param {Date|string} [options.date] which period the number belongs to
 * @returns {Promise<{number: string, seq: number, key: string}>}
 */
async function nextNumber(schemeKey, options = {}) {
  if (!NUMBER_SCHEMES[schemeKey]) {
    throw new Error(`core/company: unknown number scheme '${schemeKey}'`);
  }
  const location = options.location || null;
  const branchId = location ? location.branchId : (options.branchId ?? null);
  const date = options.date || new Date();
  const key = sequenceKey(schemeKey, { branchId, date });

  await ensureSequenceRow(key);
  const seq = await allocate(key);

  return {
    number: formatNumber(schemeKey, seq, {
      date,
      prefixOverride: location ? location.poPrefix : null,
    }),
    seq,
    key,
  };
}

/** What a scheme is currently up to, without consuming a number. */
async function peekSequence(schemeKey, options = {}) {
  const key = sequenceKey(schemeKey, {
    branchId: options.location ? options.location.branchId : (options.branchId ?? null),
    date: options.date || new Date(),
  });
  const row = await getDb()(SEQUENCES).where({ scope_key: key }).first('next_value');
  return { key, next: row ? Number(row.next_value) : 1 };
}

module.exports = {
  BRANCH_UID,
  TAX_RATE_UID,
  SEQUENCES,
  locations,
  defaultLocation,
  taxRates,
  taxFor,
  nextNumber,
  peekSequence,
};
