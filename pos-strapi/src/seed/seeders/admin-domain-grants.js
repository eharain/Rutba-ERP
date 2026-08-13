'use strict';

/**
 * The rutba-users → rutba-admin cutover: every holder of a `users_*` app-role
 * additively gets the matching `admin_*` role.
 *
 * ── Why this has to exist ─────────────────────────────────────────────────
 * A user's access is stored as `up_users_app_roles_lnk` rows pointing at role
 * keys. rutba-admin replaced rutba-users and claims `X-Rutba-App: admin`, and
 * api-pro resolves that claim by checking the caller holds a role whose domain
 * is `admin` — which nobody did before this ran. Without the backfill, deleting
 * rutba-users locks every administrator out of the admin console, with no UI
 * left to grant themselves back in. (Recovery if that happens anyway:
 * `npm run grant:full-access -- --email <addr>`.)
 *
 * ── Additive, never destructive ───────────────────────────────────────────
 * This only ever INSERTs. No grant is removed, moved or rewritten — the `users`
 * domain and its `users_*` roles stay alive as a deprecated alias, and
 * migrating grants off them is a separate, later task. Re-running is a no-op.
 *
 * ── Why it creates the domain/role rows itself ────────────────────────────
 * The api-pro seeder is what normally materialises config/domains.json +
 * config/roles.json into `api_pro_app_domains` / `api_pro_app_roles`, but it
 * does NOT run at boot — it runs on demand via `npm run seed`. The first-boot
 * migration that calls this therefore cannot assume `admin_*` exists yet, so
 * it upserts those rows first, in the seeder's own row shape (humanized name,
 * `Auto-seeded role '<key>' (level=…, domain=…)` description,
 * admin_role_code = key) so the next real seed upserts over them instead of
 * duplicating. Same trick, same reason, as
 * rutba-core/scripts/grant-full-access.js `syncDeclaredRoles`.
 *
 * Which levels map to which is read from @rutba/api-provider rather than
 * hardcoded: the pairing rule is "same level, users domain → admin domain", so
 * adding a level to either domain later needs no edit here.
 *
 * Shared idempotent body used by BOTH:
 *   - database/migrations/2026.08.13T00.00.00.admin-domain-grants.js
 *   - the seed registry (on-demand re-run from the CLI / seed control app)
 *
 * A RUNNING API server keeps serving the old claim from its in-process cache
 * until the TTL — restart it before judging the backfill failed.
 *
 * @param {import('knex').Knex} knex
 */

const crypto = require('crypto');

const SOURCE_DOMAIN = 'users';
const TARGET_DOMAIN = 'admin';

const DOMAINS_TABLE = 'api_pro_app_domains';
const ROLES_TABLE = 'api_pro_app_roles';
const ROLE_DOMAIN_LNK = 'api_pro_app_roles_app_domains_lnk';
const USER_ROLE_LNK = 'up_users_app_roles_lnk';

/**
 * Strapi coerces a numeric-looking documentId to an integer, so the first
 * character must be a letter. Same generator as the other knex seeders.
 */
