'use strict';

/**
 * Query-building primitives for the documents() shim: filter operators and
 * relation-edge resolution over the link tables derived by the registry.
 *
 * Filter dialect implements the operator subset used across the codebase
 * (see docs/todo/core-server-multitenancy-program/01-contracts-freeze.md).
 */

const { snakeCase } = require('../schema/naming');

const OPERATORS = new Set([
  '$eq', '$eqi', '$ne', '$nei', '$in', '$notIn', '$null', '$notNull',
  '$contains', '$notContains', '$containsi', '$notContainsi',
  '$startsWith', '$endsWith',
  '$gt', '$gte', '$lt', '$lte', '$between',
  '$and', '$or', '$not',
]);

function applyOperator(qb, column, op, value) {
  switch (op) {
    // MySQL default collation is case-insensitive, so $eqi/$nei coincide with
    // $eq/$ne here — same note as $contains/$containsi below.
    case '$eq':
    case '$eqi':
      return value === null ? qb.whereNull(column) : qb.where(column, value);
    case '$ne':
    case '$nei':
      return value === null ? qb.whereNotNull(column) : qb.whereNot(column, value);
    case '$in': return qb.whereIn(column, value);
    case '$notIn': return qb.whereNotIn(column, value);
    case '$null': return value === false ? qb.whereNotNull(column) : qb.whereNull(column);
    case '$notNull': return value === false ? qb.whereNull(column) : qb.whereNotNull(column);
    // MySQL default collation is case-insensitive, so $contains/$containsi
    // coincide here; revisit if a case-sensitive collation is introduced.
    case '$contains':
    case '$containsi':
      return qb.where(column, 'like', `%${value}%`);
    case '$notContains':
    case '$notContainsi':
      return qb.whereNot(column, 'like', `%${value}%`);
    case '$startsWith': return qb.where(column, 'like', `${value}%`);
    case '$endsWith': return qb.where(column, 'like', `%${value}`);
    case '$gt': return qb.where(column, '>', value);
    case '$gte': return qb.where(column, '>=', value);
    case '$lt': return qb.where(column, '<', value);
    case '$lte': return qb.where(column, '<=', value);
    case '$between': return qb.whereBetween(column, value);
    default:
      throw new Error(`Unsupported filter operator: ${op}`);
  }
}

/**
 * Resolve how to traverse from `model` through relation attribute `rel`:
 * which link table, which column holds this model's id, which holds the
 * target's, and the order column (if the list side is ordered).
 */
function resolveEdge(registry, model, rel) {
  const target = registry.models.get(rel.target);
  if (rel.owner) {
    const jt = registry.joinTablesByOwner.get(`${model.uid}.${rel.attr}`);
    return {
      target,
      table: jt.table,
      thisColumn: jt.sourceColumn,
      otherColumn: jt.targetColumn,
      orderColumn: jt.columns.find((c) => c === `${snakeCase(target.singularName)}_ord`) || null,
    };
  }
  // Inverse side: the owning attribute lives on the target model (mappedBy).
  const owningJt = registry.joinTablesByOwner.get(`${rel.target}.${rel.mappedBy}`);
  if (!owningJt) {
    throw new Error(`${model.uid}.${rel.attr}: cannot resolve owning side ${rel.target}.${rel.mappedBy}`);
  }
  return {
    target,
    table: owningJt.table,
    thisColumn: owningJt.targetColumn,
    otherColumn: owningJt.sourceColumn,
    orderColumn: owningJt.columns.find((c) => c === `${snakeCase(target.singularName)}_ord`) || null,
  };
}

/**
 * Apply a Strapi-style filters object onto a knex query builder for `model`,
 * with `alias` as the current table alias. Relation filters become
 * EXISTS-subqueries traversing the link tables.
 */
function applyFilters(db, registry, qb, model, filters, alias) {
  if (!filters) return;
  for (const [key, value] of Object.entries(filters)) {
    if (key === '$and') {
      for (const sub of value) {
        qb.where(function () { applyFilters(db, registry, this, model, sub, alias); });
      }
    } else if (key === '$or') {
      qb.where(function () {
        for (const sub of value) {
          this.orWhere(function () { applyFilters(db, registry, this, model, sub, alias); });
        }
      });
    } else if (key === '$not') {
      qb.whereNot(function () { applyFilters(db, registry, this, model, value, alias); });
    } else {
      applyAttributeFilter(db, registry, qb, model, key, value, alias);
    }
  }
}

function scalarColumn(model, attr) {
  if (attr === 'id') return 'id';
  if (attr === 'documentId') return 'document_id';
  if (attr === 'createdAt') return 'created_at';
  if (attr === 'updatedAt') return 'updated_at';
  if (attr === 'publishedAt') return 'published_at';
  if (attr === 'locale') return 'locale';
  const scalar = model.scalars.find((s) => s.attr === attr);
  return scalar ? scalar.column : null;
}

