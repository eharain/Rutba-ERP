'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/mfg-bundles/:documentId/process',
      handler: 'transition.process',
      config: {
        auth: false,
      },
    },
  ],
};
