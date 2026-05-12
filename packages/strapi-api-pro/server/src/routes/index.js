'use strict';

module.exports = {
  admin: {
    type: 'admin',
    routes: [
      {
        method: 'GET',
        path: '/users',
        handler: 'users.list',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'GET',
        path: '/users/role-options',
        handler: 'users.roleOptions',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'PUT',
        path: '/users/:id/roles',
        handler: 'users.assignRoles',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'POST',
        path: '/recordings/start',
        handler: 'recordings.start',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'POST',
        path: '/recordings/stop',
        handler: 'recordings.stop',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'GET',
        path: '/recordings',
        handler: 'recordings.list',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'GET',
        path: '/recordings/:sessionId/entries',
        handler: 'recordings.entries',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'GET',
        path: '/interfaces/lint-scaffold',
        handler: 'interfaces.lintScaffold',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'POST',
        path: '/interfaces/validate-alignment',
        handler: 'interfaces.validateAlignment',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'POST',
        path: '/interfaces/preview-guided-fix',
        handler: 'interfaces.previewGuidedFix',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'GET',
        path: '/interfaces',
        handler: 'interfaces.list',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'POST',
        path: '/interfaces/from-recordings',
        handler: 'interfaces.createFromRecordings',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'POST',
        path: '/interfaces/from-content-type',
        handler: 'interfaces.createFromContentType',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'PATCH',
        path: '/interfaces/:interfaceId/methods',
        handler: 'interfaces.upsertMethod',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
      {
        method: 'GET',
        path: '/health',
        handler: 'health.check',
        config: {
          middlewares: ['plugin::api-pro.appContext'],
          policies: [],
        },
      },
    ],
  },
};
