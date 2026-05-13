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

// Upsert via file â†’ DB. The data argument matches the file shape (which
// matches the DB column names 1:1).
async function upsert(strapi, { interfaceKey, methodKey, roleKey, data }) {
  if (!interfaceKey || !methodKey || !roleKey) {
    const err = new Error('interfaceKey, methodKey and roleKey are required');
    err.status = 400;
    throw err;
  }
  const normalizedRoleKey = String(roleKey).toLowerCase();

  // Bump templateVersion to >= 2 on every admin save so the boot seeder
  // recognises this policy as user-tuned and skips overwriting its templates.
  const incomingVersion = Number.isInteger(data?.templateVersion) ? data.templateVersion : 1;
  const bumpedVersion = Math.max(incomingVersion + 1, 2);

  const fileData = {
    name: data?.name || `${interfaceKey}:${methodKey}:${normalizedRoleKey}`,
    resolverMode: data?.resolverMode === 'lenient' ? 'lenient' : 'strict',
    filtersTemplate: data?.filtersTemplate || {},
    populateTemplate: data?.populateTemplate || {},
    bodyTemplate: data?.bodyTemplate || {},
    queryTemplate: data?.queryTemplate || {},
    templateVersion: bumpedVersion,
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

// Bulk fetch all role policies for a single (interface, method). Used by
// the Comparative Editor so the UI gets a `{ roleKey: templates }` map plus
// the list of all available roles (so it can offer to ADD a policy for a
// role that doesn't have one yet).
async function findForMethod(strapi, { interfaceKey, methodKey }) {
  const METHOD_UID = 'plugin::api-pro.api-interface-method';
  const ROLE_UID = 'plugin::api-pro.app-role';

  const method = await strapi.db.query(METHOD_UID).findOne({
    where: { key: `${interfaceKey}:${methodKey}` },
    populate: { apiInterface: true },
  });
  if (!method) {
    const err = new Error(`method '${interfaceKey}:${methodKey}' not found`);
    err.status = 404;
    throw err;
  }

  const rows = await strapi.db.query(POLICY_UID).findMany({
    where: { interfaceMethod: { id: method.id } },
    orderBy: { roleKey: 'asc' },
  });

  const policies = {};
  for (const r of rows) {
    policies[r.roleKey] = {
      id: r.id,
      key: r.key,
      name: r.name,
      resolverMode: r.resolverMode,
      filtersTemplate: r.filtersTemplate || {},
      populateTemplate: r.populateTemplate || {},
      bodyTemplate: r.bodyTemplate || {},
      queryTemplate: r.queryTemplate || {},
      templateVersion: r.templateVersion,
    };
  }

  const allRoles = await strapi.db.query(ROLE_UID).findMany({
    where: { isActive: true },
    populate: { appDomains: { select: ['id', 'key', 'name'] } },
    orderBy: { key: 'asc' },
  });

  return {
    interfaceKey,
    methodKey,
    method: {
      id: method.id,
      action: method.action,
      method: method.method,
      path: method.path,
      apiInterfaceUid: method.apiInterface?.uid || null,
      apiInterfaceKey: method.apiInterface?.key || null,
    },
    policies,
    allRoles: allRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key,
      adminRoleCode: r.adminRoleCode || null,
      appDomains: Array.isArray(r.appDomains)
        ? r.appDomains.map((d) => ({ id: d.id, key: d.key, name: d.name || d.key }))
        : [],
    })),
  };
}

// Bulk upsert: accepts { [roleKey]: templates } and saves each. Roles with
// a null/false value are DELETED (so the UI can remove a role's policy by
// passing null). Each row goes file-first then DB-sync (idempotent).
async function bulkUpsertForMethod(strapi, { interfaceKey, methodKey, policies }) {
  if (!interfaceKey || !methodKey) {
    const err = new Error('interfaceKey and methodKey are required');
    err.status = 400;
    throw err;
  }
  if (!policies || typeof policies !== 'object') {
    const err = new Error('policies must be an object keyed by roleKey');
    err.status = 400;
    throw err;
  }

  const results = { saved: [], deleted: [], errors: [] };
  for (const [rawRoleKey, value] of Object.entries(policies)) {
    const roleKey = String(rawRoleKey).toLowerCase();
    try {
      if (value === null || value === false) {
        await remove(strapi, { interfaceKey, methodKey, roleKey });
        results.deleted.push(roleKey);
      } else {
        await upsert(strapi, { interfaceKey, methodKey, roleKey, data: value });
        results.saved.push(roleKey);
      }
    } catch (error) {
      results.errors.push({ roleKey, message: error?.message || 'unknown error' });
    }
  }

  return results;
}

module.exports = {
  list,
  findOne,
  upsert,
  remove,
  findForMethod,
  bulkUpsertForMethod,
};
