'use strict';

/**
 * documents() shim — write path.
 *
 * Semantics follow Strapi 5's Document Service:
 *  - create → draft version for draftAndPublish types (published_at NULL),
 *    single published row for non-D&P types; accepts a caller-supplied
 *    documentId (needed by the content-sync engine).
 *  - update → mutates the draft version (or the single row for non-D&P).
 *  - publish → deletes any existing published version, clones the draft graph
 *    (entity row + owner-side link rows + component graph + media morph rows),
 *    remapping D&P relation targets to their published counterparts.
 *  - discardDraft → the inverse: deletes the draft version and clones the
 *    published graph back into a fresh draft (targets remapped to drafts).
 *  - delete → removes every version and its full graph.
 *
 * Every operation runs in its own transaction.
 *
 * Relations write the one link row from either end: an inverse (mappedBy)
 * attribute writes the owning side's link table with the id and order columns
 * swapped, so the CMS-style "set my groups from the page editor" payloads work.
 *
 * Known v0 limit (documented, revisit per-module during ports):
 *  - Publish/discard rebuild a version from its own graph: inverse links added
 *    on the draft reach the published version only once the OWNING document is
 *    published (its clone remaps targets to their published counterparts).
 */

const crypto = require('crypto');
const { withTransaction } = require('../db/connection');

const DOC_ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function generateDocumentId() {
  // Strapi 5 documentIds are 24-char lowercase base36 (cuid2 format).
  const bytes = crypto.randomBytes(24);
  let out = '';
  for (let i = 0; i < 24; i++) {
    // first char must be a letter per cuid2
    const pool = i === 0 ? 26 : 36;
    out += DOC_ID_ALPHABET[bytes[i] % pool];
  }
  return out;
}

function scalarInsertValues(model, data, now) {
  const values = {};
  for (const s of model.scalars) {
    if (!(s.attr in data)) continue;
    let v = data[s.attr];
    if (s.type === 'json' && v !== null && typeof v !== 'string') v = JSON.stringify(v);
    // Strapi accepts ISO-8601 strings for datetimes; MySQL DATETIME columns
    // reject the raw 'T…Z' form — hand knex a Date so it formats it.
    if (s.type === 'datetime' && typeof v === 'string' && !Number.isNaN(Date.parse(v))) v = new Date(v);
    values[s.column] = v;
  }
  return values;
}

/** Normalize a relation input value to { mode, items }. */
function normalizeRelationInput(value) {
  if (value === null) return { mode: 'replace', items: [] };
  if (Array.isArray(value)) return { mode: 'replace', items: value };
  if (typeof value === 'object' && (value.set || value.connect || value.disconnect)) {
    return {
      mode: 'ops',
      set: value.set,
      connect: value.connect || [],
      disconnect: value.disconnect || [],
    };
  }
  return { mode: 'replace', items: [value] };
}

/** Resolve one relation item (id | documentId | {id} | {documentId}) to a row id. */
async function resolveTargetId(trx, target, item) {
  let id = null;
  let documentId = null;
  if (typeof item === 'number') id = item;
  else if (typeof item === 'string') documentId = item;
  else if (item && typeof item === 'object') {
    if (item.id !== undefined) id = item.id;
    else if (item.documentId !== undefined) documentId = item.documentId;
  }
  if (id !== null) return id;
  if (documentId === null) throw new Error(`Cannot resolve relation target from ${JSON.stringify(item)}`);
  if (target.builtin && !target.tableName) throw new Error(`documentId lookup not supported for builtin target ${target.uid}`);
  const qb = trx(target.tableName).where('document_id', documentId);
  if (target.draftAndPublish) qb.whereNull('published_at');
  const row = await qb.first('id');
  if (!row) throw new Error(`${target.uid}: no ${target.draftAndPublish ? 'draft ' : ''}row for documentId ${documentId}`);
  return row.id;
}

/**
 * Resolve how to write relation `rel` of `model` into its link table: which
 * table, which column holds this row's id, which holds the target's, which
 * order column ranks THIS row's list, and which ranks the far row's.
 * An inverse (mappedBy) attribute is the owning side's edge, reversed.
 */
