'use strict';

// Literal-prefix route — must register before the core /crm-leads/:documentId
// router or it gets shadowed (first-match wins in the koa router).
module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/crm-leads/assignees',
      handler: 'api::crm-lead.crm-lead.assignees',
      config: { policies: [] },
    },
  ],
};
