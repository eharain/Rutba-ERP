'use strict';

/**
 * PostingService — the storage half of ERP Core posting (portal task E1 × E2).
 *
 * `@rutba/shared/core/posting` decides whether an entry is well-formed and
 * where it belongs. This decides nothing; it looks up the entitlement, and it
 * writes to the export queue when the answer is "not the ledger".
 *
 * ── The one decision worth arguing with ───────────────────────────────────
 *
 * Posting is gated on **`erp.gl` specifically**, NOT on the accounts app's key
 * list. That distinction is load-bearing. `config/apps.manifest.json` maps the
 * accounts app to `['erp.gl', 'erp.ap-ar']` with ANY-of semantics, so an org
 * that bought only the sub-ledgers can open the app — correctly, since supplier
 * bills and customer invoices live there. It must still not write to a general
 * ledger it never licensed. Reusing the app's key list here would post to a GL
 * for every AP/AR customer, which is precisely the "sold by module" model the
 * suite exists to enforce.
 *
 * ── What this does NOT do ─────────────────────────────────────────────────
 *
 * It does not post to the ledger. The engine that does
 * (services/strapi/.../acc-journal-entry/services/accounting.js) is not ported to
 * core yet, and reimplementing entry numbering, fiscal-period lookup and
 * account-balance updates here would be a second ledger — the exact duplication
 * E1 exists to end. So `capture()` routes: for an entitled org it returns
 * `target: 'ledger'` and the caller posts through the existing engine; for an
 * unentitled one it captures the entry here, which is the half that had nowhere
 * to go before.
 *
 * When the accounting tranche lands in core, `capture()` gains the ledger arm
 * and no caller changes.
 */

const { getDb } = require('../../db/connection');
const {
  POSTING_TARGETS,
  balanceOf,
  idempotencyKey,
  postingTarget,
  toExportPayload,
  validateEntry,
} = require('@rutba/shared/core/posting');

const TABLE = 'core_posting_exports';

/** The single key that grants the general ledger. See the module note. */
const GL_KEY = 'erp.gl';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function clampLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * Does this org hold `erp.gl`?
 *
 * Returns a tri-state on purpose — true / false / null for "could not tell" —
 * because the contract's `postingTarget` treats unknown as the ledger, and
 * flattening null to false here would quietly divert a licensed org's real
 * postings into a queue nobody is watching.
 *
 * `keys: null` from the resolver means "everything this build knows about",
 * which is the stub's answer while no licence service exists. It is the
 * opposite of an empty set, and reading it as "no keys" is the single most
 * dangerous mistake available in this file.
 */
async function isLedgerEntitled(resolver, orgId = null) {
  if (!resolver) return null;
  let entitlement;
  try {
    entitlement = await resolver.resolve(orgId);
  } catch {
    // Unreachable licence service. Unknown, not denied.
    return null;
  }
  if (!entitlement) return null;
  if (entitlement.status === 'revoked') return false;
  const held = entitlement.keys;
  if (held === null || held === undefined) return true;
  return held.has ? held.has(GL_KEY) : Array.from(held).includes(GL_KEY);
}

/**
 * Route an entry, and capture it when the ledger is not available.
 *
 * Validation comes first and refuses either way: an unbalanced entry is not
 * more acceptable in an export file than in a ledger, and a queue full of
 * entries nobody can import is a slower version of losing them.
 *
 * @param {object} entry     from the contract's toEntry()
 * @param {object} [options]
 * @param {object} [options.resolver]      entitlement resolver
 * @param {string} [options.orgId]
 * @param {string} [options.discriminator] separates two postings of one document
 * @returns {Promise<{target: string, valid: boolean, errors: string[],
 *   captured?: boolean, duplicate?: boolean, id?: number, key?: string}>}
 */
async function capture(entry, options = {}) {
  const verdict = validateEntry(entry);
  if (!verdict.valid) {
    return { target: null, valid: false, errors: [...verdict.errors] };
  }

  const entitled = await isLedgerEntitled(options.resolver, options.orgId);
  const target = postingTarget(entitled);

  if (target === POSTING_TARGETS.LEDGER) {
    // The caller posts through the existing engine — see the module note.
    return { target, valid: true, errors: [], captured: false };
  }

  const result = await enqueue(entry, options.discriminator);
  return { target, valid: true, errors: [], ...result };
}

