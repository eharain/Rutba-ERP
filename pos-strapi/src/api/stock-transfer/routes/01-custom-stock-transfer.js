'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/stock-transfers/:id/dispatch',
      handler: 'transitions.dispatch',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/stock-transfers/:id/receive',
      handler: 'transitions.receive',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/stock-transfers/:id/cancel',
      handler: 'transitions.cancel',
      config: { auth: false },
    },
  ],
};
