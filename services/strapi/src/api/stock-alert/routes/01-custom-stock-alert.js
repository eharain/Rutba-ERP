'use strict';

/**
 * Custom stock-alert routes. The `01-` filename prefix sorts these before the
 * core router so `/stock-alerts/run-now` and `/stock-alerts/:id/...` are matched
 * before the core `/stock-alerts/:documentId` (koa first-match). auth:false +
 * manual requireAppRole in the transitions controller (same pattern as the
 * reorder-policy / stock-adjustment custom routes).
 */

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/stock-alerts/run-now',
      handler: 'transitions.runNow',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/stock-alerts/:id/acknowledge',
      handler: 'transitions.acknowledge',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/stock-alerts/:id/dismiss',
      handler: 'transitions.dismiss',
      config: { auth: false },
    },
  ],
};
