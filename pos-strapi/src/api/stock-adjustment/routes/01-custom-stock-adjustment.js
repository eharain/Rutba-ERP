'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/stock-adjustments/:id/post',
      handler: 'transitions.post',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/stock-adjustments/:id/cancel',
      handler: 'transitions.cancel',
      config: { auth: false },
    },
  ],
};
