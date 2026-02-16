'use strict';

/**
 * Custom cash-register routes for open/close/active/expire actions.
 * These are loaded alongside the core CRUD routes.
 */

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/cash-registers/active',
      handler: 'cash-register.active',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/cash-registers/open',
      handler: 'cash-register.open',
      config: {
        policies: [],
      },
    },
    {
      method: 'PUT',
      path: '/cash-registers/:id/close',
      handler: 'cash-register.close',
      config: {
        policies: [],
      },
    },
    {
      method: 'PUT',
      path: '/cash-registers/:id/expire',
      handler: 'cash-register.expire',
      config: {
        policies: [],
      },
    },
  ],
};
