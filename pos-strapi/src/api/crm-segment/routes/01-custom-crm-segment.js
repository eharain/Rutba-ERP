'use strict';

// Literal-prefix routes register before the core /crm-segments/:documentId
// router — koa-router is first-match, so /crm-segments/fields would otherwise
// be swallowed by findOne.
module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/crm-segments/fields',
      handler: 'api::crm-segment.crm-segment.fields',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/crm-segments/resolve',
      handler: 'api::crm-segment.crm-segment.resolve',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/crm-segments/:documentId/members',
      handler: 'api::crm-segment.crm-segment.members',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/crm-segments/:documentId/audience',
      handler: 'api::crm-segment.crm-segment.audience',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/crm-segments/:documentId/recount',
      handler: 'api::crm-segment.crm-segment.recomputeCount',
      config: { policies: [] },
    },
  ],
};
