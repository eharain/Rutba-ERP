'use strict';

/**
 * grant-full-access.js — grant a user every app-role in every app domain,
 * creating the account first when it does not exist.
 *
 * "Full access" is defined by the database, not a hardcoded list: every
 * active plugin::api-pro.app-role row is granted, which covers domains with
 * non-standard level sets (ess ships employee/manager, web ships
 * public/user) as well as the usual admin/manager/staff triple. The account
 * is put on the `rutba_app_user` users-permissions role — AuthCallback logs
 * out any other roleType — and confirmed so login works immediately.
 *
 * Additive and idempotent: existing app_roles are kept, re-running changes
 * nothing. Writes go through strapi.db.query because entityService silently
 * strips the plugin-injected app_roles relation (same as backfill-users-roles).
 *
 * Boots Strapi load-only (no HTTP listen — safe while the server is up), but
 * a RUNNING server keeps serving the old claim from the api-pro cache until
 * its TTL — restart the server (or wait) before judging the grant failed.
 *
 * Run from the repo root so load-env hydrates the DB credentials:
 *   npm run grant:full-access -- --email someone@rutba.pk
 *
 * Options:
 *   --email <addr>         required — account to grant (created if missing)
 *   --password <pw>        password when creating (default: generated, printed once)
 *   --username <name>      username when creating (default: the email address)
 *   --display-name <name>  displayName when creating
 *   --keep-role            do not move an existing account onto rutba_app_user
 *   --unblock              clear the blocked flag on an existing account
 *   --dry-run              report what would change without writing
 */

const crypto = require('crypto');
const { createStrapi, compileStrapi } = require('@strapi/strapi');

const USER_UID = 'plugin::users-permissions.user';
const UP_ROLE_UID = 'plugin::users-permissions.role';
const APP_ROLE_UID = 'plugin::api-pro.app-role';
const APP_ROLE_TYPE = 'rutba_app_user';

function parseArgs(argv) {
  const args = { flags: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const take = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${a}`);
      return argv[i];
    };
    if (a === '--email' || a === '-e') args.email = take();
    else if (a === '--password') args.password = take();
    else if (a === '--username') args.username = take();
    else if (a === '--display-name') args.displayName = take();
    else if (a === '--keep-role') args.flags.keepRole = true;
    else if (a === '--unblock') args.flags.unblock = true;
    else if (a === '--dry-run') args.flags.dryRun = true;
    else if (a === '--help' || a === '-h') args.flags.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function usage() {
  console.log(
    'Usage: npm run grant:full-access -- --email <addr> ' +
    '[--password <pw>] [--username <name>] [--display-name <name>] ' +
    '[--keep-role] [--unblock] [--dry-run]'
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.help) return usage();
  if (!args.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email)) {
    usage();
    throw new Error('--email <valid address> is required.');
  }
  const email = args.email.toLowerCase();

  const app = await createStrapi(await compileStrapi()).load();
  app.log.level = 'error';
  const out = {
    email,
    dryRun: !!args.flags.dryRun,
    created: false,
    rolesAdded: 0,
    rolesTotal: 0,
    domains: [],
    warnings: [],
  };

  try {
    const allRoles = await app.db.query(APP_ROLE_UID).findMany({
      where: { isActive: true },
      populate: { appDomains: { select: ['key'] } },
    });
    if (!allRoles.length) {
      throw new Error(
        'No app-roles found — run: npm run seed -- --only=api-provider,up-permissions'
      );
    }
    out.domains = [...new Set(
      allRoles.flatMap((r) => (r.appDomains || []).map((d) => d.key)).filter(Boolean)
    )].sort();

    const upRole = await app.db.query(UP_ROLE_UID).findOne({
      where: { type: APP_ROLE_TYPE },
    });
    if (!upRole) {
      throw new Error(
        `users-permissions role type '${APP_ROLE_TYPE}' not found — seed the platform first.`
      );
    }

    let user = await app.db.query(USER_UID).findOne({
      where: { email: { $eqi: email } },
      populate: { role: { select: ['id', 'type'] }, app_roles: { select: ['id', 'key'] } },
    });

    if (!user) {
      out.created = true;
      const username = args.username || email;
      const clash = await app.db.query(USER_UID).findOne({
        where: { username: { $eqi: username } },
        select: ['id', 'email'],
      });
      if (clash) {
        throw new Error(
          `Username '${username}' is already taken by ${clash.email} — pass --username <name>.`
        );
      }
      const password = args.password || crypto.randomBytes(12).toString('base64url');
      if (!args.password) out.generatedPassword = password;
      if (args.flags.dryRun) {
        out.rolesAdded = allRoles.length;
        out.rolesTotal = allRoles.length;
        console.log(JSON.stringify(out, null, 2));
        return;
      }
      const userService = app.plugin('users-permissions').service('user');
      const created = await userService.add({
        username,
        email,
        password,
        provider: 'local',
        // displayName is required + unique on the extended user schema; the
        // username (default: the email) inherits uniqueness from the account.
        displayName: args.displayName || username,
        confirmed: true,
        blocked: false,
        role: upRole.id,
      });
      user = await app.db.query(USER_UID).findOne({
        where: { id: created.id },
        populate: { role: { select: ['id', 'type'] }, app_roles: { select: ['id', 'key'] } },
      });
    }
    out.userId = user.id;

    const data = {};
    const held = new Set((user.app_roles || []).map((r) => r.id));
    const missing = allRoles.filter((r) => !held.has(r.id));
    out.rolesAdded = missing.length;
    out.rolesTotal = held.size + missing.length;
    if (missing.length) {
      data.app_roles = [...held, ...missing.map((r) => r.id)];
    }

    if (user.role?.type !== APP_ROLE_TYPE) {
      if (args.flags.keepRole) {
        out.warnings.push(
          `UP role type is '${user.role?.type || 'none'}' — kept (--keep-role); ` +
          'AuthCallback rejects non-rutba_app_user accounts.'
        );
      } else {
        data.role = upRole.id;
        out.upRoleChanged = { from: user.role?.type || null, to: APP_ROLE_TYPE };
      }
    }
    if (!user.confirmed) data.confirmed = true;
    if (user.blocked) {
      if (args.flags.unblock) data.blocked = false;
      else out.warnings.push('Account is BLOCKED — pass --unblock to clear it.');
    }

    if (Object.keys(data).length && !args.flags.dryRun) {
      await app.db.query(USER_UID).update({ where: { id: user.id }, data });
      // Best-effort claim-cache eviction; a separately running server process
      // holds its own cache and serves the old claim until its TTL or restart.
      try { app.apiPro?.cache?.clearUser?.(user.id); } catch (_) { /* best-effort */ }
      out.warnings.push(
        'A running API server serves cached claims until the api-pro TTL — restart it to see the grant immediately.'
      );
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
