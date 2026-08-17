'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/mfg-tasks/:documentId/process',
      handler: 'transition.process',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/mfg-tasks/:documentId/approve',
      handler: 'transition.approve',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/mfg-tasks/:documentId/reject',
      handler: 'transition.reject',
      config: {
        auth: false,
      },
    },
  ],
};
