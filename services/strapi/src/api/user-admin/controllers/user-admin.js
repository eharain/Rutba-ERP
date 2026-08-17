// @ts-nocheck
'use strict';

/**
 * user-admin — the central user-management API behind rutba-admin (:4022).
 *
 * Carved out of api::auth-admin (which now re-exports this controller so the
 * legacy /auth-admin/* paths keep working on both servers during transition).
 * Routes are auth:false — this api has no content type, so there is no UP
 * action to grant; authentication + authorization are DB-backed via
 * requireAppRole (never the client-supplied X-Rutba-App header, which the old
 * requireAuthAdmin gate trusted for app scoping).
 *
 * ADMIN_DOMAINS is a role-key PREFIX list, not an app list, and both legacy
 * entries are transitional:
 *   'admin' — the live one. rutba-admin replaced rutba-users and claims
 *             X-Rutba-App: admin, so admin_* is what new grants use.
 *   'users' — the rutba-users carve-out's domain, kept so existing users_*
 *             holders keep working. The admin-domain-grants seeder backfills
 *             users_* holders with the matching admin_* role.
 *   'auth'  — the pre-carve-out domain, kept so auth_admin holders aren't
 *             locked out before the users_* backfill ran everywhere.
 * Tighten to ['admin'] once both backfills have run on every deployment.
 */

const crypto = require('crypto');
const { requireAppRole } = require('../../../utils/require-admin');
const { resolveGuardRoles, isAdminRoleKey } = require('../../../utils/guard-roles');

const ADMIN_DOMAINS = ['admin', 'users', 'auth'];
const USER_UID = 'plugin::users-permissions.user';

// The generated api-provider clients wrap bodies as { data: {...} } (wrapData);
// the legacy pos-auth client posts raw payloads to the /auth-admin/* aliases.
// Accept both shapes everywhere.
function bodyOf(ctx) {
  const body = ctx.request.body || {};
  return (body && typeof body === 'object' && body.data && typeof body.data === 'object')
    ? body.data
    : body;
}

function clearClaimCache(strapi, userId) {
  // Grants made here bypass the api-pro plugin's own write path, so evict the
  // cached user→app_roles claim or the old role set survives until TTL.
  try {
    strapi.apiPro?.cache?.clearUser?.(userId);
  } catch (_) { /* cache is best-effort on both servers */ }
}

function sanitizeUser(user) {
  if (!user) return user;
  const {
    password,
    resetPasswordToken,
    confirmationToken,
    ...safe
  } = user;
  return safe;
}

function deriveDomainAccessFromUser(user) {
  const roles = user?.app_roles || [];

  const appKeys = [...new Set(
    roles
      .flatMap((role) => (role?.appDomains || []).map((d) => d?.key))
      .filter(Boolean)
  )];

  // AGP roles have no level field; admin roles are identified by key convention
  // (*_admin or *-admin) — the same rule resolveGuardRoles writes by.
  const adminKeys = [...new Set(
    roles
      .filter((role) => isAdminRoleKey(role?.key))
      .flatMap((role) => (role?.appDomains || []).map((d) => d?.key))
      .filter(Boolean)
  )];

  return { appKeys, adminKeys };
}

async function resolveDomainKeys(strapi, values = []) {
  const normalized = (values || []).map((v) => {
    if (v && typeof v === 'object') {
      return String(v.key || v.id || '').trim();
    }
    return String(v || '').trim();
  }).filter(Boolean);

  const directKeys = normalized.filter((v) => Number.isNaN(Number(v))).map((v) => v.toLowerCase());
  const numericIds = normalized
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (numericIds.length === 0) {
    return [...new Set(directKeys)];
  }

  const domains = await strapi.db.query('plugin::api-pro.app-domain').findMany({
    where: { id: { $in: numericIds } },
    select: ['key'],
  });

  const idKeys = (domains || []).map((domain) => String(domain.key || '').toLowerCase()).filter(Boolean);
  return [...new Set([...directKeys, ...idKeys])];
}

async function requireUsersAdmin(ctx, strapi, { levels = ['admin'], domains = ADMIN_DOMAINS } = {}) {
  return requireAppRole(ctx, strapi, { domains, levels });
}

async function fetchUserById(strapi, id) {
  return strapi.query(USER_UID).findOne({
    where: { id },
    populate: {
      role: true,
      hr_employee: true,
      app_roles: {
        populate: {
          appDomains: true,
        },
      },
    },
  });
}

