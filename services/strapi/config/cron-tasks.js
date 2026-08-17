'use strict';

// Background jobs for the social module. Wired into Strapi via config/server.js
// (`cron: { enabled, tasks }`). Each task is defensive — a throw inside one run
// must not crash the scheduler.
//
//   socialPublishScheduled — publish posts whose scheduled_at has arrived
//   socialSyncReplies      — pull new comments/replies from each platform
//   socialRefreshTokens    — refresh OAuth tokens before they expire

const POST_UID = 'api::social-post.social-post';

module.exports = function buildSocialCronTasks(rules = {}) {
  return {
    socialPublishScheduled: {
      task: async ({ strapi }) => {
        try {
          await strapi.service(POST_UID).publishDueScheduled();
        } catch (e) {
          strapi.log.warn(`[social] cron publishScheduled failed: ${e.message}`);
        }
      },
      options: { rule: rules.publishRule || '* * * * *' },
    },

    socialSyncReplies: {
      task: async ({ strapi }) => {
        try {
          await strapi.service(POST_UID).syncRepliesForAllPublished();
        } catch (e) {
          strapi.log.warn(`[social] cron syncReplies failed: ${e.message}`);
        }
      },
      options: { rule: rules.syncRule || '*/10 * * * *' },
    },

    socialRefreshTokens: {
      task: async ({ strapi }) => {
        try {
          await strapi.service(POST_UID).refreshExpiringTokens();
        } catch (e) {
          strapi.log.warn(`[social] cron refreshTokens failed: ${e.message}`);
        }
      },
      options: { rule: rules.refreshRule || '0 */6 * * *' },
    },
  };
};