/**
 * Write one entry to the export queue.
 *
 * Idempotent by `idempotency_key`: a retried webhook or a double-clicked
 * Complete captures the sale once. An entry with no key (a Manual one, which
 * has no source document) is always inserted — "no identity" must not collapse
 * two unrelated manual entries into one.
 */
async function enqueue(entry, discriminator = null) {
  const key = idempotencyKey(entry, discriminator);
  const balance = balanceOf(entry);
  const db = getDb();

  if (key) {
    const existing = await db(TABLE).where({ idempotency_key: key }).first('id');
    if (existing) return { captured: false, duplicate: true, id: existing.id, key };
  }

  const row = {
    idempotency_key: key,
    source_type: entry.sourceType,
    source_id: entry.sourceId ?? null,
    source_ref: entry.sourceRef ?? null,
    entry_date: entry.date,
    branch_id: Number.isInteger(entry.branch) ? entry.branch : null,
    currency_id: Number.isInteger(entry.currency) ? entry.currency : null,
    total_debit_minor: balance.debit,
    total_credit_minor: balance.credit,
    scale: entry.scale,
    payload: JSON.stringify(toExportPayload(entry)),
    status: 'pending',
    captured_at: new Date(),
  };

  try {
    const [id] = await db(TABLE).insert(row);
    return { captured: true, duplicate: false, id, key };
  } catch (err) {
    // Two concurrent captures of the same document race between the SELECT
    // above and this INSERT. The unique index is what actually enforces
    // idempotency; this turns its error into the same answer the check gives.
    if (key && /duplicate|unique/i.test(err.message || '')) {
      const existing = await db(TABLE).where({ idempotency_key: key }).first('id');
      if (existing) return { captured: false, duplicate: true, id: existing.id, key };
    }
    throw err;
  }
}

/**
 * What is waiting to be exported, oldest first.
 *
 * Oldest first because an export is a period's worth of entries and skipping
 * around dates produces a file no one can reconcile.
 */
async function listPending(options = {}) {
  const limit = clampLimit(options.limit);
  const q = getDb()(TABLE).where({ status: 'pending' });
  if (options.from) q.where('entry_date', '>=', options.from);
  if (options.to) q.where('entry_date', '<=', options.to);
  const rows = await q.orderBy('entry_date', 'asc').orderBy('id', 'asc').limit(limit);
  return rows.map(hydrate);
}

/** Totals for the queue, so an operator can see what is outstanding. */
async function pendingSummary() {
  const rows = await getDb()(TABLE)
    .where({ status: 'pending' })
    .select('source_type')
    .count('* as entries')
    .sum('total_debit_minor as debit_minor')
    .groupBy('source_type');
  return rows.map((r) => ({
    sourceType: r.source_type,
    entries: Number(r.entries),
    debitMinor: Number(r.debit_minor || 0),
  }));
}

/**
 * Mark rows resolved.
 *
 * `exported` and `posted` are separate outcomes because their consequences
 * differ: an exported entry is in an accountant's file, a posted one is in the
 * ledger, and an entry that became both has been counted twice. Only `pending`
 * rows move, so a repeated call cannot resurrect and re-resolve settled ones.
 */
async function markResolved(ids, status = 'exported', error = null) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter((v) => Number.isInteger(Number(v)));
  if (!list.length) return 0;
  if (!['exported', 'posted', 'failed'].includes(status)) {
    throw new Error(`markResolved: '${status}' is not a resolution`);
  }
  return getDb()(TABLE)
    .whereIn('id', list)
    .where({ status: 'pending' })
    .update({ status, error, resolved_at: new Date() });
}

/** Rows come back with the payload parsed — every caller wants it that way. */
function hydrate(row) {
  let payload = row.payload;
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch { payload = null; }
  }
  return {
    id: row.id,
    key: row.idempotency_key,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceRef: row.source_ref,
    entryDate: row.entry_date,
    branchId: row.branch_id,
    currencyId: row.currency_id,
    totalDebitMinor: Number(row.total_debit_minor),
    totalCreditMinor: Number(row.total_credit_minor),
    scale: row.scale,
    status: row.status,
    capturedAt: row.captured_at,
    payload,
  };
}

module.exports = {
  TABLE,
  GL_KEY,
  MAX_LIMIT,
  isLedgerEntitled,
  capture,
  enqueue,
  listPending,
  pendingSummary,
  markResolved,
};
