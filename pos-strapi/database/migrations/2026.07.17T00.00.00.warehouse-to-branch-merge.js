'use strict';

/**
 * Warehouse → Branch consolidation — Phase 1 (runs BEFORE Strapi schema sync).
 *
 * See src/utils/warehouse-branch-migration.js for the shared config + the full
 * two-phase description. This phase only reads the soon-to-be-dropped warehouse
 * link tables and stashes resolved (entity_id, branch_id) pairs — plus the
 * per-branch warehouse field values — into temp tables. Phase 2 (src/index.js
 * bootstrap) does the actual writes once sync has created the branch link tables.
 *
 * Safe to re-run: every temp table is dropped-if-exists before it is rebuilt.
 */

const path = require('path');
const {
  WAREHOUSE_BRANCH_LNK,
  ORPHAN_TABLE,
  ENTITIES,
  BRANCH_FIELDS_TEMP,
  firstExistingTable,
  linkForeignKeys,
} = require(path.join(__dirname, '..', '..', 'src', 'utils', 'warehouse-branch-migration'));

async function up(knex) {
  // 1. Build warehouse_id -> branch_id from the mapping link table.
  const mapTable = await firstExistingTable(knex, WAREHOUSE_BRANCH_LNK);
  if (!mapTable) {
    console.log('[wh2br] No warehouses_branch_lnk table found — nothing to migrate (fresh DB or already merged).');
    return;
  }
  const mapFks = await linkForeignKeys(knex, mapTable);
  const whCol = mapFks.find((c) => /warehouse/.test(c)) || 'warehouse_id';
  const brCol = mapFks.find((c) => /branch/.test(c)) || 'branch_id';
  const mapRows = await knex(mapTable).select(whCol, brCol);
  const wh2br = new Map();
  for (const r of mapRows) wh2br.set(Number(r[whCol]), Number(r[brCol]));
  console.log(`[wh2br] Loaded ${wh2br.size} warehouse→branch mapping(s) from "${mapTable}".`);

  // 2. Preserve per-branch warehouse fields (code/type/default/active).
  //    One warehouse per branch under the new 1:1 rule — prefer is_default=1,
  //    else the lowest warehouse id. Log branches that had several warehouses.
  await knex.schema.dropTableIfExists(BRANCH_FIELDS_TEMP);
  if (await knex.schema.hasTable('warehouses')) {
    const whInfo = await knex('warehouses').columnInfo();
    const cols = ['id'];
    for (const c of ['code', 'type', 'is_default', 'is_active']) if (whInfo[c]) cols.push(c);
    const warehouses = await knex('warehouses').select(cols);

    const byBranch = new Map(); // branchId -> chosen warehouse row
    const multi = new Set();
    for (const w of warehouses) {
      const branchId = wh2br.get(Number(w.id));
      if (!branchId) continue; // branchless warehouse — its stock rows resolve below (skipped)
      const existing = byBranch.get(branchId);
      if (existing) multi.add(branchId);
      const better = !existing
        || (Number(w.is_default) === 1 && Number(existing.is_default) !== 1)
        || (Number(w.is_default) === Number(existing.is_default) && Number(w.id) < Number(existing.id));
      if (better) byBranch.set(branchId, w);
    }
    if (multi.size) {
      console.warn(`[wh2br] ${multi.size} branch(es) had multiple warehouses; collapsed to the default/lowest-id one under the 1:1 rule. Branch ids: ${[...multi].join(', ')}`);
    }
    const branchless = warehouses.filter((w) => !wh2br.get(Number(w.id))).map((w) => w.id);
    if (branchless.length) {
      console.warn(`[wh2br] ${branchless.length} warehouse(s) had no branch; their stock rows will be left unlinked. Warehouse ids: ${branchless.join(', ')}`);
    }

    await knex.schema.createTable(BRANCH_FIELDS_TEMP, (t) => {
      t.integer('branch_id').unsigned().notNullable();
      t.string('location_code');
      t.string('location_type');
      t.boolean('is_default_location');
      t.boolean('is_active');
    });
    const fieldRows = [...byBranch.entries()].map(([branchId, w]) => ({
      branch_id: branchId,
      location_code: w.code ?? null,
      location_type: w.type ?? 'warehouse',
      is_default_location: w.is_default != null ? Number(w.is_default) === 1 : false,
      is_active: w.is_active != null ? Number(w.is_active) === 1 : true,
    }));
    for (let i = 0; i < fieldRows.length; i += 100) {
      await knex(BRANCH_FIELDS_TEMP).insert(fieldRows.slice(i, i + 100));
    }
    console.log(`[wh2br] Stashed location fields for ${fieldRows.length} branch(es).`);
  }

  // 3. Resolve each stock entity's warehouse link into (entity_id, branch_id).
  for (const ent of ENTITIES) {
    await knex.schema.dropTableIfExists(ent.temp);
    const oldTable = await firstExistingTable(knex, ent.old);
    if (!oldTable) {
      console.log(`[wh2br] ${ent.key}: no source link table (${ent.old.join(', ')}) — skipping.`);
      continue;
    }
    const fks = await linkForeignKeys(knex, oldTable);
    const idCol = fks.includes(ent.idCol) ? ent.idCol : fks.find((c) => c !== 'warehouse_id' && !/warehouse/.test(c)) || ent.idCol;
    const whCol2 = fks.find((c) => /warehouse/.test(c)) || 'warehouse_id';
    const rows = await knex(oldTable).select(idCol, whCol2);

    await knex.schema.createTable(ent.temp, (t) => {
      t.integer('entity_id').unsigned().notNullable();
      t.integer('branch_id').unsigned().notNullable();
    });
    const resolved = [];
    let unmapped = 0;
    for (const r of rows) {
      const branchId = wh2br.get(Number(r[whCol2]));
      if (!branchId) { unmapped++; continue; }
      resolved.push({ entity_id: Number(r[idCol]), branch_id: branchId });
    }
    for (let i = 0; i < resolved.length; i += 100) {
      await knex(ent.temp).insert(resolved.slice(i, i + 100));
    }
    console.log(`[wh2br] ${ent.key}: stashed ${resolved.length} row(s)${unmapped ? `, ${unmapped} unmapped (branchless warehouse)` : ''}.`);
  }

  // 4. Forensics: record InStock stock-items with no branch link (redundant
  //    warehouse link is about to be dropped; branch is the source of truth).
  await knex.schema.dropTableIfExists(ORPHAN_TABLE);
  const branchLnk = await firstExistingTable(knex, ['stock_items_branch_lnk']);
  if (await knex.schema.hasTable('stock_items') && branchLnk) {
    const linkedFks = await linkForeignKeys(knex, branchLnk);
    const siCol = linkedFks.find((c) => /stock_item/.test(c)) || 'stock_item_id';
    const orphans = await knex('stock_items as si')
      .leftJoin(`${branchLnk} as bl`, `bl.${siCol}`, 'si.id')
      .where('si.status', 'InStock')
      .whereNull(`bl.${siCol}`)
      .select('si.id');
    if (orphans.length) {
      await knex.schema.createTable(ORPHAN_TABLE, (t) => t.integer('stock_item_id').unsigned().notNullable());
      for (let i = 0; i < orphans.length; i += 100) {
        await knex(ORPHAN_TABLE).insert(orphans.slice(i, i + 100).map((o) => ({ stock_item_id: o.id })));
      }
      console.warn(`[wh2br] WARNING: ${orphans.length} InStock stock-item(s) have no branch. They will be location-less after the warehouse link is dropped — re-place them via POST /stock-items/backfill-default-locations. Ids recorded in ${ORPHAN_TABLE}.`);
    } else {
      console.log('[wh2br] Coverage OK: every InStock stock-item has a branch.');
    }
  }
}

async function down(knex) {
  for (const ent of ENTITIES) await knex.schema.dropTableIfExists(ent.temp);
  await knex.schema.dropTableIfExists(BRANCH_FIELDS_TEMP);
  // ORPHAN_TABLE is intentionally left for inspection.
  console.log('[wh2br] Phase-1 temp tables dropped (orphan table kept).');
}

module.exports = { up, down };
