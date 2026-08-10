'use strict';

// Mail background jobs. Wired into config/server.js behind MAIL_CRON_ENABLED.
//
//   mailUnseenPoll — STATUS (UNSEEN) on INBOX for every active mail-account,
//   cached into `unseen_counts` for the client's folder badges. This is the
//   ONLY background IMAP touch in the live-read architecture (see
//   docs/todo/email-program/02-imap-gateway.md) — cheap STATUS commands, no
//   message reads, no sync. Failures are logged (never with settings) and
//   never written to last_error: a transient poll miss must not scare the
//   settings screen.

const UID = 'api::mail-account.mail-account';

module.exports = function buildMailCronTasks(rules = {}) {
  return {
    mailUnseenPoll: {
      task: async ({ strapi }) => {
        try {
          const gateway = require('../src/utils/mail/gateway');
          const accounts = await strapi.documents(UID).findMany({
            filters: { is_active: true },
            limit: 100,
          });
          for (const account of accounts) {
            try {
              const counts = await gateway.getUnseenCounts(strapi, account, ['INBOX']);
              await strapi.documents(UID).update({
                documentId: account.documentId,
                data: {
                  unseen_counts: { ...counts, checked_at: new Date().toISOString() },
                  last_checked_at: new Date(),
                },
              });
            } catch (e) {
              strapi.log.warn(`[mail] unseen poll failed for ${account.documentId}: ${e.message}`);
            }
          }
        } catch (e) {
          strapi.log.warn(`[mail] cron unseenPoll failed: ${e.message}`);
        }
      },
      options: { rule: rules.unseenPollRule || '*/2 * * * *' },
    },
  };
};
