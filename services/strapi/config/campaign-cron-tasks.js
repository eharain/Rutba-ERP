'use strict';

// Campaign background jobs (apps/content/campaigns spec §4.8). Wired into
// config/server.js behind CAMPAIGNS_CRON_ENABLED — the env flag every .env
// file has declared since Phase 0, consumed here for the first time.
//
//   campaignDueSweep   — start every Scheduled campaign whose next_run_at (or
//                        start_at) has passed; recurrence/max_runs/max_failures
//                        are advanced inside the service.
//   campaignReportPoll — reconcile in-flight runs against the MTA batch report,
//                        backfilling anything the webhook missed and closing
//                        completed runs.
//
// Both are no-ops (fast DB checks) while MTA_BASE_URL is unset — a due
// campaign then fails its run with a structured mta_not_configured error,
// which is the honest state, not a silent skip.

module.exports = function buildCampaignCronTasks(rules = {}) {
  return {
    campaignDueSweep: {
      task: async ({ strapi }) => {
        try {
          const results = await strapi.service('api::cmp-campaign.cmp-campaign').sweepDue();
          if (results.length) {
            strapi.log.info(`[campaigns] due sweep: ${results.filter((r) => r.ok).length}/${results.length} runs started`);
          }
        } catch (e) {
          strapi.log.warn(`[campaigns] cron dueSweep failed: ${e.message}`);
        }
      },
      options: { rule: rules.dueSweepRule || '* * * * *' },
    },
    campaignReportPoll: {
      task: async ({ strapi }) => {
        try {
          await strapi.service('api::cmp-run.cmp-run').sweepReports();
        } catch (e) {
          strapi.log.warn(`[campaigns] cron reportPoll failed: ${e.message}`);
        }
      },
      options: { rule: rules.reportPollRule || '*/5 * * * *' },
    },
  };
};