function applyAttributeFilter(db, registry, qb, model, attr, value, alias) {
  // Strapi built-in admin-relation filters ({createdBy: {id: X}}) hit the
  // *_by_id columns directly.
  if (attr === 'createdBy' || attr === 'updatedBy') {
    const col = `${alias}.${attr === 'createdBy' ? 'created_by_id' : 'updated_by_id'}`;
    const idFilter = value && typeof value === 'object' ? value.id : value;
    if (idFilter !== undefined) {
      if (idFilter !== null && typeof idFilter === 'object') {
        for (const [op, opValue] of Object.entries(idFilter)) applyOperator(qb, col, op, opValue);
      } else {
        applyOperator(qb, col, '$eq', idFilter);
      }
    }
    return;
  }
  const column = scalarColumn(model, attr);
  if (column) {
    const qualified = `${alias}.${column}`;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [op, opValue] of Object.entries(value)) {
        // Strapi silently strips invalid filter fragments — match that
        // (fail-soft) rather than erroring the whole request.
        if (!OPERATORS.has(op)) continue;
        applyOperator(qb, qualified, op, opValue);
      }
    } else {
      applyOperator(qb, qualified, '$eq', value);
    }
    return;
  }

  const rel = model.relations.find((r) => r.attr === attr);
  if (rel) {
    const edge = resolveEdge(registry, model, rel);
    const linkAlias = `${alias}_${attr}_l`;
    const targetAlias = `${alias}_${attr}_t`;
    // Strapi shorthand: { rel: 5 } / { rel: [5,6] } means the target's id;
    // { rel: null } means "no linked row".
    if (value === null) {
      qb.whereNotExists(function () {
        this.select(db.raw('1'))
          .from(`${edge.table} as ${linkAlias}`)
          .whereRaw('??.?? = ??.??', [linkAlias, edge.thisColumn, alias, 'id']);
      });
      return;
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      value = { id: Array.isArray(value) ? { $in: value } : value };
    }
    // Strapi's query engine LEFT JOINs relation traversals, so a filter made
    // purely of null-tests ({ user: { id: { $null: true } } }) also matches
    // rows with NO link at all — the idiom ported code uses for "orphan".
    // The EXISTS translation can't express absence; rewrite as absence-or-null.
    const isNullTest = (v) => {
      if (v === null) return true;
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const ops = Object.entries(v);
        return ops.length > 0 && ops.every(([op, val]) =>
          (op === '$null' && val !== false) || (op === '$eq' && val === null));
      }
      return false;
    };
    const valueEntries = Object.entries(value);
    const pureNullTest = valueEntries.length > 0 &&
      valueEntries.every(([k, v]) => scalarColumn(edge.target, k) && isNullTest(v));
    if (pureNullTest) {
      qb.where(function () {
        this.whereNotExists(function () {
          this.select(db.raw('1'))
            .from(`${edge.table} as ${linkAlias}`)
            .whereRaw('??.?? = ??.??', [linkAlias, edge.thisColumn, alias, 'id']);
        }).orWhereExists(function () {
          this.select(db.raw('1'))
            .from(`${edge.table} as ${linkAlias}`)
            .join(`${edge.target.tableName} as ${targetAlias}`, `${targetAlias}.id`, `${linkAlias}.${edge.otherColumn}`)
            .whereRaw('??.?? = ??.??', [linkAlias, edge.thisColumn, alias, 'id']);
          applyFilters(db, registry, this, edge.target, value, targetAlias);
        });
      });
      return;
    }
    qb.whereExists(function () {
      this.select(db.raw('1'))
        .from(`${edge.table} as ${linkAlias}`)
        .join(`${edge.target.tableName} as ${targetAlias}`, `${targetAlias}.id`, `${linkAlias}.${edge.otherColumn}`)
        .whereRaw('??.?? = ??.??', [linkAlias, edge.thisColumn, alias, 'id']);
      applyFilters(db, registry, this, edge.target, value, targetAlias);
    });
    return;
  }

  // Unknown attribute in a filter: Strapi strips it silently — match that.
}

/** Normalize sort input ('name:asc' | ['a:desc', ...] | {name: 'asc'}) to [[column, dir]]. */
function normalizeSort(model, sort) {
  if (!sort) return [];
  const entries = [];
  const items = Array.isArray(sort) ? sort : [sort];
  for (const item of items) {
    if (typeof item === 'string') {
      const [attr, dir = 'asc'] = item.split(':');
      entries.push([attr, dir]);
    } else {
      for (const [attr, dir] of Object.entries(item)) entries.push([attr, dir]);
    }
  }
  return entries.map(([attr, dir]) => {
    const column = scalarColumn(model, attr);
    if (!column) throw new Error(`${model.uid}: cannot sort on "${attr}"`);
    return [column, String(dir).toLowerCase() === 'desc' ? 'desc' : 'asc'];
  });
}

module.exports = { applyFilters, normalizeSort, resolveEdge, scalarColumn };
