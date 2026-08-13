'use strict';

/**
 * Remove the api-pro policy rows that still grant `social_*` roles the WRITE
 * methods on social-accounts and social-relay-providers.
 *
 * ── Why a prune is needed at all ──────────────────────────────────────────
 * Administering connected accounts and relay providers moved to the
 * rutba-admin console, expressed as `apps: ['admin']` on those methods in
 * @rutba/api-provider. But the api-pro seeder is UPSERT-ONLY — it writes a
 * policy row per (method × granted role) and never deletes one that the
 * descriptors have stopped declaring. So narrowing an `apps` array grants the
 * new roles and silently LEAVES the old ones: after a reseed, `social_admin`
 * would still hold `…:create:social_admin` and could still write, and the
 * "moved to admin" boundary would exist only in the UI.
 *
 * This is a general gap in the seeder, not a quirk of this change — any future
 * narrowing hits it. Pruning globally (delete every policy the descriptors no
 * longer declare) is the real fix, but it is a blast-radius change across
 * ~4800 rows and does not belong in the same commit as a UI move. So this
 * deletes exactly the rows this change orphaned, and nothing else.
 *
 * Scoped hard, and idempotent: it matches only the two interfaces, only the
 * write actions, and only role keys in the `social` domain. Reads (list,
 * providerStatus, providerMeta, validate, validateConnection) are deliberately
 * untouched — the social app still needs them, and posts/create would break
 * without `list`.
 *
 * @param {import('knex').Knex} knex
 */

const POLICIES = 'api_pro_method_policies';

// Interface keys as the seeder derives them from the content-type uid.
const INTERFACES = [
    'api--social-account-social-account',
    'api--social-relay-provider-social-relay-provider',
];

// The methods that moved. Deliberately NOT a "everything except reads" rule —
// an explicit list means a method added later is not silently revoked.
const WRITE_ACTIONS = ['create', 'update', 'delete', 'getConnectUrl', 'syncToken'];

async function pruneSocialWritePolicies(knex) {
    const out = { deleted: 0, keys: [], skipped: null };

    if (!(await knex.schema.hasTable(POLICIES))) {
        out.skipped = `table ${POLICIES} not present`;
        return out;
    }

    // Policy keys are `<interface>:<action>:<roleKey>` — match on the exact
    // triple rather than a LIKE over the whole key, so a role such as
    // `social_media_admin` (different domain, same prefix) could never match.
    const wanted = [];
    for (const iface of INTERFACES) {
        for (const action of WRITE_ACTIONS) {
            wanted.push(`${iface}:${action}`);
        }
    }

    const rows = await knex(POLICIES).select('id', 'key', 'role_key');
    const doomed = rows.filter((r) => {
        const key = String(r.key || '');
        const roleKey = String(r.role_key || '');
        if (!/^social_/.test(roleKey)) return false;
        return wanted.some((prefix) => key === `${prefix}:${roleKey}`);
    });

    if (!doomed.length) return out;

    await knex(POLICIES).whereIn('id', doomed.map((r) => r.id)).del();
    out.deleted = doomed.length;
    out.keys = doomed.map((r) => r.key).sort();
    return out;
}

module.exports = { pruneSocialWritePolicies };
