'use strict';

/**
 * documents() shim v0 — read path.
 *
 * API-compatible subset of Strapi 5's Document Service so ported
 * controllers/services keep their `strapi.documents(uid).findMany(...)`
 * call sites unchanged:
 *
 *   documents(uid).findMany({ filters, sort, populate, status, limit, start, page, pageSize })
 *   documents(uid).findOne({ documentId, populate, status })
 *   documents(uid).findFirst({ ... })
 *   documents(uid).count({ filters, status })
 *
 * Semantics follow the Document Service: draft-by-default for
 * draftAndPublish types (pass status: 'published' for published versions).
 * Write path (create/update/delete/publish) comes in v1.
 */

const { getDb } = require('../db/connection');
const { buildRegistry } = require('../schema/registry');
const { applyFilters, normalizeSort, resolveEdge } = require('./query');
const { createWriteApi } = require('./write');

let registry = null;
function getRegistry() {
  if (!registry) registry = buildRegistry();
  return registry;
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

/** Map a DB row to the Document Service result shape (attribute names, camelCase meta). */
function mapScalar(s, value) {
  if (s.type === 'json') return parseMaybeJson(value);
  // MySQL TINYINT(1) → real boolean, matching Strapi's serialization.
  if (s.type === 'boolean') return value === null || value === undefined ? value : Boolean(value);
  return value;
}

function mapRow(model, row) {
  if (!row) return null;
  const out = { documentId: row.document_id, id: row.id };
  for (const s of model.scalars) {
    out[s.attr] = mapScalar(s, row[s.column]);
  }
  out.createdAt = row.created_at;
  out.updatedAt = row.updated_at;
  out.publishedAt = row.published_at;
  // Strapi omits locale entirely when i18n is off — only emit when set.
  if (row.locale !== null && row.locale !== undefined) out.locale = row.locale;
  return out;
}

function mapComponentRow(model, row) {
  const out = { id: row.id };
  for (const s of model.scalars) {
    out[s.attr] = mapScalar(s, row[s.column]);
  }
  return out;
}

const FILE_MODEL = {
  uid: 'plugin::upload.file',
  scalars: [
    'name', 'alternativeText', 'caption', 'width', 'height', 'formats', 'hash',
    'ext', 'mime', 'size', 'url', 'previewUrl', 'provider', 'providerMetadata',
    'folderPath',
  ],
};

function mapFileRow(row) {
  const out = { id: row.id, documentId: row.document_id };
  for (const attr of FILE_MODEL.scalars) {
    const column = attr.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
    const value = row[column];
    out[attr] = (attr === 'formats' || attr === 'providerMetadata') ? parseMaybeJson(value) : value;
  }
  out.createdAt = row.created_at;
  out.updatedAt = row.updated_at;
  return out;
}

function applyStatus(qb, model, status, alias) {
  if (!model.draftAndPublish) return;
  // Document Service default: draft versions.
  if (status === 'published') qb.whereNotNull(`${alias}.published_at`);
  else qb.whereNull(`${alias}.published_at`);
}

function normalizePopulate(model, populate) {
  // Accept true | '*' | ['a','b'] | { a: true|{...} } → Map(attr → opts object)
  const out = new Map();
  if (!populate) return out;
  const all = populate === true || populate === '*';
  const attrs = [
    ...model.relations.map((r) => r.attr),
    ...model.media.map((m) => m.attr),
    ...model.components.map((c) => c.attr),
  ];
  if (all) {
    // populate=* parity: Strapi's sanitize strips relations targeting UP users
    // (owners etc.) from wildcard population — they appear only when explicit.
    const upUserAttrs = new Set(
      model.relations
        .filter((r) => r.target === 'plugin::users-permissions.user')
        .map((r) => r.attr)
    );
    for (const attr of attrs) if (!upUserAttrs.has(attr)) out.set(attr, {});
    return out;
  }
  if (Array.isArray(populate)) {
    for (const attr of populate) out.set(attr, {});
    return out;
  }
  for (const [attr, opts] of Object.entries(populate)) {
    if (opts === false) continue;
    out.set(attr, opts === true || opts === '*' ? {} : opts);
  }
  return out;
}

async function populateRows(db, reg, model, rows, populate, status) {
  const plan = normalizePopulate(model, populate);
  if (plan.size === 0 || rows.length === 0) return;
  const idOf = new Map(rows.map((r) => [r.id, r]));
  const ids = [...idOf.keys()];

  for (const [attr, opts] of plan) {
    const rel = model.relations.find((r) => r.attr === attr);
    const media = model.media.find((m) => m.attr === attr);
    const comp = model.components.find((c) => c.attr === attr);
    if (rel) await populateRelation(db, reg, model, rows, ids, rel, opts, status);
    else if (media) await populateMedia(db, model, rows, ids, media, opts);
    else if (comp) await populateComponent(db, reg, model, rows, ids, comp, opts);
    else throw new Error(`${model.uid}: cannot populate unknown attribute "${attr}"`);
  }
}

async function populateRelation(db, reg, model, rows, ids, rel, opts, status) {
  const edge = resolveEdge(reg, model, rel);
  const target = edge.target;
  if (target.builtin && !BUILTIN_ROW_MAPPERS[rel.target]) {
    // Builtin plugin models without a safe projection (admin users, …) have no
    // compiled schema — resolve to empty rather than failing the populate tree.
    const single = rel.relation === 'oneToOne' || rel.relation === 'manyToOne';
    for (const row of rows) attach(row, rel.attr, single ? null : []);
    return;
  }

  // Link rows may reference either version's row of a D&P target document
  // (Strapi resolves versions per-document at read time — verified against
  // live data: a published branch links draft AND published product rows).
  // Hop through the linked row to the version matching the requested status.
  const qb = db(`${edge.table} as l`).whereIn(`l.${edge.thisColumn}`, ids);
  if (!target.builtin && target.draftAndPublish) {
    qb.join(`${target.tableName} as tl`, 'tl.id', `l.${edge.otherColumn}`)
      .join(`${target.tableName} as t`, 't.document_id', 'tl.document_id');
  } else {
    qb.join(`${target.tableName} as t`, 't.id', `l.${edge.otherColumn}`);
  }
  qb.select('t.*', `l.${edge.thisColumn} as __parent_id`);
  if (!target.builtin) applyStatus(qb, target, opts.status || status, 't');
  if (opts.filters) applyFilters(db, reg, qb, target, opts.filters, 't');
  if (edge.orderColumn) qb.orderBy(`l.${edge.orderColumn}`, 'asc');
  else qb.orderBy('l.id', 'asc');

  const children = await qb;
  const single = rel.relation === 'oneToOne' || rel.relation === 'manyToOne';
  const grouped = new Map();
  const seenPerParent = new Map(); // dedupe when both versions of a doc are linked
  for (const child of children) {
    const parentId = child.__parent_id;
    delete child.__parent_id;
    const seenKey = `${parentId}:${child.id}`;
    if (seenPerParent.has(seenKey)) continue;
    seenPerParent.set(seenKey, true);
    const mapped = target.builtin
      ? BUILTIN_ROW_MAPPERS[rel.target](child)
      : mapRow(target, child);
    if (!grouped.has(parentId)) grouped.set(parentId, []);
    grouped.get(parentId).push({ mapped, raw: child });
  }

  // Nested populate on the target's fetched rows.
  if (opts.populate && !target.builtin) {
    const allPairs = [...grouped.values()].flat();
    const rawRows = allPairs.map((p) => p.raw);
    const byId = new Map(allPairs.map((p) => [p.raw.id, p.mapped]));
    await populateRows(db, reg, target, rawRows, opts.populate, opts.status || status);
    // populateRows attaches onto raw rows' mapped twins via __mapped — see note below.
    for (const p of allPairs) {
      for (const key of Object.keys(p.raw.__populated || {})) {
        byId.get(p.raw.id)[key] = p.raw.__populated[key];
      }
    }
  }

  for (const row of rows) {
    const list = (grouped.get(row.id) || []).map((p) => p.mapped);
    attach(row, rel.attr, single ? (list[0] || null) : list);
  }
}

function mapUpUserRow(row) {
  // Minimal user projection: enough for ownership/display; never expose secrets.
  return {
    id: row.id,
    documentId: row.document_id,
    username: row.username,
    email: row.email,
    confirmed: row.confirmed,
    blocked: row.blocked,
  };
}

// Builtin targets that MAY be populated, each with a fixed safe projection.
// UP role is needed by the ported auth utils (super-admin check reads role.type).
const BUILTIN_ROW_MAPPERS = {
  'plugin::users-permissions.user': mapUpUserRow,
  'plugin::users-permissions.role': (row) => ({
    id: row.id,
    documentId: row.document_id,
    name: row.name,
    description: row.description,
    type: row.type,
  }),
};

async function populateMedia(db, model, rows, ids, media, opts) {
  const children = await db('files_related_mph as m')
    .join('files as f', 'f.id', 'm.file_id')
    .where('m.related_type', model.uid)
    .where('m.field', media.attr)
    .whereIn('m.related_id', ids)
    .orderBy('m.order', 'asc')
    .select('f.*', 'm.related_id as __parent_id');
  const grouped = new Map();
  for (const child of children) {
    const parentId = child.__parent_id;
    delete child.__parent_id;
    if (!grouped.has(parentId)) grouped.set(parentId, []);
    grouped.get(parentId).push(mapFileRow(child));
  }
  for (const row of rows) {
    const list = grouped.get(row.id) || [];
    // Strapi returns null (not []) for empty media, single or multiple.
    attach(row, media.attr, media.multiple ? (list.length ? list : null) : (list[0] || null));
  }
}

async function populateComponent(db, reg, model, rows, ids, comp, opts) {
  const compModel = reg.models.get(comp.component);
  if (!compModel) throw new Error(`${model.uid}.${comp.attr}: unknown component ${comp.component}`);
  const cmpsTable = `${model.tableName}_cmps`;
  const children = await db(`${cmpsTable} as c`)
    .join(`${compModel.tableName} as t`, 't.id', 'c.cmp_id')
    .where('c.field', comp.attr)
    .whereIn('c.entity_id', ids)
    .orderBy('c.order', 'asc')
    .select('t.*', 'c.entity_id as __parent_id');
  const grouped = new Map();
  const pairs = [];
  for (const child of children) {
    const parentId = child.__parent_id;
    delete child.__parent_id;
    const pair = { mapped: mapComponentRow(compModel, child), raw: child };
    pairs.push(pair);
    if (!grouped.has(parentId)) grouped.set(parentId, []);
    grouped.get(parentId).push(pair);
  }

  // Components can hold relations/media of their own (nested populate).
  if (opts.populate && pairs.length) {
    await populateRows(db, reg, compModel, pairs.map((p) => p.raw), opts.populate);
    for (const p of pairs) {
      Object.assign(p.mapped, p.raw.__populated || {});
    }
  }

  for (const row of rows) {
    const list = (grouped.get(row.id) || []).map((p) => p.mapped);
    attach(row, comp.attr, comp.repeatable ? list : (list[0] || null));
  }
}

// Populated values are attached to the RAW row under __populated, and merged
// into the mapped result by the caller — this lets nested populate reuse the
// same machinery without tracking mapped/raw pairs everywhere.
function attach(rawRow, attr, value) {
  if (!rawRow.__populated) rawRow.__populated = {};
  rawRow.__populated[attr] = value;
}

function buildBaseQuery(db, reg, model, params) {
  const qb = db(`${model.tableName} as t`);
  applyStatus(qb, model, params.status, 't');
  if (params.filters) applyFilters(db, reg, qb, model, params.filters, 't');
  return qb;
}

// ── Document-service middlewares ────────────────────────────────────────────
// Equivalent of Strapi's documents-service middleware seam (the pattern the
// codebase already prefers over lifecycles — e.g. mfg kind-typing). Each
// middleware runs around every documents() operation:
//   use(async (ctx, next) => { ... return next(); })
// ctx = { uid, action, params, model } — mutate ctx.params to alter the
// operation; the resolved value of next() is the operation result.
const documentMiddlewares = [];

function useDocumentMiddleware(fn) {
  documentMiddlewares.push(fn);
}

async function runWithMiddlewares(ctx, operation) {
  let index = -1;
  const dispatch = (i) => {
    if (i <= index) return Promise.reject(new Error('next() called multiple times'));
    index = i;
    if (i === documentMiddlewares.length) return operation();
    return documentMiddlewares[i](ctx, () => dispatch(i + 1));
  };
  return dispatch(0);
}

function documents(uid) {
  const reg = getRegistry();
  const model = reg.models.get(uid);
  if (!model) throw new Error(`Unknown content-type uid: ${uid}`);
  if (model.isComponent) throw new Error(`${uid} is a component, not a content-type`);
  // Lazy wrapper so every query joins the ambient transaction (ALS) when present.
  const db = (...args) => getDb()(...args);
  db.raw = (...args) => getDb().raw(...args);

  async function runFind(params, limitOne) {
    const qb = buildBaseQuery(db, reg, model, params).select('t.*');
    for (const [column, dir] of normalizeSort(model, params.sort)) {
      qb.orderBy(`t.${column}`, dir);
    }
    if (limitOne) {
      qb.limit(1);
    } else if (params.page !== undefined || params.pageSize !== undefined) {
      const page = Math.max(1, parseInt(params.page || 1, 10));
      const pageSize = Math.max(1, parseInt(params.pageSize || 25, 10));
      qb.limit(pageSize).offset((page - 1) * pageSize);
    } else {
      if (params.limit !== undefined) qb.limit(parseInt(params.limit, 10));
      if (params.start !== undefined) qb.offset(parseInt(params.start, 10));
    }
    const rows = await qb;
    await populateRows(db, reg, model, rows, params.populate, params.status);
    return rows.map((raw) => Object.assign(mapRow(model, raw), raw.__populated || {}));
  }

  const rawApi = {
    async findMany(params = {}) {
      return runFind(params, false);
    },
    async findFirst(params = {}) {
      const results = await runFind(params, true);
      return results[0] || null;
    },
    async findOne(params = {}) {
      const documentId = typeof params === 'string' ? params : params.documentId;
      const opts = typeof params === 'string' ? {} : params;
      if (!documentId) throw new Error('findOne requires a documentId');
      const results = await runFind(
        { ...opts, filters: { $and: [{ documentId: { $eq: documentId } }, ...(opts.filters ? [opts.filters] : [])] } },
        true
      );
      return results[0] || null;
    },
    async count(params = {}) {
      const [{ count }] = await buildBaseQuery(db, reg, model, params).count('t.id as count');
      return Number(count);
    },
  };

  Object.assign(rawApi, createWriteApi({ db, reg, model, findOne: rawApi.findOne }));

  // Wrap every operation in the document-middleware chain.
  const api = {};
  for (const [action, fn] of Object.entries(rawApi)) {
    api[action] = (params = {}) => {
      if (documentMiddlewares.length === 0) return fn(params);
      const ctx = { uid, action, params, model };
      return runWithMiddlewares(ctx, () => fn(ctx.params));
    };
  }
  return api;
}

// Mirror Strapi's `strapi.documents.use(...)` so ported registration code
// (pos-strapi src/index.js style) reads the same in core.
documents.use = useDocumentMiddleware;

module.exports = { documents, getRegistry, useDocumentMiddleware };
