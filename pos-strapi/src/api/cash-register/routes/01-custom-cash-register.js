'use strict';

/**
 * Custom cash-register routes for open/close/active/expire actions.
 * These are loaded alongside the core CRUD routes.
 *
 * auth: false → bypasses Strapi's built-in role-permission check
 * for custom actions.  Authentication is enforced manually inside
 * each controller method (ctx.state.user must be present).
 */

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/cash-registers/active',
      handler: 'cash-register.active',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/cash-registers/open',
      handler: 'cash-register.open',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/cash-registers/:id/close',
      handler: 'cash-register.close',
      config: {
        auth: false,
      },
    },
    {
      method: 'PUT',
      path: '/cash-registers/:id/expire',
      handler: 'cash-register.expire',
      config: {
        auth: false,
      },
    },
  ],
};
