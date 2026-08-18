'use strict';

/**
 * grant-full-access.js — grant a user every app-role in every app domain,
 * creating the account first when it does not exist. Core-native twin of
 * services/strapi/scripts/grant-full-access.js: direct knex against the shared
 * tables, no server boot, so it runs in seconds and works whether the
 * deployment serves Strapi, core, or both (RUTBA_BACKEND is irrelevant —
 * both servers read these rows).
 *
 * "Full access" is defined by @rutba/api-provider, not a hardcoded list: the
 * script first reconciles api_pro_app_domains / api_pro_app_roles with the
 * domains.json + roles.json declarations, then grants every active role. That
 * covers domains with non-standard level sets (ess ships employee/manager, web
 * ships public/user) as well as the usual admin/manager/staff triple — and,
 * critically, an app added since the last seed: without the reconcile the
 * grant would silently skip a domain whose roles are not in the DB yet, which
 * is the usual "the new app has no permissions and I cannot grant them"
 * lockout. The account is put on the `rutba_app_user` users-permissions role
 * — AuthCallback logs out any other roleType — and confirmed so login works
 * immediately.
 *
 * The reconcile only creates role/domain rows and reactivates declared ones it
 * finds disabled; it never deletes or renames. It is not a substitute for the
 * full seed (`npm run seed -- --only=api-provider,up-permissions`), which also
 * seeds interfaces, methods and per-method policies — the rows that decide
 * what each role may call. This script gets you back in; the seed makes the
 * endpoints answer.
 *
 * Additive and idempotent: existing app_roles are kept, re-running changes
 * nothing. User writes go through src/auth/up.js userService so password
 * hashing (bcryptjs, 10 rounds) and link-row layout match both servers.
 *
 * A RUNNING API server keeps serving the old claim from its in-process
 * cache until the TTL — restart it (or wait) before judging the grant failed.
 *
 * From the repo root:  npm run grant:full-access -- --email someone@rutba.pk
 * From services/core:     node scripts/grant-full-access.js --email someone@rutba.pk
 * (config/env.js hydrates DB credentials from the repo-root .env files.)
 *
 * Options:
 *   --email <addr>         required — account to grant (created if missing)
 *   --password <pw>        password when creating (default: generated, printed once)
 *   --username <name>      username when creating (default: the email address)
 *   --display-name <name>  displayName when creating (default: the username)
 *   --keep-role            do not move an existing account onto rutba_app_user
 *   --unblock              clear the blocked flag on an existing account
 *   --no-sync              skip the config→DB reconcile; grant only what exists
 *   --dry-run              report what would change without writing
 */

const crypto = require('crypto');
const { getDb, closeDb } = require('../src/db/connection');
const { userService } = require('../src/auth/up');
const { generateDocumentId } = require('../src/documents/write');

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
    else if (a === '--no-sync') args.flags.noSync = true;
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
    '[--keep-role] [--unblock] [--no-sync] [--dry-run]'
  );
}

