'use strict';

/**
 * The api-pro policy seeder, running inside services/core.
 *
 * `packages/api-provider/api/*.js` is the contract; the `api_pro_*` tables are
 * its runtime mirror. Core reads its entire route table from that mirror
 * (src/http/server.js) and api-pro answers every authorization question from
 * it — so until now a descriptor change meant booting Strapi, because
 * `packages/strapi-api-pro/server/src/services/seeder.js` is the only thing
 * that could write those rows. That was the last hard dependency on Strapi in
 * the daily loop. This is its replacement.
 *
 * ── What is deliberately different from the Strapi seeder ──────────────────
 *
 * 1. **It diffs instead of upserting.** The Strapi version issues a findOne +
 *    update for all ~6,300 rows on every run, which is why it needs retry
 *    logic for pool exhaustion. Core computes the desired state, reads the
 *    current state in six queries, and writes only what actually differs — so
 *    the common case (nothing changed) writes nothing at all and the plan is
 *    printable before it runs (`--dry-run`).
 *
 * 2. **It reports stale rows.** Deleting a descriptor left its interface,
 *    method and policy rows behind forever. That is not cosmetic in core: the
 *    route table is built FROM these rows, so a stale row mounts a route no
 *    descriptor declares. The plan names them; `--prune` removes them. Report
 *    -only by default, matching the api-pro convention that narrowing never
 *    silently revokes.
 *
 * 3. **Table and column names come from the schema registry**, not string
 *    literals, so this file cannot drift from the schema the shim reads.
 *
 * Preserved exactly: the action/uid/grant inference (see descriptors.js), the
 * scope template vocabulary (scope.js), and the rule that an admin-tuned
 * policy — `templateVersion > 1`, set by the Policy Editor — is never
 * overwritten by a reseed.
 */

const { getDb, withTransaction } = require('../db/connection');
const { generateDocumentId } = require('../documents/write');
const { readContract } = require('./descriptors');
const { templatesForRole } = require('./scope');

const DOMAIN_UID = 'plugin::api-pro.app-domain';
const ROLE_UID = 'plugin::api-pro.app-role';
const INTERFACE_UID = 'plugin::api-pro.api-interface';
const METHOD_UID = 'plugin::api-pro.api-interface-method';
const POLICY_UID = 'plugin::api-pro.api-method-policy';

const INSERT_CHUNK = 200;

// ─── registry-backed schema access ──────────────────────────────────────────

/** { table, col(attr), type(attr) } for one content type, straight off the registry. */
function schemaOf(registry, uid) {
  const model = registry.models.get(uid);
  if (!model) throw new Error(`[policy] the schema registry has no model for ${uid}`);
  const byAttr = new Map(model.scalars.map((s) => [s.attr, s]));
  return {
    uid,
    table: model.tableName,
    col: (attr) => {
      const s = byAttr.get(attr);
      if (!s) throw new Error(`[policy] ${uid} has no scalar attribute '${attr}'`);
      return s.column;
    },
    type: (attr) => byAttr.get(attr)?.type,
  };
}

/** The link table for an owner-side relation, plus its order columns. */
function linkOf(registry, uid, attr) {
  const jt = registry.joinTablesByOwner.get(`${uid}.${attr}`);
  if (!jt) throw new Error(`[policy] ${uid}.${attr} is not an owner-side relation`);
  const ordFor = (col) => jt.columns.find((c) => c === `${col.replace(/_id$/, '')}_ord`) || null;
  return {
    table: jt.table,
    sourceColumn: jt.sourceColumn,
    targetColumn: jt.targetColumn,
    targetOrd: ordFor(jt.targetColumn),
    sourceOrd: ordFor(jt.sourceColumn),
  };
}

// ─── value comparison ───────────────────────────────────────────────────────

/** Stable JSON so `{a:1,b:2}` and `{b:2,a:1}` compare equal. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

/**
 * Does the stored column value already equal the desired one?
 *
 * The three traps this exists for: mysql2 hands back JSON columns already
 * parsed (so a string compare against our object always differs), booleans
 * arrive as TINYINT 0/1, and a JSON column written as `[]` reads back as an
 * array rather than the string we sent.
 */
