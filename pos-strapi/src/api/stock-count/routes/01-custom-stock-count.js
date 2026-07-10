'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/stock-counts/:id/post',
      handler: 'transitions.post',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/stock-counts/:id/cancel',
      handler: 'transitions.cancel',
      config: { auth: false },
    },
  ],
};