function titleCase(key) {
  return key.split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
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

/**
 * Bring api_pro_app_domains / api_pro_app_roles up to what @rutba/api-provider
 * declares, so a domain added since the last seed can actually be granted.
 *
 * Mirrors the api-pro seeder's row shape (name, `Auto-seeded role ...`
 * description, admin_role_code = key) so the next real seed upserts over these
 * rows instead of duplicating them. Additive only — nothing is deleted, and an
 * already-correct database comes back with every counter at zero.
 */
async function syncDeclaredRoles(db, { dryRun }) {
  const declared = readDeclared();
  if (!declared) {
    return { skipped: '@rutba/api-provider config not resolvable — granted existing rows only' };
  }

  const report = { domainsCreated: [], rolesCreated: [], rolesLinked: [], reactivated: [] };
  const now = new Date();

  const domainByKey = new Map(
    (await db('api_pro_app_domains').select('id', 'key', 'is_active')).map((d) => [d.key, d])
  );
  for (const [key, def] of Object.entries(declared.domains || {})) {
    const existing = domainByKey.get(key);
    if (!existing) {
      report.domainsCreated.push(key);
      if (dryRun) {
        domainByKey.set(key, { id: null, key, is_active: 1 });
        continue;
      }
      const [id] = await db('api_pro_app_domains').insert({
        document_id: generateDocumentId(),
        key,
        name: def.name || titleCase(key),
        description: def.description || null,
        is_active: 1,
        created_at: now,
        updated_at: now,
        published_at: now,
      });
      domainByKey.set(key, { id, key, is_active: 1 });
    } else if (!existing.is_active) {
      // A deactivated domain's roles are still granted, but the guards treat
      // the app as switched off — reactivate so the grant means something.
      report.reactivated.push(`domain:${key}`);
      if (!dryRun) {
        await db('api_pro_app_domains').where('id', existing.id).update({ is_active: 1, updated_at: now });
      }
    }
  }

  const roleByKey = new Map(
    (await db('api_pro_app_roles').select('id', 'key', 'is_active')).map((r) => [r.key, r])
  );
  const links = await db('api_pro_app_roles_app_domains_lnk').select('app_role_id', 'app_domain_id', 'app_role_ord');
  const linkedRoleIds = new Set(links.map((l) => Number(l.app_role_id)));
  const lastOrd = new Map();
  for (const l of links) {
    const d = Number(l.app_domain_id);
    lastOrd.set(d, Math.max(lastOrd.get(d) || 0, Number(l.app_role_ord) || 0));
  }

  const declaredRoles = Array.isArray(declared.roles)
    ? declared.roles
    : Object.entries(declared.roles || {}).map(([key, v]) => ({ key, ...v }));

  for (const def of declaredRoles) {
    if (!def?.key) continue;
    let row = roleByKey.get(def.key);
    if (!row) {
      // Dry-run stops here: the row has no id, so the link it would get is
      // implied by the create rather than reported separately.
      report.rolesCreated.push(def.key);
      if (dryRun) continue;
      const [id] = await db('api_pro_app_roles').insert({
        document_id: generateDocumentId(),
        key: def.key,
        name: titleCase(def.key),
        description: `Auto-seeded role '${def.key}' (level=${def.level}, domain=${def.domain})`,
        is_active: 1,
        admin_role_code: def.key,
        created_at: now,
        updated_at: now,
        published_at: now,
      });
      row = { id, key: def.key, is_active: 1 };
      roleByKey.set(def.key, row);
    } else if (!row.is_active) {
      // An inactive role is skipped by the grant query below — the quietest
      // way to stay locked out of an app that looks fully configured.
      report.reactivated.push(`role:${def.key}`);
      if (!dryRun) {
        await db('api_pro_app_roles').where('id', row.id).update({ is_active: 1, updated_at: now });
      }
      row.is_active = 1;
    }

    const domain = domainByKey.get(def.domain);
    if (domain?.id && row.id && !linkedRoleIds.has(Number(row.id))) {
      report.rolesLinked.push(`${def.key}->${def.domain}`);
      if (!dryRun) {
        const ord = (lastOrd.get(Number(domain.id)) || 0) + 1;
        lastOrd.set(Number(domain.id), ord);
        await db('api_pro_app_roles_app_domains_lnk').insert({
          app_role_id: row.id,
          app_domain_id: domain.id,
          app_domain_ord: 1,
          app_role_ord: ord,
        });
        linkedRoleIds.add(Number(row.id));
      }
    }
  }

  for (const k of Object.keys(report)) {
    if (Array.isArray(report[k]) && !report[k].length) delete report[k];
  }
  return report;
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
    if (!args.flags.noSync) {
      const sync = await syncDeclaredRoles(db, { dryRun: args.flags.dryRun });
      if (Object.keys(sync).length) out.sync = sync;
      if (sync.rolesCreated?.length && args.flags.dryRun) {
        out.warnings.push(
          `${sync.rolesCreated.length} declared role(s) are missing from the database; ` +
          'a real run creates them, so the counts below understate the grant.'
        );
      }
    }

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

// Exported so the reconcile can be exercised inside a rolled-back transaction
// (it takes any knex-callable, so a trx works) without touching real rows.
module.exports = { syncDeclaredRoles };

if (require.main === module) {
  main().catch(async (err) => {
    console.error(err.message || err);
    try { await closeDb(); } catch (_) { /* already closed */ }
    process.exit(1);
  });
}
