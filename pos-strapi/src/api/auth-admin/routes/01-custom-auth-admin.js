'use strict';

/** @type {import('@strapi/strapi').Core.RouterConfig} */
module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/auth-admin/users',
      handler: 'api::auth-admin.auth-admin.listUsers',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/auth-admin/users/:id',
      handler: 'api::auth-admin.auth-admin.getUser',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/auth-admin/users',
      handler: 'api::auth-admin.auth-admin.createUser',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/auth-admin/users/:id',
      handler: 'api::auth-admin.auth-admin.updateUser',
      config: { auth: false },
    },
    {
      method: 'DELETE',
      path: '/auth-admin/users/:id',
      handler: 'api::auth-admin.auth-admin.deleteUser',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/auth-admin/roles',
      handler: 'api::auth-admin.auth-admin.listRoles',
      config: { auth: false },
    },
  ],
};