function resolveWriteEdge(reg, model, rel) {
  const target = reg.models.get(rel.target);
  if (!target) throw new Error(`${model.uid}.${rel.attr}: unknown relation target ${rel.target}`);
  const owningKey = rel.owner ? `${model.uid}.${rel.attr}` : `${rel.target}.${rel.mappedBy}`;
  const jt = reg.joinTablesByOwner.get(owningKey);
  if (!jt) throw new Error(`${model.uid}.${rel.attr}: cannot resolve owning side ${owningKey}`);

  const edge = rel.owner
    ? {
      thisColumn: jt.sourceColumn,
      otherColumn: jt.targetColumn,
      myOrdColumn: jt.ownerOrdColumn,
      farOrdColumn: jt.inverseOrdColumn,
    }
    : {
      thisColumn: jt.targetColumn,
      otherColumn: jt.sourceColumn,
      myOrdColumn: jt.inverseOrdColumn,
      farOrdColumn: jt.ownerOrdColumn,
    };
  // Bidirectional self-relation: both lists share one order column.
  if (edge.farOrdColumn === edge.myOrdColumn) edge.farOrdColumn = null;
  // Writing the inverse side of a to-one owner (its `seo_meta`, its `footer`)
  // hands the far row a value it can only hold once, so connecting steals it
  // from whoever held it. The owning side keeps its historical laxness: two
  // order lines legitimately point their oneToOne `product` at the same row.
  edge.exclusiveTarget = !rel.owner
    && (jt.relation === 'oneToOne' || jt.relation === 'manyToOne');
  return { ...edge, jt, target };
}

async function writeRelation(trx, reg, model, rowId, rel, value) {
  const { jt, target, thisColumn, otherColumn, myOrdColumn, farOrdColumn, exclusiveTarget } =
    resolveWriteEdge(reg, model, rel);
  const input = normalizeRelationInput(value);

  // Where this row sits in the FAR row's list: keep the rank a pair already had
  // (a replace must not shuffle the other side's list), else append.
  const keptFarOrd = new Map();
  const farOrdFor = async (targetId) => {
    if (keptFarOrd.has(targetId)) return keptFarOrd.get(targetId);
    const rows = await trx(jt.table).where(otherColumn, targetId).max(`${farOrdColumn} as m`);
    return (Number(rows[0] && rows[0].m) || 0) + 1;
  };

  const insertRows = async (items, startOrd) => {
    let ord = startOrd;
    for (const item of items) {
      const targetId = await resolveTargetId(trx, target, item);
      if (exclusiveTarget) {
        await trx(jt.table).where(otherColumn, targetId).whereNot(thisColumn, rowId).del();
      }
      const row = { [thisColumn]: rowId, [otherColumn]: targetId };
      if (myOrdColumn) row[myOrdColumn] = ord++;
      if (farOrdColumn) row[farOrdColumn] = await farOrdFor(targetId);
      await trx(jt.table).insert(row);
    }
  };

  if (input.mode === 'replace' || input.set) {
    const existing = await trx(jt.table).where(thisColumn, rowId);
    if (farOrdColumn) {
      for (const r of existing) {
        if (r[farOrdColumn] !== null && r[farOrdColumn] !== undefined) {
          keptFarOrd.set(r[otherColumn], r[farOrdColumn]);
        }
      }
    }
    await trx(jt.table).where(thisColumn, rowId).del();
    await insertRows(input.set || input.items, 1);
    return;
  }
  if (input.disconnect.length) {
    const ids = [];
    for (const item of input.disconnect) ids.push(await resolveTargetId(trx, target, item));
    await trx(jt.table).where(thisColumn, rowId).whereIn(otherColumn, ids).del();
  }
  if (input.connect.length) {
    const existing = await trx(jt.table).where(thisColumn, rowId);
    const existingTargets = new Set(existing.map((r) => r[otherColumn]));
    let maxOrd = 0;
    if (myOrdColumn) for (const r of existing) maxOrd = Math.max(maxOrd, r[myOrdColumn] || 0);
    const fresh = [];
    for (const item of input.connect) {
      const targetId = await resolveTargetId(trx, target, item);
      if (!existingTargets.has(targetId)) fresh.push(targetId);
    }
    await insertRows(fresh, maxOrd + 1);
  }
}

async function writeMedia(trx, ownerUid, rowId, mediaAttr, value) {
  await trx('files_related_mph')
    .where({ related_type: ownerUid, related_id: rowId, field: mediaAttr.attr })
    .del();
  if (value === null || value === undefined) return;
  const items = Array.isArray(value) ? value : [value];
  let order = 1;
  for (const item of items) {
    const fileId = typeof item === 'object' ? item.id : item;
    await trx('files_related_mph').insert({
      file_id: fileId,
      related_id: rowId,
      related_type: ownerUid,
      field: mediaAttr.attr,
      order: order++,
    });
  }
}

