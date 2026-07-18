'use strict';

/**
 * Shared config + helpers for the Warehouse → Branch consolidation.
 *
 * The `warehouse` content-type is retired and every relation that targeted it
 * is repointed to `branch` (1 branch = 1 stock location). The data move runs in
 * two phases, sharing this module so the two phases stay in lock-step:
 *
 *   Phase 1  database/migrations/2026.07.17T00.00.00.warehouse-to-branch-merge.js
 *            Runs BEFORE Strapi schema sync (while the *_warehouse_lnk tables and
 *            the warehouses_branch_lnk mapping still exist). Resolves each stock
 *            entity's warehouse link into (entity_id, branch_id) pairs and stashes
 *            them — plus the per-branch warehouse field values — in temp tables.
 *
 *   Phase 2  src/index.js bootstrap()
 *            Runs AFTER sync has created the new *_branch_lnk tables. Writes the
 *            branch relation for each stashed row via the ORM (so Strapi manages
 *            the link tables + their ordering columns correctly), copies the
 *            preserved warehouse fields onto branches, then drops the temp tables.
 *            Guarded by temp-table existence, so it is idempotent and self-clearing.
 */

// The warehouse→branch mapping link table (candidate names; resolved at runtime).
const WAREHOUSE_BRANCH_LNK = ['warehouses_branch_lnk'];

// Persistent forensic table (NOT auto-dropped) listing InStock stock-items that
// had no branch when the redundant warehouse link was dropped — re-place them
// with the backfill (POST /stock-items/backfill-default-locations).
const ORPHAN_TABLE = '_tmp_wh2br_orphan_stock_items';

// Each manyToOne warehouse relation that becomes a branch relation.
//   old  : candidate source link-table names (warehouse side) — read in Phase 1
//   dest : the destination link-table (branch side) — informational; Phase 2
//          writes via the ORM, not by name
//   idCol: the entity's own id column inside the link table
//   uid   / field : used by Phase 2 to set the relation via strapi.db.query
//   temp : temp table holding resolved (entity_id, branch_id) pairs
const ENTITIES = [
  {
    key: 'storage-location',
    old: ['storage_locations_warehouse_lnk'],
    dest: 'storage_locations_branch_lnk',
    idCol: 'storage_location_id',
    uid: 'api::storage-location.storage-location',
    field: 'branch',
    temp: '_tmp_wh2br_storage_locations',
  },
  {
    key: 'stock-level',
    old: ['stock_levels_warehouse_lnk'],
    dest: 'stock_levels_branch_lnk',
    idCol: 'stock_level_id',
    uid: 'api::stock-level.stock-level',
    field: 'branch',
    temp: '_tmp_wh2br_stock_levels',
  },
  {
    key: 'stock-batch',
    old: ['stock_batches_warehouse_lnk'],
    dest: 'stock_batches_branch_lnk',
    idCol: 'stock_batch_id',
    uid: 'api::stock-batch.stock-batch',
    field: 'branch',
    temp: '_tmp_wh2br_stock_batches',
  },
  {
    key: 'stock-count',
    old: ['stock_counts_warehouse_lnk'],
    dest: 'stock_counts_branch_lnk',
    idCol: 'stock_count_id',
    uid: 'api::stock-count.stock-count',
    field: 'branch',
    temp: '_tmp_wh2br_stock_counts',
  },
  {
    key: 'stock-adjustment',
    old: ['stock_adjustments_warehouse_lnk'],
    dest: 'stock_adjustments_branch_lnk',
    idCol: 'stock_adjustment_id',
    uid: 'api::stock-adjustment.stock-adjustment',
    field: 'branch',
    temp: '_tmp_wh2br_stock_adjustments',
  },
  {
    key: 'stock-transfer-from',
    old: ['stock_transfers_from_warehouse_lnk'],
    dest: 'stock_transfers_from_branch_lnk',
    idCol: 'stock_transfer_id',
    uid: 'api::stock-transfer.stock-transfer',
    field: 'from_branch',
    temp: '_tmp_wh2br_stock_transfers_from',
  },
  {
    key: 'stock-transfer-to',
    old: ['stock_transfers_to_warehouse_lnk'],
    dest: 'stock_transfers_to_branch_lnk',
    idCol: 'stock_transfer_id',
    uid: 'api::stock-transfer.stock-transfer',
    field: 'to_branch',
    temp: '_tmp_wh2br_stock_transfers_to',
  },
  {
    key: 'reorder-policy',
    old: ['reorder_policies_warehouse_lnk'],
    dest: 'reorder_policies_branch_lnk',
    idCol: 'reorder_policy_id',
    uid: 'api::reorder-policy.reorder-policy',
    field: 'branch',
    temp: '_tmp_wh2br_reorder_policies',
  },
  {
    key: 'reorder-policy-source',
    old: ['reorder_policies_source_warehouse_lnk'],
    dest: 'reorder_policies_source_branch_lnk',
    idCol: 'reorder_policy_id',
    uid: 'api::reorder-policy.reorder-policy',
    field: 'source_branch',
    temp: '_tmp_wh2br_reorder_policies_source',
  },
];

