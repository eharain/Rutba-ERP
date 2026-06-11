'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/pay-payroll-runs/:documentId/process',
      handler: 'process.run',
      config: {
        auth: false,
      },
    },
    {
      method: 'POST',
      path: '/pay-payroll-runs/:documentId/cancel',
      handler: 'process.cancel',
      config: {
        auth: false,
      },
    },
  ],
};
