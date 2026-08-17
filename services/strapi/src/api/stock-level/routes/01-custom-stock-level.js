'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/stock-levels/recompute',
      handler: 'recompute.run',
      config: {
        auth: false,
      },
    },
  ],
};
