'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/mfg-work-orders/:documentId/process',
      handler: 'transition.process',
      config: {
        auth: false,
      },
    },
  ],
};
