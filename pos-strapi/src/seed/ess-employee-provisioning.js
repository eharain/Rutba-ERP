'use strict';

/**
 * Provision an hr-employee record for every real internal user account
 * (role type `rutba_app_user` — the actual staff roster; the generic
 * `authenticated` role is storefront/web customers, not employees) that
 * doesn't already have one.
 *
 * The users-permissions user list (with real app-role grants) is the
 * authoritative source of who the actual employees are — the demo
 * hr-employee rows seeded for testing are not linked to any account. This is
 * the batch counterpart to hr-access.js#resolveOrCreateEmployeeForUser, which
 * provisions lazily on first ESS touch; this backfill does it up front for
 * the existing roster so self-service isn't gated on someone happening to
 * hit an ESS endpoint first.
 */

const { resolveEmployeeForUser, resolveOrCreateEmployeeForUser } = require('../utils/hr-access');

module.exports = async function provisionEssEmployees(strapi) {
    // Filter in JS rather than `where: { role: { type: ... } } }` — the latter
    // is a relation-attribute filter that, in testing, non-deterministically
    // let at least one non-matching row through (a query-layer quirk, not a
    // data issue). Populate-then-filter is slower but exact.
    const allUsers = await strapi.db.query('plugin::users-permissions.user').findMany({
        select: ['id', 'username', 'email'],
        populate: { role: { select: ['type'] } },
    });
    const users = allUsers.filter((u) => u.role?.type === 'rutba_app_user');

    let created = 0;
    for (const user of users) {
        const existing = await resolveEmployeeForUser(strapi, user);
        if (existing) continue;
        const emp = await resolveOrCreateEmployeeForUser(strapi, user);
        if (emp) created++;
    }

    if (created > 0) {
        strapi.log.info(`[ess-employee-provisioning] created ${created} hr-employee record(s) for existing users`);
    }
};
