'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/warehouses/backfill-default-locations',
      handler: 'backfill.run',
      config: {
        auth: false,
      },
    },
  ],
};
