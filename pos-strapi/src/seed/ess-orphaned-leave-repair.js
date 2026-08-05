'use strict';

/**
 * Repair hr-leave-request rows with no `employee` link but a known `owners`
 * user — a symptom of applying for leave before the caller had a linked
 * hr-employee record (see hr-access.js#resolveOrCreateEmployeeForUser, which
 * now prevents this going forward). Without `employee`, myRequests/teamQueue
 * can never surface the row again even though it was genuinely booked.
 *
 * Only repairs rows where `owners` gives an unambiguous signal of who the
 * request belongs to — never guesses at rows with no owner recorded.
 */

const { resolveEmployeeForUser } = require('../utils/hr-access');

const LR_UID = 'api::hr-leave-request.hr-leave-request';

module.exports = async function repairOrphanedLeaveRequests(strapi) {
    const rows = await strapi.db.query(LR_UID).findMany({
        where: { employee: { id: { $null: true } }, owners: { id: { $notNull: true } } },
        select: ['id', 'documentId'],
        populate: { owners: { select: ['id', 'username', 'email'] } },
    });

    let repaired = 0;
    for (const row of rows) {
        const ownerUser = row.owners?.[0];
        if (!ownerUser) continue;
        const employee = await resolveEmployeeForUser(strapi, ownerUser);
        if (!employee) continue;

        await strapi.documents(LR_UID).update({
            documentId: row.documentId,
            data: { employee: { connect: [employee.documentId] } },
        });
        repaired++;
    }

    if (repaired > 0) {
        strapi.log.info(`[ess-orphaned-leave-repair] re-linked employee on ${repaired} hr-leave-request row(s)`);
    }
};
