#!/usr/bin/env node
'use strict';

/**
 * Contract smoke for core's policy layer (src/policy/): the descriptor seeder
 * and API-token minting, the two things that still needed a running Strapi.
 *
 * The claim the seeder half has to prove is strong: core, with no Strapi
 * process alive, writes the SAME api_pro_* rows Strapi's seeder wrote.
 * Comparing the two seeders' output on a live database is the only honest way
 * to check that — a unit test over the inference rules would just restate them.
 *
 * So the whole run happens inside one transaction that is deliberately rolled
 * back at the end:
 *
 *   1. snapshot every seeded row as it stands (Strapi's work)
 *   2. empty the five tables and their link tables
 *   3. seed from scratch with core
 *   4. compare, row by row and link by link, against the snapshot
 *   5. re-plan (must be clean), tune a policy (must survive), prune (must
 *      remove exactly the stale rows)
 *   6. mint an API token and prove core's own auth middleware accepts it
 *   7. throw → the transaction rolls back and the database is untouched
 *
 * Step 7 is why this is safe to run against a database that matters, and the
 * script verifies the rollback afterwards rather than trusting it.
 *
 * Usage: node scripts/smoke-policy.js
 * Exit:  0 all checks passed, 1 otherwise.
 */

const crypto = require('crypto');
const { buildRegistry } = require('../src/schema/registry');
const { planSeed, applySeed } = require('../src/policy/seeder');
const tokens = require('../src/policy/tokens');
const { get } = require('../src/config/env');
const { getDb, withTransaction, closeDb } = require('../src/db/connection');

const TABLES = {
  domains: 'api_pro_app_domains',
  roles: 'api_pro_app_roles',
  interfaces: 'api_pro_interfaces',
  methods: 'api_pro_interface_methods',
  policies: 'api_pro_method_policies',
};
const LINKS = {
  roles: { table: 'api_pro_app_roles_app_domains_lnk', source: 'app_role_id', target: 'app_domain_id', targetSection: 'domains' },
  methods: { table: 'api_pro_interface_methods_api_interface_lnk', source: 'api_interface_method_id', target: 'api_interface_id', targetSection: 'interfaces' },
  policies: { table: 'api_pro_method_policies_interface_method_lnk', source: 'api_method_policy_id', target: 'api_interface_method_id', targetSection: 'methods' },
};

// Columns the seeder owns. Everything else (id, document_id, timestamps) is
// row bookkeeping that legitimately differs between two seeds.
const COMPARED = {
  domains: ['key', 'name', 'description', 'is_active'],
  roles: ['key', 'name', 'description', 'is_active', 'admin_role_code'],
  interfaces: ['key', 'name', 'file_path', 'uid', 'status'],
  methods: ['key', 'name', 'action', 'method', 'path', 'route_tokens', 'input_signature', 'apps', 'app_roles'],
  policies: ['key', 'name', 'role_key', 'resolver_mode', 'filters_template', 'populate_template', 'body_template', 'query_template', 'template_version'],
};

let failures = 0;
function check(ok, label, detail) {
  if (ok) { console.log(`  ok    ${label}`); return true; }
  failures += 1;
  console.log(`  FAIL  ${label}${detail ? `\n        ${detail}` : ''}`);
  return false;
}

// Every policy name Strapi wrote reads "Accounts Admin â†’ list": the plugin
// seeder's own source file has a mojibake arrow (UTF-8 E2 86 92 round-tripped
// through cp1252, so U+2192 became the three characters â † ’), and it writes
// what it reads. Core writes the real arrow.
//
// `name` is display-only, and the seeder preserves whatever an existing row
// already has — so on a live database this difference never materialises. It
// only shows up here, where core seeds a snapshot of Strapi's rows from
// scratch. Normalising it keeps this check honest: a name that differs for any
// OTHER reason still fails.
const MOJIBAKE_ARROW = 'â†’';
function repairArrow(value) {
  return typeof value === 'string' ? value.split(MOJIBAKE_ARROW).join('→') : value;
}

