'use strict';

// CRUD service for api-method-policy rows, with the file-store as canonical.
// Every mutating call writes the .api-pro/policies/{interface}/{method}/{role}.json
// file FIRST, then upserts the DB mirror via services/sync.
//
// Read paths prefer the DB (it's already the merged, runtime-ready shape),
// falling back to files only for listings that have no DB equivalent (e.g.
// stale-file detection).

const fileStore = require('./file-store');
const sync = require('./sync');

const POLICY_UID = 'plugin::api-pro.api-method-policy';

function shape(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    roleKey: row.roleKey,
    resolverMode: row.resolverMode,
    filtersTemplate: row.filtersTemplate || {},
    populateTemplate: row.populateTemplate || {},
    bodyTemplate: row.bodyTemplate || {},
    queryTemplate: row.queryTemplate || {},
    templateVersion: row.templateVersion,
    interfaceMethod: row.interfaceMethod
      ? { id: row.interfaceMethod.id, key: row.interfaceMethod.key, name: row.interfaceMethod.name }
      : null,
  };
}

// List all policies, optionally filtered. Returns DB rows.
async function list(strapi, { interfaceKey, methodKey, roleKey } = {}) {
  const where = {};
  if (roleKey) where.roleKey = String(roleKey).toLowerCase();

  if (interfaceKey || methodKey) {
    where.interfaceMethod = {};
    if (methodKey && interfaceKey) {
      where.interfaceMethod.key = `${interfaceKey}:${methodKey}`;
    } else if (interfaceKey) {
      where.interfaceMethod.apiInterface = { key: interfaceKey };
    } else if (methodKey) {
      where.interfaceMethod.name = methodKey;
    }
  }

  const rows = await strapi.db.query(POLICY_UID).findMany({
    where,
    populate: { interfaceMethod: { populate: { apiInterface: true } } },
    orderBy: { roleKey: 'asc' },
  });
  return rows.map(shape);
}

async function findOne(strapi, { interfaceKey, methodKey, roleKey }) {
  const row = await strapi.db.query(POLICY_UID).findOne({
    where: {
      key: `${interfaceKey}:${methodKey}:${String(roleKey).toLowerCase()}`,
    },
    populate: { interfaceMethod: { populate: { apiInterface: true } } },
  });
  return shape(row);
}

// Upsert via file → DB. The data argument matches the file shape (which
// matches the DB column names 1:1).
async function upsert(strapi, { interfaceKey, methodKey, roleKey, data }) {
  if (!interfaceKey || !methodKey || !roleKey) {
    const err = new Error('interfaceKey, methodKey and roleKey are required');
    err.status = 400;
    throw err;
  }
  const normalizedRoleKey = String(roleKey).toLowerCase();

  const fileData = {
    name: data?.name || `${interfaceKey}:${methodKey}:${normalizedRoleKey}`,
    resolverMode: data?.resolverMode === 'lenient' ? 'lenient' : 'strict',
    filtersTemplate: data?.filtersTemplate || {},
    populateTemplate: data?.populateTemplate || {},
    bodyTemplate: data?.bodyTemplate || {},
    queryTemplate: data?.queryTemplate || {},
    templateVersion: Number.isInteger(data?.templateVersion) ? data.templateVersion : 1,
  };

  await fileStore.writePolicy(strapi, interfaceKey, methodKey, normalizedRoleKey, fileData);
  await sync.syncPolicyWrite(strapi, interfaceKey, methodKey, normalizedRoleKey);
  strapi.apiPro?.clearAllCache?.();

  return findOne(strapi, { interfaceKey, methodKey, roleKey: normalizedRoleKey });
}

async function remove(strapi, { interfaceKey, methodKey, roleKey }) {
  if (!interfaceKey || !methodKey || !roleKey) {
    const err = new Error('interfaceKey, methodKey and roleKey are required');
    err.status = 400;
    throw err;
  }
  const normalizedRoleKey = String(roleKey).toLowerCase();

  await fileStore.deletePolicy(strapi, interfaceKey, methodKey, normalizedRoleKey);
  await sync.syncPolicyDelete(strapi, interfaceKey, methodKey, normalizedRoleKey);
  strapi.apiPro?.clearAllCache?.();

  return { interfaceKey, methodKey, roleKey: normalizedRoleKey, deleted: true };
}

module.exports = {
  list,
  findOne,
  upsert,
  remove,
};