async function insertComponentValue(trx, reg, ownerModel, ownerRowId, comp, value, now) {
  if (value === null || value === undefined) return;
  const compModel = reg.models.get(comp.component);
  if (!compModel) throw new Error(`${ownerModel.uid}.${comp.attr}: unknown component ${comp.component}`);
  const items = comp.repeatable ? value : [value];
  let order = 1;
  for (const item of items) {
    const cmpId = await insertEntityData(trx, reg, compModel, item, now, { isComponent: true });
    await trx(`${ownerModel.tableName}_cmps`).insert({
      entity_id: ownerRowId,
      cmp_id: cmpId,
      component_type: comp.component,
      field: comp.attr,
      order: comp.repeatable ? order++ : null,
    });
  }
}

/** Insert one entity/component row with its relations, media, and components. */
async function insertEntityData(trx, reg, model, data, now, { isComponent, documentId, publishedAt } = {}) {
  const values = scalarInsertValues(model, data, now);
  if (!isComponent) {
    values.document_id = documentId;
    values.created_at = now;
    values.updated_at = now;
    values.published_at = publishedAt;
    values.locale = data.locale !== undefined ? data.locale : null;
  }
  const [rowId] = await trx(model.tableName).insert(values);

  for (const rel of model.relations) {
    if (data[rel.attr] !== undefined) await writeRelation(trx, reg, model, rowId, rel, data[rel.attr]);
  }
  for (const media of model.media) {
    if (data[media.attr] !== undefined) await writeMedia(trx, model.uid, rowId, media, data[media.attr]);
  }
  for (const comp of model.components) {
    if (data[comp.attr] !== undefined) {
      await insertComponentValue(trx, reg, model, rowId, comp, data[comp.attr], now);
    }
  }
  return rowId;
}

/** Delete the component graph hanging off the given entity rows (optionally one field only). */
async function deleteComponentGraph(trx, reg, ownerModel, ownerRowIds, onlyField) {
  if (!ownerModel.components.length || ownerRowIds.length === 0) return;
  const cmpsTable = `${ownerModel.tableName}_cmps`;
  let qb = trx(cmpsTable).whereIn('entity_id', ownerRowIds);
  if (onlyField) qb = qb.where('field', onlyField);
  const cmpsRows = await qb.select('id', 'cmp_id', 'component_type');

  const byType = new Map();
  for (const row of cmpsRows) {
    if (!byType.has(row.component_type)) byType.set(row.component_type, []);
    byType.get(row.component_type).push(row.cmp_id);
  }
  for (const [componentUid, cmpIds] of byType) {
    const compModel = reg.models.get(componentUid);
    if (compModel) {
      await deleteComponentGraph(trx, reg, compModel, cmpIds); // nested components
      await trx('files_related_mph')
        .where('related_type', componentUid).whereIn('related_id', cmpIds).del();
      // component-owned link rows cascade via FK when the component row is deleted
      await trx(compModel.tableName).whereIn('id', cmpIds).del();
    }
  }
  await trx(cmpsTable).whereIn('id', cmpsRows.map((r) => r.id)).del();
}

/** Find the counterpart row id of the wanted status for a D&P target row id
 *  (null when that version doesn't exist). */
async function counterpartId(trx, target, rowId, wantStatus) {
  const src = await trx(target.tableName).where('id', rowId).first('document_id');
  if (!src) return null;
  const qb = trx(target.tableName).where('document_id', src.document_id);
  if (wantStatus === 'published') qb.whereNotNull('published_at');
  else qb.whereNull('published_at');
  const row = await qb.first('id');
  return row ? row.id : null;
}

/** Clone an entity/component row and its graph; returns the new row id.
 *  `remapTo` remaps D&P relation targets onto that version ('published' when
 *  publishing a draft, 'draft' when discarding back from the published copy);
 *  targets without that version are dropped from the clone. */
