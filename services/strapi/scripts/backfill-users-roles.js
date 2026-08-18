'use strict';

/**
 * One-off backfill for the rutba-users carve-out: every user holding an
 * auth_* app-role gets the matching users_* role (admin/manager/staff) so
 * the existing auth administrators can open the new User Management app
 * without a manual grant round.
 *
 * Additive and idempotent — existing roles are kept, users already holding
 * the users_* role are skipped. Writes go through strapi.db.query because
 * entityService silently strips the plugin-injected app_roles relation.
 *
 * Boots Strapi load-only (no HTTP listen — safe while the dev server is up).
 * Run the api-provider seed first so the users_* roles exist:
 *   npm run seed -- --only=api-provider,up-permissions
 * Then from services/strapi:  node scripts/backfill-users-roles.js
 * (A running server may serve cached claims for up to the api-pro cache TTL.)
 */

const { createStrapi, compileStrapi } = require('@strapi/strapi');

const USER_UID = 'plugin::users-permissions.user';
const APP_ROLE_UID = 'plugin::api-pro.app-role';
const LEVELS = ['admin', 'manager', 'staff'];

async function main() {
  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';
  const out = { granted: [], skipped: 0, missingTargetRoles: [] };

  try {
    const usersRoles = {};
    for (const level of LEVELS) {
      const row = await app.db.query(APP_ROLE_UID).findOne({ where: { key: `users_${level}` } });
      if (row) usersRoles[level] = row;
      else out.missingTargetRoles.push(`users_${level}`);
    }
    if (out.missingTargetRoles.length) {
      throw new Error(
        `Missing app-roles ${out.missingTargetRoles.join(', ')} — run: npm run seed -- --only=api-provider,up-permissions`
      );
    }

    const holders = await app.db.query(USER_UID).findMany({
      where: { app_roles: { key: { $in: LEVELS.map((l) => `auth_${l}`) } } },
      populate: { app_roles: { select: ['id', 'key'] } },
    });

    for (const user of holders) {
      const keys = new Set((user.app_roles || []).map((r) => r.key));
      const wanted = LEVELS.filter((l) => keys.has(`auth_${l}`) && !keys.has(`users_${l}`));
      if (!wanted.length) {
        out.skipped += 1;
        continue;
      }
      const ids = [
        ...(user.app_roles || []).map((r) => r.id),
        ...wanted.map((l) => usersRoles[l].id),
      ];
      await app.db.query(USER_UID).update({ where: { id: user.id }, data: { app_roles: ids } });
      out.granted.push({ id: user.id, email: user.email, added: wanted.map((l) => `users_${l}`) });
    }

    console.log(JSON.stringify(out, null, 2));
  } finally {
    await app.destroy();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