function generateDocumentId() {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const alphabet = letters + '0123456789';
    const bytes = crypto.randomBytes(24);
    let out = letters[bytes[0] % letters.length];
    for (let i = 1; i < 24; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
}

/** The api-pro seeder's own name formatting — match it so a reseed is a no-op. */
function humanize(input) {
    return String(input || '')
        .replace(/[_-]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
}

function readDeclared() {
    try {
        return {
            domains: require('@rutba/api-provider/config/domains.json'),
            roles: require('@rutba/api-provider/config/roles.json'),
        };
    } catch (_) {
        return null;
    }
}

/** level → role key, for every declared role in `domain`. */
function rolesByLevel(declaredRoles, domain) {
    const out = new Map();
    for (const [key, def] of Object.entries(declaredRoles || {})) {
        if (def?.domain === domain && def?.level) out.set(def.level, key);
    }
    return out;
}

async function applyAdminDomainGrants(knex) {
    const out = {
        rolesCreated: [],
        rolesLinked: [],
        reactivated: [],
        grantsAdded: 0,
        usersTouched: 0,
        skipped: null,
    };

    for (const table of [DOMAINS_TABLE, ROLES_TABLE, ROLE_DOMAIN_LNK, USER_ROLE_LNK]) {
        if (!(await knex.schema.hasTable(table))) {
            // Fresh database: the api-pro tables do not exist yet, so there are
            // no grants to copy either. The seed run that creates them is the
            // one that will hold the correct rows.
            out.skipped = `table ${table} not present`;
            return out;
        }
    }

    const declared = readDeclared();
    if (!declared) {
        out.skipped = '@rutba/api-provider config not resolvable';
        return out;
    }

    const sourceByLevel = rolesByLevel(declared.roles, SOURCE_DOMAIN);
    const targetByLevel = rolesByLevel(declared.roles, TARGET_DOMAIN);
    const pairs = [...sourceByLevel.entries()]
        .filter(([level]) => targetByLevel.has(level))
        .map(([level, from]) => ({ level, from, to: targetByLevel.get(level) }));

    if (!pairs.length) {
        out.skipped = `no ${SOURCE_DOMAIN}_* → ${TARGET_DOMAIN}_* level pairs declared`;
        return out;
    }

    const now = new Date();

    // ── 1. the target domain row ───────────────────────────────────────────
    const domainDef = declared.domains?.[TARGET_DOMAIN] || {};
    let domain = await knex(DOMAINS_TABLE).where('key', TARGET_DOMAIN).first('id', 'is_active');
    if (!domain) {
        const [id] = await knex(DOMAINS_TABLE).insert({
            document_id: generateDocumentId(),
            key: TARGET_DOMAIN,
            name: humanize(domainDef.name || TARGET_DOMAIN),
            description: domainDef.description
                || `Access domain '${TARGET_DOMAIN}' (seeded from platform config)`,
            is_active: 1,
            created_at: now,
            updated_at: now,
            published_at: now,
        });
        domain = { id, is_active: 1 };
        out.rolesCreated.push(`domain:${TARGET_DOMAIN}`);
    } else if (!domain.is_active) {
        // An inactive domain is treated as "app switched off" by the guards, so
        // the grants below would mean nothing.
        await knex(DOMAINS_TABLE).where('id', domain.id).update({ is_active: 1, updated_at: now });
        out.reactivated.push(`domain:${TARGET_DOMAIN}`);
    }

    // ── 2. the target role rows, linked to that domain ─────────────────────
    const roleIdByKey = new Map(
        (await knex(ROLES_TABLE)
            .whereIn('key', pairs.flatMap((p) => [p.from, p.to]))
            .select('id', 'key', 'is_active')
        ).map((r) => [r.key, r])
    );

    const linkedRoleIds = new Set(
        (await knex(ROLE_DOMAIN_LNK).where('app_domain_id', domain.id).pluck('app_role_id')).map(Number)
    );
    let lastOrd = Number(
        (await knex(ROLE_DOMAIN_LNK)
            .where('app_domain_id', domain.id)
            .max('app_role_ord as ord')
            .first())?.ord || 0
    );

    for (const pair of pairs) {
        let row = roleIdByKey.get(pair.to);
        if (!row) {
            const [id] = await knex(ROLES_TABLE).insert({
                document_id: generateDocumentId(),
                key: pair.to,
                name: humanize(pair.to),
                description: `Auto-seeded role '${pair.to}' (level=${pair.level}, domain=${TARGET_DOMAIN})`,
                is_active: 1,
                admin_role_code: pair.to,
                created_at: now,
                updated_at: now,
                published_at: now,
            });
            row = { id, key: pair.to, is_active: 1 };
            roleIdByKey.set(pair.to, row);
            out.rolesCreated.push(pair.to);
        } else if (!row.is_active) {
            // An inactive role is skipped by every guard — the quietest way to
            // stay locked out of an app that looks fully configured.
            await knex(ROLES_TABLE).where('id', row.id).update({ is_active: 1, updated_at: now });
            row.is_active = 1;
            out.reactivated.push(`role:${pair.to}`);
        }

        if (!linkedRoleIds.has(Number(row.id))) {
            lastOrd += 1;
            await knex(ROLE_DOMAIN_LNK).insert({
                app_role_id: row.id,
                app_domain_id: domain.id,
                app_domain_ord: 1,
                app_role_ord: lastOrd,
            });
            linkedRoleIds.add(Number(row.id));
            out.rolesLinked.push(`${pair.to}->${TARGET_DOMAIN}`);
        }
    }

    // ── 3. the grants themselves ───────────────────────────────────────────
    const touched = new Set();
    for (const pair of pairs) {
        const source = roleIdByKey.get(pair.from);
        const target = roleIdByKey.get(pair.to);
        // A deployment that never had the source role has nobody to migrate.
        if (!source || !target) continue;

        const holders = await knex(USER_ROLE_LNK).where('app_role_id', source.id).pluck('user_id');
        if (!holders.length) continue;

        const already = new Set(
            (await knex(USER_ROLE_LNK)
                .where('app_role_id', target.id)
                .whereIn('user_id', holders)
                .pluck('user_id')
            ).map(Number)
        );
        const missing = [...new Set(holders.map(Number))].filter((id) => !already.has(id));
        if (!missing.length) continue;

        // Chunked: a large estate would otherwise build one enormous INSERT.
        for (let i = 0; i < missing.length; i += 200) {
            const chunk = missing.slice(i, i + 200);
            await knex(USER_ROLE_LNK).insert(
                chunk.map((userId) => ({ user_id: userId, app_role_id: target.id }))
            );
        }
        out.grantsAdded += missing.length;
        for (const id of missing) touched.add(id);
    }
    out.usersTouched = touched.size;

    return out;
}

module.exports = { applyAdminDomainGrants };
