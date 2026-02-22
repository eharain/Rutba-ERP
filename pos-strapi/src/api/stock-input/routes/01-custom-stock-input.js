'use strict';

/**
 * Custom stock-input routes for bulk processing.
 * Loaded alongside the core CRUD routes.
 */

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/stock-inputs/process',
      handler: 'stock-input.process',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/stock-inputs/bulk',
      handler: 'stock-input.bulk',
      config: {
        policies: [],
      },
    },
  ],
};
