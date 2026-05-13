'use strict';

// File â†” DB sync.
//
// Files in .api-pro/ are the canonical authoring layer; DB tables exist as a
// runtime-read mirror. On every plugin boot we read all files and upsert them
// into the DB. The API controllers for interfaces/policies are responsible
// for keeping the two in step: write file first, then call the matching
// sync*Write helper here to push the change into the DB.
//
// Direction is one-way (file â†’ DB). Deleting a file removes the DB row;
// deleting a DB row directly is NOT supported via this layer (use the
// controllers, which delete the file first).

const fileStore = require('./file-store');

const INTERFACE_UID = 'plugin::api-pro.api-interface';
const METHOD_UID = 'plugin::api-pro.api-interface-method';
const POLICY_UID = 'plugin::api-pro.api-method-policy';

function methodCompositeKey(interfaceKey, methodKey) {
  return `${interfaceKey}:${methodKey}`;
}

function policyCompositeKey(interfaceKey, methodKey, roleKey) {
  return `${interfaceKey}:${methodKey}:${roleKey}`;
}

// â”€â”€ Per-row upserts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function upsertInterface(strapi, interfaceKey, data) {
  const existing = await strapi.db.query(INTERFACE_UID).findOne({
    where: { key: interfaceKey },
  });

  const payload = {
    key: interfaceKey,
    name: data.name || data.label || interfaceKey,
    filePath: data.filePath || `api/${interfaceKey}.js`,
    uid: data.uid || data.contentType || null,
    status: data.status || 'manual',
  };

  if (existing) {
    return strapi.db.query(INTERFACE_UID).update({
      where: { id: existing.id },
      data: payload,
    });
  }
  return strapi.db.query(INTERFACE_UID).create({ data: payload });
}

async function upsertMethod(strapi, interfaceRow, methodData) {
  const compositeKey = methodCompositeKey(interfaceRow.key, methodData.key || methodData.id);
  const existing = await strapi.db.query(METHOD_UID).findOne({
    where: { key: compositeKey },
  });

  const payload = {
    key: compositeKey,
    name: methodData.name || methodData.label || methodData.key || methodData.id,
    action: methodData.action || methodData.key || methodData.id,
    method: String(methodData.method || methodData.httpMethod || 'GET').toLowerCase(),
    path: methodData.path || '',
    routeTokens: Array.isArray(methodData.routeTokens) ? methodData.routeTokens : [],
    inputSignature: Array.isArray(methodData.inputSignature) ? methodData.inputSignature : [],
    apps: Array.isArray(methodData.apps) ? methodData.apps : [],
    appRoles: Array.isArray(methodData.appRoles) ? methodData.appRoles : [],
    apiInterface: interfaceRow.id,
  };

  if (existing) {
    return strapi.db.query(METHOD_UID).update({
      where: { id: existing.id },
      data: payload,
    });
  }
  return strapi.db.query(METHOD_UID).create({ data: payload });
}

async function upsertPolicy(strapi, interfaceKey, methodKey, roleKey, data) {
  const compositeMethodKey = methodCompositeKey(interfaceKey, methodKey);
  const method = await strapi.db.query(METHOD_UID).findOne({
    where: { key: compositeMethodKey },
  });
  if (!method) {
    strapi.log.warn(`[api-pro] sync: policy refers to missing method '${compositeMethodKey}', skipping`);
    return null;
  }

  const compositeKey = policyCompositeKey(interfaceKey, methodKey, roleKey);
  const existing = await strapi.db.query(POLICY_UID).findOne({
    where: { key: compositeKey },
  });

  const payload = {
    key: compositeKey,
    name: data.name || compositeKey,
    roleKey,
    resolverMode: data.resolverMode === 'lenient' ? 'lenient' : 'strict',
    filtersTemplate: data.filtersTemplate || {},
    populateTemplate: data.populateTemplate || {},
    bodyTemplate: data.bodyTemplate || {},
    queryTemplate: data.queryTemplate || {},
    templateVersion: Number.isInteger(data.templateVersion) ? data.templateVersion : 1,
    interfaceMethod: method.id,
  };

  if (existing) {
    return strapi.db.query(POLICY_UID).update({
      where: { id: existing.id },
      data: payload,
    });
  }
  return strapi.db.query(POLICY_UID).create({ data: payload });
}

// â”€â”€ Per-key sync (called from controllers after a file write) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function syncInterfaceWrite(strapi, interfaceKey) {
  const fileData = await fileStore.readInterface(strapi, interfaceKey);
  if (!fileData) return null;

  const row = await upsertInterface(strapi, interfaceKey, fileData);
  const methods = Array.isArray(fileData.methods) ? fileData.methods : [];
  for (const m of methods) {
    await upsertMethod(strapi, row, m);
  }
  return row;
}

async function syncPolicyWrite(strapi, interfaceKey, methodKey, roleKey) {
  const data = await fileStore.readPolicy(strapi, interfaceKey, methodKey, roleKey);
  if (!data) return null;
  return upsertPolicy(strapi, interfaceKey, methodKey, roleKey, data);
}

async function syncInterfaceDelete(strapi, interfaceKey) {
  const row = await strapi.db.query(INTERFACE_UID).findOne({ where: { key: interfaceKey } });
  if (!row) return;
  // Cascade: methods â†’ policies are wired via relations; deleting the
  // interface should leave dangling rows only if FK cascade isn't set.
  // Be explicit so we don't depend on DB-level cascades.
  const methods = await strapi.db.query(METHOD_UID).findMany({
    where: { apiInterface: row.id },
    select: ['id'],
  });
  const methodIds = methods.map((m) => m.id);
  if (methodIds.length > 0) {
    await strapi.db.query(POLICY_UID).deleteMany({
      where: { interfaceMethod: { id: { $in: methodIds } } },
    });
    await strapi.db.query(METHOD_UID).deleteMany({ where: { id: { $in: methodIds } } });
  }
  await strapi.db.query(INTERFACE_UID).delete({ where: { id: row.id } });
}

async function syncPolicyDelete(strapi, interfaceKey, methodKey, roleKey) {
  const compositeKey = policyCompositeKey(interfaceKey, methodKey, roleKey);
  await strapi.db.query(POLICY_UID).deleteMany({ where: { key: compositeKey } });
}

// â”€â”€ Full sync (boot) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function syncAll(strapi) {
  await fileStore.ensureStorage(strapi);

  const interfaces = await fileStore.listInterfaces(strapi);
  let iCount = 0;
  let mCount = 0;
  for (const { key, data } of interfaces) {
    const row = await upsertInterface(strapi, key, data);
    const methods = Array.isArray(data.methods) ? data.methods : [];
    for (const m of methods) {
      await upsertMethod(strapi, row, m);
      mCount += 1;
    }
    iCount += 1;
  }

  const policies = await fileStore.listAllPolicies(strapi);
  let pCount = 0;
  for (const p of policies) {
    const result = await upsertPolicy(strapi, p.interfaceKey, p.methodKey, p.roleKey, p.data);
    if (result) pCount += 1;
  }

  // Cache invalidation after a full re-sync.
  strapi.apiPro?.cache?.clearAll?.();

  return { interfaces: iCount, methods: mCount, policies: pCount };
}

module.exports = {
  syncAll,
  syncInterfaceWrite,
  syncInterfaceDelete,
  syncPolicyWrite,
  syncPolicyDelete,
};
