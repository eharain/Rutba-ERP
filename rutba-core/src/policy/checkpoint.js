'use strict';

/**
 * The policy seeder's boot fast path.
 *
 * Reading the contract means importing 178 ESM descriptor modules (~1.5s).
 * Worth it when something changed; pure boot-time tax when nothing did. So
 * boot asks two cheap questions first — do the input files still hash to what
 * we seeded, and do the tables still hold as many rows as we left them? — and
 * only walks the descriptors when either answer is no.
 *
 * Every failure mode here degrades to "seed anyway": a missing checkpoint
 * table (migrations have not run), an unreadable row, a count that throws.
 * Being slow is recoverable; skipping a seed the contract needed is a 403 in
 * production.
 *
 * See migrations/021-policy-seed-checkpoint.js for the table.
 */

const { getDb } = require('../db/connection');

const TABLE = 'core_policy_checkpoints';
const SEEDER_NAME = 'api-pro';

const COUNTED_TABLES = {
  domains: 'api_pro_app_domains',
  roles: 'api_pro_app_roles',
  interfaces: 'api_pro_interfaces',
  methods: 'api_pro_interface_methods',
  policies: 'api_pro_method_policies',
};

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value; // mysql2 parses JSON columns
  try { return JSON.parse(value); } catch { return null; }
}

/** Live row counts for the five seeded tables. */
async function countRows() {
  const db = getDb();
  const out = {};
  for (const [name, table] of Object.entries(COUNTED_TABLES)) {
    const [row] = await db(table).count({ n: '*' });
    out[name] = Number(row.n);
  }
  return out;
}

async function read(name = SEEDER_NAME) {
  const db = getDb();
  try {
    const row = await db(TABLE).where({ name }).first();
    if (!row) return null;
    return {
      name: row.name,
      fingerprint: row.fingerprint,
      counts: parseJson(row.counts),
      summary: parseJson(row.summary),
      seededAt: row.seeded_at,
    };
  } catch {
    // No checkpoint table yet (migrations not run) — the caller seeds.
    return null;
  }
}

async function write({ name = SEEDER_NAME, fingerprint, counts, summary }) {
  const db = getDb();
  const row = {
    name,
    fingerprint,
    counts: JSON.stringify(counts ?? null),
    summary: JSON.stringify(summary ?? null),
    seeded_at: new Date(),
  };
  try {
    const updated = await db(TABLE).where({ name }).update(row);
    if (!updated) await db(TABLE).insert(row);
    return true;
  } catch {
    // Same reasoning as read(): the checkpoint is an optimisation, never a
    // precondition. A seed that succeeded but could not record itself simply
    // pays the full walk again next boot.
    return false;
  }
}

/**
 * Should the seeder do the full walk?
 *
 * @returns {Promise<{seed: boolean, reason: string, counts: object|null}>}
 */
async function shouldSeed(fingerprint, name = SEEDER_NAME) {
  const checkpoint = await read(name);
  if (!checkpoint) return { seed: true, reason: 'no checkpoint', counts: null };
  if (checkpoint.fingerprint !== fingerprint) {
    return { seed: true, reason: 'descriptors changed', counts: null };
  }

  let counts;
  try {
    counts = await countRows();
  } catch (err) {
    return { seed: true, reason: `cannot count rows (${err.message})`, counts: null };
  }

  const before = checkpoint.counts || {};
  for (const key of Object.keys(COUNTED_TABLES)) {
    if (Number(before[key]) !== counts[key]) {
      return { seed: true, reason: `row drift: ${key} ${before[key]} → ${counts[key]}`, counts };
    }
  }
  return { seed: false, reason: `unchanged since ${checkpoint.seededAt}`, counts };
}

module.exports = { read, write, shouldSeed, countRows, TABLE, SEEDER_NAME };
