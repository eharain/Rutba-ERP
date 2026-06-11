'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/mfg-material-lots/recompute',
      handler: 'recompute.run',
      config: {
        auth: false,
      },
    },
  ],
};
