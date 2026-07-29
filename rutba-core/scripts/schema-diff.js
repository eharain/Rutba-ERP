#!/usr/bin/env node
'use strict';

/**
 * schema:diff — generate a PROPOSED knex migration from the gap between the
 * schema.json-derived layout (src/schema/registry.js) and the live database.
 *
 * This is Strapi's auto-sync convenience MINUS the silent execution: where
 * Strapi diffs desired-vs-live DDL at boot and applies it immediately
 * (including destructive drops), this tool emits a migration DRAFT for review.
 * It is the Phase-2/3 schema-maintenance mechanism from the program docs: once
 * a module is served by rutba-core, its schema changes ship as one commit —
 * schema.json edit + the generated (reviewed) migration.
 *
 *   node scripts/schema-diff.js [--filter <substr>] [--name <slug>] [--print]
 *
 *   --filter  only consider derived tables whose uid/table matches (use for
 *             per-module baselines, e.g. --filter mfg-)
 *   --name    migration slug (default schema_sync)
 *   --print   print the migration to stdout instead of writing a file
 *
 * Output: rutba-core/migrations/<utc-ts>_<name>.js. Additive changes are
 * active; DESTRUCTIVE statements (drop column/table for extras) are emitted
 * COMMENTED OUT — un-commenting them is an explicit reviewer decision.
 * A clean diff writes nothing and exits 0.
 */

const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../src/db/connection');
const { buildRegistry } = require('../src/schema/registry');

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const FILTER = argValue('--filter');
const NAME = (argValue('--name') || 'schema_sync').replace(/[^a-z0-9_-]/gi, '_');
const PRINT = args.includes('--print');

// schema.json scalar type → knex column builder call (MySQL dialect, matching
// what Strapi 5 creates).
function columnBuilder(col, type) {
  switch (type) {
    case 'string': case 'email': case 'password': case 'uid': case 'enumeration':
      return `t.string('${col}')`;
    case 'text': case 'richtext': case 'blocks':
      return `t.text('${col}', 'longtext')`;
    case 'integer': return `t.integer('${col}')`;
    case 'biginteger': return `t.bigInteger('${col}')`;
    case 'float': return `t.double('${col}')`;
    case 'decimal': return `t.decimal('${col}', 10, 2)`;
    case 'boolean': return `t.boolean('${col}')`;
    case 'date': return `t.date('${col}')`;
    case 'datetime': return `t.datetime('${col}', { precision: 6 })`;
    case 'time': return `t.time('${col}', { precision: 3 })`;
    case 'timestamp': return `t.timestamp('${col}', { precision: 6 })`;
    case 'json': return `t.json('${col}')`;
    default: return `t.string('${col}') /* TODO review: unmapped type "${type}" */`;
  }
}

function entityTableLines(model) {
  const lines = [
    `t.increments('id');`,
    `t.string('document_id');`,
  ];
  for (const s of model.scalars) lines.push(`${columnBuilder(s.column, s.type)};`);
  lines.push(
    `t.datetime('created_at', { precision: 6 });`,
    `t.datetime('updated_at', { precision: 6 });`,
    `t.datetime('published_at', { precision: 6 });`,
    `t.integer('created_by_id').unsigned().references('id').inTable('admin_users').onDelete('SET NULL');`,
    `t.integer('updated_by_id').unsigned().references('id').inTable('admin_users').onDelete('SET NULL');`,
    `t.string('locale');`,
    `t.index(['document_id'], '${model.tableName}_documents_idx');`
  );
  return lines;
}

function componentTableLines(model) {
  const lines = [`t.increments('id');`];
  for (const s of model.scalars) lines.push(`${columnBuilder(s.column, s.type)};`);
  return lines;
}

function joinTableLines(jt, ownerTable, targetTable) {
  const lines = [`t.increments('id');`];
  for (const col of jt.columns) {
    if (col === 'id') continue;
    if (col === jt.sourceColumn) {
      lines.push(`t.integer('${col}').unsigned().references('id').inTable('${ownerTable}').onDelete('CASCADE');`);
    } else if (col === jt.targetColumn) {
      lines.push(`t.integer('${col}').unsigned().references('id').inTable('${targetTable}').onDelete('CASCADE');`);
    } else if (/_ord$/.test(col)) {
      lines.push(`t.double('${col}').unsigned();`);
    } else {
      lines.push(`t.string('${col}') /* TODO review: unexpected link column */;`);
    }
  }
  lines.push(
    `t.unique(['${jt.sourceColumn}', '${jt.targetColumn}'], { indexName: '${jt.table}_unique' });`,
    `t.index(['${jt.sourceColumn}'], '${jt.table}_fk');`,
    `t.index(['${jt.targetColumn}'], '${jt.table}_ifk');`
  );
  return lines;
}

function cmpsTableLines(ownerTable, table) {
  return [
    `t.increments('id');`,
    `t.integer('entity_id').unsigned().references('id').inTable('${ownerTable}').onDelete('CASCADE');`,
    `t.integer('cmp_id').unsigned();`,
    `t.string('component_type');`,
    `t.string('field');`,
    `t.double('order').unsigned();`,
    `t.index(['entity_id'], '${table}_entity_fk');`,
    `t.unique(['entity_id', 'cmp_id', 'field', 'component_type'], { indexName: '${table}_unique' });`,
  ];
}