function sameValue(stored, desired, type) {
  if (type === 'json') {
    const s = typeof stored === 'string' ? safeParse(stored) : stored;
    return stableStringify(s ?? null) === stableStringify(desired ?? null);
  }
  if (type === 'boolean') return Boolean(stored) === Boolean(desired);
  if (stored === null || stored === undefined) return desired === null || desired === undefined;
  if (typeof stored === 'number' || typeof desired === 'number') return Number(stored) === Number(desired);
  return String(stored) === String(desired);
}

function safeParse(raw) {
  try { return JSON.parse(raw); } catch { return raw; }
}

function humanize(input) {
  return String(input || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function interfaceKeyFor(uid) {
  return uid.replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
}

// ─── desired state ──────────────────────────────────────────────────────────

/**
 * Turn the contract into the exact rows the five tables should hold.
 *
 * Every entry is `{ key, attrs, link }` where `attrs` is keyed by SCHEMA
 * ATTRIBUTE name (not column) — the column mapping happens once, at write time,
 * through the registry.
 */
function buildDesiredState(contract) {
  const { domainsConfig, rolesConfig, descriptors } = contract;

  const domains = Object.entries(domainsConfig || {}).map(([key, value]) => ({
    key,
    attrs: {
      key,
      name: humanize(value?.name || key),
      description: value?.description || `Access domain '${key}' (seeded from platform config)`,
      isActive: true,
    },
  }));

  const roles = Object.entries(rolesConfig || {}).map(([key, value]) => ({
    key,
    attrs: {
      key,
      name: humanize(key),
      description: `Auto-seeded role '${key}' (level=${value?.level || '?'}, domain=${value?.domain || '?'})`,
      isActive: true,
      adminRoleCode: key,
    },
    // A role belongs to at most one domain today, but the relation is m2m and
    // the writer treats this as a list, so widening costs nothing later.
    link: value?.domain ? [value.domain] : [],
  }));

  // Descriptors, grouped by the content type they govern. Insertion order is
  // the file walk order, which is sorted — so the `_ord` columns below are
  // stable across runs rather than shuffling on every reseed.
  const byUid = new Map();
  for (const d of descriptors) {
    if (!byUid.has(d.uid)) byUid.set(d.uid, []);
    byUid.get(d.uid).push(d);
  }

  const interfaces = [];
  const methods = [];
  const policies = [];

  for (const [uid, group] of byUid) {
    const key = interfaceKeyFor(uid);
    interfaces.push({
      key,
      attrs: {
        key,
        name: humanize(uid.split('.').pop() || key),
        filePath: `api/${(group[0]?.fileName || `${key}.js`).replace(/\.js$/, '')}.js`,
        uid,
        status: 'generated',
      },
    });

    group.forEach((d, methodIndex) => {
      const methodKey = `${key}:${d.methodName}`;
      methods.push({
        key: methodKey,
        attrs: {
          key: methodKey,
          name: d.methodName,
          action: d.action,
          method: d.method,
          path: d.path,
          routeTokens: d.routeTokens,
          inputSignature: d.routeTokens,
          apps: [],
          appRoles: d.grants,
        },
        link: [key],
        ord: methodIndex + 1,
      });

      d.grants.forEach((roleKey, policyIndex) => {
        const level = rolesConfig?.[roleKey]?.level || 'unknown';
        policies.push({
          key: `${key}:${d.methodName}:${roleKey}`,
          attrs: {
            key: `${key}:${d.methodName}:${roleKey}`,
            name: `${humanize(roleKey)} → ${d.methodName}`,
            roleKey,
            resolverMode: 'strict',
            ...templatesForRole(d.interfaceScope, d.policyScope, level, d.action),
            templateVersion: 1,
          },
          link: [methodKey],
          ord: policyIndex + 1,
        });
      });
    });
  }

  return { domains, roles, interfaces, methods, policies };
}

// ─── current state + diff ───────────────────────────────────────────────────

async function readCurrent(db, schema) {
  const rows = await db(schema.table).select('*');
  return new Map(rows.map((r) => [r[schema.col('key')], r]));
}

/**
 * Compare desired rows against what the table holds.
 *
 * `preserve` is how an admin-tuned policy survives a reseed: it returns the
 * subset of attributes the seeder is still allowed to own for that row.
 *
 * `protectStale` is the same idea for deletion. A row the descriptors no
 * longer declare is normally the seeder's to remove — but not if a human
 * authored it. The Policy Editor can write a policy for a method no descriptor
 * produces, and the DB has historically had a second writer (the plugin's
 * file-store sync). Those rows are reported and left alone; `prune` never
 * touches them.
 */
function diffSection(schema, desired, currentByKey, { preserve, protectStale } = {}) {
  const inserts = [];
  const updates = [];

  for (const row of desired) {
    const existing = currentByKey.get(row.key);
    if (!existing) { inserts.push(row); continue; }

    const attrs = preserve ? preserve(row.attrs, existing) : row.attrs;
    const changed = {};
    for (const [attr, value] of Object.entries(attrs)) {
      if (!sameValue(existing[schema.col(attr)], value, schema.type(attr))) changed[attr] = value;
    }
    if (Object.keys(changed).length) updates.push({ id: existing.id, key: row.key, changed });
  }

  const desiredKeys = new Set(desired.map((r) => r.key));
  const stale = [];
  const protectedStale = [];
  for (const r of currentByKey.values()) {
    if (desiredKeys.has(r[schema.col('key')])) continue;
    const entry = { id: r.id, key: r[schema.col('key')] };
    (protectStale && protectStale(r) ? protectedStale : stale).push(entry);
  }

  return { inserts, updates, stale, protectedStale };
}

/**
 * Link rows for rows that already exist. New rows get their links written as
 * part of the insert, so only pre-existing sources are diffed here.
 */
async function diffLinks(db, link, sources, idByKey, targetIdByKey) {
  const sourceIds = sources.map((s) => s.id).filter(Boolean);
  const existing = sourceIds.length
    ? await db(link.table).whereIn(link.sourceColumn, sourceIds)
    : [];
  const bySource = new Map();
  for (const row of existing) {
    if (!bySource.has(row[link.sourceColumn])) bySource.set(row[link.sourceColumn], []);
    bySource.get(row[link.sourceColumn]).push(row);
  }

  const adds = [];
  const removes = [];
  for (const source of sources) {
    const want = (source.link || []).map((k) => targetIdByKey.get(k)).filter(Boolean);
    const have = bySource.get(source.id) || [];
    const haveIds = new Set(have.map((r) => r[link.targetColumn]));
    want.forEach((targetId, i) => {
      if (!haveIds.has(targetId)) {
        adds.push({ sourceId: source.id, targetId, ord: source.ord ?? i + 1 });
      }
    });
    const wantIds = new Set(want);
    for (const row of have) {
      if (!wantIds.has(row[link.targetColumn])) removes.push(row.id);
    }
  }
  return { adds, removes };
}

// ─── write helpers ──────────────────────────────────────────────────────────

function toColumns(schema, attrs) {
  const values = {};
  for (const [attr, value] of Object.entries(attrs)) {
    const column = schema.col(attr);
    values[column] = schema.type(attr) === 'json' && value !== null && typeof value !== 'string'
      ? JSON.stringify(value)
      : value;
  }
  return values;
}

/** Insert rows and return key → new id. None of these types are draftAndPublish,
 *  so `published_at` is set on insert exactly as the documents() writer does. */
async function insertRows(trx, schema, rows, now) {
  const idByKey = new Map();
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const chunk = rows.slice(i, i + INSERT_CHUNK).map((row) => ({
      ...toColumns(schema, row.attrs),
      document_id: generateDocumentId(),
      created_at: now,
      updated_at: now,
      published_at: now,
      locale: null,
    }));
    await trx(schema.table).insert(chunk);
  }
  if (rows.length) {
    const keys = rows.map((r) => r.key);
    const back = await trx(schema.table)
      .whereIn(schema.col('key'), keys)
      .select('id', `${schema.col('key')} as k`);
    for (const r of back) idByKey.set(r.k, r.id);
  }
  return idByKey;
}

async function applyUpdates(trx, schema, updates, now) {
  for (const u of updates) {
    await trx(schema.table).where('id', u.id).update({
      ...toColumns(schema, u.changed),
      updated_at: now,
    });
  }
}

async function applyLinks(trx, link, { adds, removes }) {
  if (removes.length) {
    for (let i = 0; i < removes.length; i += INSERT_CHUNK) {
      await trx(link.table).whereIn('id', removes.slice(i, i + INSERT_CHUNK)).del();
    }
  }
  const rows = adds.map((a) => {
    const row = { [link.sourceColumn]: a.sourceId, [link.targetColumn]: a.targetId };
    // Owner-list order (which target, in what order) and the inverse list's
    // order (where this source sits among the target's children). Strapi
    // maintains both; leaving either NULL reorders populated lists.
    if (link.targetOrd) row[link.targetOrd] = a.ord;
    if (link.sourceOrd) row[link.sourceOrd] = a.ord;
    return row;
  });
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await trx(link.table).insert(rows.slice(i, i + INSERT_CHUNK));
  }
}