async function listDomainsWithUserCounts(strapi) {
  const domains = await strapi.db.query('plugin::api-pro.app-domain').findMany({
    where: { isActive: true },
    orderBy: { id: 'asc' },
    select: ['id', 'documentId', 'key', 'name', 'description'],
    populate: { appRoles: { select: ['key'] } },
  });

  const users = await strapi.query(USER_UID).findMany({
    populate: {
      app_roles: {
        populate: {
          appDomains: {
            select: ['key'],
          },
        },
      },
    },
  });

  const usersByDomainKey = new Map();
  for (const user of users || []) {
    const domainKeys = new Set(
      (user.app_roles || [])
        .flatMap((role) => (role?.appDomains || []).map((d) => d?.key))
        .filter(Boolean)
    );

    for (const domainKey of domainKeys) {
      usersByDomainKey.set(domainKey, (usersByDomainKey.get(domainKey) || 0) + 1);
    }
  }

  return (domains || []).map((domain) => {
    // Not every domain has all three levels — `ess` ships employee/manager and
    // `web` ships public/user (see api-provider/config/domains.json). Tell the
    // caller, so the admin UI doesn't offer an "Admin Access" switch that has
    // no role to grant and therefore always reads back off.
    const roleKeys = (domain.appRoles || []).map((r) => r?.key).filter(Boolean);
    const { appRoles, ...rest } = domain;
    return {
      ...rest,
      roleKeys,
      hasAdminRole: roleKeys.some(isAdminRoleKey),
      userCount: usersByDomainKey.get(domain.key) || 0,
    };
  });
}

// Invite plumbing: a fresh reset token + templated email. Redemption is 100%
// existing machinery — pos-auth's /login?code= reset view resets the password
// and BOTH servers' resetPassword confirm-on-reset wrappers flip
// confirmed:true (pos-strapi extensions/users-permissions/strapi-server.js;
// rutba-core modules/auth.js). While unconfirmed, UP blocks local login, so
// the random initial password is unusable before redemption.
async function issueInvite(strapi, user) {
  const token = crypto.randomBytes(64).toString('hex');
  // Through the UP user service, not db.query: rutba-core's compat query
  // layer only writes scalar cache columns and rejects resetPasswordToken,
  // while BOTH servers' user services map it (core: userScalarColumns).
  await strapi.plugin('users-permissions').service('user').edit(user.id, {
    resetPasswordToken: token,
  });

  const authUrl = (process.env.NEXT_PUBLIC_AUTH_URL || 'http://localhost:4003').replace(/\/+$/, '');
  const link = `${authUrl}/login?code=${token}&invited=1`;
  const name = user.displayName || user.username || user.email;

  await strapi.plugin('email').service('email').send({
    to: user.email,
    subject: 'You have been invited to Rutba ERP',
    text: `Hello ${name},\n\nAn account has been created for you on Rutba ERP. Set your password to activate it:\n\n${link}\n\nIf you were not expecting this invitation you can ignore this email.`,
    html: `<p>Hello ${name},</p>
<p>An account has been created for you on <strong>Rutba ERP</strong>. Set your password to activate it:</p>
<p><a href="${link}">Set your password</a></p>
<p style="color:#6c757d;font-size:12px">If the button does not work, open this link: ${link}<br/>
If you were not expecting this invitation you can ignore this email.</p>`,
  });

  return link;
}

// Shared by updateUser and setBulkAccess: resolve a matrix payload to role ids
// and replace the user's app_roles set. Matrix semantics are intentionally
// identical to the legacy auth-admin console (a plain domain grants every
// non-admin role in it); the precise per-role editor is setAppRoles.
async function applyAccessChange(strapi, userId, payload) {
  const userService = strapi.plugin('users-permissions').service('user');
  const appAccesses = await resolveDomainKeys(strapi, payload.domain_accesses || []);
  const adminAppAccesses = await resolveDomainKeys(strapi, payload.admin_domain_accesses || []);

  const { roleIds } = await resolveGuardRoles(strapi, {
    domainKeys: appAccesses,
    adminKeys: adminAppAccesses,
    roleKeys: payload.role_keys || [],
  });

  await userService.edit(userId, { app_roles: roleIds });
  clearClaimCache(strapi, userId);
}

