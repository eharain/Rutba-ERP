'use strict';

// Workflow background jobs. Wired into Strapi via config/server.js
// (`cron: { enabled, tasks }`, merged with the social/inventory tasks). Each
// task is defensive — a throw inside one run must not crash the scheduler.
//
//   workflowSlaSweep — scan every active, SLA-configured api::workflow.workflow
//   for entities that have overslept their current stage (see
//   utils/workflow-engine.js#isStageOverdue) and fire a deduped
//   'workflow.sla_breach' notification event per overdue entity. Flags only —
//   never auto-transitions or auto-approves. A no-op until a workflow row sets
//   sla_hours on at least one transition (none do by default).

const WF_UID = 'api::workflow.workflow';

module.exports = function buildWorkflowCronTasks(rules = {}) {
  return {
    workflowSlaSweep: {
      task: async ({ strapi }) => {
        try {
          await strapi.service(WF_UID).sweepOverdueStages();
        } catch (e) {
          strapi.log.warn(`[workflow] cron slaSweep failed: ${e.message}`);
        }
      },
      options: { rule: rules.slaSweepRule || '*/15 * * * *' },
    },
  };
};
