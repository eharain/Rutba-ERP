'use strict';

/**
 * Backfill `owners` on hr-leave-request / hr-attendance / pay-payslip rows
 * created before the field was populated (leave-request) or before it existed
 * at all (attendance, payslip). Idempotent — only touches rows that have an
 * `employee` link and an empty `owners` set. New rows get `owners` from the
 * controller (hr-leave-request) or a beforeCreate lifecycle (hr-attendance,
 * pay-payslip) going forward; see utils/hr-access.js#ownerUserIdForEmployeeRef.
 *
 * Data consistency only — self/report scoping stays on the `employee`
 * relation, not `owners`.
 */

const CONTENT_TYPES = [
    'api::hr-leave-request.hr-leave-request',
    'api::hr-attendance.hr-attendance',
    'api::pay-payslip.pay-payslip',
];

async function backfillOwnersFor(strapi, uid) {
    const pageSize = 100;
    let updated = 0;
    let page = 1;

    while (true) {
        const rows = await strapi.db.query(uid).findMany({
            where: { employee: { id: { $notNull: true } }, owners: { id: { $null: true } } },
            select: ['id'],
            populate: { employee: { populate: { user: { select: ['id'] } } } },
            limit: pageSize,
            offset: (page - 1) * pageSize,
        });
        if (!Array.isArray(rows) || rows.length === 0) break;

        for (const row of rows) {
            const ownerId = row.employee?.user?.id;
            if (!ownerId) continue;
            try {
                await strapi.db.query(uid).update({
                    where: { id: row.id },
                    data: { owners: [ownerId] },
                });
                updated++;
            } catch (err) {
                strapi.log.warn(`[ess-owners-backfill] ${uid} id=${row.id} failed: ${err.message}`);
            }
        }

        if (rows.length < pageSize) break;
        page++;
    }

    return updated;
}

module.exports = async function backfillEssOwners(strapi) {
    for (const uid of CONTENT_TYPES) {
        const updated = await backfillOwnersFor(strapi, uid);
        if (updated > 0) {
            strapi.log.info(`[ess-owners-backfill] filled owners on ${updated} ${uid} row(s)`);
        }
    }
};
