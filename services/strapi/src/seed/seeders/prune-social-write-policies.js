'use strict';

/**
 * Remove the api-pro policy rows that still grant `social_*` roles the WRITE
 * methods on social-accounts and social-relay-providers.
 *
 * ── Why a prune is needed at all ──────────────────────────────────────────
 * Administering connected accounts and relay providers moved to the
 * apps/admin/console console, expressed as `apps: ['admin']` on those methods in
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
 * Scoped hard, and idempotent: only these two interfaces, only role keys in
 * the `social` domain, and only methods outside SOCIAL_READ_METHODS. The reads
 * are deliberately untouched — the social app still needs them, and
 * posts/create would break without `list`.
 *
 * ── Corrected once, and worth knowing why ─────────────────────────────────
 * The first version listed the methods to DELETE and named one of them
 * `delete`. Policy keys carry the descriptor's METHOD name, which is `del`, so
 * six `…:del:social_*` rows survived and social_admin could still delete
 * accounts and relay providers. The bug hid because the query used to verify
 * the prune repeated the same wrong name, and so confirmed its own mistake.
 * Verify a revocation by asking "what is LEFT for this role", never by
 * re-asserting the list you just deleted.
 *
 * @param {import('knex').Knex} knex
 */

const POLICIES = 'api_pro_method_policies';

// Interface keys as the seeder derives them from the content-type uid.
const INTERFACES = [
    'api--social-account-social-account',
    'api--social-relay-provider-social-relay-provider',
];

// The methods apps/content/social KEEPS. Everything else on these two interfaces is
// pruned for social_* roles.
//
// This started as the opposite — an allowlist of the write methods to delete —
// and that was wrong twice over. It shipped naming `delete`, but the policy key
// carries the descriptor's METHOD name, which is `del`; so six
// `…:del:social_*` rows survived and social_admin could still delete accounts
// and relay providers. The allowlist is also fail-OPEN by nature: a write
// method added to either descriptor later would keep its social_* policy and
// silently reopen the boundary.
//
// Inverted, the rule is fail-CLOSED and states the actual invariant — "social
// may read these two entities and nothing more" — so a new method is pruned by
// default and only an explicit addition here can widen social's access again.
const SOCIAL_READ_METHODS = [
    'list',
    'providerStatus',      // social-accounts: which platforms have a server OAuth app
    'validateConnection',  // social-accounts: probes a stored credential, mutates nothing
    'providerMeta',        // social-relay-providers: the adapter catalogue
    'validate',            // social-relay-providers: probes the stored key
];

async function pruneSocialWritePolicies(knex) {
    const out = { deleted: 0, keys: [], skipped: null };

    if (!(await knex.schema.hasTable(POLICIES))) {
        out.skipped = `table ${POLICIES} not present`;
        return out;
    }

    // Policy keys are `<interface>:<methodName>:<roleKey>` — note METHOD name,
    // not the HTTP action: `del` yields `…:del:…`, never `…:delete:…`. Parse
    // the triple rather than pattern-matching the whole key, so a role such as
    // `social_media_admin` (different domain, same prefix) can never match, and
    // an interface whose name merely starts the same way cannot either.
    const kept = new Set(SOCIAL_READ_METHODS);
    const ifaces = new Set(INTERFACES);

    const rows = await knex(POLICIES).select('id', 'key', 'role_key');
    const doomed = rows.filter((r) => {
        const roleKey = String(r.role_key || '');
        if (!/^social_/.test(roleKey)) return false;

        const key = String(r.key || '');
        // Split from the right: the role key is the last segment, the method the
        // one before it, and whatever precedes both is the interface.
        if (!key.endsWith(`:${roleKey}`)) return false;
        const head = key.slice(0, -(roleKey.length + 1));
        const cut = head.lastIndexOf(':');
        if (cut < 0) return false;
        const iface = head.slice(0, cut);
        const method = head.slice(cut + 1);

        if (!ifaces.has(iface)) return false;
        return !kept.has(method);
    });

    if (!doomed.length) return out;

    await knex(POLICIES).whereIn('id', doomed.map((r) => r.id)).del();
    out.deleted = doomed.length;
    out.keys = doomed.map((r) => r.key).sort();
    return out;
}

module.exports = { pruneSocialWritePolicies };
