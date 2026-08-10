// @ts-nocheck
'use strict';

// All auth:false — this api has no content type, so there is no UP action to
// grant; requireAppRole inside the controller is the gate (same pattern as the
// legacy /auth-admin/* routes these supersede). Literal paths registered
// before parameterised ones — koa-router matches in order.
module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/user-admin/users',
      handler: 'api::user-admin.user-admin.listUsers',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/user-admin/users',
      handler: 'api::user-admin.user-admin.createUser',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/user-admin/users/bulk-access',
      handler: 'api::user-admin.user-admin.setBulkAccess',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/user-admin/invites',
      handler: 'api::user-admin.user-admin.createInvite',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/user-admin/users/:id/invite',
      handler: 'api::user-admin.user-admin.sendInvite',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/user-admin/directory',
      handler: 'api::user-admin.user-admin.listDirectory',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/user-admin/employees',
      handler: 'api::user-admin.user-admin.listEmployees',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/user-admin/roles',
      handler: 'api::user-admin.user-admin.listRoles',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/user-admin/domains',
      handler: 'api::user-admin.user-admin.listDomains',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/user-admin/domains',
      handler: 'api::user-admin.user-admin.createDomain',
      config: { auth: false },
    },
    {
      method: 'DELETE',
      path: '/user-admin/domains/:id',
      handler: 'api::user-admin.user-admin.deleteDomain',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/user-admin/users/:id/app-roles',
      handler: 'api::user-admin.user-admin.setAppRoles',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/user-admin/users/:id/mailbox',
      handler: 'api::user-admin.user-admin.createMailbox',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/user-admin/users/:id',
      handler: 'api::user-admin.user-admin.getUser',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/user-admin/users/:id',
      handler: 'api::user-admin.user-admin.updateUser',
      config: { auth: false },
    },
    {
      method: 'DELETE',
      path: '/user-admin/users/:id',
      handler: 'api::user-admin.user-admin.deleteUser',
      config: { auth: false },
    },
  ],
};