module.exports = {
  async listUsers(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const users = await strapi.query(USER_UID).findMany({
      populate: {
        role: true,
        app_roles: {
          populate: {
            appDomains: true,
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    ctx.send((users || []).map((user) => {
      const { appKeys, adminKeys } = deriveDomainAccessFromUser(user);
      return sanitizeUser({
        ...user,
        domain_accesses: appKeys,
        admin_domain_accesses: adminKeys,
      });
    }));
  },

  /**
   * Sanitized minimal user projection for pickers in other apps (the HR
   * employee↔user link picker was dead against the old auth-only gate).
   * Deliberately no roles/domains — this is a directory, not an admin read.
   */
  async listDirectory(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi, {
      domains: [...ADMIN_DOMAINS, 'hr'],
      levels: ['admin', 'manager'],
    });
    if (!allowed) return;

    const users = await strapi.query(USER_UID).findMany({
      select: ['id', 'documentId', 'username', 'email', 'displayName', 'confirmed', 'blocked'],
      orderBy: { displayName: 'asc' },
    });

    // Explicit projection rather than trusting `select` — rutba-core's compat
    // query layer returns extra columns, and this feed goes to non-users apps.
    ctx.send({
      data: (users || []).map((u) => ({
        id: u.id,
        documentId: u.documentId,
        username: u.username,
        email: u.email,
        displayName: u.displayName,
        confirmed: u.confirmed,
        blocked: u.blocked,
      })),
    });
  },

  /** hr-employee picker feed for the user↔employee link (id/name/email/user). */
  async listEmployees(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi, { levels: ['admin', 'manager'] });
    if (!allowed) return;

    const employees = await strapi.db.query('api::hr-employee.hr-employee').findMany({
      select: ['id', 'documentId', 'name', 'email', 'designation', 'status'],
      populate: { user: { select: ['id', 'email', 'displayName'] } },
      orderBy: { name: 'asc' },
    });

    ctx.send({ data: employees || [] });
  },

  async getUser(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const user = await fetchUserById(strapi, id);
    if (!user) return ctx.notFound('User not found.');

    const { appKeys, adminKeys } = deriveDomainAccessFromUser(user);
    ctx.send(sanitizeUser({
      ...user,
      domain_accesses: appKeys,
      admin_domain_accesses: adminKeys,
    }));
  },

  async createUser(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const payload = bodyOf(ctx);
    const userService = strapi.plugin('users-permissions').service('user');

    const appAccesses = await resolveDomainKeys(strapi, payload.domain_accesses || []);
    const adminAppAccesses = await resolveDomainKeys(strapi, payload.admin_domain_accesses || []);

    const { roleIds } = await resolveGuardRoles(strapi, {
      domainKeys: appAccesses,
      adminKeys: adminAppAccesses,
      roleKeys: payload.role_keys || [],
    });

    const created = await userService.add({
      username: payload.username,
      email: payload.email,
      password: payload.password,
      provider: 'local',
      displayName: payload.displayName,
      confirmed: payload.confirmed,
      blocked: payload.blocked,
      role: payload.role,
      app_roles: roleIds,
    });

    const user = await fetchUserById(strapi, created.id);
    ctx.send(sanitizeUser(user));
  },

  async updateUser(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const payload = bodyOf(ctx);
    const userService = strapi.plugin('users-permissions').service('user');
    const appAccesses = await resolveDomainKeys(strapi, payload.domain_accesses || []);
    const adminAppAccesses = await resolveDomainKeys(strapi, payload.admin_domain_accesses || []);

    const { roleIds } = await resolveGuardRoles(strapi, {
      domainKeys: appAccesses,
      adminKeys: adminAppAccesses,
      roleKeys: payload.role_keys || [],
    });

    const nextData = {
      username: payload.username,
      email: payload.email,
      provider: payload.provider || 'local',
      displayName: payload.displayName,
      confirmed: payload.confirmed,
      blocked: payload.blocked,
      role: payload.role,
      app_roles: roleIds,
    };

    if (payload.password) {
      nextData.password = payload.password;
    }

    await userService.edit(id, nextData);
    clearClaimCache(strapi, id);

    // Employee link — rewired from the hr-employee side (the relation's FK
    // lives there, and neither server's user service carries hr_employee
    // through edit). null unlinks; an id links, detaching any other employee
    // currently pointing at this user (1:1).
    if (payload.hr_employee !== undefined) {
      const HR_UID = 'api::hr-employee.hr-employee';
      const wanted = payload.hr_employee === null || payload.hr_employee === ''
        ? null
        : Number(payload.hr_employee);
      const current = await strapi.documents(HR_UID).findMany({
        filters: { user: { id } },
        fields: ['id'],
      });
      for (const emp of current) {
        if (wanted === null || emp.id !== wanted) {
          await strapi.documents(HR_UID).update({ documentId: emp.documentId, data: { user: null } });
        }
      }
      if (wanted !== null && !current.some((emp) => emp.id === wanted)) {
        const target = await strapi.documents(HR_UID).findMany({
          filters: { id: wanted },
          fields: ['id'],
        });
        if (target[0]) {
          await strapi.documents(HR_UID).update({ documentId: target[0].documentId, data: { user: id } });
        }
      }
    }

    const user = await fetchUserById(strapi, id);
    ctx.send(sanitizeUser(user));
  },

  /**
   * Bulk matrix save — one request instead of the N sequential PUTs the old
   * access-assignment page issued. Body:
   *   { changes: [{ userId, domain_accesses: [], admin_domain_accesses: [], role_keys?: [] }] }
   * Only touches app_roles (never profile fields); per-user failures don't
   * abort the batch.
   */
  async setBulkAccess(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const changes = Array.isArray(bodyOf(ctx).changes) ? bodyOf(ctx).changes : [];
    if (!changes.length) return ctx.badRequest('changes[] is required.');

    const results = [];
    for (const change of changes) {
      const userId = Number(change?.userId);
      if (!userId) {
        results.push({ userId: change?.userId ?? null, ok: false, error: 'Invalid userId' });
        continue;
      }
      try {
        await applyAccessChange(strapi, userId, change);
        results.push({ userId, ok: true });
      } catch (err) {
        results.push({ userId, ok: false, error: err.message });
      }
    }

    ctx.send({ results });
  },

  /**
   * Precise per-role editor — replaces the user's WHOLE app_roles set with
   * exactly the given keys (same replace semantics as the api-pro admin page).
   * This is the only surface that can grant a single role (e.g. ess_employee
   * alone) — the domain matrix always grants role bundles.
   */
  async setAppRoles(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const roleKeys = Array.isArray(bodyOf(ctx).role_keys) ? bodyOf(ctx).role_keys : null;
    if (!roleKeys) return ctx.badRequest('role_keys[] is required.');

    const existing = await strapi.query(USER_UID).findOne({ where: { id }, select: ['id'] });
    if (!existing) return ctx.notFound('User not found.');

    const { roleIds, roleKeys: resolvedKeys } = await resolveGuardRoles(strapi, { roleKeys });

    const unknown = roleKeys
      .map((k) => String(k).trim().toLowerCase())
      .filter(Boolean)
      .filter((k) => !resolvedKeys.includes(k));
    if (unknown.length) {
      return ctx.badRequest(`Unknown or inactive role keys: ${unknown.join(', ')}`);
    }

    const userService = strapi.plugin('users-permissions').service('user');
    await userService.edit(id, { app_roles: roleIds });
    clearClaimCache(strapi, id);

    const user = await fetchUserById(strapi, id);
    ctx.send(sanitizeUser(user));
  },

  /**
   * POST /user-admin/invites — create a user WITHOUT a usable password and
   * email them a set-your-password link (the invite-first replacement for
   * admin-typed plaintext passwords). Body is createUser's minus password:
   *   { email, displayName, username?, role?, domain_accesses,
   *     admin_domain_accesses, role_keys? }
   */
  async createInvite(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const payload = bodyOf(ctx);
    const email = String(payload.email || '').trim().toLowerCase();
    if (!email) return ctx.badRequest('email is required.');

    const userService = strapi.plugin('users-permissions').service('user');
    const appAccesses = await resolveDomainKeys(strapi, payload.domain_accesses || []);
    const adminAppAccesses = await resolveDomainKeys(strapi, payload.admin_domain_accesses || []);
    const { roleIds } = await resolveGuardRoles(strapi, {
      domainKeys: appAccesses,
      adminKeys: adminAppAccesses,
      roleKeys: payload.role_keys || [],
    });

    const created = await userService.add({
      username: payload.username || email,
      email,
      // Random throwaway — unconfirmed accounts can't log in with it, and
      // redemption replaces it. Never shown to anyone.
      password: crypto.randomBytes(32).toString('hex'),
      provider: 'local',
      displayName: payload.displayName,
      confirmed: false,
      blocked: false,
      role: payload.role,
      app_roles: roleIds,
    });

    try {
      await issueInvite(strapi, created);
    } catch (e) {
      // Keep the account (roles are set up); the admin can hit re-send once
      // SMTP is back instead of re-entering everything.
      const user = await fetchUserById(strapi, created.id);
      return ctx.send({
        ok: false,
        emailError: e?.message || 'Invite email failed to send.',
        user: sanitizeUser(user),
      }, 502);
    }

    const user = await fetchUserById(strapi, created.id);
    ctx.send({ ok: true, user: sanitizeUser(user) });
  },

  /** POST /user-admin/users/:id/invite — re-issue + resend for an unconfirmed user. */
  async sendInvite(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');
    const user = await strapi.query(USER_UID).findOne({
      where: { id },
      select: ['id', 'email', 'username', 'displayName', 'confirmed', 'blocked'],
    });
    if (!user) return ctx.notFound('User not found.');
    if (user.blocked) return ctx.badRequest('User is blocked.');
    if (user.confirmed) {
      return ctx.badRequest('User has already activated their account — use password reset instead.');
    }

    try {
      await issueInvite(strapi, user);
    } catch (e) {
      return ctx.send({ ok: false, emailError: e?.message || 'Invite email failed to send.' }, 502);
    }
    ctx.send({ ok: true });
  },

  /**
   * POST /user-admin/users/:id/mailbox — assign an email address to a user by
   * provisioning it on a registered mail server (api::mail-server; falls back
   * to the MAILCOW_* env server when serverId is omitted) and connecting the
   * resulting mail-account with the user as owner. Body:
   *   { serverId?, localPart, domain, name?, kind?: 'personal'|'shared',
   *     quotaMb?, access_roles?: [] }
   */
  async createMailbox(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');
    const target = await strapi.query(USER_UID).findOne({ where: { id }, select: ['id', 'email'] });
    if (!target) return ctx.notFound('User not found.');

    const body = bodyOf(ctx);
    const localPart = String(body.localPart || '').trim().toLowerCase();
    const domain = String(body.domain || '').trim().toLowerCase();
    if (!localPart || !domain) return ctx.badRequest('localPart and domain are required.');

    let serverConfig = null;
    if (body.serverId) {
      serverConfig = await strapi.service('api::mail-server.mail-server').configFor(String(body.serverId));
      if (!serverConfig) return ctx.notFound('Mail server not found.');
      if (!serverConfig.isActive) return ctx.badRequest('Mail server is disabled.');
    } else {
      serverConfig = await strapi.service('api::mail-server.mail-server').resolveForEmailDomain(domain);
      // null is fine — provisionAccount then uses the MAILCOW_* env server.
    }

    try {
      const account = await strapi.service('api::mail-account.mail-account').provisionAccount({
        localPart,
        domain,
        name: body.name,
        kind: body.kind === 'shared' ? 'shared' : 'personal',
        quotaMb: body.quotaMb,
        ownerUserIds: [id],
        accessRoles: Array.isArray(body.access_roles) ? body.access_roles : undefined,
        serverConfig,
      });
      return ctx.send({ ok: true, account });
    } catch (e) {
      const status = e?.status || 502;
      return ctx.send({ error: e?.code || 'error', message: e?.message || 'Provisioning failed.' }, status);
    }
  },

  async deleteUser(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid user id.');

    const userService = strapi.plugin('users-permissions').service('user');
    await userService.remove({ id });
    clearClaimCache(strapi, id);

    ctx.send({ ok: true });
  },

  async listRoles(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const roles = await strapi.query('plugin::users-permissions.role').findMany({
      select: ['id', 'name', 'type', 'description'],
      orderBy: { id: 'asc' },
    });

    ctx.send({ roles: roles || [] });
  },

  async listDomains(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const domains = await listDomainsWithUserCounts(strapi);
    ctx.send({ data: domains });
  },

  async createDomain(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const payload = bodyOf(ctx);
    const key = String(payload.key || '').trim().toLowerCase();
    const name = String(payload.name || '').trim();

    if (!key || !name) {
      return ctx.badRequest('Key and name are required.');
    }

    const existing = await strapi.db.query('plugin::api-pro.app-domain').findOne({
      where: { key },
      select: ['id'],
    });

    if (existing) {
      return ctx.badRequest('A domain with this key already exists.');
    }

    await strapi.db.query('plugin::api-pro.app-domain').create({
      data: {
        key,
        name,
        description: payload.description || '',
        isActive: true,
      },
    });

    const domains = await listDomainsWithUserCounts(strapi);
    ctx.send({ data: domains });
  },

  async deleteDomain(ctx) {
    const allowed = await requireUsersAdmin(ctx, strapi);
    if (!allowed) return;

    const id = Number(ctx.params.id);
    if (!id) return ctx.badRequest('Invalid domain id.');

    const domain = await strapi.db.query('plugin::api-pro.app-domain').findOne({
      where: { id },
      select: ['id', 'key'],
    });

    if (!domain) return ctx.notFound('Domain not found.');

    if (domain.key === 'web' || domain.key === 'web-user') {
      return ctx.badRequest('Core web domains cannot be deleted.');
    }

    await strapi.db.query('plugin::api-pro.app-domain').update({
      where: { id },
      data: { isActive: false },
    });

    ctx.send({ ok: true });
  },
};
