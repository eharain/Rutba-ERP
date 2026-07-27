'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/mfg-job-works/:id/dispatch',
      handler: 'transitions.dispatch',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/mfg-job-works/:id/receive',
      handler: 'transitions.receive',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/mfg-job-works/:id/cancel',
      handler: 'transitions.cancel',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/mfg-job-works/:id/close',
      handler: 'transitions.close',
      config: { auth: false },
    },
  ],
};