async function cloneEntityGraph(trx, reg, model, sourceRowId, overrides, remapTo = 'published') {
  const source = await trx(model.tableName).where('id', sourceRowId).first();
  if (!source) throw new Error(`${model.uid}: row ${sourceRowId} not found for clone`);
  const values = { ...source, ...overrides };
  delete values.id;
  // mysql2 PARSES JSON columns on read; handing the parsed value back to knex
  // breaks (arrays become SQL lists). Re-stringify for the insert.
  for (const s of model.scalars) {
    if (s.type === 'json' && values[s.column] !== null && typeof values[s.column] === 'object') {
      values[s.column] = JSON.stringify(values[s.column]);
    }
  }
  const [newId] = await trx(model.tableName).insert(values);

  // Owner-side link rows, remapping D&P targets to their published versions.
  for (const rel of model.relations) {
    if (!rel.owner) continue;
    const jt = reg.joinTablesByOwner.get(`${model.uid}.${rel.attr}`);
    const target = reg.models.get(rel.target);
    const links = await trx(jt.table).where(jt.sourceColumn, sourceRowId).orderBy('id', 'asc');
    for (const link of links) {
      let targetId = link[jt.targetColumn];
      if (!target.builtin && target.draftAndPublish) {
        targetId = await counterpartId(trx, target, targetId, remapTo);
        if (targetId === null) continue; // target has no such version → drop from the clone
      }
      const row = { ...link, [jt.sourceColumn]: newId, [jt.targetColumn]: targetId };
      delete row.id;
      await trx(jt.table).insert(row);
    }
  }

  // Media morph rows.
  const mediaRows = await trx('files_related_mph')
    .where({ related_type: model.uid, related_id: sourceRowId });
  for (const m of mediaRows) {
    const row = { ...m, related_id: newId };
    delete row.id;
    await trx('files_related_mph').insert(row);
  }

  // Component graph.
  if (model.components.length) {
    const cmpsTable = `${model.tableName}_cmps`;
    const cmpsRows = await trx(cmpsTable).where('entity_id', sourceRowId).orderBy('id', 'asc');
    for (const c of cmpsRows) {
      const compModel = reg.models.get(c.component_type);
      if (!compModel) continue;
      const newCmpId = await cloneEntityGraph(trx, reg, compModel, c.cmp_id, {}, remapTo);
      const row = { ...c, entity_id: newId, cmp_id: newCmpId };
      delete row.id;
      await trx(cmpsTable).insert(row);
    }
  }
  return newId;
}

async function deleteVersionGraph(trx, reg, model, rowIds) {
  if (rowIds.length === 0) return;
  await deleteComponentGraph(trx, reg, model, rowIds);
  await trx('files_related_mph')
    .where('related_type', model.uid).whereIn('related_id', rowIds).del();
  // Entity delete cascades link and cmps rows via FKs.
  await trx(model.tableName).whereIn('id', rowIds).del();
}

function versionRowsQuery(trx, model, documentId, status) {
  const qb = trx(model.tableName).where('document_id', documentId);
  if (model.draftAndPublish) {
    if (status === 'published') qb.whereNotNull('published_at');
    else if (status === 'draft') qb.whereNull('published_at');
  }
  return qb;
}

