'use strict';

// Two route surfaces:
//   • content-api: public-ish API consumers (frontend apps) hit these
//   • admin:       Strapi admin UI hits these for plugin pages
//
// Strapi prepends the plugin id, so a content-api path '/me/permissions'
// resolves to '/api/api-pro/me/permissions' (which is in the default
// bypassPaths list — see config.js — so the global interceptor lets it through).

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
      {
        method: 'GET',
        path: '/users',
        handler: 'users.list',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'GET',
        path: '/users/role-options',
        handler: 'users.roleOptions',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'PUT',
        path: '/users/:id/roles',
        handler: 'users.assignRoles',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },

      // ── Recordings ───────────────────────────────────────────────────
      {
        method: 'POST',
        path: '/recordings/start',
        handler: 'recordings.start',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'POST',
        path: '/recordings/stop',
        handler: 'recordings.stop',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'GET',
        path: '/recordings',
        handler: 'recordings.list',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'GET',
        path: '/recordings/:sessionId/entries',
        handler: 'recordings.entries',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },

      // ── Interfaces ───────────────────────────────────────────────────
      {
        method: 'GET',
        path: '/interfaces',
        handler: 'interfaces.list',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/from-recordings',
        handler: 'interfaces.createFromRecordings',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/from-content-type',
        handler: 'interfaces.createFromContentType',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'PATCH',
        path: '/interfaces/:interfaceId/methods',
        handler: 'interfaces.upsertMethod',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'GET',
        path: '/interfaces/lint-scaffold',
        handler: 'interfaces.lintScaffold',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/validate-alignment',
        handler: 'interfaces.validateAlignment',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/preview-guided-fix',
        handler: 'interfaces.previewGuidedFix',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'GET',
        path: '/interfaces/:interfaceKey/scaffold',
        handler: 'interfaces.scaffold',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },

      // ── Domains & Roles ──────────────────────────────────────────────
      {
        method: 'GET',
        path: '/domains',
        handler: 'domains.listDomains',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'POST',
        path: '/domains',
        handler: 'domains.createDomain',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'PUT',
        path: '/domains/:id',
        handler: 'domains.updateDomain',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'DELETE',
        path: '/domains/:id',
        handler: 'domains.deleteDomain',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'GET',
        path: '/roles',
        handler: 'domains.listRoles',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'POST',
        path: '/roles',
        handler: 'domains.createRole',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'PUT',
        path: '/roles/:id',
        handler: 'domains.updateRole',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'DELETE',
        path: '/roles/:id',
        handler: 'domains.deleteRole',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },

      // ── Method Policies ──────────────────────────────────────────────
      {
        method: 'GET',
        path: '/policies',
        handler: 'policies.list',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'GET',
        path: '/policies/:interfaceKey/:methodKey/:roleKey',
        handler: 'policies.findOne',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'PUT',
        path: '/policies/:interfaceKey/:methodKey/:roleKey',
        handler: 'policies.upsert',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },
      {
        method: 'DELETE',
        path: '/policies/:interfaceKey/:methodKey/:roleKey',
        handler: 'policies.remove',
        config: { middlewares: ['plugin::api-pro.appContext'], policies: [] },
      },

      // ── Health ───────────────────────────────────────────────────────
      {
        method: 'GET',
        path: '/health',
        handler: 'health.check',
        config: { policies: [] },
      },
    ],
  },
};