function block(indent, lines) {
  return lines.map((l) => `${indent}${l}`).join('\n');
}

async function main() {
  const db = getDb();
  const database = db.client.config.connection.database;
  console.log(`[schema-diff] database: ${database}${FILTER ? ` (filter: ${FILTER})` : ''}`);

  const tables = await db('information_schema.tables')
    .where({ table_schema: database }).select('TABLE_NAME as name');
  const columns = await db('information_schema.columns')
    .where({ table_schema: database })
    .select('TABLE_NAME as table', 'COLUMN_NAME as column')
    .orderBy(['TABLE_NAME', 'ORDINAL_POSITION']);
  const live = new Map();
  for (const t of tables) live.set(t.name, []);
  for (const c of columns) if (live.has(c.table)) live.get(c.table).push(c.column);

  const { models, joinTables, componentJoins } = buildRegistry();
  const derived = [...models.values()].filter((m) => !m.builtin && !m.partial);
  const matches = (uid, table) => !FILTER || String(uid).includes(FILTER) || String(table).includes(FILTER);

  const up = [];
  const down = [];
  const destructive = [];

  for (const model of derived) {
    if (!matches(model.uid, model.tableName)) continue;
    const liveCols = live.get(model.tableName);
    const lines = model.isComponent ? componentTableLines(model) : entityTableLines(model);
    if (!liveCols) {
      up.push(
        `  // ${model.uid}\n` +
        `  await knex.schema.createTable('${model.tableName}', (t) => {\n${block('    ', lines)}\n  });`
      );
      down.unshift(`  await knex.schema.dropTableIfExists('${model.tableName}');`);
      continue;
    }
    const liveSet = new Set(liveCols);
    const missing = model.scalars.filter((s) => !liveSet.has(s.column));
    if (missing.length) {
      up.push(
        `  // ${model.uid}: add ${missing.map((s) => s.column).join(', ')}\n` +
        `  await knex.schema.alterTable('${model.tableName}', (t) => {\n` +
        block('    ', missing.map((s) => `${columnBuilder(s.column, s.type)};`)) + `\n  });`
      );
      down.unshift(
        `  await knex.schema.alterTable('${model.tableName}', (t) => {\n` +
        block('    ', missing.map((s) => `t.dropColumn('${s.column}');`)) + `\n  });`
      );
    }
    if (!model.isComponent) {
      const derivedSet = new Set(model.columns);
      const extra = liveCols.filter((c) => !derivedSet.has(c));
      for (const col of extra) {
        destructive.push(`  // await knex.schema.alterTable('${model.tableName}', (t) => t.dropColumn('${col}')); // live column not in schema.json`);
      }
    }
  }

  for (const jt of joinTables) {
    if (!matches(jt.ownerUid, jt.table)) continue;
    if (live.has(jt.table)) continue;
    const owner = [...models.values()].find((m) => m.uid === jt.ownerUid);
    const target = [...models.values()].find((m) => m.uid === jt.targetUid);
    if (!owner || !target) continue;
    up.push(
      `  // ${jt.ownerUid}.${jt.attr} → ${jt.targetUid} [${jt.relation}]\n` +
      `  await knex.schema.createTable('${jt.table}', (t) => {\n` +
      block('    ', joinTableLines(jt, owner.tableName, target.tableName)) + `\n  });`
    );
    down.unshift(`  await knex.schema.dropTableIfExists('${jt.table}');`);
  }

  for (const cj of componentJoins) {
    if (!matches(cj.ownerUid, cj.table)) continue;
    if (live.has(cj.table)) continue;
    const owner = [...models.values()].find((m) => m.uid === cj.ownerUid);
    if (!owner) continue;
    up.push(
      `  // ${cj.ownerUid} components\n` +
      `  await knex.schema.createTable('${cj.table}', (t) => {\n` +
      block('    ', cmpsTableLines(owner.tableName, cj.table)) + `\n  });`
    );
    down.unshift(`  await knex.schema.dropTableIfExists('${cj.table}');`);
  }

  await closeDb();

  if (!up.length && !destructive.length) {
    console.log('[schema-diff] clean — nothing to generate');
    process.exit(0);
  }

  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const header =
    `'use strict';\n\n` +
    `/**\n` +
    ` * GENERATED DRAFT (schema-diff.js) — REVIEW BEFORE APPLYING.\n` +
    ` * Derived from schema.json vs live \`${database}\` on ${new Date().toISOString()}.\n` +
    ` * Additive changes are active. Destructive statements are commented out —\n` +
    ` * un-commenting one is an explicit reviewer decision.\n` +
    ` */\n\n`;
  const src =
    header +
    `exports.up = async function up(knex) {\n${up.join('\n\n')}\n` +
    (destructive.length ? `\n  // ── DESTRUCTIVE (commented out) ──\n${destructive.join('\n')}\n` : '') +
    `};\n\n` +
    `exports.down = async function down(knex) {\n${down.join('\n')}\n};\n`;

  if (PRINT) {
    console.log(src);
  } else {
    const dir = path.join(__dirname, '..', 'migrations');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${ts}_${NAME}.js`);
    fs.writeFileSync(file, src);
    console.log(`[schema-diff] wrote ${file} (${up.length} up step(s), ${destructive.length} destructive suggestion(s))`);
  }
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[schema-diff] failed:', err.stack);
  await closeDb();
  process.exit(2);
});
