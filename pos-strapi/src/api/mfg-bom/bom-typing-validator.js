'use strict';

/**
 * mfg-bom input/output KIND typing enforcement (Epic 1 P3).
 *
 * Runs as a DOCUMENT-SERVICE middleware (registered in src/index.js) rather than
 * a DB lifecycle, because only the document layer sees nested component relations
 * (material_lines[].material_product, outputs[].product) in the write payload
 * BEFORE they are committed — the db-layer beforeCreate strips them.
 *
 * Rules:
 *   inputs  (material_lines[].material_product) ∈ {raw_material, consumable, semi_finished}
 *   outputs (outputs[].product AND the primary mfg-bom.product) ∈ {finished_good, semi_finished}
 *     …except outputs whose output_type is `scrap` / `by_product` (may be ANY kind).
 *
 * Graduated: a violation HARD-BLOCKS (ValidationError → 400) only when the BOM is
 * (being set) Active; on Draft/Archived it is a logged warning so authors keep
 * migration slack. Products with no `kind` yet (legacy) are never flagged. Any
 * plumbing error is swallowed so it can never wrongly block a legitimate edit.
 */

const { ValidationError } = require('@strapi/utils').errors;

const BOM_UID = 'api::mfg-bom.mfg-bom';
const PRODUCT_UID = 'api::product.product';

const INPUT_KINDS = ['raw_material', 'consumable', 'semi_finished'];
const OUTPUT_KINDS = ['finished_good', 'semi_finished'];
const ANY_KIND_OUTPUT_TYPES = ['scrap', 'by_product'];

// Normalise however a relation arrives → { id } | { documentId } | null
function relRef(v) {
  if (v == null) return null;
  if (typeof v === 'number') return { id: v };
  if (typeof v === 'string') return { documentId: v };
  if (Array.isArray(v)) return v.length ? relRef(v[0]) : null;
  if (typeof v === 'object') {
    if (v.id != null) return { id: v.id };
    if (v.documentId != null) return { documentId: v.documentId };
    if (v.connect != null) return relRef(v.connect);
    if (v.set != null) return relRef(v.set);
  }
  return null;
}

// Batch-resolve refs → Map keyed by `id:<n>` and `doc:<docId>` → product row.
async function resolveKinds(strapi, refs) {
  const map = new Map();
  const add = (r) => { if (r.id != null) map.set(`id:${r.id}`, r); if (r.documentId) map.set(`doc:${r.documentId}`, r); };
  const ids = [...new Set(refs.filter((r) => r?.id != null).map((r) => r.id))];
  const docIds = [...new Set(refs.filter((r) => r?.documentId != null && r.id == null).map((r) => r.documentId))];
  if (ids.length) {
    (await strapi.db.query(PRODUCT_UID).findMany({ where: { id: { $in: ids } }, select: ['id', 'documentId', 'kind', 'name'] })).forEach(add);
  }
  if (docIds.length) {
    (await strapi.db.query(PRODUCT_UID).findMany({ where: { documentId: { $in: docIds } }, select: ['id', 'documentId', 'kind', 'name'] })).forEach(add);
  }
  return map;
}

function lookup(map, ref) {
  if (!ref) return null;
  if (ref.id != null && map.has(`id:${ref.id}`)) return map.get(`id:${ref.id}`);
  if (ref.documentId != null && map.has(`doc:${ref.documentId}`)) return map.get(`doc:${ref.documentId}`);
  return null;
}

const label = (p, ref) => p?.name || p?.documentId || (ref && (ref.documentId || `#${ref.id}`)) || 'product';

// Merge the incoming write `data` over any persisted `existing` state, resolve the
// kinds of every referenced product, and return { violations[], status }.
async function collectViolations(strapi, data, existing) {
  const materialLines = Array.isArray(data.material_lines) ? data.material_lines : (existing?.material_lines || []);
  const outputs = Array.isArray(data.outputs) ? data.outputs : (existing?.outputs || []);
  const primaryRef = ('product' in data) ? relRef(data.product) : (existing?.product ? relRef(existing.product) : null);

  const inputRefs = materialLines.map((l) => relRef(l?.material_product)).filter(Boolean);
  const outputRows = outputs.map((o) => ({ ref: relRef(o?.product), type: o?.output_type })).filter((o) => o.ref);
  const allRefs = [...inputRefs, ...outputRows.map((o) => o.ref)];
  if (primaryRef) allRefs.push(primaryRef);

  const violations = [];
  if (allRefs.length) {
    const map = await resolveKinds(strapi, allRefs);
    for (const ref of inputRefs) {
      const p = lookup(map, ref);
      if (p && p.kind && !INPUT_KINDS.includes(p.kind)) {
        violations.push(`input "${label(p, ref)}" is kind "${p.kind}" — inputs must be ${INPUT_KINDS.join(' / ')}`);
      }
    }
    for (const o of outputRows) {
      if (ANY_KIND_OUTPUT_TYPES.includes(o.type)) continue;
      const p = lookup(map, o.ref);
      if (p && p.kind && !OUTPUT_KINDS.includes(p.kind)) {
        violations.push(`output "${label(p, o.ref)}" is kind "${p.kind}" — outputs must be ${OUTPUT_KINDS.join(' / ')} (or output_type scrap/by_product)`);
      }
    }
    if (primaryRef) {
      const p = lookup(map, primaryRef);
      if (p && p.kind && !OUTPUT_KINDS.includes(p.kind)) {
        violations.push(`primary product "${label(p, primaryRef)}" is kind "${p.kind}" — must be ${OUTPUT_KINDS.join(' / ')}`);
      }
    }
  }
  const status = (data.status != null ? data.status : existing?.status) || 'Draft';
  return { violations, status };
}

/**
 * Validate a mfg-bom create/update. Throws ValidationError to BLOCK only when the
 * resulting BOM is Active; warns otherwise. Never throws for anything else.
 */
async function validateBomWrite(strapi, { action, data, documentId }) {
  if (!data) return;
  let existing = null;
  try {
    const needsExisting = action === 'update'
      && (!('material_lines' in data) || !('outputs' in data) || !('product' in data) || !('status' in data));
    if (needsExisting && documentId) {
      existing = await strapi.db.query(BOM_UID).findOne({
        where: { documentId },
        populate: {
          material_lines: { populate: { material_product: { select: ['id', 'documentId'] } } },
          outputs: { populate: { product: { select: ['id', 'documentId'] } } },
          product: { select: ['id', 'documentId'] },
        },
      });
    }
    const { violations, status } = await collectViolations(strapi, data, existing);
    if (!violations.length) return;
    const msg = `BOM typing — ${violations.join('; ')}`;
    if (status === 'Active') throw new ValidationError(msg);
    strapi.log.warn(`[mfg-bom] ${msg} (status=${status}: allowed, will block when set Active)`);
  } catch (e) {
    if (e instanceof ValidationError) throw e; // intentional block — propagate
    strapi.log.warn(`[mfg-bom] typing validation skipped (error): ${e.message}`);
  }
}

module.exports = { validateBomWrite, BOM_UID };
