import require$$0$7 from "path";
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
var bootstrap$1 = ({ strapi: strapi2 }) => {
  strapi2.log.info("[api-pro] bootstrap");
};
var destroy$1 = () => {
};
var config$1 = {
  default: {
    apiProviderRoot: "../../api-provider",
    interfacesDir: "api",
    scaffoldScript: "scripts/scaffold-endpoint-providers.mjs",
    generatedClientDir: "providers/generated/client"
  },
  validator(config2) {
    if (!config2 || typeof config2 !== "object") {
      throw new Error("[api-pro] invalid plugin config");
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
const health = health$1;
const recordings$2 = recordings$3;
const interfaces$2 = interfaces$3;
const users$2 = users$3;
var controllers$1 = {
  health,
  recordings: recordings$2,
  interfaces: interfaces$2,
  users: users$2
};
var routes$1 = {
  admin: {
    type: "admin",
    routes: [
      {
        method: "GET",
        path: "/users",
        handler: "users.list",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "GET",
        path: "/users/role-options",
        handler: "users.roleOptions",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "PUT",
        path: "/users/:id/roles",
        handler: "users.assignRoles",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "POST",
        path: "/recordings/start",
        handler: "recordings.start",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "POST",
        path: "/recordings/stop",
        handler: "recordings.stop",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "GET",
        path: "/recordings",
        handler: "recordings.list",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "GET",
        path: "/recordings/:sessionId/entries",
        handler: "recordings.entries",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "GET",
        path: "/interfaces/lint-scaffold",
        handler: "interfaces.lintScaffold",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "POST",
        path: "/interfaces/validate-alignment",
        handler: "interfaces.validateAlignment",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "POST",
        path: "/interfaces/preview-guided-fix",
        handler: "interfaces.previewGuidedFix",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "GET",
        path: "/interfaces",
        handler: "interfaces.list",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "POST",
        path: "/interfaces/from-recordings",
        handler: "interfaces.createFromRecordings",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "POST",
        path: "/interfaces/from-content-type",
        handler: "interfaces.createFromContentType",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "PATCH",
        path: "/interfaces/:interfaceId/methods",
        handler: "interfaces.upsertMethod",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      },
      {
        method: "GET",
        path: "/health",
        handler: "health.check",
        config: {
          middlewares: ["plugin::api-pro.appContext"],
          policies: []
        }
      }
    ]
  }
};
const APP_ROLE_UID$1 = "plugin::api-pro.app-role";
function getHeader(ctx, key) {
  const value = ctx?.request?.headers?.[key.toLowerCase()];
  return typeof value === "string" ? value.trim() : "";
}
function normalizeClaims(ctx) {
  const appName = getHeader(ctx, "x-rutba-app") || getHeader(ctx, "x-app-name");
  const roleKey = getHeader(ctx, "x-rutba-app-role") || getHeader(ctx, "x-app-role");
  const domainKey = getHeader(ctx, "x-rutba-app-domain") || getHeader(ctx, "x-app-domain");
  return {
    appName,
    roleKey,
    domainKey
  };
}
function normalizeUserRoleKeys(user) {
  const raw = user?.api_guard_roles;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    if (typeof entry === "string") return entry.toLowerCase();
    if (entry && typeof entry.key === "string") return entry.key.toLowerCase();
    return null;
  }).filter(Boolean);
}
function createValidationError(message, code = "INVALID_CONTEXT_CLAIM", status = 403) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
async function validateClaimContext(ctx, strapi2) {
  const claims = normalizeClaims(ctx);
  const user = ctx?.state?.user;
  if (!user?.id) {
    throw createValidationError("Authenticated user is required for app context validation", "AUTH_REQUIRED", 401);
  }
  if (!claims.appName) {
    throw createValidationError("Missing appName claim header (x-rutba-app)", "APP_CLAIM_REQUIRED", 400);
  }
  if (!claims.roleKey) {
    throw createValidationError("Missing role claim header (x-rutba-app-role)", "ROLE_CLAIM_REQUIRED", 400);
  }
  const claimedRoleKey = claims.roleKey.toLowerCase();
  const userRoleKeys = normalizeUserRoleKeys(user);
  if (!userRoleKeys.includes(claimedRoleKey)) {
    throw createValidationError(`Claimed role '${claims.roleKey}' is not assigned to current user`, "ROLE_NOT_ASSIGNED", 403);
  }
  const matchedRole = await strapi2.db.query(APP_ROLE_UID$1).findOne({
    where: {
      key: claimedRoleKey,
      isActive: true
    },
    populate: {
      appDomains: true
    }
  });
  if (!matchedRole) {
    throw createValidationError(`Claimed app role '${claims.roleKey}' is not configured`, "ROLE_NOT_CONFIGURED", 403);
  }
  const domainKeys = Array.isArray(matchedRole.appDomains) ? matchedRole.appDomains.map((d) => String(d?.key || "").toLowerCase()).filter(Boolean) : [];
  if (claims.domainKey) {
    const dk = claims.domainKey.toLowerCase();
    if (domainKeys.length > 0 && !domainKeys.includes(dk)) {
      throw createValidationError(`Claimed domain '${claims.domainKey}' is not allowed for role '${claims.roleKey}'`, "DOMAIN_NOT_ALLOWED", 403);
    }
  }
  return {
    claim: {
      appName: claims.appName,
      roleKey: claimedRoleKey,
      domainKey: claims.domainKey || null
    },
    user: {
      id: user.id,
      email: user.email || null,
      username: user.username || null
    },
    role: {
      key: matchedRole.key,
      name: matchedRole.name || matchedRole.key,
      adminRoleCode: matchedRole.adminRoleCode,
      domainKeys
    },
    audit: {
      validationSource: "x-rutba-app/x-rutba-app-role headers",
      validatedAt: (/* @__PURE__ */ new Date()).toISOString()
    }
  };
}
var context$1 = {
  normalizeClaims,
  validateClaimContext
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
const path = require$$0$7;
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
const TOKEN_REGEX = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const ALLOWED_ROOTS = /* @__PURE__ */ new Set(["strapi", "user", "claim", "input"]);
function getByPath(source, dottedPath) {
  return dottedPath.split(".").reduce((acc, segment) => {
    if (acc == null) return void 0;
    if (typeof acc !== "object") return void 0;
    return acc[segment];
  }, source);
}
function resolveToken(context2, token, strict) {
  const [root] = token.split(".");
  if (!ALLOWED_ROOTS.has(root)) {
    throw new Error(`Policy template token root '${root}' is not allowed`);
  }
  const value = getByPath(context2, token);
  if (value === void 0 && strict) {
    throw new Error(`Policy template token '${token}' resolved to undefined`);
  }
  return value;
}
function resolveStringTemplate(value, context2, strict) {
  const matches = [...value.matchAll(TOKEN_REGEX)];
  if (matches.length === 0) return value;
  if (matches.length === 1 && matches[0][0] === value.trim()) {
    const token = matches[0][1];
    const tokenValue = resolveToken(context2, token, strict);
    return tokenValue === void 0 ? null : tokenValue;
  }
  return value.replace(TOKEN_REGEX, (_, token) => {
    const tokenValue = resolveToken(context2, token, strict);
    if (tokenValue == null) return "";
    if (typeof tokenValue === "object") return JSON.stringify(tokenValue);
    return String(tokenValue);
  });
}
function resolveNode(node, context2, strict) {
  if (Array.isArray(node)) {
    return node.map((item) => resolveNode(item, context2, strict));
  }
  if (node && typeof node === "object") {
    const output = {};
    for (const [key, value] of Object.entries(node)) {
      output[key] = resolveNode(value, context2, strict);
    }
    return output;
  }
  if (typeof node === "string") {
    return resolveStringTemplate(node, context2, strict);
  }
  return node;
}
function buildContextBundle({ strapiCtx = {}, user = {}, claim = {}, input = {} } = {}) {
  return {
    strapi: {
      request: {
        method: strapiCtx?.request?.method || null,
        path: strapiCtx?.request?.path || null,
        query: strapiCtx?.request?.query || {}
      }
    },
    user: {
      id: user?.id || null,
      email: user?.email || null,
      username: user?.username || null
    },
    claim: {
      appName: claim?.appName || null,
      roleKey: claim?.roleKey || null,
      domainKey: claim?.domainKey || null
    },
    input: input || {}
  };
}
function resolvePolicyTemplates(policy = {}, options2 = {}) {
  const strict = options2.resolverMode !== "lenient";
  const context2 = buildContextBundle(options2);
  return {
    filters: resolveNode(policy.filtersTemplate || {}, context2, strict),
    populate: resolveNode(policy.populateTemplate || {}, context2, strict),
    body: resolveNode(policy.bodyTemplate || {}, context2, strict),
    query: resolveNode(policy.queryTemplate || {}, context2, strict)
  };
}
var policyResolver$1 = {
  buildContextBundle,
  resolvePolicyTemplates
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
const context = context$1;
const recordings = recordings$1;
const interfaces = interfaces$1;
const policyResolver = policyResolver$1;
const users = users$1;
const scaffoldRunner = scaffoldRunner$1;
var services$1 = {
  context,
  recordings,
  interfaces,
  policyResolver,
  users,
  scaffoldRunner
};
var policies$1 = {};
var appContext$1 = (config2, { strapi: strapi2 }) => {
  return async (ctx, next) => {
    const shouldValidate = config2?.required !== false;
    if (!shouldValidate) {
      await next();
      return;
    }
    try {
      const resolved = await strapi2.plugin("api-pro").service("context").validateClaimContext(ctx, strapi2);
      ctx.state.apiProContext = resolved;
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
