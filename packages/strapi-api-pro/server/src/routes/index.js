'use strict';

// Two route surfaces:
//   • content-api: public-ish API consumers (frontend apps) hit these
//   • admin:       Strapi admin UI hits these for plugin pages
//
// Strapi prepends the plugin id, so a content-api path '/me/permissions'
// resolves to '/api/api-pro/me/permissions' (which is in the default
// bypassPaths list — see config.js — so the global interceptor lets it through).
//
// Admin routes inherit Strapi's admin session-JWT middleware by default (route
// type 'admin'). Beyond that we layer Strapi RBAC via `admin::hasPermissions`,
// so administrators only see/use the plugin if their role explicitly grants
// the matching action. Two-tier model:
//   • plugin::api-pro.read  — list everything (no mutations)
//   • plugin::api-pro.write — all mutations (POST/PUT/PATCH/DELETE)
// Actions are registered in bootstrap.js. Super Admin is auto-granted both;
// other roles must be granted from Settings → Administration → Roles.

const READ_ACTION = 'plugin::api-pro.read';
const WRITE_ACTION = 'plugin::api-pro.write';

const adminPolicy = (action) => ({
  name: 'admin::hasPermissions',
  config: { actions: [action] },
});

const adminRead = (method, path, handler) => ({
  method,
  path,
  handler,
  config: { policies: [adminPolicy(READ_ACTION)] },
});

const adminWrite = (method, path, handler) => ({
  method,
  path,
  handler,
  config: { policies: [adminPolicy(WRITE_ACTION)] },
});

module.exports = {
  'content-api': {
    type: 'content-api',
    routes: [
      {
        method: 'GET',
        path: '/me/permissions',
        handler: 'me.permissions',
        config: {
          policies: [],
        },
      },
    ],
  },

  admin: {
    type: 'admin',
    routes: [
      // ── Users ────────────────────────────────────────────────────────
      adminRead('GET', '/users', 'users.list'),
      adminRead('GET', '/users/role-options', 'users.roleOptions'),
      adminWrite('PUT', '/users/:id/roles', 'users.assignRoles'),

      // ── Recordings ───────────────────────────────────────────────────
      adminWrite('POST', '/recordings/start', 'recordings.start'),
      adminWrite('POST', '/recordings/stop', 'recordings.stop'),
      adminRead('GET', '/recordings', 'recordings.list'),
      adminRead('GET', '/recordings/:sessionId/entries', 'recordings.entries'),

      // ── Interfaces ───────────────────────────────────────────────────
      adminRead('GET', '/interfaces', 'interfaces.list'),
      adminWrite('POST', '/interfaces/from-recordings', 'interfaces.createFromRecordings'),
      adminWrite('POST', '/interfaces/from-content-type', 'interfaces.createFromContentType'),
      adminWrite('PATCH', '/interfaces/:interfaceId/methods', 'interfaces.upsertMethod'),
      adminRead('GET', '/interfaces/lint-scaffold', 'interfaces.lintScaffold'),
      adminWrite('POST', '/interfaces/validate-alignment', 'interfaces.validateAlignment'),
      adminWrite('POST', '/interfaces/preview-guided-fix', 'interfaces.previewGuidedFix'),
      adminRead('GET', '/interfaces/:interfaceKey/scaffold', 'interfaces.scaffold'),

      // ── Domains & Roles ──────────────────────────────────────────────
      adminRead('GET', '/domains', 'domains.listDomains'),
      adminWrite('POST', '/domains', 'domains.createDomain'),
      adminWrite('PUT', '/domains/:id', 'domains.updateDomain'),
      adminWrite('DELETE', '/domains/:id', 'domains.deleteDomain'),
      adminRead('GET', '/roles', 'domains.listRoles'),
      adminWrite('POST', '/roles', 'domains.createRole'),
      adminWrite('PUT', '/roles/:id', 'domains.updateRole'),
      adminWrite('DELETE', '/roles/:id', 'domains.deleteRole'),

      // ── Method Policies ──────────────────────────────────────────────
      // ORDER MATTERS: koa-router does first-match. Literal-prefixed paths
      // (`/policies/method/...`) MUST be registered before the generic
      // 3-param `/policies/:i/:m/:r` patterns, otherwise GET /policies/method/term/list
      // matches findOne with interfaceKey='method', returning 404 "policy not found"
      // and leaving the Comparative Editor with allRoles=[] and policies={}.
      adminRead('GET', '/policies', 'policies.list'),
      // Comparative editor: bulk fetch / save all policies for a method
      adminRead('GET', '/policies/method/:interfaceKey/:methodKey', 'policies.findForMethod'),
      adminWrite('PUT', '/policies/method/:interfaceKey/:methodKey', 'policies.bulkUpsertForMethod'),
      adminRead('GET', '/policies/:interfaceKey/:methodKey/:roleKey', 'policies.findOne'),
      adminWrite('PUT', '/policies/:interfaceKey/:methodKey/:roleKey', 'policies.upsert'),
      adminWrite('DELETE', '/policies/:interfaceKey/:methodKey/:roleKey', 'policies.remove'),

      // ── Admin tools ──────────────────────────────────────────────────
      adminWrite('POST', '/admin/seed', 'admin-tools.seed'),
      // Play as role: never mutates plugin state, only proxies/simulates,
      // so gated as read.
      adminRead('POST', '/play', 'play.run'),

      // ── Health ───────────────────────────────────────────────────────
      adminRead('GET', '/health', 'health.check'),
    ],
  },
};