function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map((k) => `${k}:${canonical(value[k])}`).join(',')}}`;
  }
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'string') {
    // mysql2 returns JSON columns parsed, but a driver that hands back a string
    // must compare equal to the parsed form.
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return canonical(JSON.parse(trimmed)); } catch { /* plain string */ }
    }
    return value;
  }
  return String(value);
}

/** key → { col: canonical value } for one table, plus id → key. */
async function snapshotSection(db, section) {
  const rows = await db(TABLES[section]).select('*');
  const byKey = new Map();
  const keyById = new Map();
  for (const row of rows) {
    const values = {};
    for (const col of COMPARED[section]) {
      values[col] = canonical(col === 'name' ? repairArrow(row[col]) : row[col]);
    }
    byKey.set(row.key, values);
    keyById.set(row.id, row.key);
  }
  return { byKey, keyById };
}

/** source key → target key, so links compare across two different id spaces. */
async function snapshotLinks(db, section, sections) {
  const link = LINKS[section];
  const rows = await db(link.table).select('*');
  const out = new Map();
  for (const row of rows) {
    const sourceKey = sections[section].keyById.get(row[link.source]);
    const targetKey = sections[link.targetSection].keyById.get(row[link.target]);
    if (sourceKey === undefined) continue;
    if (!out.has(sourceKey)) out.set(sourceKey, []);
    out.get(sourceKey).push(targetKey ?? `#missing:${row[link.target]}`);
  }
  for (const list of out.values()) list.sort();
  return out;
}

async function snapshotAll(db) {
  const sections = {};
  for (const section of Object.keys(TABLES)) sections[section] = await snapshotSection(db, section);
  const links = {};
  for (const section of Object.keys(LINKS)) links[section] = await snapshotLinks(db, section, sections);
  return { sections, links };
}

function compareSection(section, before, after, staleKeys) {
  const expected = [...before.byKey.keys()].filter((k) => !staleKeys.has(k));
  const missing = expected.filter((k) => !after.byKey.has(k));
  const extra = [...after.byKey.keys()].filter((k) => !before.byKey.has(k));

  check(missing.length === 0, `${section}: every non-stale row re-created (${expected.length})`,
    missing.length ? `missing: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` …+${missing.length - 5}` : ''}` : '');
  check(extra.length === 0, `${section}: no rows the contract did not ask for`,
    extra.length ? `extra: ${extra.slice(0, 5).join(', ')}` : '');
  check(!after.byKey.has([...staleKeys][0]) || staleKeys.size === 0,
    `${section}: stale rows not re-created`);

  const differing = [];
  for (const key of expected) {
    if (!after.byKey.has(key)) continue;
    const a = before.byKey.get(key);
    const b = after.byKey.get(key);
    for (const col of COMPARED[section]) {
      if (a[col] !== b[col]) differing.push(`${key}.${col}: ${JSON.stringify(a[col])} → ${JSON.stringify(b[col])}`);
    }
  }
  check(differing.length === 0, `${section}: every compared column identical`,
    differing.length ? `${differing.length} difference(s), first: ${differing[0]}` : '');
}

function compareLinks(section, before, after, staleKeys) {
  const mismatches = [];
  for (const [sourceKey, targets] of before) {
    if (staleKeys.has(sourceKey)) continue;
    const now = after.get(sourceKey);
    if (!now) { mismatches.push(`${sourceKey}: link lost`); continue; }
    if (now.join('|') !== targets.join('|')) mismatches.push(`${sourceKey}: ${targets.join(',')} → ${now.join(',')}`);
  }
  check(mismatches.length === 0, `${section}: link rows point at the same targets`,
    mismatches.length ? `${mismatches.length} mismatch(es), first: ${mismatches[0]}` : '');
}

