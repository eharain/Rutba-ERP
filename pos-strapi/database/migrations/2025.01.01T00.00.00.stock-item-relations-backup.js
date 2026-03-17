'use strict';

/**
 * Migration Phase 1 (runs BEFORE Strapi schema sync)
 *
 * Back up old manyToOne/oneToMany link-table rows into temporary tables
 * so the data survives Strapi dropping/recreating the link tables during
 * its own schema sync.
 *
 * Phase 2 lives in src/index.js (bootstrap) which copies the temp data
 * into whichever new link tables Strapi has created, then drops the temps.
 *
 * Relations being migrated:
 *   Old (manyToOne)  stock_items_sale_item_lnk        -> New (manyToMany) stock_items_sale_items_lnk
 *   Old (manyToOne)  stock_items_sale_return_item_lnk -> New (manyToMany) stock_items_sale_return_items_lnk
 */

var RELATIONS = [
  {
    oldTable: 'stock_items_sale_item_lnk',
    newTable: 'stock_items_sale_items_lnk',
    tempTable: '_tmp_stock_items_sale_item_lnk',
    sourceCol: 'stock_item_id',
    targetCol: 'sale_item_id',
  },
  {
    oldTable: 'stock_items_sale_return_item_lnk',
    newTable: 'stock_items_sale_return_items_lnk',
    tempTable: '_tmp_stock_items_sale_return_item_lnk',
    sourceCol: 'stock_item_id',
    targetCol: 'sale_return_item_id',
  },
];

async function up(knex) {
  for (var i = 0; i < RELATIONS.length; i++) {
    await backupToTemp(knex, RELATIONS[i]);
  }
}

async function backupToTemp(knex, opts) {
  var oldTable = opts.oldTable;
  var newTable = opts.newTable;
  var tempTable = opts.tempTable;
  var sourceCol = opts.sourceCol;
  var targetCol = opts.targetCol;

  // Drop any leftover temp table from a previous failed run
  await knex.schema.dropTableIfExists(tempTable);

  // Try old table first, fall back to new table (if Strapi already synced)
  var sourceTable = null;
  var candidates = [oldTable, newTable];
  for (var i = 0; i < candidates.length; i++) {
    var candidate = candidates[i];
    if (await knex.schema.hasTable(candidate)) {
      var count = await knex(candidate).count('* as cnt').first();
      if (count && Number(count.cnt) > 0) {
        sourceTable = candidate;
        break;
      }
    }
  }

  if (!sourceTable) {
    console.log('[migration-up] Neither "' + oldTable + '" nor "' + newTable + '" has data - nothing to back up.');
    return;
  }

  var rows = await knex(sourceTable).select(sourceCol, targetCol);
  if (!rows.length) {
    console.log('[migration-up] "' + sourceTable + '" is empty - skipping.');
    return;
  }

  console.log('[migration-up] Backing up ' + rows.length + ' row(s) from "' + sourceTable + '" to "' + tempTable + '".');

  await knex.schema.createTable(tempTable, function (t) {
    t.integer(sourceCol).unsigned().notNullable();
    t.integer(targetCol).unsigned().notNullable();
  });

  var BATCH = 100;
  for (var j = 0; j < rows.length; j += BATCH) {
    var batch = rows.slice(j, j + BATCH).map(function (r) {
      var row = {};
      row[sourceCol] = r[sourceCol];
      row[targetCol] = r[targetCol];
      return row;
    });
    await knex(tempTable).insert(batch);
  }

  console.log('[migration-up] Backup complete for "' + tempTable + '".');
}

async function down(knex) {
  for (var i = 0; i < RELATIONS.length; i++) {
    await knex.schema.dropTableIfExists(RELATIONS[i].tempTable);
  }
  console.log('[migration-down] Temp tables dropped (if they existed).');
}

module.exports = { up: up, down: down };
