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
  ],
};
