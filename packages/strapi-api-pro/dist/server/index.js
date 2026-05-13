"use strict";
const require$$0$7 = require("fs");
const require$$1 = require("path");
const require$$2 = require("url");
const _interopDefault = (e) => e && e.__esModule ? e : { default: e };
const require$$0__default = /* @__PURE__ */ _interopDefault(require$$0$7);
const require$$1__default = /* @__PURE__ */ _interopDefault(require$$1);
const require$$2__default = /* @__PURE__ */ _interopDefault(require$$2);
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
const kind$6 = "collectionType";
const collectionName$6 = "api_pro_app_roles";
const info$6 = {
  singularName: "app-role",
  pluralName: "app-roles",
  displayName: "App Role",
  description: "Role mapped to Strapi admin role for app context validation"
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
const require$$0$6 = {
  kind: kind$6,
  collectionName: collectionName$6,
  info: info$6,
  options: options$6,
  pluginOptions: pluginOptions$6,
  attributes: attributes$6
};
const schema$6 = require$$0$6;
const app_roles_relation = {
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
const extendUserRelation$1 = (strapi2) => {
  const upPlugin = strapi2.plugin("users-permissions");
  if (!upPlugin) {
    strapi2.log.warn("[api-pro] Could not extend user schema â€” plugin::users-permissions is not loaded.");
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
      attrs.app_roles = { ...app_roles_relation };
      patched += 1;
    }
  }
  if (patched > 0) {
    strapi2.log.info(`[api-pro] Injected app_roles onto plugin::users-permissions.user (${patched} container${patched === 1 ? "" : "s"})`);
  }
};
var appRole$1 = {
  schema: schema$6,
  extendUserRelation: extendUserRelation$1
};
const { extendUserRelation } = appRole$1;
var register$1 = ({ strapi: strapi2 }) => {
  try {
    extendUserRelation(strapi2);
  } catch (err) {
    strapi2.log.error("[api-pro] Failed to extend user content-type:", err.message);
  }
};
const POLICY_UID$5 = "plugin::api-pro.api-method-policy";
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
    policies2 = await strapi2.db.query(POLICY_UID$5).findMany({
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
      policies2 = await strapi2.db.query(POLICY_UID$5).findMany({
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
async function getPolicyForActionAndRole(strapi2, { user, roleKey, contentTypeUid, actionName }) {
  const userId = user?.id;
  if (!userId || !roleKey || !contentTypeUid || !actionName) return null;
  const lower = String(roleKey).toLowerCase();
  const cache = strapi2.apiPro?.cache;
  const key = `u:${userId}:r:${lower}:p:${contentTypeUid}:${actionName}`;
  if (cache) {
    const hit = cache.get(key);
    if (hit !== void 0) return hit;
  }
  let row = null;
  try {
    row = await strapi2.db.query(POLICY_UID$5).findOne({
      where: {
        roleKey: lower,
        interfaceMethod: {
          action: actionName,
          apiInterface: { uid: contentTypeUid }
        }
      },
      populate: { interfaceMethod: { populate: { apiInterface: true } } }
    });
  } catch (error) {
    strapi2.log.warn(`[api-pro] policy lookup failed: ${error?.message}; falling back`);
    const method = await strapi2.db.query("plugin::api-pro.api-interface-method").findOne({
      where: { action: actionName, apiInterface: { uid: contentTypeUid } },
      select: ["id"]
    });
    if (method) {
      row = await strapi2.db.query(POLICY_UID$5).findOne({
        where: { roleKey: lower, interfaceMethod: { id: method.id } }
      });
    }
  }
  if (cache) cache.set(key, row);
  return row;
}
var permissionEngine$1 = {
  resolveUserRoleKeys,
  parseRouteHandler,
  getPoliciesForAction,
  getPolicyForActionAndRole,
  clearCache
};
const ALLOWED_ROOTS = /* @__PURE__ */ new Set(["user", "claim", "query", "params", "body", "strapi"]);
const DAY_MS = 24 * 60 * 60 * 1e3;
function isoDaysAgo(days) {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}
function resolveToken(value, context2) {
  if (typeof value !== "string" || !value.startsWith("$")) return value;
  if (value === "$today") return (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  if (value === "$now") return (/* @__PURE__ */ new Date()).toISOString();
  if (value === "$todayStart") {
    const d = /* @__PURE__ */ new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }
  if (value === "$last1day") return isoDaysAgo(1);
  if (value === "$last7days") return isoDaysAgo(7);
  if (value === "$last30days") return isoDaysAgo(30);
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
function getHeader(ctx, key) {
  const raw = ctx?.request?.headers?.[String(key).toLowerCase()];
  return typeof raw === "string" ? raw.trim() : "";
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
    role: (cfg.headerRoleKey || "x-rutba-app-role").toLowerCase()
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
function pickActiveRole(rolesForApp, claimedRoleKey) {
  if (claimedRoleKey) {
    const match = rolesForApp.find((r) => normalizeKey$1(r) === claimedRoleKey);
    if (!match) {
      throw createValidationError(
        `Claimed role '${claimedRoleKey}' is not assigned to the current user for this app`,
        "ROLE_NOT_ASSIGNED"
      );
    }
    return match;
  }
  if (rolesForApp.length === 1) {
    return rolesForApp[0];
  }
  if (rolesForApp.length > 1) {
    const choices = rolesForApp.map((r) => normalizeKey$1(r)).filter(Boolean).join(", ");
    throw createValidationError(
      `User holds multiple roles for this app â€” claim one via the role header (choices: ${choices})`,
      "ROLE_CLAIM_AMBIGUOUS",
      400
    );
  }
  throw createValidationError(
    "User has no app_role assigned for the active app",
    "NO_ACTIVE_ROLE"
  );
}
async function resolveClaim(ctx, strapi2, { requireApp = true, requireActiveRole = true } = {}) {
  const user = ctx?.state?.user;
  if (!user?.id) {
    throw createValidationError("Authenticated user required", "AUTH_REQUIRED", 401);
  }
  const headerKeys = readHeaderKeys(strapi2);
  const appName = getHeader(ctx, headerKeys.domain);
  const claimedRoleKey = getHeader(ctx, headerKeys.role).toLowerCase() || null;
  if (requireApp && !appName) {
    throw createValidationError(
      `Missing app context header '${headerKeys.domain}'`,
      "APP_CONTEXT_REQUIRED",
      400
    );
  }
  const appRoles = await loadUserAppRoles(strapi2, user.id);
  const rolesForApp = filterRolesByApp(appRoles, appName);
  let activeRole = null;
  if (requireActiveRole && appName) {
    activeRole = pickActiveRole(rolesForApp, claimedRoleKey);
  } else if (claimedRoleKey && rolesForApp.length > 0) {
    activeRole = rolesForApp.find((r) => normalizeKey$1(r) === claimedRoleKey) || null;
  }
  const activeDomainKeys = Array.from(
    new Set(
      (activeRole?.appDomains || []).map((d) => normalizeKey$1(d)).filter(Boolean)
    )
  );
  return {
    user: {
      id: user.id,
      email: user.email || null,
      username: user.username || null
    },
    appName: appName || null,
    // The active claimed role â€” this is what request-interceptor uses to
    // pick which policies apply.
    roleKey: activeRole ? normalizeKey$1(activeRole) : null,
    domainKey: appName ? appName.toLowerCase() : null,
    domainKeys: activeDomainKeys,
    // Full active-role detail retained for /me/permissions shaping.
    activeRole: activeRole ? {
      id: activeRole.id,
      key: activeRole.key,
      name: activeRole.name || activeRole.key,
      adminRoleCode: activeRole.adminRoleCode || null,
      appDomains: Array.isArray(activeRole.appDomains) ? activeRole.appDomains.map((d) => ({ id: d.id, key: d.key, name: d.name || d.key })) : []
    } : null,
    // All of the user's roles for the active app â€” surface so the
    // /me/permissions response and any client UI can render the role
    // selector menu.
    rolesForApp: rolesForApp.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key,
      adminRoleCode: r.adminRoleCode || null
    }))
  };
}
var context$1 = {
  resolveClaim,
  loadUserAppRoles,
  filterRolesByApp
};
const engine = permissionEngine$1;
const resolver$1 = policyResolver$1;
const contextSvc = context$1;
const NON_INJECTABLE_METHODS = /* @__PURE__ */ new Set(["OPTIONS", "HEAD"]);
function isPlainObject$1(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function deepMerge(target, source) {
  if (!isPlainObject$1(source)) return source;
  const out = { ...isPlainObject$1(target) ? target : {} };
  for (const [k, v] of Object.entries(source)) {
    if (isPlainObject$1(v) && isPlainObject$1(out[k])) {
      out[k] = deepMerge(out[k], v);
    } else if (Array.isArray(v) && Array.isArray(out[k])) {
      out[k] = Array.from(/* @__PURE__ */ new Set([...out[k], ...v]));
    } else {
      out[k] = v;
    }
  }
  return out;
}
function resolveOnePolicy(policy, tokenCtx) {
  const r = resolver$1.resolvePolicyTemplates(policy, tokenCtx);
  return {
    filters: isPlainObject$1(r.filters) ? r.filters : {},
    populate: isPlainObject$1(r.populate) ? r.populate : {},
    body: isPlainObject$1(r.body) ? r.body : {},
    query: isPlainObject$1(r.query) ? r.query : {},
    fields: Array.isArray(r.query?.fields) ? r.query.fields : []
  };
}
function injectIntoQuery(ctx, fragment) {
  ctx.query = ctx.query || {};
  if (fragment.filters && Object.keys(fragment.filters).length > 0) {
    ctx.query.filters = deepMerge(
      isPlainObject$1(ctx.query.filters) ? ctx.query.filters : {},
      fragment.filters
    );
  }
  if (fragment.populate && Object.keys(fragment.populate).length > 0) {
    if (!ctx.query.populate) {
      ctx.query.populate = fragment.populate;
    } else if (isPlainObject$1(ctx.query.populate)) {
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
  if (isPlainObject$1(ctx.request.body?.data)) {
    ctx.request.body.data = deepMerge(ctx.request.body.data, fragment.body);
  } else {
    ctx.request.body = deepMerge(isPlainObject$1(ctx.request.body) ? ctx.request.body : {}, fragment.body);
  }
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
  let claim;
  try {
    claim = await contextSvc.resolveClaim(ctx, strapi2, {
      requireApp: false,
      requireActiveRole: false
    });
  } catch (error) {
    return { status: "skipped", reason: `claim resolve failed: ${error?.code || error?.message}` };
  }
  if (!claim.appName || !claim.roleKey) {
    return { status: "skipped", reason: "no active app/role claim" };
  }
  ctx.state.apiProClaim = {
    appName: claim.appName,
    roleKey: claim.roleKey,
    domainKey: claim.domainKey,
    domainKeys: claim.domainKeys
  };
  const policy = await engine.getPolicyForActionAndRole(strapi2, {
    user,
    roleKey: claim.roleKey,
    contentTypeUid: parsed.contentTypeUid,
    actionName: parsed.actionName
  });
  if (!policy) {
    if (cfg.denyByDefault && (mode === "enforce" || mode === "hybrid")) {
      return { status: "denied", reason: `no policy for role '${claim.roleKey}' on ${parsed.contentTypeUid}.${parsed.actionName}`, policies: 0 };
    }
    return { status: "allowed", reason: "no policy / lenient", policies: 0 };
  }
  if (mode === "audit") {
    return { status: "audited", policies: 1 };
  }
  const tokenCtx = resolver$1.buildTokenContext({
    strapiCtx: ctx,
    user,
    claim: ctx.state.apiProClaim
  });
  const fragment = resolveOnePolicy(policy, tokenCtx);
  injectIntoQuery(ctx, fragment);
  injectIntoBody(ctx, fragment);
  ctx.state.apiProPolicy = fragment;
  return { status: "allowed", policies: 1 };
}
var requestInterceptor$1 = {
  process: process$1,
  // exported for tests
  deepMerge
};
const fs$1 = require$$0__default.default.promises;
const path$2 = require$$1__default.default;
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
  return path$2.resolve(root, dir);
}
function interfacesDir(strapi2) {
  return path$2.join(storageRoot(strapi2), "interfaces");
}
function policiesRoot(strapi2) {
  return path$2.join(storageRoot(strapi2), "policies");
}
function interfaceFile(strapi2, interfaceKey) {
  assertSafeKey("interfaceKey", interfaceKey);
  return path$2.join(interfacesDir(strapi2), `${interfaceKey}.json`);
}
function policyDir(strapi2, interfaceKey, methodKey) {
  assertSafeKey("interfaceKey", interfaceKey);
  assertSafeKey("methodKey", methodKey);
  return path$2.join(policiesRoot(strapi2), interfaceKey, methodKey);
}
function policyFile(strapi2, interfaceKey, methodKey, roleKey) {
  assertSafeKey("roleKey", roleKey);
  return path$2.join(policyDir(strapi2, interfaceKey, methodKey), `${roleKey}.json`);
}
function seedCheckpointFile(strapi2) {
  return path$2.join(storageRoot(strapi2), "seed-checkpoint.json");
}
async function ensureDir(dir) {
  await fs$1.mkdir(dir, { recursive: true });
}
async function readJsonSafe(filePath) {
  try {
    const raw = await fs$1.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}
async function writeJsonAtomic(filePath, value) {
  await ensureDir(path$2.dirname(filePath));
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs$1.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs$1.rename(tmp, filePath);
}
async function listJsonFiles(dir) {
  try {
    const entries = await fs$1.readdir(dir, { withFileTypes: true });
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
    const data = await readJsonSafe(path$2.join(interfacesDir(strapi2), name));
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
    await fs$1.unlink(interfaceFile(strapi2, interfaceKey));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const dir = path$2.join(policiesRoot(strapi2), interfaceKey);
  await fs$1.rm(dir, { recursive: true, force: true });
}
async function listPoliciesForMethod(strapi2, interfaceKey, methodKey) {
  const dir = policyDir(strapi2, interfaceKey, methodKey);
  const names = await listJsonFiles(dir);
  const out = [];
  for (const name of names) {
    const roleKey = name.slice(0, -5);
    const data = await readJsonSafe(path$2.join(dir, name));
    if (data) out.push({ roleKey, data });
  }
  return out;
}
async function listAllPolicies(strapi2) {
  const root = policiesRoot(strapi2);
  let interfaceDirs;
  try {
    interfaceDirs = await fs$1.readdir(root, { withFileTypes: true });
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
      methodDirs = await fs$1.readdir(path$2.join(root, interfaceKey), { withFileTypes: true });
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
    await fs$1.unlink(policyFile(strapi2, interfaceKey, methodKey, roleKey));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}
async function ensureStorage(strapi2) {
  await ensureDir(interfacesDir(strapi2));
  await ensureDir(policiesRoot(strapi2));
}
async function readSeedCheckpoint(strapi2) {
  return readJsonSafe(seedCheckpointFile(strapi2));
}
async function writeSeedCheckpoint(strapi2, payload) {
  await writeJsonAtomic(seedCheckpointFile(strapi2), payload);
}
var fileStore$5 = {
  storageRoot,
  interfacesDir,
  policiesRoot,
  interfaceFile,
  policyFile,
  seedCheckpointFile,
  ensureStorage,
  listInterfaces: listInterfaces$1,
  readInterface,
  writeInterface,
  deleteInterface,
  listPoliciesForMethod,
  listAllPolicies,
  readPolicy,
  writePolicy,
  deletePolicy,
  readSeedCheckpoint,
  writeSeedCheckpoint
};
const fileStore$4 = fileStore$5;
const INTERFACE_UID$2 = "plugin::api-pro.api-interface";
const METHOD_UID$3 = "plugin::api-pro.api-interface-method";
const POLICY_UID$4 = "plugin::api-pro.api-method-policy";
function methodCompositeKey(interfaceKey, methodKey) {
  return `${interfaceKey}:${methodKey}`;
}
function policyCompositeKey(interfaceKey, methodKey, roleKey) {
  return `${interfaceKey}:${methodKey}:${roleKey}`;
}
async function upsertInterface(strapi2, interfaceKey, data) {
  const existing = await strapi2.db.query(INTERFACE_UID$2).findOne({
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
    return strapi2.db.query(INTERFACE_UID$2).update({
      where: { id: existing.id },
      data: payload
    });
  }
  return strapi2.db.query(INTERFACE_UID$2).create({ data: payload });
}
async function upsertMethod$1(strapi2, interfaceRow, methodData) {
  const compositeKey = methodCompositeKey(interfaceRow.key, methodData.key || methodData.id);
  const existing = await strapi2.db.query(METHOD_UID$3).findOne({
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
    return strapi2.db.query(METHOD_UID$3).update({
      where: { id: existing.id },
      data: payload
    });
  }
  return strapi2.db.query(METHOD_UID$3).create({ data: payload });
}
async function upsertPolicy(strapi2, interfaceKey, methodKey, roleKey, data) {
  const compositeMethodKey = methodCompositeKey(interfaceKey, methodKey);
  const method = await strapi2.db.query(METHOD_UID$3).findOne({
    where: { key: compositeMethodKey }
  });
  if (!method) {
    strapi2.log.warn(`[api-pro] sync: policy refers to missing method '${compositeMethodKey}', skipping`);
    return null;
  }
  const compositeKey = policyCompositeKey(interfaceKey, methodKey, roleKey);
  const existing = await strapi2.db.query(POLICY_UID$4).findOne({
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
    return strapi2.db.query(POLICY_UID$4).update({
      where: { id: existing.id },
      data: payload
    });
  }
  return strapi2.db.query(POLICY_UID$4).create({ data: payload });
}
async function syncInterfaceWrite(strapi2, interfaceKey) {
  const fileData = await fileStore$4.readInterface(strapi2, interfaceKey);
  if (!fileData) return null;
  const row = await upsertInterface(strapi2, interfaceKey, fileData);
  const methods = Array.isArray(fileData.methods) ? fileData.methods : [];
  for (const m of methods) {
    await upsertMethod$1(strapi2, row, m);
  }
  return row;
}
async function syncPolicyWrite(strapi2, interfaceKey, methodKey, roleKey) {
  const data = await fileStore$4.readPolicy(strapi2, interfaceKey, methodKey, roleKey);
  if (!data) return null;
  return upsertPolicy(strapi2, interfaceKey, methodKey, roleKey, data);
}
async function syncInterfaceDelete(strapi2, interfaceKey) {
  const row = await strapi2.db.query(INTERFACE_UID$2).findOne({ where: { key: interfaceKey } });
  if (!row) return;
  const methods = await strapi2.db.query(METHOD_UID$3).findMany({
    where: { apiInterface: row.id },
    select: ["id"]
  });
  const methodIds = methods.map((m) => m.id);
  if (methodIds.length > 0) {
    await strapi2.db.query(POLICY_UID$4).deleteMany({
      where: { interfaceMethod: { id: { $in: methodIds } } }
    });
    await strapi2.db.query(METHOD_UID$3).deleteMany({ where: { id: { $in: methodIds } } });
  }
  await strapi2.db.query(INTERFACE_UID$2).delete({ where: { id: row.id } });
}
async function syncPolicyDelete(strapi2, interfaceKey, methodKey, roleKey) {
  const compositeKey = policyCompositeKey(interfaceKey, methodKey, roleKey);
  await strapi2.db.query(POLICY_UID$4).deleteMany({ where: { key: compositeKey } });
}
async function syncAll(strapi2) {
  await fileStore$4.ensureStorage(strapi2);
  const interfaces2 = await fileStore$4.listInterfaces(strapi2);
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
  const policies2 = await fileStore$4.listAllPolicies(strapi2);
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
async function registerAdminPermissions(strapi2) {
  try {
    const actionProvider = strapi2.service("admin::permission")?.actionProvider;
    if (!actionProvider?.registerMany) {
      strapi2.log.warn("[api-pro] admin permission actionProvider unavailable — RBAC not registered");
      return;
    }
    await actionProvider.registerMany([
      {
        section: "plugins",
        displayName: "Read",
        uid: "read",
        pluginName: "api-pro"
      },
      {
        section: "plugins",
        displayName: "Write",
        uid: "write",
        pluginName: "api-pro"
      }
    ]);
  } catch (error) {
    strapi2.log.warn(`[api-pro] failed to register admin permission actions: ${error?.message}`);
  }
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
  await registerAdminPermissions(strapi2);
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
    // The plugin reads ctx headers using these keys to derive the active claim.
    //   x-rutba-app       — which app/domain the user is currently acting in
    //   x-rutba-app-role  — which of the user's roles for that app is active
    //                       (the client renders a role-selector menu when the
    //                        user holds more than one role for the app)
    //
    // Role is REQUIRED when the user holds multiple roles for the active app;
    // optional when they hold exactly one (in which case it's auto-selected).
    headerDomainKey: "x-rutba-app",
    headerRoleKey: "x-rutba-app-role",
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
const kind$5 = "collectionType";
const collectionName$5 = "api_pro_app_domains";
const info$5 = {
  singularName: "app-domain",
  pluralName: "app-domains",
  displayName: "App Domain",
  description: "Shallow app domain grouping"
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
  appRoles: {
    type: "relation",
    relation: "manyToMany",
    target: "plugin::api-pro.app-role",
    mappedBy: "appDomains"
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
var appDomain$1 = { schema: schema$5 };
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
  filters: {
    type: "json",
    "default": {}
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
  // â”€â”€ Domains â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // â”€â”€ Roles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  },
  // ── Method-level bulk endpoints (Comparative Editor) ─────────────────────
  async findForMethod(ctx) {
    const { interfaceKey, methodKey } = ctx.params;
    try {
      const data = await strapi.plugin("api-pro").service("policies").findForMethod(strapi, { interfaceKey, methodKey });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 500, error?.message || "Failed to load method policies");
    }
  },
  async bulkUpsertForMethod(ctx) {
    const { interfaceKey, methodKey } = ctx.params;
    const body = ctx.request.body?.data || ctx.request.body || {};
    const policies2 = body.policies || {};
    try {
      const data = await strapi.plugin("api-pro").service("policies").bulkUpsertForMethod(strapi, { interfaceKey, methodKey, policies: policies2 });
      ctx.body = { data };
    } catch (error) {
      sendError(ctx, error?.status || 400, error?.message || "Failed to save method policies");
    }
  }
};
var adminTools$1 = {
  async seed(ctx) {
    try {
      const result = await strapi.plugin("api-pro").service("seeder").runFullSeed(strapi);
      if (!result.ok) {
        ctx.status = 500;
        ctx.body = { error: { code: "SEED_FAILED", message: result.error || "Seed failed" } };
        return;
      }
      ctx.body = { data: result };
    } catch (error) {
      strapi.log.error(`[api-pro admin-tools] seed failed: ${error?.stack || error?.message}`);
      ctx.status = 500;
      ctx.body = { error: { code: "SEED_EXCEPTION", message: error?.message || "Seed crashed" } };
    }
  }
};
var play$3 = {
  async run(ctx) {
    const body = ctx.request.body?.data || ctx.request.body || {};
    try {
      const result = await strapi.plugin("api-pro").service("play").play(strapi, body);
      ctx.body = { data: result };
    } catch (error) {
      ctx.status = error?.status || 500;
      ctx.body = { error: { message: error?.message || "Play failed" } };
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
const adminTools = adminTools$1;
const play$2 = play$3;
var controllers$1 = {
  health,
  recordings: recordings$2,
  interfaces: interfaces$2,
  users: users$2,
  me,
  domains,
  policies: policies$4,
  "admin-tools": adminTools,
  play: play$2
};
const READ_ACTION = "plugin::api-pro.read";
const WRITE_ACTION = "plugin::api-pro.write";
const adminPolicy = (action) => ({
  name: "admin::hasPermissions",
  config: { actions: [action] }
});
const adminRead = (method, path2, handler) => ({
  method,
  path: path2,
  handler,
  config: { policies: [adminPolicy(READ_ACTION)] }
});
const adminWrite = (method, path2, handler) => ({
  method,
  path: path2,
  handler,
  config: { policies: [adminPolicy(WRITE_ACTION)] }
});
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
      adminRead("GET", "/users", "users.list"),
      adminRead("GET", "/users/role-options", "users.roleOptions"),
      adminWrite("PUT", "/users/:id/roles", "users.assignRoles"),
      // ── Recordings ───────────────────────────────────────────────────
      adminWrite("POST", "/recordings/start", "recordings.start"),
      adminWrite("POST", "/recordings/stop", "recordings.stop"),
      adminRead("GET", "/recordings", "recordings.list"),
      adminRead("GET", "/recordings/:sessionId/entries", "recordings.entries"),
      // ── Interfaces ───────────────────────────────────────────────────
      adminRead("GET", "/interfaces", "interfaces.list"),
      adminWrite("POST", "/interfaces/from-recordings", "interfaces.createFromRecordings"),
      adminWrite("POST", "/interfaces/from-content-type", "interfaces.createFromContentType"),
      adminWrite("PATCH", "/interfaces/:interfaceId/methods", "interfaces.upsertMethod"),
      adminRead("GET", "/interfaces/lint-scaffold", "interfaces.lintScaffold"),
      adminWrite("POST", "/interfaces/validate-alignment", "interfaces.validateAlignment"),
      adminWrite("POST", "/interfaces/preview-guided-fix", "interfaces.previewGuidedFix"),
      adminRead("GET", "/interfaces/:interfaceKey/scaffold", "interfaces.scaffold"),
      // ── Domains & Roles ──────────────────────────────────────────────
      adminRead("GET", "/domains", "domains.listDomains"),
      adminWrite("POST", "/domains", "domains.createDomain"),
      adminWrite("PUT", "/domains/:id", "domains.updateDomain"),
      adminWrite("DELETE", "/domains/:id", "domains.deleteDomain"),
      adminRead("GET", "/roles", "domains.listRoles"),
      adminWrite("POST", "/roles", "domains.createRole"),
      adminWrite("PUT", "/roles/:id", "domains.updateRole"),
      adminWrite("DELETE", "/roles/:id", "domains.deleteRole"),
      // ── Method Policies ──────────────────────────────────────────────
      // ORDER MATTERS: koa-router does first-match. Literal-prefixed paths
      // (`/policies/method/...`) MUST be registered before the generic
      // 3-param `/policies/:i/:m/:r` patterns, otherwise GET /policies/method/term/list
      // matches findOne with interfaceKey='method', returning 404 "policy not found"
      // and leaving the Comparative Editor with allRoles=[] and policies={}.
      adminRead("GET", "/policies", "policies.list"),
      // Comparative editor: bulk fetch / save all policies for a method
      adminRead("GET", "/policies/method/:interfaceKey/:methodKey", "policies.findForMethod"),
      adminWrite("PUT", "/policies/method/:interfaceKey/:methodKey", "policies.bulkUpsertForMethod"),
      adminRead("GET", "/policies/:interfaceKey/:methodKey/:roleKey", "policies.findOne"),
      adminWrite("PUT", "/policies/:interfaceKey/:methodKey/:roleKey", "policies.upsert"),
      adminWrite("DELETE", "/policies/:interfaceKey/:methodKey/:roleKey", "policies.remove"),
      // ── Admin tools ──────────────────────────────────────────────────
      adminWrite("POST", "/admin/seed", "admin-tools.seed"),
      // Play as role: never mutates plugin state, only proxies/simulates,
      // so gated as read.
      adminRead("POST", "/play", "play.run"),
      // ── Health ───────────────────────────────────────────────────────
      adminRead("GET", "/health", "health.check")
    ]
  }
};
const SESSION_UID = "plugin::api-pro.recording-session";
const ENTRY_UID = "plugin::api-pro.recording-entry";
async function getActiveSession(strapi2) {
  return await strapi2.db.query(SESSION_UID).findOne({
    where: { status: "recording" },
    orderBy: { createdAt: "desc" }
  });
}
function normalizeFilters(raw) {
  const out = { methods: [], pathPatterns: [], contentTypeUids: [] };
  if (!raw || typeof raw !== "object") return out;
  if (Array.isArray(raw.methods)) {
    out.methods = raw.methods.map((m) => String(m || "").trim().toUpperCase()).filter(Boolean);
  }
  if (Array.isArray(raw.pathPatterns)) {
    out.pathPatterns = raw.pathPatterns.map((p) => String(p || "").trim()).filter(Boolean);
  }
  if (Array.isArray(raw.contentTypeUids)) {
    out.contentTypeUids = raw.contentTypeUids.map((u) => String(u || "").trim()).filter(Boolean);
  }
  return out;
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
      resolvedRoleKey: roleKey,
      filters: normalizeFilters(payload.filters)
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
  getActiveSession,
  normalizeFilters
};
const path$1 = require$$1__default.default;
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
  const root = path$1.resolve(process.cwd(), pluginConfig.apiProviderRoot || "../../api-provider");
  return {
    root,
    interfacesDir: path$1.join(root, pluginConfig.interfacesDir || "api")
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
const POLICY_UID$3 = "plugin::api-pro.api-method-policy";
const USER_UID$2 = "plugin::users-permissions.user";
const APP_DOMAIN_UID$1 = "plugin::api-pro.app-domain";
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
  return strapi2.db.query(USER_UID$2).findOne({
    where: { id: userId },
    populate: {
      role: true,
      app_roles: { populate: { appDomains: true } }
    }
  });
}
async function loadPoliciesForRoles(strapi2, roleKeys) {
  if (roleKeys.length === 0) return [];
  return strapi2.db.query(POLICY_UID$3).findMany({
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
  const allDomains = await strapi2.db.query(APP_DOMAIN_UID$1).findMany({
    where: { isActive: true },
    select: ["key", "name"]
  });
  const allDomainKeys = allDomains.map((d) => normalizeKey(d)).filter(Boolean);
  const domainNameByKey = new Map(
    allDomains.map((d) => [normalizeKey(d), d.name || normalizeKey(d)])
  );
  const domainEntries = [];
  for (const role of appRoles) {
    const roleKey = normalizeKey(role);
    const roleDomains = Array.isArray(role.appDomains) ? role.appDomains : [];
    if (roleDomains.length === 0) {
      for (const domainKey of allDomainKeys) {
        domainEntries.push({
          key: domainKey,
          name: domainNameByKey.get(domainKey) || domainKey,
          roleKey
        });
      }
      continue;
    }
    for (const d of roleDomains) {
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
  const rolesByApp = {};
  const pushRole = (domainKey, role) => {
    const roleKey = normalizeKey(role);
    if (!roleKey || !domainKey) return;
    rolesByApp[domainKey] = rolesByApp[domainKey] || [];
    if (rolesByApp[domainKey].some((r) => r.key === roleKey)) return;
    rolesByApp[domainKey].push({ key: roleKey, name: role.name || roleKey });
  };
  for (const role of appRoles) {
    const roleDomains = Array.isArray(role.appDomains) ? role.appDomains : [];
    if (roleDomains.length === 0) {
      pushRole("*", role);
      for (const domainKey of allDomainKeys) pushRole(domainKey, role);
      continue;
    }
    for (const d of roleDomains) pushRole(normalizeKey(d), role);
  }
  return {
    role: strapiRole?.name || null,
    roleType: strapiRole?.type || null,
    domains: domains2,
    appRoles: appRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key
    })),
    rolesByApp,
    permissions,
    strapiPermissions,
    sessionTimeout
  };
}
var mePermissions$1 = {
  build,
  gatherExtraRoleKeys
};
const USER_UID$1 = "plugin::users-permissions.user";
const APP_ROLE_UID$1 = "plugin::api-pro.app-role";
async function listUsers(strapi2) {
  return await strapi2.db.query(USER_UID$1).findMany({
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
  return await strapi2.db.query(APP_ROLE_UID$1).findMany({
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
  const user = await strapi2.db.query(USER_UID$1).findOne({ where: { id } });
  if (!user) {
    const err = new Error("User not found");
    err.status = 404;
    throw err;
  }
  await strapi2.db.query(USER_UID$1).update({
    where: { id },
    data: { app_roles: validRoleIds }
  });
  return await strapi2.db.query(USER_UID$1).findOne({
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
const METHOD_UID$2 = "plugin::api-pro.api-interface-method";
async function lintMethodAlignment(strapi2) {
  const methods = await strapi2.db.query(METHOD_UID$2).findMany({
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
const fileStore$3 = fileStore$5;
const sync$1 = sync$2;
const POLICY_UID$2 = "plugin::api-pro.api-method-policy";
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
  const rows = await strapi2.db.query(POLICY_UID$2).findMany({
    where,
    populate: { interfaceMethod: { populate: { apiInterface: true } } },
    orderBy: { roleKey: "asc" }
  });
  return rows.map(shape);
}
async function findOne(strapi2, { interfaceKey, methodKey, roleKey }) {
  const row = await strapi2.db.query(POLICY_UID$2).findOne({
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
  const incomingVersion = Number.isInteger(data?.templateVersion) ? data.templateVersion : 1;
  const bumpedVersion = Math.max(incomingVersion + 1, 2);
  const fileData = {
    name: data?.name || `${interfaceKey}:${methodKey}:${normalizedRoleKey}`,
    resolverMode: data?.resolverMode === "lenient" ? "lenient" : "strict",
    filtersTemplate: data?.filtersTemplate || {},
    populateTemplate: data?.populateTemplate || {},
    bodyTemplate: data?.bodyTemplate || {},
    queryTemplate: data?.queryTemplate || {},
    templateVersion: bumpedVersion
  };
  await fileStore$3.writePolicy(strapi2, interfaceKey, methodKey, normalizedRoleKey, fileData);
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
  await fileStore$3.deletePolicy(strapi2, interfaceKey, methodKey, normalizedRoleKey);
  await sync$1.syncPolicyDelete(strapi2, interfaceKey, methodKey, normalizedRoleKey);
  strapi2.apiPro?.clearAllCache?.();
  return { interfaceKey, methodKey, roleKey: normalizedRoleKey, deleted: true };
}
async function findForMethod(strapi2, { interfaceKey, methodKey }) {
  const METHOD_UID2 = "plugin::api-pro.api-interface-method";
  const ROLE_UID2 = "plugin::api-pro.app-role";
  const method = await strapi2.db.query(METHOD_UID2).findOne({
    where: { key: `${interfaceKey}:${methodKey}` },
    populate: { apiInterface: true }
  });
  if (!method) {
    const err = new Error(`method '${interfaceKey}:${methodKey}' not found`);
    err.status = 404;
    throw err;
  }
  const rows = await strapi2.db.query(POLICY_UID$2).findMany({
    where: { interfaceMethod: { id: method.id } },
    orderBy: { roleKey: "asc" }
  });
  const policies2 = {};
  for (const r of rows) {
    policies2[r.roleKey] = {
      id: r.id,
      key: r.key,
      name: r.name,
      resolverMode: r.resolverMode,
      filtersTemplate: r.filtersTemplate || {},
      populateTemplate: r.populateTemplate || {},
      bodyTemplate: r.bodyTemplate || {},
      queryTemplate: r.queryTemplate || {},
      templateVersion: r.templateVersion
    };
  }
  const allRoles = await strapi2.db.query(ROLE_UID2).findMany({
    where: { isActive: true },
    populate: { appDomains: { select: ["id", "key", "name"] } },
    orderBy: { key: "asc" }
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
      apiInterfaceKey: method.apiInterface?.key || null
    },
    policies: policies2,
    allRoles: allRoles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name || r.key,
      adminRoleCode: r.adminRoleCode || null,
      appDomains: Array.isArray(r.appDomains) ? r.appDomains.map((d) => ({ id: d.id, key: d.key, name: d.name || d.key })) : []
    }))
  };
}
async function bulkUpsertForMethod(strapi2, { interfaceKey, methodKey, policies: policies2 }) {
  if (!interfaceKey || !methodKey) {
    const err = new Error("interfaceKey and methodKey are required");
    err.status = 400;
    throw err;
  }
  if (!policies2 || typeof policies2 !== "object") {
    const err = new Error("policies must be an object keyed by roleKey");
    err.status = 400;
    throw err;
  }
  const results = { saved: [], deleted: [], errors: [] };
  for (const [rawRoleKey, value] of Object.entries(policies2)) {
    const roleKey = String(rawRoleKey).toLowerCase();
    try {
      if (value === null || value === false) {
        await remove(strapi2, { interfaceKey, methodKey, roleKey });
        results.deleted.push(roleKey);
      } else {
        await upsert(strapi2, { interfaceKey, methodKey, roleKey, data: value });
        results.saved.push(roleKey);
      }
    } catch (error) {
      results.errors.push({ roleKey, message: error?.message || "unknown error" });
    }
  }
  return results;
}
var policies$3 = {
  list,
  findOne,
  upsert,
  remove,
  findForMethod,
  bulkUpsertForMethod
};
const fileStore$2 = fileStore$5;
const INTERFACE_UID$1 = "plugin::api-pro.api-interface";
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
    `// Auto-generated by api-pro â€” do not edit manually.`,
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
  const fileData = await fileStore$2.readInterface(strapi2, interfaceKey);
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
  const row = await strapi2.db.query(INTERFACE_UID$1).findOne({
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
const fs = require$$0__default.default;
const path = require$$1__default.default;
const { pathToFileURL } = require$$2__default.default;
const fileStore$1 = fileStore$5;
const APP_DOMAIN_UID = "plugin::api-pro.app-domain";
const APP_ROLE_UID = "plugin::api-pro.app-role";
const INTERFACE_UID = "plugin::api-pro.api-interface";
const METHOD_UID$1 = "plugin::api-pro.api-interface-method";
const POLICY_UID$1 = "plugin::api-pro.api-method-policy";
const SEEDER_VERSION = 1;
function resolveApiProviderRoot(strapi2) {
  const cwd = strapi2?.dirs?.app?.root || process.cwd();
  try {
    const domainsPath = require.resolve("@rutba/api-provider/config/domains", { paths: [cwd] });
    return path.dirname(path.dirname(domainsPath));
  } catch (e) {
    strapi2?.log?.warn(`[api-pro seeder] @rutba/api-provider not resolvable from ${cwd}: ${e?.message}`);
    return null;
  }
}
function loadJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, "utf8"));
}
function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter((v) => typeof v === "string" && v.trim()))];
}
function inferAction(method, endpointPath, methodName) {
  const m = String(method || "").toLowerCase();
  const p = String(endpointPath || "");
  const n = String(methodName || "").toLowerCase();
  if (n.includes("publish")) return n.includes("unpublish") ? "unpublish" : "publish";
  if (n.includes("delete") || n === "del") return "delete";
  if (n.includes("update") || n.startsWith("put")) return "update";
  if (n.includes("create") || n.startsWith("post")) return "create";
  if (n.includes("byid") || n.includes("findone")) return "findOne";
  if (n.includes("list") || n.includes("search") || n.includes("find")) return "find";
  if (m === "post") return "create";
  if (m === "put" || m === "patch") return "update";
  if (m === "delete") return "delete";
  if (m === "get") return /\/[^/]+\/[:$]|\/\$\{/.test(p) ? "findOne" : "find";
  return null;
}
function isDescriptorMethodName(methodName) {
  const name = String(methodName || "").toLowerCase();
  if (!name || name === "meta") return false;
  return /^(list|by|get|find|search|create|update|del|delete|remove|publish|unpublish|archive|unarchive|assign|process|open|close|transfer|validate|shipping|tracking|messages|send)/.test(name);
}
function createInvocationArgs(fn) {
  const arity = typeof fn?.length === "number" ? fn.length : 0;
  return arity > 0 ? new Array(arity).fill(void 0) : [];
}
function buildContentTypeLookup(strapi2) {
  const lookup = /* @__PURE__ */ new Map();
  for (const [uid, model] of Object.entries(strapi2?.contentTypes || {})) {
    if (!uid.startsWith("api::")) continue;
    const singular = String(model?.info?.singularName || "").toLowerCase();
    const plural = String(model?.info?.pluralName || "").toLowerCase();
    const tail = String(uid.split(".").pop() || "").toLowerCase();
    if (singular) lookup.set(singular, uid);
    if (plural) lookup.set(plural, uid);
    if (tail) lookup.set(tail, uid);
  }
  return lookup;
}
function inferUidFromPath(endpointPath, lookup) {
  const raw = String(endpointPath || "").trim();
  if (!raw.startsWith("/")) return null;
  const first = raw.split("?")[0].split("/").filter(Boolean)[0];
  if (!first) return null;
  const key = first.toLowerCase();
  if (lookup.has(key)) return lookup.get(key);
  if (key.endsWith("ies") && lookup.has(`${key.slice(0, -3)}y`)) return lookup.get(`${key.slice(0, -3)}y`);
  if (key.endsWith("s") && lookup.has(key.slice(0, -1))) return lookup.get(key.slice(0, -1));
  return null;
}
function expandGrants(domains2, roleLevels, domainMap, roleMap) {
  const levels = uniqueStrings(roleLevels);
  const dKeys = uniqueStrings(domains2);
  const grants = /* @__PURE__ */ new Set();
  for (const dk of dKeys) {
    const dr = Array.isArray(domainMap?.[dk]?.roles) ? domainMap[dk].roles : [];
    for (const roleName of dr) {
      const level = String(roleMap?.[roleName]?.level || "").toLowerCase();
      if (!level) continue;
      if (!levels.length || levels.includes(level)) grants.add(roleName);
    }
  }
  return [...grants];
}
async function walkApiDescriptors(root, domainsConfig, rolesConfig, strapi2) {
  const apiDir = path.join(root, "api");
  if (!fs.existsSync(apiDir)) return [];
  const lookup = buildContentTypeLookup(strapi2);
  const out = [];
  const files = fs.readdirSync(apiDir).filter((n) => n.endsWith(".js") && n !== "index.js" && !n.startsWith("_") && !n.startsWith("__")).sort();
  for (const fileName of files) {
    const fullPath = path.join(apiDir, fileName);
    let mod;
    try {
      mod = await import(pathToFileURL(fullPath).href);
    } catch (e) {
      strapi2.log.warn(`[api-pro seeder] failed to import ${fileName}: ${e?.message}`);
      continue;
    }
    for (const exported of Object.values(mod)) {
      if (!exported || typeof exported !== "object" || Array.isArray(exported)) continue;
      const metaUid = typeof exported?.meta?.uid === "string" ? exported.meta.uid : null;
      const defaultDomains = uniqueStrings(exported?.meta?.domains);
      const defaultRoleLevels = uniqueStrings(exported?.meta?.roles);
      const interfaceScope = exported?.meta?.scope && typeof exported.meta.scope === "object" ? exported.meta.scope : null;
      for (const [methodName, value] of Object.entries(exported)) {
        if (methodName === "meta" || typeof value !== "function") continue;
        if (!isDescriptorMethodName(methodName)) continue;
        if (value.constructor?.name === "AsyncFunction") continue;
        let descriptor;
        try {
          descriptor = value(...createInvocationArgs(value));
        } catch {
          continue;
        }
        if (!descriptor || typeof descriptor !== "object" || typeof descriptor.then === "function") continue;
        const endpointPath = descriptor.path || descriptor.url;
        if (!endpointPath || String(endpointPath).startsWith("/upload")) continue;
        const uid = metaUid || inferUidFromPath(endpointPath, lookup);
        if (!uid) continue;
        const action = descriptor.action || inferAction(descriptor.method, endpointPath, methodName);
        if (!action) continue;
        const domains2 = uniqueStrings(descriptor.apps).length ? descriptor.apps : defaultDomains;
        const roleLevels = uniqueStrings(descriptor.approle).length ? descriptor.approle : defaultRoleLevels;
        const grants = expandGrants(domains2, roleLevels, domainsConfig, rolesConfig);
        if (grants.length === 0) continue;
        const routeTokens = (String(endpointPath).match(/(?::([a-zA-Z_][\w]*))|(?:\$\{\s*([a-zA-Z_][\w]*)\s*\})/g) || []).map((m) => m.replace(/[:${}\s]/g, ""));
        const policyScope = descriptor?.scope && typeof descriptor.scope === "object" ? descriptor.scope : null;
        out.push({
          uid,
          methodName,
          action,
          method: String(descriptor.method || "GET").toLowerCase(),
          path: endpointPath,
          routeTokens,
          grants,
          fileName,
          interfaceScope,
          policyScope
        });
      }
    }
  }
  return out;
}
async function upsertByKey(strapi2, uid, key, data, populate) {
  const existing = await strapi2.db.query(uid).findOne({ where: { key } });
  if (existing) {
    return strapi2.db.query(uid).update({ where: { id: existing.id }, data, populate });
  }
  return strapi2.db.query(uid).create({ data, populate });
}
function humanize(input) {
  return String(input || "").replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}
async function seedDomains(strapi2, domainsConfig) {
  let count = 0;
  for (const [key, value] of Object.entries(domainsConfig || {})) {
    await upsertByKey(strapi2, APP_DOMAIN_UID, key, {
      key,
      name: humanize(value?.name || key),
      description: value?.description || `Auto-seeded domain '${key}' from api-provider/config`,
      isActive: true
    });
    count += 1;
  }
  return count;
}
async function seedRoles(strapi2, rolesConfig, domainsConfig) {
  const domainRows = await strapi2.db.query(APP_DOMAIN_UID).findMany({ select: ["id", "key"] });
  const domainIdByKey = new Map(domainRows.map((d) => [d.key, d.id]));
  let count = 0;
  for (const [key, value] of Object.entries(rolesConfig || {})) {
    const domainKey = value?.domain;
    const domainId = domainKey ? domainIdByKey.get(domainKey) : null;
    await upsertByKey(strapi2, APP_ROLE_UID, key, {
      key,
      name: humanize(key),
      description: `Auto-seeded role '${key}' (level=${value?.level || "?"}, domain=${domainKey || "?"})`,
      isActive: true,
      adminRoleCode: key,
      appDomains: domainId ? [domainId] : []
    });
    count += 1;
  }
  return count;
}
async function seedInterfacesAndMethods(strapi2, descriptors) {
  const byUid = /* @__PURE__ */ new Map();
  for (const d of descriptors) {
    if (!byUid.has(d.uid)) byUid.set(d.uid, []);
    byUid.get(d.uid).push(d);
  }
  let interfaceCount = 0;
  let methodCount = 0;
  const methodByCompositeKey = /* @__PURE__ */ new Map();
  for (const [uid, group] of byUid.entries()) {
    const interfaceKey = uid.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const filePathField = `api/${(group[0]?.fileName || `${interfaceKey}.js`).replace(/\.js$/, "")}.js`;
    const ifaceRow = await upsertByKey(strapi2, INTERFACE_UID, interfaceKey, {
      key: interfaceKey,
      name: humanize(uid.split(".").pop() || interfaceKey),
      filePath: filePathField,
      uid,
      status: "generated"
    });
    interfaceCount += 1;
    for (const d of group) {
      const methodKey = `${interfaceKey}:${d.methodName}`;
      const methodRow = await upsertByKey(strapi2, METHOD_UID$1, methodKey, {
        key: methodKey,
        name: d.methodName,
        action: d.action,
        method: d.method,
        path: d.path,
        routeTokens: d.routeTokens,
        inputSignature: d.routeTokens,
        apps: [],
        appRoles: d.grants,
        apiInterface: ifaceRow.id
      });
      methodByCompositeKey.set(methodKey, methodRow);
      methodCount += 1;
    }
  }
  return { interfaceCount, methodCount, methodByCompositeKey };
}
const DEFAULT_RECENCY_TOKEN = "$last7days";
function emptyTemplates() {
  return { filtersTemplate: {}, populateTemplate: {}, bodyTemplate: {}, queryTemplate: {} };
}
function expandScopeShorthand(scope, action, ownerField, recencyField, recencyToken) {
  const a = String(action || "").toLowerCase();
  const ownerFilter = { [ownerField]: { id: { $eq: "$user.id" } } };
  const recencyFilter = { [recencyField]: { $gte: recencyToken } };
  if (scope === "owner") {
    if (a === "create") return { bodyTemplate: { [ownerField]: "$user.id" } };
    return { filtersTemplate: ownerFilter };
  }
  if (scope === "owner+recency") {
    if (a === "create") return { bodyTemplate: { [ownerField]: "$user.id" } };
    if (a === "find") return { filtersTemplate: { $and: [ownerFilter, recencyFilter] } };
    return { filtersTemplate: ownerFilter };
  }
  if (scope === "recency") {
    if (a === "find") return { filtersTemplate: recencyFilter };
    return {};
  }
  return {};
}
function buildTemplatesFromLevelBlock(levelBlock, action) {
  if (!levelBlock || typeof levelBlock !== "object") return emptyTemplates();
  const ownerField = levelBlock.ownerField || "createdBy";
  const recencyField = levelBlock.recencyField || "createdAt";
  const recencyToken = levelBlock.recencyToken || DEFAULT_RECENCY_TOKEN;
  const combined = expandScopeShorthand(levelBlock.scope, action, ownerField, recencyField, recencyToken);
  if (levelBlock.filters) combined.filtersTemplate = { ...combined.filtersTemplate || {}, ...levelBlock.filters };
  if (levelBlock.populate) combined.populateTemplate = { ...combined.populateTemplate || {}, ...levelBlock.populate };
  if (levelBlock.body) combined.bodyTemplate = { ...combined.bodyTemplate || {}, ...levelBlock.body };
  if (levelBlock.query) combined.queryTemplate = { ...combined.queryTemplate || {}, ...levelBlock.query };
  return {
    filtersTemplate: combined.filtersTemplate || {},
    populateTemplate: combined.populateTemplate || {},
    bodyTemplate: combined.bodyTemplate || {},
    queryTemplate: combined.queryTemplate || {}
  };
}
function effectiveLevelBlock(interfaceServerCtx, policyServerCtx, level) {
  const key = String(level).toLowerCase();
  const policyBlock = policyServerCtx && typeof policyServerCtx === "object" ? policyServerCtx[key] : void 0;
  if (policyBlock !== void 0) return policyBlock;
  if (interfaceServerCtx && typeof interfaceServerCtx === "object") return interfaceServerCtx[key];
  return void 0;
}
function templatesForRole(interfaceServerCtx, policyServerCtx, level, action) {
  const block = effectiveLevelBlock(interfaceServerCtx, policyServerCtx, level);
  return buildTemplatesFromLevelBlock(block, action);
}
async function seedPolicies(strapi2, descriptors, methodByCompositeKey, rolesConfig) {
  let count = 0;
  for (const d of descriptors) {
    const interfaceKey = d.uid.replace(/[^a-z0-9_-]/gi, "-").toLowerCase();
    const methodKey = `${interfaceKey}:${d.methodName}`;
    const methodRow = methodByCompositeKey.get(methodKey);
    if (!methodRow) continue;
    for (const roleKey of d.grants) {
      const policyKey = `${interfaceKey}:${d.methodName}:${roleKey}`;
      const level = rolesConfig?.[roleKey]?.level || "unknown";
      const templates = templatesForRole(d.interfaceScope, d.policyScope, level, d.action);
      const existing = await strapi2.db.query(POLICY_UID$1).findOne({ where: { key: policyKey } });
      const userTuned = existing && Number(existing.templateVersion) > 1;
      const data = {
        key: policyKey,
        name: existing?.name || `${humanize(roleKey)} â†’ ${d.methodName}`,
        roleKey,
        resolverMode: existing?.resolverMode || "strict",
        interfaceMethod: methodRow.id,
        ...userTuned ? {} : { ...templates, templateVersion: 1 }
      };
      if (existing) {
        await strapi2.db.query(POLICY_UID$1).update({ where: { id: existing.id }, data });
      } else {
        await strapi2.db.query(POLICY_UID$1).create({ data });
      }
      count += 1;
    }
  }
  return count;
}
function listFingerprintTargets(root) {
  const targets = [
    path.join(root, "config", "domains.json"),
    path.join(root, "config", "roles.json")
  ];
  const apiDir = path.join(root, "api");
  if (fs.existsSync(apiDir)) {
    const files = fs.readdirSync(apiDir).filter((n) => n.endsWith(".js") && n !== "index.js" && !n.startsWith("_")).sort();
    for (const f of files) targets.push(path.join(apiDir, f));
  }
  return targets;
}
function computeSourceFingerprint(root) {
  const entries = [];
  for (const abs of listFingerprintTargets(root)) {
    let mtimeMs = null;
    try {
      mtimeMs = fs.statSync(abs).mtimeMs;
    } catch {
    }
    entries.push({ path: path.relative(root, abs).replace(/\\/g, "/"), mtimeMs });
  }
  return { seederVersion: SEEDER_VERSION, entries };
}
function fingerprintsEqual(a, b) {
  if (!a || !b) return false;
  if (a.seederVersion !== b.seederVersion) return false;
  if (!Array.isArray(a.entries) || !Array.isArray(b.entries)) return false;
  if (a.entries.length !== b.entries.length) return false;
  for (let i = 0; i < a.entries.length; i += 1) {
    if (a.entries[i].path !== b.entries[i].path) return false;
    if (a.entries[i].mtimeMs !== b.entries[i].mtimeMs) return false;
  }
  return true;
}
async function runFullSeed(strapi2, options2 = {}) {
  const { force = false } = options2;
  const root = resolveApiProviderRoot(strapi2);
  if (!root) {
    return { ok: false, error: "@rutba/api-provider not resolvable" };
  }
  const fingerprint = computeSourceFingerprint(root);
  if (!force) {
    const checkpoint = await fileStore$1.readSeedCheckpoint(strapi2).catch(() => null);
    if (fingerprintsEqual(checkpoint?.fingerprint, fingerprint)) {
      strapi2.log.info(
        `[api-pro seeder] skip: source unchanged since ${checkpoint.seededAt} (${fingerprint.entries.length} files tracked)`
      );
      return { ok: true, skipped: true, ...checkpoint.summary };
    }
  }
  const domainsConfig = loadJson(path.join(root, "config", "domains.json"));
  const rolesConfig = loadJson(path.join(root, "config", "roles.json"));
  const domainCount = await seedDomains(strapi2, domainsConfig);
  const roleCount = await seedRoles(strapi2, rolesConfig);
  const descriptors = await walkApiDescriptors(root, domainsConfig, rolesConfig, strapi2);
  const { interfaceCount, methodCount, methodByCompositeKey } = await seedInterfacesAndMethods(strapi2, descriptors);
  const policyCount = await seedPolicies(strapi2, descriptors, methodByCompositeKey, rolesConfig);
  strapi2.apiPro?.clearAllCache?.();
  const summary = {
    domains: domainCount,
    roles: roleCount,
    interfaces: interfaceCount,
    methods: methodCount,
    policies: policyCount,
    descriptorsScanned: descriptors.length
  };
  try {
    await fileStore$1.writeSeedCheckpoint(strapi2, {
      seededAt: (/* @__PURE__ */ new Date()).toISOString(),
      fingerprint,
      summary
    });
  } catch (e) {
    strapi2.log.warn(`[api-pro seeder] could not write checkpoint: ${e?.message}`);
  }
  return { ok: true, skipped: false, ...summary };
}
var seeder$1 = {
  runFullSeed,
  resolveApiProviderRoot,
  walkApiDescriptors,
  computeSourceFingerprint
};
const resolver = policyResolver$1;
const METHOD_UID = "plugin::api-pro.api-interface-method";
const POLICY_UID = "plugin::api-pro.api-method-policy";
const USER_UID = "plugin::users-permissions.user";
const SAFE_FIND_ACTIONS = /* @__PURE__ */ new Set(["find", "findOne"]);
async function loadMethod(strapi2, interfaceKey, methodName) {
  const method = await strapi2.db.query(METHOD_UID).findOne({
    where: { key: `${interfaceKey}:${methodName}` },
    populate: { apiInterface: true }
  });
  if (!method) {
    const err = new Error(`method '${interfaceKey}:${methodName}' not found`);
    err.status = 404;
    throw err;
  }
  return method;
}
async function loadPolicy(strapi2, methodId, roleKey) {
  return strapi2.db.query(POLICY_UID).findOne({
    where: { interfaceMethod: { id: methodId }, roleKey: String(roleKey).toLowerCase() }
  });
}
async function loadActAsUser(strapi2, userId) {
  if (!userId) return null;
  return strapi2.db.query(USER_UID).findOne({
    where: { id: Number(userId) },
    populate: { role: true, app_roles: { populate: { appDomains: true } } }
  });
}
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function mergeQuery(base, fragment) {
  const out = { ...isPlainObject(base) ? base : {} };
  if (!isPlainObject(fragment)) return out;
  if (isPlainObject(fragment.filters)) {
    out.filters = isPlainObject(out.filters) ? { ...out.filters, ...fragment.filters } : fragment.filters;
  }
  if (isPlainObject(fragment.populate) && Object.keys(fragment.populate).length > 0) {
    out.populate = fragment.populate;
  } else if (fragment.populate === "*") {
    out.populate = "*";
  }
  return out;
}
async function play$1(strapi2, params) {
  const {
    interfaceKey,
    methodName,
    roleKey,
    actAsUserId = null,
    pathParams = {},
    queryParams = {},
    bodyData = {},
    documentId = null
  } = params || {};
  if (!interfaceKey || !methodName || !roleKey) {
    const err = new Error("interfaceKey, methodName and roleKey are required");
    err.status = 400;
    throw err;
  }
  const method = await loadMethod(strapi2, interfaceKey, methodName);
  const policy = await loadPolicy(strapi2, method.id, roleKey);
  const uid = method.apiInterface?.uid || null;
  const action = method.action || methodName;
  let user = null;
  if (actAsUserId) {
    user = await loadActAsUser(strapi2, actAsUserId);
    if (!user) {
      const err = new Error(`actAsUserId=${actAsUserId} not found`);
      err.status = 404;
      throw err;
    }
  }
  const tokenCtx = {
    user: user ? { id: user.id, email: user.email, username: user.username, ...user } : { id: null, email: null, username: "admin-preview" },
    claim: {
      appName: "(play-preview)",
      roleKey: String(roleKey).toLowerCase(),
      domainKey: null
    },
    query: queryParams || {},
    params: { ...pathParams || {}, ...documentId ? { documentId } : {} },
    body: bodyData || {},
    strapi: {
      request: { method: String(method.method || "GET").toUpperCase(), path: method.path }
    }
  };
  const resolved = policy ? {
    filters: resolver.resolveDeep(policy.filtersTemplate || {}, tokenCtx),
    populate: resolver.resolveDeep(policy.populateTemplate || {}, tokenCtx),
    body: resolver.resolveDeep(policy.bodyTemplate || {}, tokenCtx),
    query: resolver.resolveDeep(policy.queryTemplate || {}, tokenCtx)
  } : { filters: {}, populate: {}, body: {}, query: {} };
  const finalQuery = mergeQuery(
    { ...queryParams || {} },
    { filters: resolved.filters, populate: resolved.populate, ...resolved.query || {} }
  );
  const result = {
    method: {
      uid,
      action,
      method: method.method,
      path: method.path,
      interfaceKey,
      methodName
    },
    policyFound: Boolean(policy),
    actAsUser: user ? { id: user.id, email: user.email, username: user.username } : null,
    tokenContext: {
      // Slim user dump to avoid leaking sensitive fields (e.g. password hash).
      user: user ? { id: user.id, email: user.email, username: user.username } : tokenCtx.user,
      claim: tokenCtx.claim,
      query: tokenCtx.query,
      params: tokenCtx.params,
      body: tokenCtx.body
    },
    resolved,
    finalQuery,
    response: null,
    executed: false,
    executionError: null
  };
  if (uid && SAFE_FIND_ACTIONS.has(action)) {
    try {
      if (action === "findOne") {
        const target = documentId || pathParams?.documentId || pathParams?.id || null;
        if (!target) {
          result.executionError = "findOne requires a documentId (or id) in path params to execute";
        } else {
          const doc = await strapi2.documents(uid).findOne({
            documentId: String(target),
            ...finalQuery.populate ? { populate: finalQuery.populate } : {},
            ...finalQuery.filters ? { filters: finalQuery.filters } : {}
          });
          result.response = doc;
          result.executed = true;
        }
      } else {
        const docs = await strapi2.documents(uid).findMany({
          ...finalQuery.filters ? { filters: finalQuery.filters } : {},
          ...finalQuery.populate ? { populate: finalQuery.populate } : {},
          ...finalQuery.pagination ? { pagination: finalQuery.pagination } : { pagination: { pageSize: 10 } },
          ...finalQuery.sort ? { sort: finalQuery.sort } : {},
          ...finalQuery.fields ? { fields: finalQuery.fields } : {}
        });
        result.response = docs;
        result.executed = true;
      }
    } catch (error) {
      result.executionError = error?.message || String(error);
    }
  }
  return result;
}
var play_1 = {
  play: play$1
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
const fileStore = fileStore$5;
const sync = sync$2;
const policies$2 = policies$3;
const scaffold = scaffold$1;
const seeder = seeder$1;
const play = play_1;
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
  scaffold,
  seeder,
  play
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
module.exports = index;
