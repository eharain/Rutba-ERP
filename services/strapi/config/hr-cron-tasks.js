'use strict';

// HR background jobs. Wired into Strapi via config/server.js
// (`cron: { enabled, tasks }`), mirroring the workflow/inventory cron pattern.
//
//   hrBirthdayCheck — once a day, find every hr-employee whose date_of_birth
//   falls on today's month/day and fire a deduped 'hr.birthday.today' event
//   per employee, routed to their line manager(s) via payload.user_id — the
//   notification-template's `audience` (e.g. 'both') decides whether HR
//   admins are also copied in, no extra fan-out needed here.

const EMP_UID = 'api::hr-employee.hr-employee';

module.exports = function buildHrCronTasks(rules = {}) {
  return {
    hrBirthdayCheck: {
      task: async ({ strapi }) => {
        try {
          const { managerUserIdsForEmployee } = require('../src/utils/hr-access');
          const now = new Date();
          const month = now.getUTCMonth() + 1;
          const day = now.getUTCDate();
          const todayKey = now.toISOString().slice(0, 10);

          const employees = await strapi.documents(EMP_UID).findMany({
            filters: { date_of_birth: { $notNull: true } },
            fields: ['documentId', 'name', 'date_of_birth'],
            pagination: { pageSize: 1000 },
          });

          const todays = (employees || []).filter((e) => {
            if (!e.date_of_birth) return false;
            const dob = new Date(e.date_of_birth);
            return dob.getUTCMonth() + 1 === month && dob.getUTCDate() === day;
          });

          for (const emp of todays) {
            const managerUserIds = await managerUserIdsForEmployee(strapi, emp.documentId);
            for (const managerUserId of managerUserIds) {
              await strapi.service('api::notification.notification-engine').processEvent({
                event_name: 'hr.birthday.today',
                entity_type: 'hr-employee',
                entity_id: emp.documentId,
                payload: {
                  user_id: managerUserId,
                  employee_id: emp.documentId,
                  employee_name: emp.name,
                  dedup_key: `hr.birthday.today:${emp.documentId}:${todayKey}`,
                },
              });
            }
          }
        } catch (e) {
          strapi.log.warn(`[hr] cron birthdayCheck failed: ${e.message}`);
        }
      },
      options: { rule: rules.birthdayCheckRule || '0 7 * * *' },
    },
  };
};
