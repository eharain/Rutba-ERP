'use strict';

/**
 * grant-full-access.js — grant a user every app-role in every app domain,
 * creating the account first when it does not exist. Core-native twin of
 * pos-strapi/scripts/grant-full-access.js: direct knex against the shared
 * tables, no server boot, so it runs in seconds and works whether the
 * deployment serves Strapi, core, or both (RUTBA_BACKEND is irrelevant —
 * both servers read these rows).
 *
 * "Full access" is defined by the database, not a hardcoded list: every
 * active api_pro_app_roles row is granted, which covers domains with
 * non-standard level sets (ess ships employee/manager, web ships
 * public/user) as well as the usual admin/manager/staff triple. The account
 * is put on the `rutba_app_user` users-permissions role — AuthCallback logs
 * out any other roleType — and confirmed so login works immediately.
 *
 * Additive and idempotent: existing app_roles are kept, re-running changes
 * nothing. User writes go through src/auth/up.js userService so password
 * hashing (bcryptjs, 10 rounds) and link-row layout match both servers.
 *
 * A RUNNING API server keeps serving the old claim from its in-process
 * cache until the TTL — restart it (or wait) before judging the grant failed.
 *
 * From the repo root:  npm run grant:full-access -- --email someone@rutba.pk
 * From rutba-core:     node scripts/grant-full-access.js --email someone@rutba.pk
 * (config/env.js hydrates DB credentials from the repo-root .env files.)
 *
 * Options:
 *   --email <addr>         required — account to grant (created if missing)
 *   --password <pw>        password when creating (default: generated, printed once)
 *   --username <name>      username when creating (default: the email address)
 *   --display-name <name>  displayName when creating (default: the username)
 *   --keep-role            do not move an existing account onto rutba_app_user
 *   --unblock              clear the blocked flag on an existing account
 *   --dry-run              report what would change without writing
 */

const crypto = require('crypto');
const { getDb, closeDb } = require('../src/db/connection');
const { userService } = require('../src/auth/up');

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

async function domainKeysFor(db, roleIds) {
  // The role↔domain m2m link table is reporting-only here; guards resolve by
  // role-key prefix, so a lookup failure must not fail the grant.
  try {
    const rows = await db('api_pro_app_roles_app_domains_lnk as l')
      .join('api_pro_app_domains as d', 'd.id', 'l.app_domain_id')
      .whereIn('l.app_role_id', roleIds)
      .distinct('d.key');
    return rows.map((r) => r.key).sort();
  } catch (_) {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.flags.help) return usage();
  if (!args.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email)) {
    usage();
    throw new Error('--email <valid address> is required.');
  }
  const email = args.email.toLowerCase();

  const db = getDb();
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
    const allRoles = await db('api_pro_app_roles').where('is_active', 1).select('id', 'key');
    if (!allRoles.length) {
      throw new Error(
        'No app-roles found — seed the platform first (npm run seed -- --only=api-provider,up-permissions).'
      );
    }
    const domains = await domainKeysFor(db, allRoles.map((r) => r.id));
    if (domains) out.domains = domains;
    else {
      delete out.domains;
      out.warnings.push('Could not resolve role→domain links for the report; grants are unaffected.');
    }

    const upRole = await db('up_roles').where({ type: APP_ROLE_TYPE }).first('id', 'type');
    if (!upRole) {
      throw new Error(`users-permissions role type '${APP_ROLE_TYPE}' not found — seed the platform first.`);
    }

    let user = await db('up_users').whereRaw('LOWER(email) = ?', [email]).first();

    if (!user) {
      out.created = true;
      const username = args.username || email;
      const clash = await db('up_users')
        .whereRaw('LOWER(username) = ?', [username.toLowerCase()])
        .first('id', 'email');
      if (clash) {
        throw new Error(`Username '${username}' is already taken by ${clash.email} — pass --username <name>.`);
      }
      const password = args.password || crypto.randomBytes(12).toString('base64url');
      if (!args.password) out.generatedPassword = password;
      if (args.flags.dryRun) {
        out.rolesAdded = allRoles.length;
        out.rolesTotal = allRoles.length;
        console.log(JSON.stringify(out, null, 2));
        return;
      }
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
      user = await db('up_users').where('id', created.id).first();
    }
    out.userId = user.id;

    const held = new Set(
      (await db('up_users_app_roles_lnk').where({ user_id: user.id }).pluck('app_role_id')).map(Number)
    );
    const missing = allRoles.filter((r) => !held.has(Number(r.id)));
    out.rolesAdded = missing.length;
    out.rolesTotal = held.size + missing.length;

    const edit = {};
    if (missing.length) edit.app_roles = [...held, ...missing.map((r) => r.id)];

    const currentRole = await db('up_users_role_lnk as l')
      .join('up_roles as r', 'r.id', 'l.role_id')
      .where('l.user_id', user.id)
      .first('r.type');
    if (currentRole?.type !== APP_ROLE_TYPE) {
      if (args.flags.keepRole) {
        out.warnings.push(
          `UP role type is '${currentRole?.type || 'none'}' — kept (--keep-role); ` +
          'AuthCallback rejects non-rutba_app_user accounts.'
        );
      } else {
        edit.role = upRole.id;
        out.upRoleChanged = { from: currentRole?.type || null, to: APP_ROLE_TYPE };
      }
    }
    if (!user.confirmed) edit.confirmed = true;
    if (user.blocked) {
      if (args.flags.unblock) edit.blocked = false;
      else out.warnings.push('Account is BLOCKED — pass --unblock to clear it.');
    }

    if (Object.keys(edit).length && !args.flags.dryRun) {
      await userService.edit(user.id, edit);
      out.warnings.push(
        'A running API server serves cached claims until its TTL — restart it to see the grant immediately.'
      );
    }
    console.log(JSON.stringify(out, null, 2));
  } finally {
    await closeDb();
  }
}

main().catch(async (err) => {
  console.error(err.message || err);
  try { await closeDb(); } catch (_) { /* already closed */ }
  process.exit(1);
});