const BRANCH_FIELDS_TEMP = '_tmp_wh2br_branch_fields';

// First of `candidates` that exists as a table, else null.
async function firstExistingTable(knex, candidates) {
  for (const name of candidates) {
    if (await knex.schema.hasTable(name)) return name;
  }
  return null;
}

// The two FK columns of a Strapi link table (columns ending in `_id`, excluding
// the auto-increment `id` PK). Order not guaranteed — filter by name at call site.
async function linkForeignKeys(knex, table) {
  const info = await knex(table).columnInfo();
  return Object.keys(info).filter((c) => c !== 'id' && /_id$/.test(c));
}

/**
 * Phase 2 — called from src/index.js bootstrap() AFTER Strapi schema sync has
 * created the new *_branch_lnk tables. Reads the temp tables stashed by Phase 1,
 * writes the branch links straight into the link tables (bypassing entity
 * lifecycles for a clean bulk move — same approach as this repo's prior link
 * migration), copies the preserved warehouse fields onto branches, then drops
 * the temp tables. Guarded + idempotent: a no-op once the temps are gone.
 */
async function runPhase2(strapi) {
  const knex = strapi.db.connection;
  const log = strapi.log;

  const anyTemp = await firstExistingTable(knex, [BRANCH_FIELDS_TEMP, ...ENTITIES.map((e) => e.temp)]);
  if (!anyTemp) return; // nothing staged — normal steady state

  log.info('[wh2br] Phase 2: applying warehouse→branch links from temp tables…');

  for (const ent of ENTITIES) {
    if (!(await knex.schema.hasTable(ent.temp))) continue;
    const dest = await firstExistingTable(knex, [ent.dest]);
    if (!dest) {
      log.warn(`[wh2br] Phase 2: destination "${ent.dest}" not found for ${ent.key}; leaving temp for a later boot.`);
      continue;
    }

    const rows = await knex(ent.temp).select('entity_id', 'branch_id');
    if (!rows.length) { await knex.schema.dropTableIfExists(ent.temp); continue; }

    const info = await knex(dest).columnInfo();
    const fks = Object.keys(info).filter((c) => c !== 'id' && /_id$/.test(c));
    const branchCol = fks.find((c) => /branch/.test(c)) || 'branch_id';
    const entityCol = fks.find((c) => c !== branchCol) || ent.idCol;
    const ordCols = Object.keys(info).filter((c) => /_ord$/.test(c));

    // xToOne: an entity appears at most once per link table — skip ones already linked.
    const existing = new Set((await knex(dest).select(entityCol)).map((r) => Number(r[entityCol])));

    let ord = 1;
    const inserts = [];
    for (const r of rows) {
      if (existing.has(Number(r.entity_id))) continue;
      const row = { [entityCol]: r.entity_id, [branchCol]: r.branch_id };
      for (const oc of ordCols) row[oc] = ord;
      ord += 1;
      inserts.push(row);
    }
    for (let i = 0; i < inserts.length; i += 100) {
      await knex(dest).insert(inserts.slice(i, i + 100));
    }
    log.info(`[wh2br] Phase 2: ${ent.key}: linked ${inserts.length} row(s) into "${dest}" (${rows.length - inserts.length} already present).`);
    await knex.schema.dropTableIfExists(ent.temp);
  }

  // Preserved warehouse fields onto branches (columns added by the branch schema edit).
  if (await knex.schema.hasTable(BRANCH_FIELDS_TEMP)) {
    const fieldRows = await knex(BRANCH_FIELDS_TEMP).select();
    for (const f of fieldRows) {
      await knex('branches').where('id', f.branch_id).update({
        location_code: f.location_code ?? null,
        location_type: f.location_type ?? 'warehouse',
        is_default_location: f.is_default_location ? 1 : 0,
        is_active: f.is_active == null ? 1 : f.is_active ? 1 : 0,
      });
    }
    log.info(`[wh2br] Phase 2: applied location fields to ${fieldRows.length} branch(es).`);
    await knex.schema.dropTableIfExists(BRANCH_FIELDS_TEMP);
  }

  log.info('[wh2br] Phase 2 complete.');
}

module.exports = {
  WAREHOUSE_BRANCH_LNK,
  ORPHAN_TABLE,
  ENTITIES,
  BRANCH_FIELDS_TEMP,
  firstExistingTable,
  linkForeignKeys,
  runPhase2,
};
