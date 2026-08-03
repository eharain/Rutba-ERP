'use strict';

/**
 * Builds the model registry: every schema.json compiled into table names,
 * column lists, relation join tables, and component-assignment tables,
 * following Strapi 5 conventions (see naming.js).
 *
 * The registry is the foundation both for the schema validator and for the
 * documents() shim's query building.
 */

const { loadAllSchemas } = require('./loader');
const {
  snakeCase,
  joinTableName,
  componentJoinTableName,
  isOverLength,
} = require('./naming');

const SCALAR_TYPES = new Set([
  'string', 'text', 'richtext', 'blocks', 'email', 'password', 'uid',
  'integer', 'biginteger', 'decimal', 'float', 'boolean',
  'date', 'datetime', 'time', 'timestamp', 'json', 'enumeration',
]);

// Standard columns Strapi 5 adds to every entity (collection/single type) table.
const ENTITY_STANDARD_COLUMNS = [
  'id', 'document_id', 'created_at', 'updated_at', 'published_at',
  'created_by_id', 'updated_by_id', 'locale',
];

function compileModel(uid, source, schema) {
  const model = {
    uid,
    source,
    kind: schema.kind || 'component',
    isComponent: source === 'component',
    singularName: schema.info ? schema.info.singularName : null,
    tableName: schema.collectionName,
    draftAndPublish: Boolean(schema.options && schema.options.draftAndPublish),
    scalars: [],       // { attr, column, type }
    relations: [],     // { attr, relation, target, mappedBy, inversedBy, owner }
    media: [],         // { attr, multiple }
    components: [],    // { attr, component, repeatable }
    columns: [],       // derived full column list for the entity table
  };

  for (const [attr, def] of Object.entries(schema.attributes || {})) {
    const isPrivate = Boolean(def.private);
    if (def.type === 'relation') {
      model.relations.push({
        attr,
        relation: def.relation,
        target: def.target,
        mappedBy: def.mappedBy || null,
        inversedBy: def.inversedBy || null,
        owner: !def.mappedBy,
        private: isPrivate,
      });
    } else if (def.type === 'media') {
      model.media.push({ attr, multiple: Boolean(def.multiple), private: isPrivate });
    } else if (def.type === 'component') {
      model.components.push({
        attr,
        component: def.component,
        repeatable: Boolean(def.repeatable),
        private: isPrivate,
      });
    } else if (def.type === 'dynamiczone') {
      throw new Error(`${uid}: dynamiczone is not supported (none expected in this schema)`);
    } else if (SCALAR_TYPES.has(def.type)) {
      model.scalars.push({ attr, column: snakeCase(attr), type: def.type, private: isPrivate });
    } else {
      throw new Error(`${uid}: unknown attribute type "${def.type}" on "${attr}"`);
    }
  }

  if (model.isComponent) {
    // Component tables: id + scalar columns (no document/audit columns).
    model.columns = ['id', ...model.scalars.map((s) => s.column)];
  } else {
    model.columns = [
      'id', 'document_id',
      ...model.scalars.map((s) => s.column),
      ...ENTITY_STANDARD_COLUMNS.slice(2),
    ];
  }
  return model;
}

function buildRegistry() {
  const { contentTypes, components, builtins } = loadAllSchemas();
  const models = new Map();

  for (const { uid, source, schema, modelName, partial } of [...contentTypes, ...components]) {
    if (!schema.collectionName) {
      throw new Error(`${uid}: schema has no collectionName`);
    }
    const model = compileModel(uid, source, schema);
    if (!model.singularName) model.singularName = modelName;
    if (partial) model.partial = true;
    if (schema.info && schema.info.pluralName) model.pluralName = schema.info.pluralName;
    models.set(uid, model);
  }
  for (const [uid, def] of Object.entries(builtins)) {
    if (models.has(uid)) continue; // a loaded (extension) model wins over the stub
    models.set(uid, {
      uid,
      source: 'builtin',
      kind: 'collectionType',
      isComponent: false,
      singularName: def.singularName,
      tableName: def.tableName,
      builtin: true,
      scalars: [], relations: [], media: [], components: [], columns: [],
    });
  }

  // Relation join tables (owned side only) + component join tables.
  const joinTables = [];
  const componentJoins = [];
  const warnings = [];

  for (const model of models.values()) {
    if (model.builtin) continue;
    for (const rel of model.relations) {
      if (!rel.owner) continue;
      const target = models.get(rel.target);
      if (!target) {
        warnings.push(`${model.uid}: relation "${rel.attr}" targets unknown model ${rel.target}`);
        continue;
      }
      const table = joinTableName(model.tableName, rel.attr);
      if (isOverLength(table)) {
        warnings.push(`join table over identifier limit (Strapi shortened it): ${table}`);
      }
      // Link-table column layout (validated against the live DB):
      //   id, {source_singular}_id, {target_singular}_id  (inv_ prefix on self-relations)
      //   + order columns only where an ordered list side exists:
      //     manyToMany owner list  → {target_singular}_ord
      //     inverse list (bidirectional manyToMany / manyToOne↔oneToMany) → {source_singular}_ord
      const sourceCol = `${snakeCase(model.singularName)}_id`;
      let targetCol = `${snakeCase(target.singularName)}_id`;
      if (targetCol === sourceCol) targetCol = `inv_${targetCol}`;
      const columns = ['id', sourceCol, targetCol];
      if (rel.relation === 'manyToMany') {
        columns.push(`${snakeCase(target.singularName)}_ord`);
        if (rel.inversedBy) columns.push(`${snakeCase(model.singularName)}_ord`);
      } else if (rel.relation === 'oneToMany') {
        columns.push(`${snakeCase(target.singularName)}_ord`);
      } else if (rel.relation === 'manyToOne' && rel.inversedBy) {
        columns.push(`${snakeCase(model.singularName)}_ord`);
      }
      joinTables.push({
        table,
        ownerUid: model.uid,
        attr: rel.attr,
        relation: rel.relation,
        targetUid: rel.target,
        sourceColumn: sourceCol,
        targetColumn: targetCol,
        columns,
      });
    }
    if (model.components.length > 0) {
      componentJoins.push({
        table: componentJoinTableName(model.tableName),
        ownerUid: model.uid,
      });
    }
  }

  const joinTablesByOwner = new Map(
    joinTables.map((jt) => [`${jt.ownerUid}.${jt.attr}`, jt])
  );

  return { models, joinTables, joinTablesByOwner, componentJoins, warnings };
}

module.exports = { buildRegistry, ENTITY_STANDARD_COLUMNS };