async function emptyEverything(trx) {
  for (const link of Object.values(LINKS)) await trx(link.table).del();
  for (const section of ['policies', 'methods', 'interfaces', 'roles', 'domains']) {
    await trx(TABLES[section]).del();
  }
}

async function main() {
  const db = getDb();
  console.log(`[smoke-policy] database: ${db.client.config.connection.database}`);

  const registry = buildRegistry();

  // The plan against the live tables, taken outside the transaction: it names
  // the rows Strapi seeded that no descriptor declares any more, which are
  // exactly the rows a from-scratch seed must NOT re-create.
  const livePlan = await planSeed({ registry });
  const staleKeys = {};
  for (const section of Object.keys(TABLES)) {
    staleKeys[section] = new Set(livePlan.sections[section].stale.map((r) => r.key));
  }
  console.log(`[smoke-policy] contract: ${livePlan.contract.descriptors.length} endpoints; `
    + `live drift: ${livePlan.totals.inserts} insert(s), ${livePlan.totals.updates} update(s), `
    + `${livePlan.totals.stale} stale row(s)`);

  const before = await snapshotAll(db);
  const beforeCounts = Object.fromEntries(
    Object.entries(before.sections).map(([k, v]) => [k, v.byKey.size])
  );

  const ROLLBACK = new Error('__rollback__');
  try {
    await withTransaction(async (trx) => {
      console.log('\n[1] from-scratch seed reproduces the Strapi-seeded tables');
      await emptyEverything(trx);
      const fresh = await planSeed({ registry, contract: livePlan.contract });
      check(fresh.sections.policies.inserts.length === livePlan.counts.policies,
        `plan against empty tables inserts every policy (${livePlan.counts.policies})`);
      await applySeed(fresh, { log: { info: () => {} } });

      const after = await snapshotAll(trx);
      for (const section of Object.keys(TABLES)) {
        compareSection(section, before.sections[section], after.sections[section], staleKeys[section]);
      }
      for (const section of Object.keys(LINKS)) {
        compareLinks(section, before.links[section], after.links[section], staleKeys[section]);
      }

      console.log('\n[2] the seed is idempotent');
      const second = await planSeed({ registry, contract: livePlan.contract });
      check(!second.dirty, 're-planning straight after a seed finds nothing to do',
        second.dirty ? `${second.totals.inserts}+ ${second.totals.updates}~ ${second.totals.linkAdds} links` : '');
      check(second.totals.stale === 0, 'a freshly seeded database has no stale rows');

      console.log('\n[3] an admin-tuned policy survives a reseed');
      const tuned = await trx(TABLES.policies).first('id', 'key');
      await trx(TABLES.policies).where('id', tuned.id).update({
        filters_template: JSON.stringify({ hand: { $eq: 'tuned' } }),
        template_version: 2,
      });
      const tunedPlan = await planSeed({ registry, contract: livePlan.contract });
      const touchesTuned = tunedPlan.sections.policies.updates.some((u) => u.key === tuned.key);
      check(!touchesTuned, `templateVersion > 1 is left alone (${tuned.key})`);
      await applySeed(tunedPlan, { log: { info: () => {} } });
      const stillTuned = await trx(TABLES.policies).where('id', tuned.id).first();
      check(canonical(stillTuned.filters_template) === canonical({ hand: { $eq: 'tuned' } }),
        'the tuned filter template is still in the row after a reseed');

      console.log('\n[4] --prune removes stale rows and only stale rows');
      // Re-create the drift the live database has, then prune it away.
      await emptyEverything(trx);
      await applySeed(await planSeed({ registry, contract: livePlan.contract }), { log: { info: () => {} } });
      const orphanIface = await trx(TABLES.interfaces).first('id');
      const [orphanId] = await trx(TABLES.methods).insert({
        key: 'smoke--orphan:list', name: 'list', action: 'find', method: 'get',
        path: '/smoke-orphans', route_tokens: '[]', input_signature: '[]', apps: '[]', app_roles: '[]',
        document_id: 'smokeorphanmethod0000001',
        created_at: new Date(), updated_at: new Date(), published_at: new Date(),
      });
      await trx(LINKS.methods.table).insert({
        [LINKS.methods.source]: orphanId, [LINKS.methods.target]: orphanIface.id,
      });
      const prunePlan = await planSeed({ registry, contract: livePlan.contract });
      check(prunePlan.sections.methods.stale.length === 1
        && prunePlan.sections.methods.stale[0].key === 'smoke--orphan:list',
        'the orphan method is reported as stale');
      check(!prunePlan.dirty, 'a stale row alone does not make the plan dirty (prune is opt-in)');
      const countBefore = Number((await trx(TABLES.methods).count({ n: '*' }))[0].n);
      await applySeed(prunePlan, { prune: true, log: { info: () => {} } });
      const countAfter = Number((await trx(TABLES.methods).count({ n: '*' }))[0].n);
      check(countAfter === countBefore - 1, `prune deleted exactly one row (${countBefore} → ${countAfter})`);
      check(!(await trx(TABLES.methods).where('key', 'smoke--orphan:list').first()),
        'the orphan row is gone');

      console.log('\n[5] core mints an API token the rest of core accepts');
      const { token, accessKey } = await tokens.mint({
        name: 'smoke-policy probe', description: 'created and rolled back by smoke-policy.js',
        type: 'full-access', lifespanDays: 7,
      });
      check(accessKey.length === 256, 'the access key is 256 hex chars (randomBytes(128), as Strapi issues)');
      const tokenRow = await trx(tokens.TABLE).where('id', token.id).first();
      check(tokenRow.access_key
        === crypto.createHmac('sha512', get('API_TOKEN_SALT', '')).update(accessKey).digest('hex'),
        'the stored access_key is HMAC-SHA512(API_TOKEN_SALT, key) — the recipe both backends verify with');
      check(tokenRow.kind === 'content-api' && tokenRow.type === 'full-access',
        'kind and type match a Strapi-issued row');
      check(Boolean(tokenRow.expires_at), 'a lifespan in days became an expiry timestamp');
      check((await tokens.reveal('smoke-policy probe')).accessKey === accessKey,
        'reveal round-trips the key back out of AES-256-GCM');
      // Exactly the lookup src/http/auth.js performs on an incoming Bearer token.
      const salt = get('API_TOKEN_SALT', '');
      const candidates = [
        crypto.createHash('sha512').update(accessKey).digest('hex'),
        crypto.createHmac('sha512', salt).update(accessKey).digest('hex'),
        crypto.createHash('sha512').update(`${salt}${accessKey}`).digest('hex'),
      ];
      check(Boolean(await trx(tokens.TABLE).whereIn('access_key', candidates).first()),
        "core's auth middleware resolves the minted token");
      await tokens.revoke('smoke-policy probe');
      check(!(await trx(tokens.TABLE).where('name', 'smoke-policy probe').first()),
        'revoke removes the row');

      throw ROLLBACK;
    });
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }

  console.log('\n[6] the database is untouched');
  const restored = await snapshotAll(db);
  const restoredCounts = Object.fromEntries(
    Object.entries(restored.sections).map(([k, v]) => [k, v.byKey.size])
  );
  check(JSON.stringify(restoredCounts) === JSON.stringify(beforeCounts),
    `rollback restored every row count (${JSON.stringify(beforeCounts)})`,
    `now ${JSON.stringify(restoredCounts)}`);

  console.log(failures === 0
    ? '\n[smoke-policy] PASS'
    : `\n[smoke-policy] FAIL — ${failures} check(s) failed`);
  return failures === 0 ? 0 : 1;
}

main()
  .then(async (code) => { await closeDb(); process.exit(code); })
  .catch(async (err) => {
    console.error(`[smoke-policy] error: ${err.stack || err.message}`);
    try { await closeDb(); } catch { /* already closing */ }
    process.exit(1);
  });