// ─── plan ───────────────────────────────────────────────────────────────────

/** Was this policy row edited by a human rather than produced by a seed? */
function isTunedPolicy(row) {
  return Number(row.template_version) > 1;
}

/** An admin-tuned policy keeps its templates, its name and its resolver mode. */
function preservePolicy(attrs, existing) {
  const kept = { ...attrs, name: existing.name ?? attrs.name, resolverMode: existing.resolver_mode ?? attrs.resolverMode };
  if (Number(existing.template_version) > 1) {
    delete kept.filtersTemplate;
    delete kept.populateTemplate;
    delete kept.bodyTemplate;
    delete kept.queryTemplate;
    delete kept.templateVersion;
  }
  return kept;
}

/**
 * Read the contract, read the tables, and work out what would change.
 * Touches nothing.
 */
async function planSeed({ registry, contract, log = console } = {}) {
  const db = getDb();
  const resolved = contract || await readContract({ registry, log });

  const schemas = {
    domains: schemaOf(registry, DOMAIN_UID),
    roles: schemaOf(registry, ROLE_UID),
    interfaces: schemaOf(registry, INTERFACE_UID),
    methods: schemaOf(registry, METHOD_UID),
    policies: schemaOf(registry, POLICY_UID),
  };
  const links = {
    roles: linkOf(registry, ROLE_UID, 'appDomains'),
    methods: linkOf(registry, METHOD_UID, 'apiInterface'),
    policies: linkOf(registry, POLICY_UID, 'interfaceMethod'),
  };

  const desired = buildDesiredState(resolved);

  const current = {};
  for (const [name, schema] of Object.entries(schemas)) {
    current[name] = await readCurrent(db, schema);
  }

  const sections = {
    domains: diffSection(schemas.domains, desired.domains, current.domains),
    roles: diffSection(schemas.roles, desired.roles, current.roles),
    interfaces: diffSection(schemas.interfaces, desired.interfaces, current.interfaces),
    methods: diffSection(schemas.methods, desired.methods, current.methods),
    policies: diffSection(schemas.policies, desired.policies, current.policies, {
      preserve: preservePolicy,
      protectStale: isTunedPolicy,
    }),
  };

  // Link diffs cover rows that already exist; inserts carry their own links.
  const idOf = (name) => new Map([...current[name]].map(([k, r]) => [k, r.id]));
  const existingIds = {
    domains: idOf('domains'), roles: idOf('roles'), interfaces: idOf('interfaces'),
    methods: idOf('methods'), policies: idOf('policies'),
  };
  const withIds = (rows, name) => rows
    .filter((r) => existingIds[name].has(r.key))
    .map((r) => ({ ...r, id: existingIds[name].get(r.key) }));

  const linkDiffs = {
    roles: await diffLinks(db, links.roles, withIds(desired.roles, 'roles'), existingIds.roles, existingIds.domains),
    methods: await diffLinks(db, links.methods, withIds(desired.methods, 'methods'), existingIds.methods, existingIds.interfaces),
    policies: await diffLinks(db, links.policies, withIds(desired.policies, 'policies'), existingIds.policies, existingIds.methods),
  };

  const totals = { inserts: 0, updates: 0, stale: 0, protectedStale: 0, linkAdds: 0, linkRemoves: 0 };
  for (const s of Object.values(sections)) {
    totals.inserts += s.inserts.length;
    totals.updates += s.updates.length;
    totals.stale += s.stale.length;
    totals.protectedStale += s.protectedStale.length;
  }
  for (const l of Object.values(linkDiffs)) {
    totals.linkAdds += l.adds.length;
    totals.linkRemoves += l.removes.length;
  }
  const dirty = totals.inserts + totals.updates + totals.linkAdds + totals.linkRemoves > 0;

  return {
    contract: resolved,
    schemas,
    links,
    desired,
    sections,
    linkDiffs,
    totals,
    dirty,
    counts: {
      domains: desired.domains.length,
      roles: desired.roles.length,
      interfaces: desired.interfaces.length,
      methods: desired.methods.length,
      policies: desired.policies.length,
    },
  };
}

