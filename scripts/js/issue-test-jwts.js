'use strict';

/**
 * Boot a headless Strapi (load only — no HTTP listen, so no clash with the
 * running dev server), find/create two throwaway users, and issue JWTs:
 *
 *   PLAIN      — a users-permissions user with NO app_roles (models a
 *                storefront customer). Must be REJECTED (403) by every gated
 *                endpoint.
 *   PRIVILEGED — a Strapi super-admin-role UP user (role.type === 'admin'),
 *                which requireAppRole short-circuits to allow. Must PASS the
 *                gate (endpoint then 404/400 on the fake ids).
 *
 * Prints two `export`-style lines the probe consumes. Read-mostly: it only
 * creates the throwaway users if none suitable already exist.
 */

const path = require('path');

const APP_DIR = path.resolve(__dirname, '..', '..', 'pos-strapi');
const { compileStrapi, createStrapi } = require(require.resolve('@strapi/strapi', { paths: [APP_DIR] }));

(async () => {
  process.chdir(APP_DIR);
  const appContext = await compileStrapi({ appDir: APP_DIR, distDir: path.join(APP_DIR, 'dist') });
  const strapi = await createStrapi(appContext).load();

  try {
    const UP_USER = 'plugin::users-permissions.user';
    const jwtService = strapi.plugin('users-permissions').service('jwt');

    // Default authenticated UP role (needed so the user can authenticate at all).
    const authedRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } });

    // PLAIN: an existing user with zero app_roles, else create one.
    let plain = null;
    const candidates = await strapi.db.query(UP_USER).findMany({
      where: { blocked: { $ne: true } },
      populate: { app_roles: { select: ['id'] } },
      limit: 200,
    });
    plain = candidates.find((u) => !Array.isArray(u.app_roles) || u.app_roles.length === 0) || null;
    if (!plain) {
      plain = await strapi.db.query(UP_USER).create({
        data: {
          username: 'probe_plain_user',
          email: 'probe_plain_user@example.test',
          password: 'ProbePlain#12345',
          confirmed: true,
          blocked: false,
          provider: 'local',
          role: authedRole?.id,
        },
      });
    }

    // PRIVILEGED: a UP user whose users-permissions role type is 'admin'
    // (requireAppRole treats this as super-admin). Create one if absent —
    // this is a UP role, NOT a Strapi admin-panel account.
    let adminRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'admin' } });
    if (!adminRole) {
      adminRole = await strapi.db.query('plugin::users-permissions.role').create({
        data: { name: 'Probe Super', description: 'probe-only', type: 'admin' },
      });
    }
    let priv = await strapi.db.query(UP_USER).findOne({ where: { role: adminRole.id, blocked: { $ne: true } } });
    if (!priv) {
      priv = await strapi.db.query(UP_USER).create({
        data: {
          username: 'probe_admin_user',
          email: 'probe_admin_user@example.test',
          password: 'ProbeAdmin#12345',
          confirmed: true,
          blocked: false,
          provider: 'local',
          role: adminRole.id,
        },
      });
    }

    // Seed endpoints use DEFAULT users-permissions auth, so a realistic operator
    // authenticates via the `rutba_app_user` UP role (which carries the seed
    // route grant). Two extra tokens isolate the CONTROLLER's seed_admin gate
    // from the UP route layer:
    //   SEED_MEMBER — rutba_app_user role, NO seed_admin app_role → passes UP,
    //                 must be REJECTED (403) by the controller. This is exactly
    //                 the hole the fix closes (previously any app user could seed).
    //   SEED_ADMIN  — rutba_app_user role + seed_admin app_role → must PASS.
    const APP_ROLE_UID = 'plugin::api-pro.app-role';
    const appUserRole = await strapi.db.query('plugin::users-permissions.role').findOne({ where: { type: 'rutba_app_user' } });
    const seedAdminRole = await strapi.db.query(APP_ROLE_UID).findOne({ where: { key: 'seed_admin' } });

    let seedMemberJwt = '';
    let seedAdminJwt = '';
    if (appUserRole && seedAdminRole) {
      let member = await strapi.db.query(UP_USER).findOne({ where: { email: 'probe_seed_member@example.test' } });
      if (!member) {
        member = await strapi.db.query(UP_USER).create({
          data: { username: 'probe_seed_member', email: 'probe_seed_member@example.test', password: 'ProbeSeedM#12345', confirmed: true, blocked: false, provider: 'local', role: appUserRole.id },
        });
      }
      // ensure member holds NO app_roles
      await strapi.db.query(UP_USER).update({ where: { id: member.id }, data: { app_roles: [] } });

      let seedAdmin = await strapi.db.query(UP_USER).findOne({ where: { email: 'probe_seed_admin@example.test' } });
      if (!seedAdmin) {
        seedAdmin = await strapi.db.query(UP_USER).create({
          data: { username: 'probe_seed_admin', email: 'probe_seed_admin@example.test', password: 'ProbeSeedA#12345', confirmed: true, blocked: false, provider: 'local', role: appUserRole.id },
        });
      }
      await strapi.db.query(UP_USER).update({ where: { id: seedAdmin.id }, data: { app_roles: [seedAdminRole.id] } });

      seedMemberJwt = await jwtService.issue({ id: member.id });
      seedAdminJwt = await jwtService.issue({ id: seedAdmin.id });
    } else {
      console.error(`[issue-test-jwts] WARN: rutba_app_user role or seed_admin app-role missing — seed-specific tokens skipped`);
    }

    const plainJwt = await jwtService.issue({ id: plain.id });
    const privJwt = await jwtService.issue({ id: priv.id });

    console.log(`PROBE_JWT_PLAIN=${plainJwt}`);
    console.log(`PROBE_JWT_PRIVILEGED=${privJwt}`);
    if (seedMemberJwt) console.log(`PROBE_JWT_SEED_MEMBER=${seedMemberJwt}`);
    if (seedAdminJwt) console.log(`PROBE_JWT_SEED_ADMIN=${seedAdminJwt}`);
    console.error(`[issue-test-jwts] plain id=${plain.id} (${plain.email}), privileged id=${priv.id} (${priv.email})`);
  } finally {
    await strapi.destroy();
  }
})().catch((e) => { console.error(e); process.exit(1); });
