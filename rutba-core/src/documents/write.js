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
 *  - delete → removes every version and its full graph.
 *
 * Every operation runs in its own transaction.
 *
 * Known v0 limits (documented, revisit per-module during ports):
 *  - Writing through the inverse side of a relation throws — write via the
 *    owning side (matches how the codebase's controllers are written).
 *  - Bidirectional inverse order columns (source_ord) are left NULL on insert;
 *    only the owner list's order column is maintained.
 */

const crypto = require('crypto');
const { snakeCase } = require('../schema/naming');
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
    const v = data[s.attr];
    values[s.column] =
      s.type === 'json' && v !== null && typeof v !== 'string' ? JSON.stringify(v) : v;
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
  if (target.builtin) throw new Error(`documentId lookup not supported for builtin target ${target.uid}`);
  const qb = trx(target.tableName).where('document_id', documentId);
  if (target.draftAndPublish) qb.whereNull('published_at');
  const row = await qb.first('id');
  if (!row) throw new Error(`${target.uid}: no ${target.draftAndPublish ? 'draft ' : ''}row for documentId ${documentId}`);
  return row.id;
}

async function writeRelation(trx, reg, model, rowId, rel, value) {
  if (!rel.owner) {
    throw new Error(
      `${model.uid}.${rel.attr}: writing through the inverse side is not supported — ` +
      `set the relation on ${rel.target}.${rel.mappedBy} instead`
    );
  }
  const jt = reg.joinTablesByOwner.get(`${model.uid}.${rel.attr}`);
  const target = reg.models.get(rel.target);
  const ordColumn = jt.columns.find((c) => c === `${snakeCase(target.singularName)}_ord`) || null;
  const input = normalizeRelationInput(value);

  const insertRows = async (items, startOrd) => {
    let ord = startOrd;
    for (const item of items) {
      const targetId = await resolveTargetId(trx, target, item);
      const row = { [jt.sourceColumn]: rowId, [jt.targetColumn]: targetId };
      if (ordColumn) row[ordColumn] = ord++;
      await trx(jt.table).insert(row);
    }
  };

  if (input.mode === 'replace' || input.set) {
    await trx(jt.table).where(jt.sourceColumn, rowId).del();
    await insertRows(input.set || input.items, 1);
    return;
  }
  if (input.disconnect.length) {
    const ids = [];
    for (const item of input.disconnect) ids.push(await resolveTargetId(trx, target, item));
    await trx(jt.table).where(jt.sourceColumn, rowId).whereIn(jt.targetColumn, ids).del();
  }
  if (input.connect.length) {
    const existing = await trx(jt.table).where(jt.sourceColumn, rowId);
    const existingTargets = new Set(existing.map((r) => r[jt.targetColumn]));
    let maxOrd = 0;
    if (ordColumn) for (const r of existing) maxOrd = Math.max(maxOrd, r[ordColumn] || 0);
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

/** Find the published counterpart's row id for a D&P target row id (null if unpublished). */
async function publishedCounterpartId(trx, target, draftRowId) {
  const src = await trx(target.tableName).where('id', draftRowId).first('document_id');
  if (!src) return null;
  const pub = await trx(target.tableName)
    .where('document_id', src.document_id).whereNotNull('published_at').first('id');
  return pub ? pub.id : null;
}

/** Clone an entity/component row and its graph; returns the new row id. */
async function cloneEntityGraph(trx, reg, model, sourceRowId, overrides) {
  const source = await trx(model.tableName).where('id', sourceRowId).first();
  if (!source) throw new Error(`${model.uid}: row ${sourceRowId} not found for clone`);
  const values = { ...source, ...overrides };
  delete values.id;
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
        targetId = await publishedCounterpartId(trx, target, targetId);
        if (targetId === null) continue; // target not published → drop from published version
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
      const newCmpId = await cloneEntityGraph(trx, reg, compModel, c.cmp_id, {});
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
  async function publishInternal(trx, documentId) {
    const draft = await versionRowsQuery(trx, model, documentId, 'draft').first('id');
    if (!draft) throw new Error(`${model.uid}: no draft for documentId ${documentId}`);
    const published = await versionRowsQuery(trx, model, documentId, 'published').select('id');
    await deleteVersionGraph(trx, reg, model, published.map((r) => r.id));
    await cloneEntityGraph(trx, reg, model, draft.id, {
      published_at: new Date(),
    });
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
  };
}

module.exports = { createWriteApi, generateDocumentId };