// ─── apply ──────────────────────────────────────────────────────────────────

/**
 * Write the plan. One transaction for the lot: a half-applied seed is a broken
 * route table, and core builds its router from these rows at boot.
 */
async function applySeed(plan, { prune = false, log = console } = {}) {
  const { schemas, links, sections, linkDiffs, desired } = plan;
  const now = new Date();
  const applied = { inserted: 0, updated: 0, linked: 0, unlinked: 0, pruned: 0 };

  await withTransaction(async (trx) => {
    // Parents before children: an interface id must exist before its methods
    // can link to it, and a method id before its policies.
    const newIds = {};
    for (const name of ['domains', 'roles', 'interfaces', 'methods', 'policies']) {
      const section = sections[name];
      newIds[name] = await insertRows(trx, schemas[name], section.inserts, now);
      await applyUpdates(trx, schemas[name], section.updates, now);
      applied.inserted += section.inserts.length;
      applied.updated += section.updates.length;
    }

    // Every key → id, existing rows and freshly inserted alike.
    const allIds = {};
    for (const name of Object.keys(schemas)) {
      const rows = await trx(schemas[name].table).select('id', `${schemas[name].col('key')} as k`);
      allIds[name] = new Map(rows.map((r) => [r.k, r.id]));
    }

    for (const [name, targetName] of [['roles', 'domains'], ['methods', 'interfaces'], ['policies', 'methods']]) {
      const insertedKeys = new Set(sections[name].inserts.map((r) => r.key));
      const freshLinks = desired[name]
        .filter((r) => insertedKeys.has(r.key))
        .map((r) => ({ ...r, id: allIds[name].get(r.key) }));
      const adds = [...linkDiffs[name].adds];
      for (const source of freshLinks) {
        (source.link || []).forEach((targetKey, i) => {
          const targetId = allIds[targetName].get(targetKey);
          if (targetId) adds.push({ sourceId: source.id, targetId, ord: source.ord ?? i + 1 });
        });
      }
      await applyLinks(trx, links[name], { adds, removes: linkDiffs[name].removes });
      applied.linked += adds.length;
      applied.unlinked += linkDiffs[name].removes.length;
    }

    if (prune) {
      // Children before parents — the link rows FK-cascade off the row that
      // owns them, so policies go before methods, methods before interfaces.
      for (const name of ['policies', 'methods', 'interfaces']) {
        const ids = sections[name].stale.map((r) => r.id);
        for (let i = 0; i < ids.length; i += INSERT_CHUNK) {
          await trx(schemas[name].table).whereIn('id', ids.slice(i, i + INSERT_CHUNK)).del();
        }
        applied.pruned += ids.length;
      }
    }
  });

  // Claims are cached per user; a policy change that the cache outlives is a
  // stale 403 (or worse, a stale allow) until the TTL expires.
  global.strapi?.apiPro?.cache?.clearAll?.();

  log.info?.(`[policy] applied: +${applied.inserted} rows, ~${applied.updated} updated, `
    + `+${applied.linked}/-${applied.unlinked} links${applied.pruned ? `, -${applied.pruned} pruned` : ''}`);
  return applied;
}

/** Plan, then apply if anything differs. */
async function seedPolicy({ registry, contract, prune = false, force = false, log = console } = {}) {
  const plan = await planSeed({ registry, contract, log });
  if (!plan.dirty && !force && !(prune && plan.totals.stale)) {
    return { ok: true, changed: false, plan };
  }
  const applied = await applySeed(plan, { prune, log });
  return { ok: true, changed: true, applied, plan };
}

module.exports = {
  planSeed,
  applySeed,
  seedPolicy,
  buildDesiredState,
  // exported for tests
  schemaOf,
  linkOf,
  sameValue,
  stableStringify,
  interfaceKeyFor,
  humanize,
};
