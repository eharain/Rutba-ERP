import require$$0$7 from "fs";
import require$$1 from "path";
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var register$1 = ({ strapi: strapi2 }) => {
  const appRole2 = strapi2.plugin("api-pro").contentType("app-role");
  if (appRole2?.extendUserRelation) {
    appRole2.extendUserRelation(strapi2);
  }
  strapi2.log.info("[api-pro] register");
};
const POLICY_UID$3 = "plugin::api-pro.api-method-policy";
function normalizeRoleKey(value) {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object") {
    if (typeof value.key === "string") return value.key.toLowerCase();
    if (typeof value.name === "string") return value.name.toLowerCase();
  }
  return null;
}
function resolveUserRoleKeys(user) {
  if (!user) return [];
  const fromAppRoles = Array.isArray(user.app_roles) ? user.app_roles.map(normalizeRoleKey).filter(Boolean) : [];
  if (fromAppRoles.length > 0) return Array.from(new Set(fromAppRoles));
  const strapiRoleName = typeof user.role === "string" ? user.role : user.role && typeof user.role === "object" ? user.role.name || user.role.type : null;
  const key = normalizeRoleKey(strapiRoleName);
  return key ? [key] : [];
}
function parseRouteHandler(handler) {
  if (typeof handler !== "string" || !handler.includes("::")) return null;
  const lastDot = handler.lastIndexOf(".");
  if (lastDot < 0) return null;
  return {
    contentTypeUid: handler.slice(0, lastDot),
    actionName: handler.slice(lastDot + 1)
  };
}
function makeCacheKey(userId, contentTypeUid, actionName) {
  return `u:${userId}:p:${contentTypeUid}:${actionName}`;
}
async function getPoliciesForAction(strapi2, { user, contentTypeUid, actionName }) {
  const userId = user?.id;
  if (!userId || !contentTypeUid || !actionName) return [];
  const roleKeys = resolveUserRoleKeys(user);
  if (roleKeys.length === 0) return [];
  const cache = strapi2.apiPro?.cache;
  const key = makeCacheKey(userId, contentTypeUid, actionName);
  if (cache) {
    const hit = cache.get(key);
    if (hit !== void 0) return hit;
  }
  let policies2 = [];
  try {
    policies2 = await strapi2.db.query(POLICY_UID$3).findMany({
      where: {
        roleKey: { $in: roleKeys },
        interfaceMethod: {
          action: actionName,
          apiInterface: { uid: contentTypeUid }
        }
      },
      populate: { interfaceMethod: { populate: { apiInterface: true } } }
    });
  } catch (error) {
    strapi2.log.warn(`[api-pro] nested policy lookup failed: ${error?.message}; falling back`);
    const methods = await strapi2.db.query("plugin::api-pro.api-interface-method").findMany({
      where: { action: actionName, apiInterface: { uid: contentTypeUid } },
      select: ["id"]
    });
    const methodIds = methods.map((m) => m.id);
    if (methodIds.length === 0) {
      policies2 = [];
    } else {
      policies2 = await strapi2.db.query(POLICY_UID$3).findMany({
        where: { roleKey: { $in: roleKeys }, interfaceMethod: { id: { $in: methodIds } } }
      });
    }
  }
  if (cache) cache.set(key, policies2);
  return policies2;
}
function clearCache(strapi2, userId) {
  if (userId) strapi2.apiPro?.cache?.clearUser?.(userId);
  else strapi2.apiPro?.cache?.clearAll?.();
}
var permissionEngine$1 = {
  resolveUserRoleKeys,
  parseRouteHandler,
  getPoliciesForAction,
  clearCache
};
const ALLOWED_ROOTS = /* @__PURE__ */ new Set(["user", "claim", "query", "params", "body", "strapi"]);
function resolveToken(value, context2) {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  if (value === "$today") return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  if (value === "$now") return (/* @__PURE__ */ new Date()).toISOString();
  const parts = value.slice(1).split(".");
  if (parts.length === 0) return void 0;
  const [root] = parts;
  if (!ALLOWED_ROOTS.has(root)) return void 0;
  let result = context2;
  for (const part of parts) {
    if (result === void 0 || result === null) return void 0;
    result = result[part];
  }
  return result;
}
function resolveDeep(value, context2) {
  if (Array.isArray(value)) {
    return value.map((v) => resolveDeep(v, context2)).filter((v) => v !== void 0);
  }
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const resolved = resolveDeep(v, context2);
      if (resolved !== void 0) out[k] = resolved;
    }
    return out;
  }
  if (typeof value === "string" && value.startsWith("$")) {
    return resolveToken(value, context2);
  }
  return value;
}
function buildTokenContext({ strapiCtx, user = null, claim = null } = {}) {
  return {
    user: user || strapiCtx?.state?.user || null,
    claim: claim || strapiCtx?.state?.apiProClaim || null,
    query: strapiCtx?.query || {},
    params: strapiCtx?.params || {},
    body: strapiCtx?.request?.body?.data || strapiCtx?.request?.body || {},
    strapi: {
      request: {
        method: strapiCtx?.request?.method || null,
        path: strapiCtx?.request?.path || null
      }
    }
  };
}
function resolvePolicyTemplates(policy = {}, context2 = {}) {
  return {
    filters: resolveDeep(policy.filtersTemplate || {}, context2),
    populate: resolveDeep(policy.populateTemplate || {}, context2),
    body: resolveDeep(policy.bodyTemplate || {}, context2),
    query: resolveDeep(policy.queryTemplate || {}, context2)
  };
}
var policyResolver$1 = {
  resolveToken,
  resolveDeep,
  buildTokenContext,
  resolvePolicyTemplates
};
const engine = permissionEngine$1;
const resolver = policyResolver$1;
const NON_INJECTABLE_METHODS = /* @__PURE__ */ new Set(["OPTIONS", "HEAD"]);
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function deepMerge(target, source) {
  if (!isPlainObject(source)) return source;
  const out = { ...isPlainObject(target) ? target : {} };
  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (Array.isArray(v) && Array.isArray(out[k])) {
      out[k] = Array.from(/* @__PURE__ */ new Set([...out[k], ...v]));
    } else {
      out[k] = v;
    }
  }
  return out;
}
function unionFields(...lists) {
  const out = /* @__PURE__ */ new Set();
  for (const list2 of lists) {
    if (Array.isArray(list2)) {
      for (const f of list2) if (typeof f === "string") out.add(f);
    }
  }
  return Array.from(out);
}
function mergeFragments(fragments) {
  if (fragments.length === 0) return null;
  if (fragments.length === 1) return fragments[0];
  const nonEmptyFilters = fragments.map((f) => f.filters).filter((x) => isPlainObject(x) && Object.keys(x).length > 0);
  const merged = {
    filters: nonEmptyFilters.length === 0 ? {} : nonEmptyFilters.length === 1 ? nonEmptyFilters[0] : { $or: nonEmptyFilters },
    populate: fragments.reduce((acc, f) => deepMerge(acc, f.populate || {}), {}),
    fields: unionFields(...fragments.map((f) => f.fields)),
    body: fragments.reduce((acc, f) => deepMerge(acc, f.body || {}), {}),
    query: fragments.reduce((acc, f) => deepMerge(acc, f.query || {}), {})
  };
  return merged;
}
function resolveOnePolicy(policy, tokenCtx) {
  const r = resolver.resolvePolicyTemplates(policy, tokenCtx);
  return {
    filters: isPlainObject(r.filters) ? r.filters : {},
    populate: isPlainObject(r.populate) ? r.populate : {},
    body: isPlainObject(r.body) ? r.body : {},
    query: isPlainObject(r.query) ? r.query : {},
    fields: Array.isArray(r.query?.fields) ? r.query.fields : []
  };
}
function injectIntoQuery(ctx, fragment, { skipFilters = false } = {}) {
  ctx.query = ctx.query || {};
  if (!skipFilters && fragment.filters && Object.keys(fragment.filters).length > 0) {
    ctx.query.filters = deepMerge(
      isPlainObject(ctx.query.filters) ? ctx.query.filters : {},
      fragment.filters
    );
  }
  if (fragment.populate && Object.keys(fragment.populate).length > 0) {
    if (!ctx.query.populate) {
      ctx.query.populate = fragment.populate;
    } else if (isPlainObject(ctx.query.populate)) {
      ctx.query.populate = deepMerge(ctx.query.populate, fragment.populate);
    }
  }
  if (fragment.fields && fragment.fields.length > 0) {
    const requested = Array.isArray(ctx.query.fields) ? ctx.query.fields : [];
    ctx.query.fields = requested.length > 0 ? requested.filter((f) => fragment.fields.includes(f)) : fragment.fields.slice();
  }
  if (fragment.query && Object.keys(fragment.query).length > 0) {
    for (const [k, v] of Object.entries(fragment.query)) {
      if (k === "fields" || k === "filters" || k === "populate") continue;
      ctx.query[k] = v;
    }
  }
}
function injectIntoBody(ctx, fragment) {
  if (!fragment.body || Object.keys(fragment.body).length === 0) return;
  if (NON_INJECTABLE_METHODS.has((ctx.request?.method || "").toUpperCase())) return;
  if (!ctx.request) return;
  if (isPlainObject(ctx.request.body?.data)) {
    ctx.request.body.data = deepMerge(ctx.request.body.data, fragment.body);
  } else {
    ctx.request.body = deepMerge(isPlainObject(ctx.request.body) ? ctx.request.body : {}, fragment.body);
  }
}
function readClaim(ctx, strapi2) {
  const cfg = strapi2.config.get("plugin::api-pro") || {};
  const headerDomainKey = (cfg.headerDomainKey || "x-rutba-app").toLowerCase();
  const headerElevatedKey = (cfg.headerElevatedKey || "x-rutba-app-admin").toLowerCase();
  const headers = ctx.request?.headers || {};
  const appName = String(headers[headerDomainKey] || "").trim() || null;
  const elevatedRaw = headers[headerElevatedKey];
  const elevated = elevatedRaw === true || elevatedRaw === "true" || elevatedRaw === "1" || elevatedRaw === 1;
  return { appName, elevated };
}
async function process$1(ctx, strapi2) {
  const cfg = strapi2.config.get("plugin::api-pro") || {};
  const mode = cfg.enforcementMode || "hybrid";
  if (mode === "off") return { status: "skipped", reason: "enforcement off" };
  const user = ctx.state?.user;
  if (!user?.id) return { status: "skipped", reason: "no authenticated user" };
  const handler = ctx.state?.route?.handler;
  const parsed = engine.parseRouteHandler(handler);
  if (!parsed) return { status: "skipped", reason: "unrecognized route handler" };
  const policies2 = await engine.getPoliciesForAction(strapi2, {
    user,
    contentTypeUid: parsed.contentTypeUid,
    actionName: parsed.actionName
  });
  if (policies2.length === 0) {
    if (cfg.denyByDefault && (mode === "enforce" || mode === "hybrid")) {
      return { status: "denied", reason: "no matching policy", policies: 0 };
    }
    return { status: "allowed", reason: "no policy / lenient", policies: 0 };
  }
  if (mode === "audit") {
    return { status: "audited", policies: policies2.length };
  }
  const claim = readClaim(ctx, strapi2);
  ctx.state.apiProClaim = { appName: claim.appName, elevated: claim.elevated };
  const tokenCtx = resolver.buildTokenContext({
    strapiCtx: ctx,
    user,
    claim: { appName: claim.appName, elevated: claim.elevated }
  });
  const fragments = policies2.map((p) => resolveOnePolicy(p, tokenCtx));
  const merged = mergeFragments(fragments);
  if (!merged) return { status: "allowed", policies: 0 };
  injectIntoQuery(ctx, merged, { skipFilters: claim.elevated });
  injectIntoBody(ctx, merged);
  ctx.state.apiProPolicy = merged;
  return { status: "allowed", policies: policies2.length };
}
var requestInterceptor$1 = {
  process: process$1,
  // exported for tests
  mergeFragments,
  deepMerge
};
const fs = require$$0$7.promises;
const path$1 = require$$1;
const SAFE_KEY_REGEX = /^[a-z0-9][a-z0-9_-]*$/i;
function assertSafeKey(label, value) {
  if (typeof value !== "string" || !SAFE_KEY_REGEX.test(value)) {
    throw new Error(`[api-pro] file-store: invalid ${label} '${value}'`);
  }
}
function storageRoot(strapi2) {
  const cfg = strapi2.config.get("plugin::api-pro") || {};
  const dir = cfg.storageDir || ".api-pro";
  const root = strapi2.dirs?.app?.root || process.cwd();
  return path$1.resolve(root, dir);
}
function interfacesDir(strapi2) {
  return path$1.join(storageRoot(strapi2), "interfaces");
}
function policiesRoot(strapi2) {
  return path$1.join(storageRoot(strapi2), "policies");
}
function interfaceFile(strapi2, interfaceKey) {
  assertSafeKey("interfaceKey", interfaceKey);
  return path$1.join(interfacesDir(strapi2), `${interfaceKey}.json`);
}
function policyDir(strapi2, interfaceKey, methodKey) {
  assertSafeKey("interfaceKey", interfaceKey);
  assertSafeKey("methodKey", methodKey);
  return path$1.join(policiesRoot(strapi2), interfaceKey, methodKey);
}
function policyFile(strapi2, interfaceKey, methodKey, roleKey) {
  assertSafeKey("roleKey", roleKey);
  return path$1.join(policyDir(strapi2, interfaceKey, methodKey), `${roleKey}.json`);
}
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}
async function readJsonSafe(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
async function writeJsonAtomic(filePath, value) {
  await ensureDir(path$1.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, filePath);
}
async function listJsonFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => e.name);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}
async function listInterfaces$1(strapi2) {
  const names = await listJsonFiles(interfacesDir(strapi2));
  const out = [];
  for (const name of names) {
    const key = name.slice(0, -5);
    const data = await readJsonSafe(path$1.join(interfacesDir(strapi2), name));
    if (data) out.push({ key, data });
  }
  return out;
}
async function readInterface(strapi2, interfaceKey) {
  return readJsonSafe(interfaceFile(strapi2, interfaceKey));
}
async function writeInterface(strapi2, interfaceKey, data) {
  await writeJsonAtomic(interfaceFile(strapi2, interfaceKey), {
    ...data,
    key: interfaceKey
  });
}
async function deleteInterface(strapi2, interfaceKey) {
  try {
    await fs.unlink(interfaceFile(strapi2, interfaceKey));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const dir = path$1.join(policiesRoot(strapi2), interfaceKey);
  await fs.rm(dir, { recursive: true, force: true });
}
async function listPoliciesForMethod(strapi2, interfaceKey, methodKey) {
  const dir = policyDir(strapi2, interfaceKey, methodKey);
  const names = await listJsonFiles(dir);
  const out = [];
  for (const name of names) {
    const roleKey = name.slice(0, -5);
    const data = await readJsonSafe(path$1.join(dir, name));
    if (data) out.push({ roleKey, data });
  }
  return out;
}
async function listAllPolicies(strapi2) {
  const root = policiesRoot(strapi2);
  let interfaceDirs;
  try {
    interfaceDirs = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const out = [];
  for (const i of interfaceDirs) {
    if (!i.isDirectory()) continue;
    const interfaceKey = i.name;
    let methodDirs;
    try {
      methodDirs = await fs.readdir(path$1.join(root, interfaceKey), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const m of methodDirs) {
      if (!m.isDirectory()) continue;
      const methodKey = m.name;
      const policies2 = await listPoliciesForMethod(strapi2, interfaceKey, methodKey);
      for (const p of policies2) {
        out.push({ interfaceKey, methodKey, ...p });
      }
    }
  }
  return out;
}
async function readPolicy(strapi2, interfaceKey, methodKey, roleKey) {
  return readJsonSafe(policyFile(strapi2, interfaceKey, methodKey, roleKey));
}
async function writePolicy(strapi2, interfaceKey, methodKey, roleKey, data) {
  await writeJsonAtomic(policyFile(strapi2, interfaceKey, methodKey, roleKey), {
    ...data,
    interfaceKey,
    methodKey,
    roleKey
  });
}
async function deletePolicy(strapi2, interfaceKey, methodKey, roleKey) {
  try {
    await fs.unlink(policyFile(strapi2, interfaceKey, methodKey, roleKey));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
async function ensureStorage(strapi2) {
  await ensureDir(interfacesDir(strapi2));
  await ensureDir(policiesRoot(strapi2));
}
var fileStore$4 = {
  storageRoot,
  interfacesDir,
  policiesRoot,
  interfaceFile,
  policyFile,
  ensureStorage,
  listInterfaces: listInterfaces$1,
  readInterface,
  writeInterface,
  deleteInterface,
  listPoliciesForMethod,
  listAllPolicies,
  readPolicy,
  writePolicy,
  deletePolicy
};
const fileStore$3 = fileStore$4;
const INTERFACE_UID$1 = "plugin::api-pro.api-interface";
const METHOD_UID$1 = "plugin::api-pro.api-interface-method";
const POLICY_UID$2 = "plugin::api-pro.api-method-policy";
function methodCompositeKey(interfaceKey, methodKey) {
  return `${interfaceKey}:${methodKey}`;
}
function policyCompositeKey(interfaceKey, methodKey, roleKey) {
  return `${interfaceKey}:${methodKey}:${roleKey}`;
}
async function upsertInterface(strapi2, interfaceKey, data) {
  const existing = await strapi2.db.query(INTERFACE_UID$1).findOne({
    where: { key: interfaceKey }
  });
  const payload = {
    key: interfaceKey,
    name: data.name || data.label || interfaceKey,
    filePath: data.filePath || `api/${interfaceKey}.js`,
    uid: data.uid || data.contentType || null,
    status: data.status || "manual"
  };
  if (existing) {
    return strapi2.db.query(INTERFACE_UID$1).update({
      where: { id: existing.id },
      data: payload
    });
  }
  return strapi2.db.query(INTERFACE_UID$1).create({ data: payload });
}
async function upsertMethod$1(strapi2, interfaceRow, methodData) {
  const compositeKey = methodCompositeKey(interfaceRow.key, methodData.key || methodData.id);
  const existing = await strapi2.db.query(METHOD_UID$1).findOne({
    where: { key: compositeKey }
  });
  const payload = {
    key: compositeKey,
    name: methodData.name || methodData.label || methodData.key || methodData.id,
    action: methodData.action || methodData.key || methodData.id,
    method: String(methodData.method || methodData.httpMethod || "GET").toLowerCase(),
    path: methodData.path || "",
    routeTokens: Array.isArray(methodData.routeTokens) ? methodData.routeTokens : [],
    inputSignature: Array.isArray(methodData.inputSignature) ? methodData.inputSignature : [],
    apps: Array.isArray(methodData.apps) ? methodData.apps : [],
    appRoles: Array.isArray(methodData.appRoles) ? methodData.appRoles : [],
    apiInterface: interfaceRow.id
  };
  if (existing) {
    return strapi2.db.query(METHOD_UID$1).update({
      where: { id: existing.id },
      data: payload
    });
  }
  return strapi2.db.query(METHOD_UID$1).create({ data: payload });
}
async function upsertPolicy(strapi2, interfaceKey, methodKey, roleKey, data) {
  const compositeMethodKey = methodCompositeKey(interfaceKey, methodKey);
  const method = await strapi2.db.query(METHOD_UID$1).findOne({
    where: { key: compositeMethodKey }
  });
  if (!method) {
    strapi2.log.warn(`[api-pro] sync: policy refers to missing method '${compositeMethodKey}', skipping`);
    return null;
  }
  const compositeKey = policyCompositeKey(interfaceKey, methodKey, roleKey);
  const existing = await strapi2.db.query(POLICY_UID$2).findOne({
    where: { key: compositeKey }
  });
  const payload = {
    key: compositeKey,
    name: data.name || compositeKey,
    roleKey,
    resolverMode: data.resolverMode === "lenient" ? "lenient" : "strict",
    filtersTemplate: data.filtersTemplate || {},
    populateTemplate: data.populateTemplate || {},
    bodyTemplate: data.bodyTemplate || {},
    queryTemplate: data.queryTemplate || {},
    templateVersion: Number.isInteger(data.templateVersion) ? data.templateVersion : 1,
    interfaceMethod: method.id
  };
  if (existing) {
    return strapi2.db.query(POLICY_UID$2).update({
      where: { id: existing.id },
      data: payload
    });
  }
  return strapi2.db.query(POLICY_UID$2).create({ data: payload });
}
async function syncInterfaceWrite(strapi2, interfaceKey) {
  const fileData = await fileStore$3.readInterface(strapi2, interfaceKey);
  if (!fileData) return null;
  const row = await upsertInterface(strapi2, interfaceKey, fileData);
  const methods = Array.isArray(fileData.methods) ? fileData.methods : [];
  for (const m of methods) {
    await upsertMethod$1(strapi2, row, m);
  }
  return row;
}
async function syncPolicyWrite(strapi2, interfaceKey, methodKey, roleKey) {
  const data = await fileStore$3.readPolicy(strapi2, interfaceKey, methodKey, roleKey);
  if (!data) return null;
  return upsertPolicy(strapi2, interfaceKey, methodKey, roleKey, data);
}
async function syncInterfaceDelete(strapi2, interfaceKey) {
  const row = await strapi2.db.query(INTERFACE_UID$1).findOne({ where: { key: interfaceKey } });
  if (!row) return;
  const methods = await strapi2.db.query(METHOD_UID$1).findMany({
    where: { apiInterface: row.id },
    select: ["id"]
  });
  const methodIds = methods.map((m) => m.id);
  if (methodIds.length > 0) {
    await strapi2.db.query(POLICY_UID$2).deleteMany({
      where: { interfaceMethod: { id: { $in: methodIds } } }
    });
    await strapi2.db.query(METHOD_UID$1).deleteMany({ where: { id: { $in: methodIds } } });
  }
  await strapi2.db.query(INTERFACE_UID$1).delete({ where: { id: row.id } });
}
async function syncPolicyDelete(strapi2, interfaceKey, methodKey, roleKey) {
  const compositeKey = policyCompositeKey(interfaceKey, methodKey, roleKey);
  await strapi2.db.query(POLICY_UID$2).deleteMany({ where: { key: compositeKey } });
}
async function syncAll(strapi2) {
  await fileStore$3.ensureStorage(strapi2);
  const interfaces2 = await fileStore$3.listInterfaces(strapi2);
  let iCount = 0;
  let mCount = 0;
  for (const { key, data } of interfaces2) {
    const row = await upsertInterface(strapi2, key, data);
    const methods = Array.isArray(data.methods) ? data.methods : [];
    for (const m of methods) {
      await upsertMethod$1(strapi2, row, m);
      mCount += 1;
    }
    iCount += 1;
  }
  const policies2 = await fileStore$3.listAllPolicies(strapi2);
  let pCount = 0;
  for (const p of policies2) {
    const result = await upsertPolicy(strapi2, p.interfaceKey, p.methodKey, p.roleKey, p.data);
    if (result) pCount += 1;
  }
  strapi2.apiPro?.cache?.clearAll?.();
  return { interfaces: iCount, methods: mCount, policies: pCount };
}
var sync$2 = {
  syncAll,
  syncInterfaceWrite,
  syncInterfaceDelete,
  syncPolicyWrite,
  syncPolicyDelete
};
const TTL_DEFAULT_MS = 3e4;
const MAX_ENTRIES_DEFAULT = 5e3;
function createPermissionCache({ ttlMs = TTL_DEFAULT_MS, maxEntries = MAX_ENTRIES_DEFAULT } = {}) {
  const store = /* @__PURE__ */ new Map();
  function get(key) {
    const entry = store.get(key);
    if (!entry) return void 0;
    if (entry.expiresAt < Date.now()) {
      store.delete(key);
      return void 0;
    }
    store.delete(key);
    store.set(key, entry);
    return entry.value;
  }
  function set(key, value) {
    if (store.has(key)) store.delete(key);
    store.set(key, { value, expiresAt: Date.now() + ttlMs });
    if (store.size > maxEntries) {
      const oldestKey = store.keys().next().value;
      store.delete(oldestKey);
    }
  }
  function clearUser(userId) {
    const prefix = `u:${userId}:`;
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  }
  function clearAll() {
    store.clear();
  }
  return {
    get,
    set,
    clearUser,
    clearAll,
    size: () => store.size
  };
}
function buildBypassMatcher(paths = []) {
  const list2 = paths.filter((p) => typeof p === "string" && p.length > 0);
  return (path2) => {
    if (!path2) return false;
    for (const prefix of list2) {
      if (path2 === prefix || path2.startsWith(`${prefix}/`)) return true;
    }
    return false;
  };
}
function registerCacheInvalidationHooks(strapi2) {
  const invalidate = () => strapi2.apiPro?.cache?.clearAll?.();
  const targets = [
    "plugin::api-pro.app-role",
    "plugin::api-pro.app-domain",
    "plugin::api-pro.api-method-policy"
  ];
  for (const uid of targets) {
    try {
      strapi2.db.lifecycles.subscribe({
        models: [uid],
        afterCreate: invalidate,
        afterUpdate: invalidate,
        afterDelete: invalidate,
        afterCreateMany: invalidate,
        afterUpdateMany: invalidate,
        afterDeleteMany: invalidate
      });
    } catch (error) {
      strapi2.log.warn(`[api-pro] failed to subscribe lifecycle for ${uid}: ${error?.message}`);
    }
  }
}
function installInterceptor(strapi2) {
  const config2 = strapi2.config.get("plugin::api-pro") || {};
  if (config2.interceptorEnabled === false) {
    strapi2.log.info("[api-pro] interceptor disabled by config");
    return;
  }
  const isBypassed = buildBypassMatcher(config2.bypassPaths);
  const interceptor = requestInterceptor$1;
  strapi2.server.use(async (ctx, next) => {
    if (isBypassed(ctx.path)) {
      return next();
    }
    try {
      const result = await interceptor.process(ctx, strapi2);
      if (result.status === "denied") {
        ctx.status = 403;
        ctx.body = {
          error: {
            code: "API_PRO_FORBIDDEN",
            message: result.reason || "Request denied by api-pro policy"
          }
        };
        return;
      }
    } catch (error) {
      strapi2.log.error(`[api-pro] interceptor error on ${ctx.method} ${ctx.path}: ${error?.stack || error?.message}`);
    }
    return next();
  });
}
var bootstrap$1 = async ({ strapi: strapi2 }) => {
  const config2 = strapi2.config.get("plugin::api-pro") || {};
  const cache = createPermissionCache(config2.cache || {});
  const roleProviders = [];
  strapi2.apiPro = Object.freeze({
    cache,
    roleProviders,
    getConfig: () => strapi2.config.get("plugin::api-pro") || {},
    isBypassed: buildBypassMatcher(config2.bypassPaths),
    clearCache: (userId) => userId ? cache.clearUser(userId) : cache.clearAll(),
    clearAllCache: () => cache.clearAll(),
    // pos-strapi (or any consumer) calls this from its own bootstrap to inject
    // additional role keys derived from external context — e.g. hr_* roles
    // pulled from HR team membership. The fn receives (user, { strapi }) and
    // should return an array of role-key strings.
    registerRoleProvider(fn) {
      if (typeof fn !== "function") {
        throw new Error("[api-pro] registerRoleProvider expects a function");
      }
      roleProviders.push(fn);
    }
  });
  registerCacheInvalidationHooks(strapi2);
  installInterceptor(strapi2);
  try {
    const sync2 = sync$2;
    const result = await sync2.syncAll(strapi2);
    strapi2.log.info(
      `[api-pro] file→DB sync ok (interfaces=${result.interfaces}, methods=${result.methods}, policies=${result.policies})`
    );
  } catch (error) {
    strapi2.log.error(`[api-pro] file→DB sync failed: ${error?.stack || error?.message}`);
  }
  strapi2.log.info(
    `[api-pro] bootstrap ok (enforcementMode=${config2.enforcementMode || "hybrid"}, denyByDefault=${config2.denyByDefault !== false}, cacheTTL=${config2.cache?.ttlMs || TTL_DEFAULT_MS}ms)`
  );
};
var destroy$1 = () => {
};
const ENFORCEMENT_MODES = ["hybrid", "enforce", "audit", "off"];
var config$1 = {
  default: {
    // ── Runtime enforcement ─────────────────────────────────────────────
    interceptorEnabled: true,
    denyByDefault: true,
    enforcementMode: "hybrid",
    enforceOwnership: true,
    sessionTimeout: 3600,
    // ── Header bridging ─────────────────────────────────────────────────
    // The plugin reads ctx headers using these keys to derive the active
    // app/domain claim and admin elevation. Role is NEVER claimed via header —
    // it's resolved from user.app_roles intersected with the active app.
    headerDomainKey: "x-rutba-app",
    headerElevatedKey: "x-rutba-app-admin",
    // ── Bypass paths ────────────────────────────────────────────────────
    // Prefix-matched paths that skip interceptor + context validation.
    // pos-strapi extends this with public routes derived from @rutba/api-provider.
    bypassPaths: [
      "/admin",
      "/content-manager",
      "/content-type-builder",
      "/i18n",
      "/users-permissions",
      "/api/auth",
      "/api/users/me",
      "/api/me/permissions",
      "/api/users-permissions/me/permissions",
      "/api/api-pro/me/permissions",
      "/api/api-guard-pro/me/permissions",
      "/uploads",
      "/_health",
      "/documentation"
    ],
    // ── Domain registry ─────────────────────────────────────────────────
    // pos-strapi populates this from @rutba/api-provider/config/domains.
    // Each entry: { key: string, name: string, aliasKeys?: string[] }.
    domains: [],
    // ── Permission cache ────────────────────────────────────────────────
    cache: {
      enabled: true,
      ttlMs: 3e4,
      maxEntries: 5e3
    },
    // ── Authoring (file-based source of truth for interfaces/policies) ──
    // Files under {strapi.dirs.app.root}/{storageDir} are canonical;
    // DB tables (api_pro_interfaces, api_pro_interface_methods,
    // api_pro_method_policies) are mirrored on boot for runtime reads.
    storageDir: ".api-pro",
    // ── Scaffold integration (TypeScript client generation) ─────────────
    // Used by services/interfaces.js + services/scaffold.js to emit
    // typed clients into the @rutba/api-provider package.
    apiProviderRoot: "../../packages/api-provider",
    interfacesDir: "api",
    scaffoldScript: "scripts/scaffold-endpoint-providers.mjs",
    generatedClientDir: "providers/generated/client"
  },
  validator(config2) {
    if (!config2 || typeof config2 !== "object") {
      throw new Error("[api-pro] invalid plugin config: must be an object");
    }
    if (config2.bypassPaths != null && !Array.isArray(config2.bypassPaths)) {
      throw new Error("[api-pro] config.bypassPaths must be an array of strings");
    }
    if (config2.domains != null) {
      if (!Array.isArray(config2.domains)) {
        throw new Error("[api-pro] config.domains must be an array");
      }
      for (const entry of config2.domains) {
        if (!entry || typeof entry !== "object" || typeof entry.key !== "string") {
          throw new Error("[api-pro] config.domains entries require a string `key`");
        }
      }
    }
    if (config2.enforcementMode != null && !ENFORCEMENT_MODES.includes(config2.enforcementMode)) {
      throw new Error(
        `[api-pro] config.enforcementMode must be one of: ${ENFORCEMENT_MODES.join(", ")} (got '${config2.enforcementMode}')`
      );
    }
    if (config2.cache != null && typeof config2.cache !== "object") {
      throw new Error("[api-pro] config.cache must be an object");
    }
  }
};
const kind$6 = "collectionType";
const collectionName$6 = "api_pro_app_domains";
const info$6 = {
  singularName: "app-domain",
  pluralName: "app-domains",
  displayName: "App Domain",
  description: "Shallow app domain grouping"
};
const options$6 = {
  draftAndPublish: false
};
const pluginOptions$6 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$6 = {
  key: {
    type: "string",
    required: true,
    unique: true,
    regex: "^[a-z][a-z0-9_-]*$"
  },
  name: {
    type: "string",
    required: true
  },
  description: {
    type: "text"
  },
  isActive: {
    type: "boolean",
    "default": true
  },
  appRoles: {
    type: "relation",
    relation: "manyToMany",
    target: "plugin::api-pro.app-role",
    mappedBy: "appDomains"
  }
};
const require$$0$6 = {
  kind: kind$6,
  collectionName: collectionName$6,
  info: info$6,
  options: options$6,
  pluginOptions: pluginOptions$6,
  attributes: attributes$6
};
const schema$6 = require$$0$6;
var appDomain$1 = { schema: schema$6 };
const kind$5 = "collectionType";
const collectionName$5 = "api_pro_app_roles";
const info$5 = {
  singularName: "app-role",
  pluralName: "app-roles",
  displayName: "App Role",
  description: "Role mapped to Strapi admin role for app context validation"
};
const options$5 = {
  draftAndPublish: false
};
const pluginOptions$5 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$5 = {
  key: {
    type: "string",
    required: true,
    unique: true,
    regex: "^[a-z][a-z0-9_-]*$"
  },
  name: {
    type: "string",
    required: true
  },
  description: {
    type: "text"
  },
  isActive: {
    type: "boolean",
    "default": true
  },
  adminRoleCode: {
    type: "string",
    required: true
  },
  appDomains: {
    type: "relation",
    relation: "manyToMany",
    target: "plugin::api-pro.app-domain",
    inversedBy: "appRoles"
  },
  users: {
    type: "relation",
    relation: "manyToMany",
    target: "plugin::users-permissions.user",
    mappedBy: "app_roles",
    configurable: false,
    writable: false,
    visible: true
  }
};
const require$$0$5 = {
  kind: kind$5,
  collectionName: collectionName$5,
  info: info$5,
  options: options$5,
  pluginOptions: pluginOptions$5,
  attributes: attributes$5
};
const schema$5 = require$$0$5;
const RELATION_DEF = {
  type: "relation",
  relation: "manyToMany",
  target: "plugin::api-pro.app-role",
  inversedBy: "users",
  configurable: false,
  writable: true,
  visible: true
  // true = appears in admin content manager on the User form
  // useJoinTable: true,
};
const extendUserRelation = (strapi2) => {
  const upPlugin = strapi2.plugin("users-permissions");
  if (!upPlugin) {
    strapi2.log.warn("[api-pro] Could not extend user schema — plugin::users-permissions is not loaded.");
    return;
  }
  const containers = [
    upPlugin.contentTypes?.user?.schema?.attributes,
    upPlugin.contentTypes?.user?.attributes,
    upPlugin.contentTypes?.["plugin::users-permissions.user"]?.schema?.attributes,
    upPlugin.contentTypes?.["plugin::users-permissions.user"]?.attributes,
    strapi2.contentTypes?.["plugin::users-permissions.user"]?.schema?.attributes,
    strapi2.contentTypes?.["plugin::users-permissions.user"]?.attributes
  ].filter(Boolean);
  const uniqueContainers = Array.from(new Set(containers));
  if (uniqueContainers.length === 0) {
    strapi2.log.warn("[api-pro] users-permissions.user schema attributes not accessible.");
    return;
  }
  let patched = 0;
  for (const attrs of uniqueContainers) {
    if (!attrs.app_roles) {
      attrs.app_roles = { ...RELATION_DEF };
      patched += 1;
    }
  }
  if (patched > 0) {
    strapi2.log.info(`[api-pro] Injected app_roles onto plugin::users-permissions.user (${patched} container${patched === 1 ? "" : "s"})`);
  }
};
var appRole$1 = {
  schema: schema$5,
  extendUserRelation
};
const kind$4 = "collectionType";
const collectionName$4 = "api_pro_recording_sessions";
const info$4 = {
  singularName: "recording-session",
  pluralName: "recording-sessions",
  displayName: "Recording Session"
};
const options$4 = {
  draftAndPublish: false
};
const pluginOptions$4 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$4 = {
  key: {
    type: "uid",
    targetField: "name"
  },
  name: {
    type: "string",
    required: true
  },
  status: {
    type: "enumeration",
    "enum": [
      "idle",
      "recording",
      "stopped"
    ],
    "default": "idle"
  },
  startedAt: {
    type: "datetime"
  },
  stoppedAt: {
    type: "datetime"
  },
  startedByUserId: {
    type: "integer"
  },
  resolvedAppName: {
    type: "string"
  },
  resolvedRoleKey: {
    type: "string"
  },
  entries: {
    type: "relation",
    relation: "oneToMany",
    target: "plugin::api-pro.recording-entry",
    mappedBy: "session"
  }
};
const require$$0$4 = {
  kind: kind$4,
  collectionName: collectionName$4,
  info: info$4,
  options: options$4,
  pluginOptions: pluginOptions$4,
  attributes: attributes$4
};
const schema$4 = require$$0$4;
var recordingSession$1 = { schema: schema$4 };
const kind$3 = "collectionType";
const collectionName$3 = "api_pro_recording_entries";
const info$3 = {
  singularName: "recording-entry",
  pluralName: "recording-entries",
  displayName: "Recording Entry"
};
const options$3 = {
  draftAndPublish: false
};
const pluginOptions$3 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$3 = {
  recordKey: {
    type: "string",
    required: true
  },
  method: {
    type: "string",
    required: true
  },
  path: {
    type: "string",
    required: true
  },
  routeTemplate: {
    type: "string"
  },
  statusCode: {
    type: "integer"
  },
  query: {
    type: "json"
  },
  body: {
    type: "json"
  },
  headers: {
    type: "json"
  },
  claimedContext: {
    type: "json"
  },
  urlParts: {
    type: "json"
  },
  count: {
    type: "integer",
    "default": 1
  },
  lastSeenAt: {
    type: "datetime"
  },
  session: {
    type: "relation",
    relation: "manyToOne",
    target: "plugin::api-pro.recording-session",
    inversedBy: "entries"
  }
};
const require$$0$3 = {
  kind: kind$3,
  collectionName: collectionName$3,
  info: info$3,
  options: options$3,
  pluginOptions: pluginOptions$3,
  attributes: attributes$3
};
const schema$3 = require$$0$3;
var recordingEntry$1 = { schema: schema$3 };
const kind$2 = "collectionType";
const collectionName$2 = "api_pro_interfaces";
const info$2 = {
  singularName: "api-interface",
  pluralName: "api-interfaces",
  displayName: "API Interface"
};
const options$2 = {
  draftAndPublish: false
};
const pluginOptions$2 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$2 = {
  key: {
    type: "string",
    required: true,
    unique: true
  },
  name: {
    type: "string",
    required: true
  },
  filePath: {
    type: "string",
    required: true,
    unique: true
  },
  uid: {
    type: "string"
  },
  status: {
    type: "enumeration",
    "enum": [
      "generated",
      "modified",
      "manual"
    ],
    "default": "generated"
  },
  methods: {
    type: "relation",
    relation: "oneToMany",
    target: "plugin::api-pro.api-interface-method",
    mappedBy: "apiInterface"
  }
};
const require$$0$2 = {
  kind: kind$2,
  collectionName: collectionName$2,
  info: info$2,
  options: options$2,
  pluginOptions: pluginOptions$2,
  attributes: attributes$2
};
const schema$2 = require$$0$2;
var apiInterface$1 = { schema: schema$2 };
const kind$1 = "collectionType";
const collectionName$1 = "api_pro_interface_methods";
const info$1 = {
  singularName: "api-interface-method",
  pluralName: "api-interface-methods",
  displayName: "API Interface Method"
};
const options$1 = {
  draftAndPublish: false
};
const pluginOptions$1 = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes$1 = {
  key: {
    type: "string",
    required: true
  },
  name: {
    type: "string",
    required: true
  },
  action: {
    type: "string"
  },
  method: {
    type: "string",
    required: true
  },
  path: {
    type: "string",
    required: true
  },
  routeTokens: {
    type: "json"
  },
  inputSignature: {
    type: "json"
  },
  apps: {
    type: "json"
  },
  appRoles: {
    type: "json"
  },
  apiInterface: {
    type: "relation",
    relation: "manyToOne",
    target: "plugin::api-pro.api-interface",
    inversedBy: "methods"
  },
  policies: {
    type: "relation",
    relation: "oneToMany",
    target: "plugin::api-pro.api-method-policy",
    mappedBy: "interfaceMethod"
  }
};
const require$$0$1 = {
  kind: kind$1,
  collectionName: collectionName$1,
  info: info$1,
  options: options$1,
  pluginOptions: pluginOptions$1,
  attributes: attributes$1
};
const schema$1 = require$$0$1;
var apiInterfaceMethod$1 = { schema: schema$1 };
const kind = "collectionType";
const collectionName = "api_pro_method_policies";
const info = {
  singularName: "api-method-policy",
  pluralName: "api-method-policies",
  displayName: "API Method Policy"
};
const options = {
  draftAndPublish: false
};
const pluginOptions = {
  "content-manager": {
    visible: false
  },
  "content-type-builder": {
    visible: false
  }
};
const attributes = {
  key: {
    type: "string",
    required: true
  },
  name: {
    type: "string"
  },
  roleKey: {
    type: "string",
    required: true
  },
  resolverMode: {
    type: "enumeration",
    "enum": [
      "strict",
      "lenient"
    ],
    "default": "strict"
  },
  filtersTemplate: {
    type: "json",
    "default": {}
  },
  populateTemplate: {
    type: "json",
    "default": {}
  },
  bodyTemplate: {
    type: "json",
    "default": {}
  },
  queryTemplate: {
    type: "json",
    "default": {}
  },
  templateVersion: {
    type: "integer",
    "default": 1
  },
  interfaceMethod: {
    type: "relation",
    relation: "manyToOne",
    target: "plugin::api-pro.api-interface-method",
    inversedBy: "policies"
  }
};
const require$$0 = {
  kind,
  collectionName,
  info,
  options,
  pluginOptions,
  attributes
};
const schema = require$$0;
var apiMethodPolicy$1 = { schema };
const appDomain = appDomain$1;
const appRole = appRole$1;
const recordingSession = recordingSession$1;
const recordingEntry = recordingEntry$1;
const apiInterface = apiInterface$1;
const apiInterfaceMethod = apiInterfaceMethod$1;
const apiMethodPolicy = apiMethodPolicy$1;
var contentTypes$1 = {
  "app-domain": appDomain,
  "app-role": appRole,
  "recording-session": recordingSession,
  "recording-entry": recordingEntry,
  "api-interface": apiInterface,
  "api-interface-method": apiInterfaceMethod,
  "api-method-policy": apiMethodPolicy
};
var health$1 = {
  async check(ctx) {
    ctx.body = {
      ok: true,
      plugin: "api-pro",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
};
var recordings$3 = {
  async start(ctx) {
    const payload = ctx.request.body || {};
    const context2 = ctx.state.apiProContext;
    const session = await strapi.plugin("api-pro").service("recordings").startSession(strapi, context2, payload);
    ctx.body = { data: session };
  },
  async stop(ctx) {
    const session = await strapi.plugin("api-pro").service("recordings").stopSession(strapi);
    ctx.body = { data: session };
  },
  async list(ctx) {
    const sessions = await strapi.plugin("api-pro").service("recordings").listSessions(strapi);
    ctx.body = { data: sessions };
  },
  async entries(ctx) {
    const sessionId = Number(ctx.params.sessionId);
    if (!sessionId) {
      ctx.badRequest("sessionId is required");
      return;
    }
    const entries = await strapi.plugin("api-pro").service("recordings").listEntries(strapi, sessionId);
    ctx.body = { data: entries };
  }
};
var interfaces$3 = {
  async list(ctx) {
    const data = await strapi.plugin("api-pro").service("interfaces").listInterfaces(strapi);
    ctx.body = { data };
  },
  async createFromRecordings(ctx) {
    try {
      const data = await strapi.plugin("api-pro").service("interfaces").createFromRecordings(strapi, ctx.request.body || {});
      ctx.body = { data };
    } catch (error) {
      ctx.badRequest(error.message);
    }
  },
  async createFromContentType(ctx) {
    try {
      const data = await strapi.plugin("api-pro").service("interfaces").createFromContentType(strapi, ctx.request.body || {});
      ctx.body = { data };
    } catch (error) {
      ctx.badRequest(error.message);
    }
  },
  async upsertMethod(ctx) {
    const interfaceId = Number(ctx.params.interfaceId);
    if (!interfaceId) {
      ctx.badRequest("interfaceId is required");
      return;
    }
    try {
      const data = await strapi.plugin("api-pro").service("interfaces").upsertMethod(strapi, interfaceId, ctx.request.body || {});
      ctx.body = {
        data,
        meta: {
          guidedFixApplied: Boolean(ctx.request.body?.guidedFix)
        }
      };
    } catch (error) {
      if (error.code === "ROUTE_PARAM_MISMATCH") {
        ctx.status = 422;
        ctx.body = {
          error: {
            code: error.code,
            message: error.message,
            details: error.details || null
          }
        };
        return;
      }
      ctx.badRequest(error.message);
    }
  },
  async validateAlignment(ctx) {
    const body = ctx.request.body || {};
    const path2 = body.path || "";
    const inputSignature = Array.isArray(body.inputSignature) ? body.inputSignature : [];
    const data = strapi.plugin("api-pro").service("interfaces").previewAlignment(path2, inputSignature);
    ctx.body = { data };
  },
  async previewGuidedFix(ctx) {
    const body = ctx.request.body || {};
    const path2 = body.path || "";
    const inputSignature = Array.isArray(body.inputSignature) ? body.inputSignature : [];
    const preview = strapi.plugin("api-pro").service("interfaces").previewAlignment(path2, inputSignature);
    ctx.body = {
      data: {
        ...preview,
        applyPayload: {
          guidedFix: true,
          inputSignature: preview.suggestedSignature
        }
      }
    };
  },
  async lintScaffold(ctx) {
    const data = await strapi.plugin("api-pro").service("scaffoldRunner").lintMethodAlignment(strapi);
    ctx.body = { data };
  },
  async scaffold(ctx) {
    const { interfaceKey } = ctx.params;
    if (!interfaceKey) {
      ctx.status = 400;
      ctx.body = { error: { message: "interfaceKey is required" } };
      return;
    }
    try {
      const data = await strapi.plugin("api-pro").service("scaffold").generate(strapi, interfaceKey);
      ctx.body = { data };
    } catch (error) {
      ctx.status = error?.status || 500;
      ctx.body = { error: { message: error?.message || "Failed to scaffold interface" } };
    }
  }
};
var users$3 = {
  async list(ctx) {
    const users2 = await strapi.plugin("api-pro").service("users").listUsers(strapi);
    ctx.body = { data: users2 || [] };
  },
  async roleOptions(ctx) {
    const options2 = await strapi.plugin("api-pro").service("users").listAppRoleOptions(strapi);
    ctx.body = { data: options2 || [] };
  },
  async assignRoles(ctx) {
    const userId = Number(ctx.params.id);
    const body = ctx.request.body?.data || ctx.request.body || {};
    const roleIds = Array.isArray(body.roleIds) ? body.roleIds : [];
    try {
      const data = await strapi.plugin("api-pro").service("users").assignUserAppRoles(strapi, userId, roleIds);
      ctx.body = { data };
    } catch (error) {
      const status = error?.status || 400;
      ctx.status = status;
      ctx.body = {
        error: {
          message: error.message || "Failed to assign app roles"
        }
      };
    }
  }
};
var me$1 = {
  async permissions(ctx) {
    const user = ctx.state?.user;
    if (!user?.id) {
      ctx.status = 401;
      ctx.body = { error: { code: "AUTH_REQUIRED", message: "Authenticated user required" } };
      return;
    }
    const payload = await strapi.plugin("api-pro").service("mePermissions").build(strapi, user.id);
    ctx.body = payload;
  }
};
const DOMAIN_UID = "plugin::api-pro.app-domain";
const ROLE_UID = "plugin::api-pro.app-role";
function pickDomainInput(body) {
  const data = body?.data || body || {};
  return {
    key: typeof data.key === "string" ? data.key.toLowerCase().trim() : void 0,
    name: typeof data.name === "string" ? data.name.trim() : void 0,
    description: typeof data.description === "string" ? data.description : void 0,
    isActive: typeof data.isActive === "boolean" ? data.isActive : void 0
  };
}
function pickRoleInput(body) {
  const data = body?.data || body || {};
  return {
    key: typeof data.key === "string" ? data.key.toLowerCase().trim() : void 0,
    name: typeof data.name === "string" ? data.name.trim() : void 0,
    description: typeof data.description === "string" ? data.description : void 0,
    isActive: typeof data.isActive === "boolean" ? data.isActive : void 0,
    adminRoleCode: typeof data.adminRoleCode === "string" ? data.adminRoleCode : void 0,
    appDomains: Array.isArray(data.appDomains) ? data.appDomains.map(Number).filter(Boolean) : void 0
  };
}
function sendError$1(ctx, status, message, code) {
  ctx.status = status;
  ctx.body = { error: { code: code || "API_PRO_ERROR", message } };
}
var domains$1 = {
  // ── Domains ───────────────────────────────────────────────────────────
  async listDomains(ctx) {
    const data = await strapi.db.query(DOMAIN_UID).findMany({
      populate: { appRoles: true },
      orderBy: { key: "asc" }
    });
    ctx.body = { data };
  },
  async createDomain(ctx) {
    const input = pickDomainInput(ctx.request.body);
    if (!input.key || !input.name) {
      return sendError$1(ctx, 400, "key and name are required", "VALIDATION_FAILED");
    }
    try {
      const data = await strapi.db.query(DOMAIN_UID).create({ data: input });
      strapi.apiPro?.clearAllCache?.();
      ctx.body = { data };
    } catch (error) {
      sendError$1(ctx, 400, error?.message || "Failed to create domain");
    }
  },
  async updateDomain(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError$1(ctx, 400, "id is required", "VALIDATION_FAILED");
    const input = pickDomainInput(ctx.request.body);
    const data = await strapi.db.query(DOMAIN_UID).update({
      where: { id },
      data: input
    });
    if (!data) return sendError$1(ctx, 404, `domain ${id} not found`, "NOT_FOUND");
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  },
  async deleteDomain(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError$1(ctx, 400, "id is required", "VALIDATION_FAILED");
    const data = await strapi.db.query(DOMAIN_UID).delete({ where: { id } });
    if (!data) return sendError$1(ctx, 404, `domain ${id} not found`, "NOT_FOUND");
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  },
  // ── Roles ─────────────────────────────────────────────────────────────
  async listRoles(ctx) {
    const data = await strapi.db.query(ROLE_UID).findMany({
      populate: { appDomains: true },
      orderBy: { key: "asc" }
    });
    ctx.body = { data };
  },
  async createRole(ctx) {
    const input = pickRoleInput(ctx.request.body);
    if (!input.key || !input.name) {
      return sendError$1(ctx, 400, "key and name are required", "VALIDATION_FAILED");
    }
    const payload = {
      ...input,
      adminRoleCode: input.adminRoleCode || input.key,
      appDomains: input.appDomains || []
    };
    try {
      const data = await strapi.db.query(ROLE_UID).create({ data: payload });
      strapi.apiPro?.clearAllCache?.();
      ctx.body = { data };
    } catch (error) {
      sendError$1(ctx, 400, error?.message || "Failed to create role");
    }
  },
  async updateRole(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError$1(ctx, 400, "id is required", "VALIDATION_FAILED");
    const input = pickRoleInput(ctx.request.body);
    const data = await strapi.db.query(ROLE_UID).update({
      where: { id },
      data: input
    });
    if (!data) return sendError$1(ctx, 404, `role ${id} not found`, "NOT_FOUND");
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  },
  async deleteRole(ctx) {
    const id = Number(ctx.params.id);
    if (!id) return sendError$1(ctx, 400, "id is required", "VALIDATION_FAILED");
    const data = await strapi.db.query(ROLE_UID).delete({ where: { id } });
    if (!data) return sendError$1(ctx, 404, `role ${id} not found`, "NOT_FOUND");
    strapi.apiPro?.clearAllCache?.();
    ctx.body = { data };
  }
};
function sendError(ctx, status, message, code) {
  ctx.status = status;
  ctx.body = { error: { code: code || "API_PRO_ERROR", message } };
}
var policies$5 = {
  async list(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.query || {};
    const data = await strapi.plugin("api-pro").service("policies").list(strapi, { interfaceKey, methodKey, roleKey });
    ctx.body = { data };
  },
  async findOne(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.params;
    const data = await strapi.plugin("api-pro").service("policies").findOne(strapi, { interfaceKey, methodKey, roleKey });
    if (!data) return sendError(ctx, 404, "policy not found", "NOT_FOUND");
    ctx.body = { data };
  },
  async upsert(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const data = await strapi.plugin("api-pro").service("policies").upsert(strapi, { interfaceKey, methodKey, roleKey, data: body });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 400, error?.message || "Failed to save policy");
    }
  },
  async remove(ctx) {
    const { interfaceKey, methodKey, roleKey } = ctx.params;
    try {
      const data = await strapi.plugin("api-pro").service("policies").remove(strapi, { interfaceKey, methodKey, roleKey });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 400, error?.message || "Failed to delete policy");
    }
  }
};
const health = health$1;
const recordings$2 = recordings$3;
const interfaces$2 = interfaces$3;
const users$2 = users$3;
const me = me$1;
const domains = domains$1;
const policies$4 = policies$5;
var controllers$1 = {
  health,
  recordings: recordings$2,
  interfaces: interfaces$2,
  users: users$2,
  me,
  domains,
  policies: policies$4
};
var routes$1 = {
  "content-api": {
    type: "content-api",
    routes: [
      {
        method: "GET",
        path: "/me/permissions",
        handler: "me.permissions",
        config: {
          policies: []
        }
      }
    ]
  },
  admin: {
    type: "admin",
    routes: [
      // ── Users ────────────────────────────────────────────────────────
      {
        method: "GET",
        path: "/users",
        handler: "users.list",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "GET",
        path: "/users/role-options",
        handler: "users.roleOptions",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "PUT",
        path: "/users/:id/roles",
        handler: "users.assignRoles",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      // ── Recordings ───────────────────────────────────────────────────
      {
        method: "POST",
        path: "/recordings/start",
        handler: "recordings.start",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "POST",
        path: "/recordings/stop",
        handler: "recordings.stop",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "GET",
        path: "/recordings",
        handler: "recordings.list",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "GET",
        path: "/recordings/:sessionId/entries",
        handler: "recordings.entries",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      // ── Interfaces ───────────────────────────────────────────────────
      {
        method: "GET",
        path: "/interfaces",
        handler: "interfaces.list",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "POST",
        path: "/interfaces/from-recordings",
        handler: "interfaces.createFromRecordings",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "POST",
        path: "/interfaces/from-content-type",
        handler: "interfaces.createFromContentType",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "PATCH",
        path: "/interfaces/:interfaceId/methods",
        handler: "interfaces.upsertMethod",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "GET",
        path: "/interfaces/lint-scaffold",
        handler: "interfaces.lintScaffold",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "POST",
        path: "/interfaces/validate-alignment",
        handler: "interfaces.validateAlignment",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "POST",
        path: "/interfaces/preview-guided-fix",
        handler: "interfaces.previewGuidedFix",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "GET",
        path: "/interfaces/:interfaceKey/scaffold",
        handler: "interfaces.scaffold",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      // ── Domains & Roles ──────────────────────────────────────────────
      {
        method: "GET",
        path: "/domains",
        handler: "domains.listDomains",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "POST",
        path: "/domains",
        handler: "domains.createDomain",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "PUT",
        path: "/domains/:id",
        handler: "domains.updateDomain",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "DELETE",
        path: "/domains/:id",
        handler: "domains.deleteDomain",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "GET",
        path: "/roles",
        handler: "domains.listRoles",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "POST",
        path: "/roles",
        handler: "domains.createRole",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "PUT",
        path: "/roles/:id",
        handler: "domains.updateRole",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "DELETE",
        path: "/roles/:id",
        handler: "domains.deleteRole",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      // ── Method Policies ──────────────────────────────────────────────
      {
        method: "GET",
        path: "/policies",
        handler: "policies.list",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "GET",
        path: "/policies/:interfaceKey/:methodKey/:roleKey",
        handler: "policies.findOne",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "PUT",
        path: "/policies/:interfaceKey/:methodKey/:roleKey",
        handler: "policies.upsert",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      {
        method: "DELETE",
        path: "/policies/:interfaceKey/:methodKey/:roleKey",
        handler: "policies.remove",
        config: { middlewares: ["plugin::api-pro.appContext"], policies: [] }
      },
      // ── Health ───────────────────────────────────────────────────────
      {
        method: "GET",
        path: "/health",
        handler: "health.check",
        config: { policies: [] }
      }
    ]
  }
};
function getHeader(ctx, key) {
  const raw = ctx?.request?.headers?.[String(key).toLowerCase()];
  return typeof raw === "string" ? raw.trim() : "";
}
function readBoolHeader(ctx, key) {
  const v = ctx?.request?.headers?.[String(key).toLowerCase()];
  return v === true || v === "true" || v === "1" || v === 1;
}
function normalizeKey$1(value) {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && typeof value.key === "string") {
    return value.key.toLowerCase();
  }
  return null;
}
function createValidationError(message, code, status = 403) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}
function readHeaderKeys(strapi2) {
  const cfg = strapi2.config.get("plugin::api-pro") || {};
  return {
    domain: (cfg.headerDomainKey || "x-rutba-app").toLowerCase(),
    elevated: (cfg.headerElevatedKey || "x-rutba-app-admin").toLowerCase()
  };
}
async function loadUserAppRoles(strapi2, userId) {
  if (!userId) return [];
  try {
    const user = await strapi2.db.query("plugin::users-permissions.user").findOne({
      where: { id: userId },
      populate: { app_roles: { populate: { appDomains: true } }, role: true }
    });
    return Array.isArray(user?.app_roles) ? user.app_roles : [];
  } catch (error) {
    strapi2.log.warn(`[api-pro] failed to load app_roles for user ${userId}: ${error?.message}`);
    return [];
  }
}
function filterRolesByApp(appRoles, appName) {
  if (!appName) return appRoles;
  const wanted = appName.toLowerCase();
  return appRoles.filter((role) => {
    const domains2 = Array.isArray(role.appDomains) ? role.appDomains : [];
    if (domains2.length === 0) return true;
    return domains2.some((d) => normalizeKey$1(d) === wanted);
  });
}
async function resolveClaim(ctx, strapi2, { requireApp = true, requireActiveRole = true } = {}) {
  const user = ctx?.state?.user;
  if (!user?.id) {
    throw createValidationError("Authenticated user required", "AUTH_REQUIRED", 401);
  }
  const headerKeys = readHeaderKeys(strapi2);
  const appName = getHeader(ctx, headerKeys.domain);
  const elevated = readBoolHeader(ctx, headerKeys.elevated);
  if (requireApp && !appName) {
    throw createValidationError(
      `Missing app context header '${headerKeys.domain}'`,
      "APP_CONTEXT_REQUIRED",
      400
    );
  }
  const appRoles = await loadUserAppRoles(strapi2, user.id);
  const activeRoles = filterRolesByApp(appRoles, appName);
  if (requireActiveRole && appName && activeRoles.length === 0) {
    throw createValidationError(
      `User has no app_role assigned for app '${appName}'`,
      "NO_ACTIVE_ROLE",
      403
    );
  }
  const activeRoleKeys = activeRoles.map((r) => normalizeKey$1(r)).filter(Boolean);
  const activeDomainKeys = Array.from(
    new Set(
      activeRoles.flatMap((r) => Array.isArray(r.appDomains) ? r.appDomains : []).map((d) => normalizeKey$1(d)).filter(Boolean)
    )
  );
  return {
    user: {
      id: user.id,
      email: user.email || null,
      username: user.username || null
    },
    appName: appName || null,
    elevated,
    roleKeys: activeRoleKeys,
    domainKeys: activeDomainKeys,
    // Full role objects retained for /me/permissions response shaping.
    appRoles: activeRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key,
      adminRoleCode: r.adminRoleCode || null,
      appDomains: Array.isArray(r.appDomains) ? r.appDomains.map((d) => ({ id: d.id, key: d.key, name: d.name || d.key })) : []
    }))
  };
}
var context$1 = {
  resolveClaim,
  loadUserAppRoles,
  filterRolesByApp
};
const SESSION_UID = "plugin::api-pro.recording-session";
const ENTRY_UID = "plugin::api-pro.recording-entry";
async function getActiveSession(strapi2) {
  return await strapi2.db.query(SESSION_UID).findOne({
    where: { status: "recording" },
    orderBy: { createdAt: "desc" }
  });
}
async function startSession(strapi2, context2, payload = {}) {
  const active = await getActiveSession(strapi2);
  if (active) return active;
  const now = /* @__PURE__ */ new Date();
  const appName = context2?.claim?.appName || "unknown-app";
  const roleKey = context2?.claim?.roleKey || "unknown-role";
  return await strapi2.db.query(SESSION_UID).create({
    data: {
      name: payload.name || `${appName}:${roleKey}:${now.toISOString()}`,
      status: "recording",
      startedAt: now,
      startedByUserId: context2?.user?.id || null,
      resolvedAppName: appName,
      resolvedRoleKey: roleKey
    }
  });
}
async function stopSession(strapi2) {
  const active = await getActiveSession(strapi2);
  if (!active) return null;
  return await strapi2.db.query(SESSION_UID).update({
    where: { id: active.id },
    data: {
      status: "stopped",
      stoppedAt: /* @__PURE__ */ new Date()
    }
  });
}
async function listSessions(strapi2) {
  return await strapi2.db.query(SESSION_UID).findMany({
    orderBy: { createdAt: "desc" }
  });
}
async function listEntries(strapi2, sessionId) {
  return await strapi2.db.query(ENTRY_UID).findMany({
    where: { session: sessionId },
    orderBy: { updatedAt: "desc" }
  });
}
var recordings$1 = {
  startSession,
  stopSession,
  listSessions,
  listEntries,
  getActiveSession
};
const path = require$$1;
const API_INTERFACE_UID = "plugin::api-pro.api-interface";
const API_METHOD_UID = "plugin::api-pro.api-interface-method";
function extractRouteTokens(routePath) {
  const path2 = String(routePath || "");
  const colonTokens = path2.split("/").filter(Boolean).filter((segment) => segment.startsWith(":")).map((segment) => segment.slice(1));
  const templateTokens = [];
  const templateRegex = /\$\{\s*([a-zA-Z_$][\w$]*)\s*\}/g;
  let match;
  while ((match = templateRegex.exec(path2)) !== null) {
    templateTokens.push(match[1]);
  }
  return [.../* @__PURE__ */ new Set([...colonTokens, ...templateTokens])];
}
function alignSignature(routePath, signature = []) {
  const tokens = extractRouteTokens(routePath);
  const mismatches = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const expected = tokens[i];
    const actual = String(signature[i] || "").trim();
    if (!actual || actual !== expected) {
      mismatches.push({ index: i, expected, actual: actual || null });
    }
  }
  return {
    tokens,
    signature,
    mismatches,
    aligned: mismatches.length === 0
  };
}
function deriveFilePath(key) {
  const safe = String(key || "interface").toLowerCase().replace(/[^a-z0-9-_]/g, "-");
  return `api/${safe}.js`;
}
async function listInterfaces(strapi2) {
  return await strapi2.db.query(API_INTERFACE_UID).findMany({
    populate: {
      methods: true
    },
    orderBy: { updatedAt: "desc" }
  });
}
async function createFromRecordings(strapi2, payload = {}) {
  const key = payload.key || payload.name;
  if (!key) {
    throw new Error("key or name is required");
  }
  const created = await strapi2.db.query(API_INTERFACE_UID).create({
    data: {
      key,
      name: payload.name || key,
      filePath: payload.filePath || deriveFilePath(key),
      uid: payload.uid || null,
      status: "generated"
    }
  });
  return created;
}
async function createFromContentType(strapi2, payload = {}) {
  const uid = String(payload.uid || "").trim();
  if (!uid) {
    throw new Error("content type uid is required");
  }
  const key = uid.split(".").pop() || uid;
  return await strapi2.db.query(API_INTERFACE_UID).create({
    data: {
      key,
      name: payload.name || key,
      filePath: payload.filePath || deriveFilePath(key),
      uid,
      status: "generated"
    }
  });
}
async function upsertMethod(strapi2, interfaceId, payload = {}) {
  const methodName = String(payload.name || "").trim();
  const routePath = String(payload.path || "").trim();
  const method = String(payload.method || "").toLowerCase();
  if (!methodName || !routePath || !method) {
    throw new Error("name, path and method are required");
  }
  const signature = Array.isArray(payload.inputSignature) ? payload.inputSignature : [];
  const alignment = alignSignature(routePath, signature);
  const guidedFix = Boolean(payload.guidedFix);
  if (!alignment.aligned && payload.strictAlignment !== false && !guidedFix) {
    const detail = alignment.mismatches.map((m) => `index ${m.index}: expected '${m.expected}' got '${m.actual || "<empty>"}'`).join("; ");
    const err = new Error(`Route parameter mismatch: ${detail}`);
    err.code = "ROUTE_PARAM_MISMATCH";
    err.details = alignment;
    throw err;
  }
  const existing = await strapi2.db.query(API_METHOD_UID).findOne({
    where: {
      apiInterface: interfaceId,
      name: methodName
    }
  });
  const data = {
    key: `${interfaceId}:${methodName}`,
    name: methodName,
    action: payload.action || null,
    method,
    path: routePath,
    routeTokens: alignment.tokens,
    inputSignature: alignment.aligned ? signature : guidedFix ? alignment.tokens : signature,
    apps: payload.apps || [],
    appRoles: payload.appRoles || [],
    apiInterface: interfaceId
  };
  if (existing) {
    return await strapi2.db.query(API_METHOD_UID).update({
      where: { id: existing.id },
      data
    });
  }
  return await strapi2.db.query(API_METHOD_UID).create({ data });
}
function previewAlignment(routePath, signature = []) {
  const alignment = alignSignature(routePath, signature);
  return {
    ...alignment,
    suggestedSignature: alignment.tokens
  };
}
function resolveApiProviderPaths(strapi2) {
  const pluginConfig = strapi2.config.get("plugin::api-pro") || {};
  const root = path.resolve(process.cwd(), pluginConfig.apiProviderRoot || "../../api-provider");
  return {
    root,
    interfacesDir: path.join(root, pluginConfig.interfacesDir || "api")
  };
}
var interfaces$1 = {
  extractRouteTokens,
  alignSignature,
  listInterfaces,
  createFromRecordings,
  createFromContentType,
  upsertMethod,
  previewAlignment,
  resolveApiProviderPaths
};
const POLICY_UID$1 = "plugin::api-pro.api-method-policy";
const USER_UID$1 = "plugin::users-permissions.user";
function normalizeKey(value) {
  if (typeof value === "string") return value.toLowerCase();
  if (value && typeof value === "object" && typeof value.key === "string") {
    return value.key.toLowerCase();
  }
  return null;
}
function uniqueBy(items, keyFn) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (key == null || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
function shapePolicyForResponse(policy) {
  return {
    id: policy.id,
    key: policy.key,
    name: policy.name || policy.key,
    roleKey: policy.roleKey,
    resolverMode: policy.resolverMode || "strict",
    filtersTemplate: policy.filtersTemplate || {},
    populateTemplate: policy.populateTemplate || {},
    bodyTemplate: policy.bodyTemplate || {},
    queryTemplate: policy.queryTemplate || {}
  };
}
async function loadUser(strapi2, userId) {
  return strapi2.db.query(USER_UID$1).findOne({
    where: { id: userId },
    populate: {
      role: true,
      app_roles: { populate: { appDomains: true } }
    }
  });
}
async function loadPoliciesForRoles(strapi2, roleKeys) {
  if (roleKeys.length === 0) return [];
  return strapi2.db.query(POLICY_UID$1).findMany({
    where: { roleKey: { $in: roleKeys } },
    populate: { interfaceMethod: { populate: { apiInterface: true } } }
  });
}
async function gatherExtraRoleKeys(strapi2, user) {
  const providers = strapi2.apiPro?.roleProviders || [];
  const extras = [];
  for (const provide of providers) {
    try {
      const result = await provide(user, { strapi: strapi2 });
      if (Array.isArray(result)) {
        for (const k of result) {
          const normalized = normalizeKey(k);
          if (normalized) extras.push(normalized);
        }
      }
    } catch (error) {
      strapi2.log.warn(`[api-pro] role provider failed: ${error?.message}`);
    }
  }
  return extras;
}
async function build(strapi2, userId) {
  const cfg = strapi2.config.get("plugin::api-pro") || {};
  const sessionTimeout = Number.isFinite(cfg.sessionTimeout) ? cfg.sessionTimeout : 3600;
  const user = await loadUser(strapi2, userId);
  if (!user) {
    return {
      role: null,
      roleType: null,
      domains: [],
      appRoles: [],
      permissions: {},
      strapiPermissions: [],
      sessionTimeout
    };
  }
  const appRoles = Array.isArray(user.app_roles) ? user.app_roles : [];
  const directRoleKeys = appRoles.map((r) => normalizeKey(r)).filter(Boolean);
  const extraRoleKeys = await gatherExtraRoleKeys(strapi2, user);
  const allRoleKeys = Array.from(/* @__PURE__ */ new Set([...directRoleKeys, ...extraRoleKeys]));
  const domainEntries = [];
  for (const role of appRoles) {
    const roleKey = normalizeKey(role);
    const domains3 = Array.isArray(role.appDomains) ? role.appDomains : [];
    for (const d of domains3) {
      const domainKey = normalizeKey(d);
      if (!domainKey) continue;
      domainEntries.push({
        key: domainKey,
        name: d.name || domainKey,
        roleKey
      });
    }
  }
  const domains2 = uniqueBy(domainEntries, (e) => `${e.key}|${e.roleKey}`);
  const policies2 = await loadPoliciesForRoles(strapi2, allRoleKeys);
  const permissions = {};
  for (const policy of policies2) {
    const ctUid = policy.interfaceMethod?.apiInterface?.uid;
    const action = policy.interfaceMethod?.action;
    if (!ctUid || !action) continue;
    permissions[ctUid] = permissions[ctUid] || {};
    permissions[ctUid][action] = permissions[ctUid][action] || { allowed: true, policies: [] };
    permissions[ctUid][action].policies.push(shapePolicyForResponse(policy));
  }
  const strapiRole = user.role || null;
  const strapiPermissions = Array.isArray(strapiRole?.permissions) ? strapiRole.permissions : [];
  return {
    role: strapiRole?.name || null,
    roleType: strapiRole?.type || null,
    domains: domains2,
    appRoles: appRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key
    })),
    permissions,
    strapiPermissions,
    sessionTimeout
  };
}
var mePermissions$1 = {
  build,
  gatherExtraRoleKeys
};
const USER_UID = "plugin::users-permissions.user";
const APP_ROLE_UID = "plugin::api-pro.app-role";
async function listUsers(strapi2) {
  return await strapi2.db.query(USER_UID).findMany({
    orderBy: { id: "asc" },
    select: ["id", "username", "email", "displayName", "blocked", "confirmed"],
    populate: {
      role: { select: ["id", "name", "type"] },
      app_roles: {
        select: ["id", "key", "name", "isActive", "adminRoleCode"],
        populate: { appDomains: { select: ["id", "key", "name"] } }
      }
    }
  });
}
async function listAppRoleOptions(strapi2) {
  return await strapi2.db.query(APP_ROLE_UID).findMany({
    where: { isActive: true },
    orderBy: { key: "asc" },
    select: ["id", "key", "name", "adminRoleCode"],
    populate: {
      appDomains: { select: ["id", "key", "name"] }
    }
  });
}
async function assignUserAppRoles(strapi2, userId, roleIds) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error("Invalid user id");
    err.status = 400;
    throw err;
  }
  const validRoleIds = (Array.isArray(roleIds) ? roleIds : []).map(Number).filter((v) => Number.isFinite(v) && v > 0);
  const user = await strapi2.db.query(USER_UID).findOne({ where: { id } });
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  await strapi2.entityService.update(USER_UID, id, {
    data: {
      app_roles: { set: validRoleIds }
    }
  });
  return await strapi2.db.query(USER_UID).findOne({
    where: { id },
    select: ["id", "username", "email", "displayName"],
    populate: {
      app_roles: {
        select: ["id", "key", "name", "isActive", "adminRoleCode"],
        populate: { appDomains: { select: ["id", "key", "name"] } }
      }
    }
  });
}
var users$1 = {
  listUsers,
  listAppRoleOptions,
  assignUserAppRoles
};
const METHOD_UID = "plugin::api-pro.api-interface-method";
async function lintMethodAlignment(strapi2) {
  const methods = await strapi2.db.query(METHOD_UID).findMany({
    select: ["id", "name", "path", "inputSignature", "method"],
    populate: {
      apiInterface: {
        select: ["id", "key", "name", "filePath"]
      }
    }
  });
  const interfacesService = strapi2.plugin("api-pro").service("interfaces");
  const issues = [];
  for (const m of methods) {
    const signature = Array.isArray(m.inputSignature) ? m.inputSignature : [];
    const alignment = interfacesService.previewAlignment(m.path, signature);
    if (!alignment.aligned) {
      issues.push({
        methodId: m.id,
        interface: m.apiInterface || null,
        name: m.name,
        httpMethod: m.method,
        path: m.path,
        signature,
        expected: alignment.tokens,
        mismatches: alignment.mismatches
      });
    }
  }
  return {
    ok: issues.length === 0,
    totalMethods: methods.length,
    issueCount: issues.length,
    issues
  };
}
var scaffoldRunner$1 = {
  lintMethodAlignment
};
const fileStore$2 = fileStore$4;
const sync$1 = sync$2;
const POLICY_UID = "plugin::api-pro.api-method-policy";
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
    interfaceMethod: row.interfaceMethod ? { id: row.interfaceMethod.id, key: row.interfaceMethod.key, name: row.interfaceMethod.name } : null
  };
}
async function list(strapi2, { interfaceKey, methodKey, roleKey } = {}) {
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
  const rows = await strapi2.db.query(POLICY_UID).findMany({
    where,
    populate: { interfaceMethod: { populate: { apiInterface: true } } },
    orderBy: { roleKey: "asc" }
  });
  return rows.map(shape);
}
async function findOne(strapi2, { interfaceKey, methodKey, roleKey }) {
  const row = await strapi2.db.query(POLICY_UID).findOne({
    where: {
      key: `${interfaceKey}:${methodKey}:${String(roleKey).toLowerCase()}`
    },
    populate: { interfaceMethod: { populate: { apiInterface: true } } }
  });
  return shape(row);
}
async function upsert(strapi2, { interfaceKey, methodKey, roleKey, data }) {
  if (!interfaceKey || !methodKey || !roleKey) {
    const err = new Error("interfaceKey, methodKey and roleKey are required");
    err.status = 400;
    throw err;
  }
  const normalizedRoleKey = String(roleKey).toLowerCase();
  const fileData = {
    name: data?.name || `${interfaceKey}:${methodKey}:${normalizedRoleKey}`,
    resolverMode: data?.resolverMode === "lenient" ? "lenient" : "strict",
    filtersTemplate: data?.filtersTemplate || {},
    populateTemplate: data?.populateTemplate || {},
    bodyTemplate: data?.bodyTemplate || {},
    queryTemplate: data?.queryTemplate || {},
    templateVersion: Number.isInteger(data?.templateVersion) ? data.templateVersion : 1
  };
  await fileStore$2.writePolicy(strapi2, interfaceKey, methodKey, normalizedRoleKey, fileData);
  await sync$1.syncPolicyWrite(strapi2, interfaceKey, methodKey, normalizedRoleKey);
  strapi2.apiPro?.clearAllCache?.();
  return findOne(strapi2, { interfaceKey, methodKey, roleKey: normalizedRoleKey });
}
async function remove(strapi2, { interfaceKey, methodKey, roleKey }) {
  if (!interfaceKey || !methodKey || !roleKey) {
    const err = new Error("interfaceKey, methodKey and roleKey are required");
    err.status = 400;
    throw err;
  }
  const normalizedRoleKey = String(roleKey).toLowerCase();
  await fileStore$2.deletePolicy(strapi2, interfaceKey, methodKey, normalizedRoleKey);
  await sync$1.syncPolicyDelete(strapi2, interfaceKey, methodKey, normalizedRoleKey);
  strapi2.apiPro?.clearAllCache?.();
  return { interfaceKey, methodKey, roleKey: normalizedRoleKey, deleted: true };
}
var policies$3 = {
  list,
  findOne,
  upsert,
  remove
};
const fileStore$1 = fileStore$4;
const INTERFACE_UID = "plugin::api-pro.api-interface";
const CRUD_OPTIONS = {
  find: ["filters", "populate", "fields", "pagination", "sort", "publicationState", "locale"],
  findOne: ["populate", "fields", "publicationState", "locale"],
  create: ["populate", "fields"],
  update: ["populate", "fields"],
  delete: []
};
function camelCase(input) {
  return String(input || "").replace(/[-_\s]+([a-z0-9])/gi, (_, c) => c.toUpperCase()).replace(/^(.)/, (c) => c.toLowerCase());
}
function templatizePath(path2) {
  return String(path2 || "").replace(/:([a-zA-Z_][\w]*)/g, (_, name) => `\${${name}}`);
}
function queryOptionsForMethod(method) {
  const action = String(method.action || method.name || "").toLowerCase();
  if (CRUD_OPTIONS[action]) return CRUD_OPTIONS[action];
  const allKeys = /* @__PURE__ */ new Set();
  Object.values(CRUD_OPTIONS).forEach((arr) => arr.forEach((k) => allKeys.add(k)));
  return Array.from(allKeys);
}
function clientVerbForMethod(method) {
  const httpMethod = String(method.method || "GET").toLowerCase();
  if (httpMethod === "patch") return "put";
  return ["get", "post", "put", "delete"].includes(httpMethod) ? httpMethod : "get";
}
function emitMethod(method) {
  const name = method.name || method.action || method.key;
  const path2 = templatizePath(method.path);
  const verb = clientVerbForMethod(method);
  const tokens = Array.isArray(method.routeTokens) ? method.routeTokens : [];
  const optionKeys = queryOptionsForMethod(method);
  const positionalArgs = tokens.map((t) => `${t}: string`);
  const bodyArg = ["post", "put"].includes(verb) ? "body?: Record<string, unknown>" : null;
  const optionsArg = optionKeys.length > 0 ? `{ ${optionKeys.join(", ")} }: { ${optionKeys.map((k) => `${k}?: unknown`).join("; ")} } = {}` : null;
  const args = [...positionalArgs, ...bodyArg ? [bodyArg] : [], ...optionsArg ? [optionsArg] : []].join(", ");
  const paramsObject = optionKeys.length > 0 ? `{ params: { ${optionKeys.join(", ")} } }` : null;
  let callArgs;
  if (verb === "get" || verb === "delete") {
    callArgs = paramsObject ? `\`${path2}\`, ${paramsObject}` : `\`${path2}\``;
  } else {
    const body = bodyArg ? "body" : "{}";
    callArgs = paramsObject ? `\`${path2}\`, ${body}, ${paramsObject}` : `\`${path2}\`, ${body}`;
  }
  return `    ${name}: (${args}) =>
      client.${verb}(${callArgs}),`;
}
function emitInterface({ key, name, methods }) {
  const fnName = `${camelCase(key)}Api`;
  const methodsCode = methods.map(emitMethod).join("\n\n");
  return [
    `// Auto-generated by strapi-api-pro — do not edit manually.`,
    `// Interface: ${name || key}`,
    `import type { StrapiClient } from '../client';`,
    ``,
    `export function ${fnName}(client: StrapiClient) {`,
    `  return {`,
    methodsCode,
    `  };`,
    `}`,
    ``
  ].join("\n");
}
async function generate(strapi2, interfaceKey) {
  const fileData = await fileStore$1.readInterface(strapi2, interfaceKey);
  if (fileData) {
    return {
      code: emitInterface({
        key: fileData.key || interfaceKey,
        name: fileData.name || fileData.label || interfaceKey,
        methods: Array.isArray(fileData.methods) ? fileData.methods : []
      }),
      source: "file"
    };
  }
  const row = await strapi2.db.query(INTERFACE_UID).findOne({
    where: { key: interfaceKey },
    populate: { methods: true }
  });
  if (!row) {
    const err = new Error(`Interface '${interfaceKey}' not found`);
    err.status = 404;
    throw err;
  }
  return {
    code: emitInterface({
      key: row.key,
      name: row.name,
      methods: Array.isArray(row.methods) ? row.methods : []
    }),
    source: "db"
  };
}
var scaffold$1 = {
  generate,
  emitInterface,
  emitMethod,
  templatizePath,
  camelCase
};
const context = context$1;
const recordings = recordings$1;
const interfaces = interfaces$1;
const policyResolver = policyResolver$1;
const permissionEngine = permissionEngine$1;
const requestInterceptor = requestInterceptor$1;
const mePermissions = mePermissions$1;
const users = users$1;
const scaffoldRunner = scaffoldRunner$1;
const fileStore = fileStore$4;
const sync = sync$2;
const policies$2 = policies$3;
const scaffold = scaffold$1;
var services$1 = {
  context,
  recordings,
  interfaces,
  policyResolver,
  permissionEngine,
  requestInterceptor,
  mePermissions,
  users,
  scaffoldRunner,
  fileStore,
  sync,
  policies: policies$2,
  scaffold
};
var policies$1 = {};
var appContext$1 = (config2, { strapi: strapi2 }) => {
  const required = config2?.required !== false;
  const requireApp = config2?.requireApp !== false;
  const requireActiveRole = config2?.requireActiveRole !== false;
  return async (ctx, next) => {
    if (!required) {
      return next();
    }
    if (strapi2.apiPro?.isBypassed?.(ctx.path)) {
      return next();
    }
    try {
      const claim = await strapi2.plugin("api-pro").service("context").resolveClaim(ctx, strapi2, { requireApp, requireActiveRole });
      ctx.state.apiProClaim = claim;
    } catch (error) {
      ctx.status = error?.status || 403;
      ctx.body = {
        error: {
          code: error?.code || "CONTEXT_VALIDATION_FAILED",
          message: error?.message || "Context validation failed"
        }
      };
      return;
    }
    await next();
  };
};
const appContext = appContext$1;
var middlewares$1 = {
  appContext
};
const register = register$1;
const bootstrap = bootstrap$1;
const destroy = destroy$1;
const config = config$1;
const contentTypes = contentTypes$1;
const controllers = controllers$1;
const routes = routes$1;
const services = services$1;
const policies = policies$1;
const middlewares = middlewares$1;
var src = {
  register,
  bootstrap,
  destroy,
  config,
  contentTypes,
  controllers,
  routes,
  services,
  policies,
  middlewares
};
const index = /* @__PURE__ */ getDefaultExportFromCjs(src);
export {
  index as default
};
