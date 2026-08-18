#!/usr/bin/env node
'use strict';

/**
 * Schema validator: derives the full table/column layout from schema.json
 * files (src/schema/registry.js) and diffs it against the live database's
 * information_schema.
 *
 * This is the correctness gate for services/core's naming rules — the documents()
 * shim is only trustworthy while this report is clean.
 *
 * Usage:  npm run validate-schema --workspace=services/core
 * Output: console summary + services/core/.tmp/schema-validation.json
 */

const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../src/db/connection');
const { buildRegistry } = require('../src/schema/registry');

// Live tables owned by Strapi core / plugins that services/core doesn't derive.
const PLATFORM_TABLE_PATTERNS = [
  /^strapi_/, /^admin_/, /^up_/, /^i18n_/,
  /^files$/, /^files_/, /^upload_folders/,
];

async function fetchLiveSchema(db, database) {
  const tables = await db('information_schema.tables')
    .where({ table_schema: database })
    .select('TABLE_NAME as name');
  const columns = await db('information_schema.columns')
    .where({ table_schema: database })
    .select('TABLE_NAME as table', 'COLUMN_NAME as column')
    .orderBy(['TABLE_NAME', 'ORDINAL_POSITION']);
  const byTable = new Map();
  for (const t of tables) byTable.set(t.name, []);
  for (const c of columns) {
    if (byTable.has(c.table)) byTable.get(c.table).push(c.column);
  }
  return byTable;
}

async function main() {
  const db = getDb();
  const database = db.client.config.connection.database;
  console.log(`[validate-schema] database: ${database}`);

  const live = await fetchLiveSchema(db, database);
  console.log(`[validate-schema] live tables: ${live.size}`);

  const { models, joinTables, componentJoins, warnings } = buildRegistry();
  const derived = [...models.values()].filter((m) => !m.builtin);
  console.log(
    `[validate-schema] derived models: ${derived.length} ` +
    `(+${joinTables.length} join tables, +${componentJoins.length} cmps tables)`
  );

  const report = {
    database,
    missingTables: [],        // derived but not in DB
    columnDiffs: [],          // { table, missing: [...], extra: [...] }
    missingJoinTables: [],
    missingCmpsTables: [],
    unaccountedLiveTables: [],
    linkTableSamples: {},     // actual columns of _lnk tables, for rule derivation
    cmpsTableSamples: {},
    warnings,
  };

  const accounted = new Set();

  for (const model of derived) {
    const liveCols = live.get(model.tableName);
    if (!liveCols) {
      report.missingTables.push(`${model.tableName}  (${model.uid})`);
      continue;
    }
    accounted.add(model.tableName);
    const liveSet = new Set(liveCols);
    const derivedSet = new Set(model.columns);
    const missing = model.columns.filter((c) => !liveSet.has(c));
    // Partial models (e.g. the UP user extension) knowingly omit base/private
    // columns — only missing columns count against them.
    const extra = model.partial ? [] : liveCols.filter((c) => !derivedSet.has(c));
    if (missing.length || extra.length) {
      report.columnDiffs.push({ table: model.tableName, uid: model.uid, missing, extra });
    }
  }

  for (const jt of joinTables) {
    if (!live.has(jt.table)) {
      report.missingJoinTables.push(`${jt.table}  (${jt.ownerUid}.${jt.attr} → ${jt.targetUid})`);
      continue;
    }
    accounted.add(jt.table);
    const liveCols = live.get(jt.table);
    const liveSet = new Set(liveCols);
    const derivedSet = new Set(jt.columns);
    const missing = jt.columns.filter((c) => !liveSet.has(c));
    const extra = liveCols.filter((c) => !derivedSet.has(c));
    if (missing.length || extra.length) {
      report.columnDiffs.push({
        table: jt.table, uid: `${jt.ownerUid}.${jt.attr} [${jt.relation}]`, missing, extra,
      });
    }
  }
  for (const cj of componentJoins) {
    if (live.has(cj.table)) accounted.add(cj.table);
    else report.missingCmpsTables.push(`${cj.table}  (${cj.ownerUid})`);
  }

  for (const [table, cols] of live) {
    if (accounted.has(table)) continue;
    if (PLATFORM_TABLE_PATTERNS.some((re) => re.test(table))) continue;
    report.unaccountedLiveTables.push({ table, columns: cols });
  }

  // Capture actual link/cmps table layouts to drive join-column rules.
  let lnkSamples = 0;
  for (const jt of joinTables) {
    if (live.has(jt.table) && lnkSamples < 12) {
      report.linkTableSamples[`${jt.table} [${jt.relation}]`] = live.get(jt.table);
      lnkSamples++;
    }
  }
  let cmpsSamples = 0;
  for (const cj of componentJoins) {
    if (live.has(cj.table) && cmpsSamples < 4) {
      report.cmpsTableSamples[cj.table] = live.get(cj.table);
      cmpsSamples++;
    }
  }

  const tmpDir = path.join(__dirname, '..', '.tmp');
  fs.mkdirSync(tmpDir, { recursive: true });
  const reportFile = path.join(tmpDir, 'schema-validation.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  const counts = {
    missingTables: report.missingTables.length,
    tablesWithColumnDiffs: report.columnDiffs.length,
    missingJoinTables: report.missingJoinTables.length,
    missingCmpsTables: report.missingCmpsTables.length,
    unaccountedLiveTables: report.unaccountedLiveTables.length,
    warnings: warnings.length,
  };
  console.log('[validate-schema] result:', JSON.stringify(counts, null, 2));
  for (const key of ['missingTables', 'missingJoinTables', 'missingCmpsTables']) {
    for (const line of report[key].slice(0, 10)) console.log(`  ${key}: ${line}`);
    if (report[key].length > 10) console.log(`  ...and ${report[key].length - 10} more (see report)`);
  }
  for (const d of report.columnDiffs.slice(0, 10)) {
    console.log(`  columnDiff ${d.table}: missing=[${d.missing}] extra=[${d.extra}]`);
  }
  if (report.columnDiffs.length > 10) {
    console.log(`  ...and ${report.columnDiffs.length - 10} more column diffs (see report)`);
  }
  console.log(`[validate-schema] full report: ${reportFile}`);

  await closeDb();
  const clean =
    !counts.missingTables && !counts.tablesWithColumnDiffs &&
    !counts.missingJoinTables && !counts.missingCmpsTables;
  process.exit(clean ? 0 : 1);
}

main().catch(async (err) => {
  console.error('[validate-schema] failed:', err.message);
  await closeDb();
  process.exit(2);
});
