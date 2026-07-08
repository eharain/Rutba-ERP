'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/stock-items/orphan-groups',
      handler: 'stock-item.orphanGroups',
      config: {
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/stock-items/orphan-groups/items',
      handler: 'stock-item.orphanGroupItems',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/stock-items/bulk-resolve',
      handler: 'stock-item.resolveBulkStock',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/stock-items/bulk-process',
      handler: 'stock-item.processBulkStock',
      config: {
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/stock-items/recompute-product-stock',
      handler: 'recompute-product-stock.run',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/stock-items/transfer',
      handler: 'transfer.run',
      config: {
        auth: false,
      },
    },
  ],
};
