'use strict';

/**
 * Rename six app keys and seventeen role keys (ERP 2.0 P3 restructure).
 *
 * The repo sweep (scripts/js/restructure.js, phase `identity`) renames these in
 * config/domains.json, config/roles.json, roles.js and every descriptor. This
 * is the other half: the same keys live in rows, and api-pro resolves an
 * incoming request by matching the `X-Rutba-App` header against
 * api_pro_app_domains.key and the caller's roles against api_pro_app_roles.key.
 * If only one half moves, every request from a renamed app is denied.
 *
 * **Run this in the same release as the sweep. Not before, not after.**
 *
 * ── Why grants survive ──────────────────────────────────────────────────────
 *
 * up_users_app_roles_lnk references app_role_id, not the key string, so
 * renaming a role in place carries every grant with it — no re-grant, no
 * user-visible change. That is what makes this safe: measured 2026-08-18, 69 of
 * the 79 roles are held by at least one user, and this migration touches zero
 * link rows.
 *
 * ── What this does NOT do ───────────────────────────────────────────────────
 *
 * api_pro_method_policies stores role keys as strings (`role_key`, and the
 * `interfaceKey:method:roleKey` composite). Those are not patched here, because
 * the seeder owns them: after this migration, run
 *
 *     npm --prefix services/core run seed:policy -- --prune
 *
 * which mints the policies for the new role keys and removes the old ones. The
 * seeder is the single writer of those rows; hand-patching them here would put
 * a second writer on the same table for no gain.
 *
 * The mapping is inlined rather than read from config/apps.manifest.json on
 * purpose: an applied migration is frozen and checksummed, so its behaviour
 * must not depend on a file that keeps changing after it ran.
 */

const DOMAIN_RENAMES = [
  ['web', 'storefront'],
  ['sale', 'pos'],
  ['web-user', 'portal'],
  ['order-management', 'orders'],
  ['inventory', 'control'],
  ['admin', 'console'],
];

const ROLE_RENAMES = [
  ['web_public', 'storefront_public'],
  ['web_user', 'storefront_user'],
  ['sale_admin', 'pos_admin'],
  ['sale_manager', 'pos_manager'],
  ['sale_staff', 'pos_staff'],
  ['webuser_admin', 'portal_admin'],
  ['webuser_manager', 'portal_manager'],
  ['webuser_staff', 'portal_staff'],
  ['order_admin', 'orders_admin'],
  ['order_manager', 'orders_manager'],
  ['order_staff', 'orders_staff'],
  ['inventory_admin', 'control_admin'],
  ['inventory_manager', 'control_manager'],
  ['inventory_staff', 'control_staff'],
  ['admin_admin', 'console_admin'],
  ['admin_manager', 'console_manager'],
  ['admin_staff', 'console_staff'],
];

// The `users` domain is an alias left over from rutba-users, which apps/admin/console
// replaced. Measured 2026-08-18: users_admin, users_manager and users_staff are
// held by ZERO users, so dropping them revokes nothing. Verified again at run
// time below — if anyone holds one by then, the migration leaves them alone and
// says so rather than silently cutting off access.
const DEAD_DOMAIN = 'users';
const DEAD_ROLES = ['users_admin', 'users_manager', 'users_staff'];

const DOMAINS = 'api_pro_app_domains';
const ROLES = 'api_pro_app_roles';
const GRANTS = 'up_users_app_roles_lnk';

async function renameKeys(knex, table, pairs, extraColumns = {}) {
  let renamed = 0;
  for (const [from, to] of pairs) {
    const row = await knex(table).where({ key: from }).first('id');
    if (!row) continue; // already renamed, or never existed here
    if (await knex(table).where({ key: to }).first('id')) {
      throw new Error(`${table}: cannot rename '${from}' -> '${to}', '${to}' already exists`);
    }
    const patch = { key: to, updated_at: new Date() };
    for (const [column, value] of Object.entries(extraColumns)) patch[column] = value(to);
    await knex(table).where({ id: row.id }).update(patch);
    renamed += 1;
  }
  return renamed;
}

module.exports = {
  name: '022-rename-app-keys',

  async up(knex) {
    const domains = await renameKeys(knex, DOMAINS, DOMAIN_RENAMES);
    // adminRoleCode mirrors the key for every seeded role; keep them in step so
    // the next seed sees no drift and writes nothing.
    const roles = await renameKeys(knex, ROLES, ROLE_RENAMES, { admin_role_code: (to) => to });
    console.log(`[022] renamed ${domains} domain(s) and ${roles} role(s)`);

    const deadIds = (await knex(ROLES).whereIn('key', DEAD_ROLES).select('id')).map((r) => r.id);
    if (deadIds.length) {
      const [{ n }] = await knex(GRANTS).whereIn('app_role_id', deadIds).count({ n: '*' });
      if (Number(n) > 0) {
        console.log(`[022] KEEPING the '${DEAD_DOMAIN}' domain — ${n} grant(s) exist against it. `
          + 'Reassign those users, then drop it in a follow-up migration.');
      } else {
        await knex(ROLES).whereIn('id', deadIds).del();
        await knex(DOMAINS).where({ key: DEAD_DOMAIN }).del();
        console.log(`[022] dropped the dead '${DEAD_DOMAIN}' domain and its ${deadIds.length} unheld role(s)`);
      }
    }

    console.log('[022] now run: npm --prefix services/core run seed:policy -- --prune');
  },

  async down(knex) {
    // Reversible for the renames — the inverse mapping is exact. The dropped
    // `users` domain is NOT recreated: it was dead by measurement, and seeding
    // it back would mint an alias nobody holds.
    const domains = await renameKeys(knex, DOMAINS, DOMAIN_RENAMES.map(([a, b]) => [b, a]));
    const roles = await renameKeys(knex, ROLES, ROLE_RENAMES.map(([a, b]) => [b, a]),
      { admin_role_code: (to) => to });
    console.log(`[022] rolled back ${domains} domain(s) and ${roles} role(s)`);
    console.log('[022] re-run the policy seed to match: npm --prefix services/core run seed:policy -- --prune');
  },
};
