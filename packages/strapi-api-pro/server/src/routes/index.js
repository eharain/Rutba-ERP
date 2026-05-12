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
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/users/role-options',
        handler: 'users.roleOptions',
        config: { policies: [] },
      },
      {
        method: 'PUT',
        path: '/users/:id/roles',
        handler: 'users.assignRoles',
        config: { policies: [] },
      },

      // ── Recordings ───────────────────────────────────────────────────
      {
        method: 'POST',
        path: '/recordings/start',
        handler: 'recordings.start',
        config: { policies: [] },
      },
      {
        method: 'POST',
        path: '/recordings/stop',
        handler: 'recordings.stop',
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/recordings',
        handler: 'recordings.list',
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/recordings/:sessionId/entries',
        handler: 'recordings.entries',
        config: { policies: [] },
      },

      // ── Interfaces ───────────────────────────────────────────────────
      {
        method: 'GET',
        path: '/interfaces',
        handler: 'interfaces.list',
        config: { policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/from-recordings',
        handler: 'interfaces.createFromRecordings',
        config: { policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/from-content-type',
        handler: 'interfaces.createFromContentType',
        config: { policies: [] },
      },
      {
        method: 'PATCH',
        path: '/interfaces/:interfaceId/methods',
        handler: 'interfaces.upsertMethod',
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/interfaces/lint-scaffold',
        handler: 'interfaces.lintScaffold',
        config: { policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/validate-alignment',
        handler: 'interfaces.validateAlignment',
        config: { policies: [] },
      },
      {
        method: 'POST',
        path: '/interfaces/preview-guided-fix',
        handler: 'interfaces.previewGuidedFix',
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/interfaces/:interfaceKey/scaffold',
        handler: 'interfaces.scaffold',
        config: { policies: [] },
      },

      // ── Domains & Roles ──────────────────────────────────────────────
      {
        method: 'GET',
        path: '/domains',
        handler: 'domains.listDomains',
        config: { policies: [] },
      },
      {
        method: 'POST',
        path: '/domains',
        handler: 'domains.createDomain',
        config: { policies: [] },
      },
      {
        method: 'PUT',
        path: '/domains/:id',
        handler: 'domains.updateDomain',
        config: { policies: [] },
      },
      {
        method: 'DELETE',
        path: '/domains/:id',
        handler: 'domains.deleteDomain',
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/roles',
        handler: 'domains.listRoles',
        config: { policies: [] },
      },
      {
        method: 'POST',
        path: '/roles',
        handler: 'domains.createRole',
        config: { policies: [] },
      },
      {
        method: 'PUT',
        path: '/roles/:id',
        handler: 'domains.updateRole',
        config: { policies: [] },
      },
      {
        method: 'DELETE',
        path: '/roles/:id',
        handler: 'domains.deleteRole',
        config: { policies: [] },
      },

      // ── Method Policies ──────────────────────────────────────────────
      {
        method: 'GET',
        path: '/policies',
        handler: 'policies.list',
        config: { policies: [] },
      },
      {
        method: 'GET',
        path: '/policies/:interfaceKey/:methodKey/:roleKey',
        handler: 'policies.findOne',
        config: { policies: [] },
      },
      {
        method: 'PUT',
        path: '/policies/:interfaceKey/:methodKey/:roleKey',
        handler: 'policies.upsert',
        config: { policies: [] },
      },
      {
        method: 'DELETE',
        path: '/policies/:interfaceKey/:methodKey/:roleKey',
        handler: 'policies.remove',
        config: { policies: [] },
      },
      // ── Comparative editor: bulk fetch / save all policies for a method ─
      {
        method: 'GET',
        path: '/policies/method/:interfaceKey/:methodKey',
        handler: 'policies.findForMethod',
        config: { policies: [] },
      },
      {
        method: 'PUT',
        path: '/policies/method/:interfaceKey/:methodKey',
        handler: 'policies.bulkUpsertForMethod',
        config: { policies: [] },
      },

      // ── Admin tools ──────────────────────────────────────────────────
      {
        method: 'POST',
        path: '/admin/seed',
        handler: 'admin-tools.seed',
        config: { policies: [] },
      },
      // ── Play as role (dry-run + optional real fetch for read actions) ──
      {
        method: 'POST',
        path: '/play',
        handler: 'play.run',
        config: { policies: [] },
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
