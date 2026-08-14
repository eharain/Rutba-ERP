'use strict';

// Literal-prefix routes — must register before the core /crm-activities/:documentId
// router or koa (first-match wins) hands /crm-activities/timeline to findOne.
// Same ordering rule as crm-lead/assignees.
module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/crm-activities/timeline',
      handler: 'api::crm-activity.crm-activity.timeline',
      config: { policies: [] },
    },
    {
      method: 'GET',
      path: '/crm-activities/followups',
      handler: 'api::crm-activity.crm-activity.followups',
      config: { policies: [] },
    },
    {
      method: 'POST',
      path: '/crm-activities/:documentId/complete-followup',
      handler: 'api::crm-activity.crm-activity.completeFollowup',
      config: { policies: [] },
    },
  ],
};