function createWriteApi({ db, reg, model, findOne }) {
  // Join tables owned by OTHER rows that point AT rows of this model
  // (including self-relations from other documents of the same type). Strapi
  // repairs these on publish/discard: deleting the replaced version row
  // FK-cascades them, and the fresh clone must inherit them — otherwise e.g.
  // the seo-meta sidecar loses its page after a discard, and a menu item's
  // published children detach when the parent is re-published.
  const inboundJts = reg.joinTables.filter((jt) => jt.targetUid === model.uid);

  async function snapshotInboundLinks(trx, oldIds) {
    if (!oldIds.length) return [];
    const inbound = [];
    for (const jt of inboundJts) {
      const rows = await trx(jt.table).whereIn(jt.targetColumn, oldIds);
      for (const row of rows) {
        // Self-relation rows whose SOURCE is also a row being replaced are
        // outbound — the clone regenerates those itself.
        if (jt.ownerUid === model.uid && oldIds.includes(row[jt.sourceColumn])) continue;
        inbound.push({ jt, row });
      }
    }
    return inbound;
  }

  async function restoreInboundLinks(trx, inbound, newId) {
    for (const { jt, row } of inbound) {
      const copy = { ...row, [jt.targetColumn]: newId };
      delete copy.id;
      await trx(jt.table).insert(copy);
    }
  }

  async function publishInternal(trx, documentId) {
    const draft = await versionRowsQuery(trx, model, documentId, 'draft').first('id');
    if (!draft) throw new Error(`${model.uid}: no draft for documentId ${documentId}`);
    const published = await versionRowsQuery(trx, model, documentId, 'published').select('id');
    const oldIds = published.map((r) => r.id);
    const inbound = await snapshotInboundLinks(trx, oldIds);
    await deleteVersionGraph(trx, reg, model, oldIds);
    const newId = await cloneEntityGraph(trx, reg, model, draft.id, {
      published_at: new Date(),
    });
    await restoreInboundLinks(trx, inbound, newId);
  }

  return {
    async create(params = {}) {
      const data = params.data || {};
      const documentId = data.documentId || params.documentId || generateDocumentId();
      const now = new Date();
      await withTransaction(async (trx) => {
        await insertEntityData(trx, reg, model, data, now, {
          documentId,
          publishedAt: model.draftAndPublish ? null : now,
        });
        if (model.draftAndPublish && params.status === 'published') {
          await publishInternal(trx, documentId);
        }
      });
      return findOne({ documentId, status: params.status, populate: params.populate });
    },

    async update(params = {}) {
      const { documentId } = params;
      if (!documentId) throw new Error('update requires a documentId');
      const data = params.data || {};
      const now = new Date();
      let found = false;
      await withTransaction(async (trx) => {
        const row = await versionRowsQuery(trx, model, documentId, 'draft').first('id');
        if (!row) return;
        found = true;
        const values = scalarInsertValues(model, data, now);
        values.updated_at = now;
        await trx(model.tableName).where('id', row.id).update(values);
        for (const rel of model.relations) {
          if (data[rel.attr] !== undefined) await writeRelation(trx, reg, model, row.id, rel, data[rel.attr]);
        }
        for (const media of model.media) {
          if (data[media.attr] !== undefined) await writeMedia(trx, model.uid, row.id, media, data[media.attr]);
        }
        for (const comp of model.components) {
          if (data[comp.attr] !== undefined) {
            await deleteComponentGraph(trx, reg, model, [row.id], comp.attr);
            await insertComponentValue(trx, reg, model, row.id, comp, data[comp.attr], now);
          }
        }
        if (model.draftAndPublish && params.status === 'published') {
          await publishInternal(trx, documentId);
        }
      });
      if (!found) return null;
      return findOne({ documentId, status: params.status, populate: params.populate });
    },

    async delete(params = {}) {
      const { documentId } = params;
      if (!documentId) throw new Error('delete requires a documentId');
      await withTransaction(async (trx) => {
        const rows = await trx(model.tableName).where('document_id', documentId).select('id');
        await deleteVersionGraph(trx, reg, model, rows.map((r) => r.id));
      });
      return { documentId };
    },

    async publish(params = {}) {
      const { documentId } = params;
      if (!documentId) throw new Error('publish requires a documentId');
      if (!model.draftAndPublish) throw new Error(`${model.uid} is not a draftAndPublish type`);
      await withTransaction(async (trx) => publishInternal(trx, documentId));
      return findOne({ documentId, status: 'published', populate: params.populate });
    },

    async unpublish(params = {}) {
      const { documentId } = params;
      if (!documentId) throw new Error('unpublish requires a documentId');
      await withTransaction(async (trx) => {
        const published = await versionRowsQuery(trx, model, documentId, 'published').select('id');
        await deleteVersionGraph(trx, reg, model, published.map((r) => r.id));
      });
      return findOne({ documentId });
    },

    async discardDraft(params = {}) {
      const { documentId } = params;
      if (!documentId) throw new Error('discardDraft requires a documentId');
      if (!model.draftAndPublish) throw new Error(`${model.uid} is not a draftAndPublish type`);
      await withTransaction(async (trx) => {
        const published = await versionRowsQuery(trx, model, documentId, 'published').first('id');
        if (!published) throw new Error(`${model.uid}: no published version for documentId ${documentId}`);
        const drafts = await versionRowsQuery(trx, model, documentId, 'draft').select('id');
        const oldIds = drafts.map((r) => r.id);
        const inbound = await snapshotInboundLinks(trx, oldIds);
        await deleteVersionGraph(trx, reg, model, oldIds);
        const newId = await cloneEntityGraph(trx, reg, model, published.id, { published_at: null }, 'draft');
        await restoreInboundLinks(trx, inbound, newId);
      });
      return findOne({ documentId, status: 'draft', populate: params.populate });
    },
  };
}

module.exports = { createWriteApi, generateDocumentId };
