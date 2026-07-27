'use strict';

/**
 * Strapi 5 identifier derivation.
 *
 * Table/column names must reproduce what Strapi 5 created in the live
 * database byte-for-byte — validated by scripts/validate-schema.js against
 * information_schema. Any rule change here must be re-validated.
 *
 * snakeCase matches lodash `snakeCase` (what Strapi uses): splits on
 * case boundaries, digit boundaries, and non-alphanumerics.
 */

function words(str) {
  return (
    String(str)
      // camelCase / PascalCase boundaries
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // letter/digit boundaries (lodash splits these)
      .replace(/([a-zA-Z])(\d)/g, '$1 $2')
      .replace(/(\d)([a-zA-Z])/g, '$1 $2')
      .split(/[^a-zA-Z0-9]+/)
      .filter(Boolean)
  );
}

function snakeCase(str) {
  return words(str)
    .map((w) => w.toLowerCase())
    .join('_');
}

/**
 * Strapi 5 shortens identifiers exceeding the DB limit (MySQL: 64) using
 * hashed token compression. None are expected to exceed it in this schema —
 * the validator flags any that do so the algorithm can be implemented from
 * evidence rather than guessed.
 */
const MAX_IDENTIFIER_LENGTH = 64;

function isOverLength(name) {
  return name.length > MAX_IDENTIFIER_LENGTH;
}

/** Join (link) table for a relation owned by `model` via attribute `attrName`. */
function joinTableName(tableName, attrName) {
  return `${tableName}_${snakeCase(attrName)}_lnk`;
}

/** Component-assignment table for a model that has component attributes. */
function componentJoinTableName(tableName) {
  return `${tableName}_cmps`;
}

/** FK column referencing an entity, from its singular name. */
function entityIdColumn(singularName) {
  return `${snakeCase(singularName)}_id`;
}

module.exports = {
  words,
  snakeCase,
  joinTableName,
  componentJoinTableName,
  entityIdColumn,
  isOverLength,
  MAX_IDENTIFIER_LENGTH,
};
