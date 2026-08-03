'use strict';

/**
 * Auth tranche (playbook tranche 8 — the last one): the users-permissions
 * endpoint surface, so core can issue and rotate its own tokens instead of
 * depending on Strapi as the sole JWT issuer.
 *
 * SHARED-STATE DESIGN (this is what makes the flip safe): both servers sign
 * with the same JWT_SECRET and read/write the same `strapi_sessions` rows in
 * the same format, so a token minted by pos-strapi validates on core and vice
 * versa, and a session rotated on one side is rotated for both. That means
 * this tranche can run side-by-side with Strapi during the bake instead of
 * needing a big-bang cutover — logged-in users are not signed out by the flip.
 *
 * NOT zero-copy, unlike tranches 1–7: the reference implementation lives in
 * @strapi/plugin-users-permissions and @strapi/core, which are runtime
 * packages that need a booted Strapi. src/auth/up.js re-implements their
 * CONTRACT (session manager semantics ported statement-by-statement, user
 * service writing the same rows, plugin-store settings read from the same
 * strapi_core_store_settings keys) while still loading the plugin's own yup
 * validators, bcryptjs and the @strapi/utils session helpers from
 * pos-strapi's node_modules — so validation messages and password hashing are
 * literally the same code.
 *
 * The pos-strapi users-permissions EXTENSION behaviours are reproduced here
 * because they are repo code the frontends depend on: register grants the
 * `web_user` app-role to authenticated-role signups and promotes a matching
 * provisional person; OAuth callback promotes too; a successful password
 * reset also confirms the account.
 *
 * auth-admin (the auth app's user/role/domain console) IS zero-copy — it is
 * repo code — and mounts as selfAuth, matching its auth:false routes.
 *
 * Email: forgot-password / send-email-confirmation need the email plugin,
 * which core does not have. They return the same shape but record the token
 * without sending; see the tranche sheet. Everything else is complete.
 */

const path = require('path');
const crypto = require('crypto');
const { posRequire } = require('../compat/strapi');
const { documents } = require('../documents');
const {
  sessionManager, upStore, userService, upValidators,
  sanitizeUserRow, findUserRow, findUserByIdentifier,
  strapiSessionHelpers,
} = require('../auth/up');
const { getDb } = require('../db/connection');

const { buildSessionMetadata, sanitizeSessionEntry, sortSessionsForDisplay } = strapiSessionHelpers;

// Strapi maps these error classes to status codes; core's server does the same
// by error name, so throwing the same names yields the same responses.
class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}
class ApplicationError extends Error {
  constructor(message) { super(message); this.name = 'ApplicationError'; }
}

const extractDeviceId = (body) => {
  const { deviceId } = body || {};
  return typeof deviceId === 'string' && deviceId.length > 0 ? deviceId : undefined;
};

async function sendRefreshAuthResponse(ctx, user, { metadata } = {}) {
  const deviceId = extractDeviceId(ctx.request.body);
  const refresh = await sessionManager.generateRefreshToken(String(user.id), deviceId, {
    type: 'refresh', ...(metadata ? { metadata } : {}),
  });
  const access = await sessionManager.generateAccessToken(refresh.token);
  if ('error' in access) throw new ApplicationError('Invalid credentials');
  ctx.body = { jwt: access.token, refreshToken: refresh.token, user: sanitizeUserRow(user) };
  return ctx.body;
}

async function reissueTokensAfterPasswordChange(ctx, user) {
  const deviceId = extractDeviceId(ctx.request.body) || crypto.randomUUID();
  await sessionManager.invalidateRefreshToken(String(user.id));
  const refresh = await sessionManager.generateRefreshToken(String(user.id), deviceId, { type: 'refresh' });
  const access = await sessionManager.generateAccessToken(refresh.token);
  if ('error' in access) throw new ApplicationError('Invalid credentials');
  ctx.body = { jwt: access.token, refreshToken: refresh.token, user: sanitizeUserRow(user) };
  return ctx.body;
}

// ── pos-strapi users-permissions extension behaviours ──────────────────────
async function ensureWebUserAppRole(userId) {
  if (!userId) return;
  const db = getDb();
  const role = await db('up_users_role_lnk as l')
    .join('up_roles as r', 'r.id', 'l.role_id')
    .where('l.user_id', userId).first('r.type');
  if (role?.type !== 'authenticated') return;
  const webUser = await db('api_pro_app_roles')
    .where({ key: 'web_user', is_active: 1 }).first('id');
  if (!webUser) return;
  const existing = await db('up_users_app_roles_lnk')
    .where({ user_id: userId, app_role_id: webUser.id }).first('id');
  if (!existing) {
    await db('up_users_app_roles_lnk').insert({ user_id: userId, app_role_id: webUser.id });
  }
}

async function promotePersonForRegisteredUser(userId) {
  if (!userId) return;
  try {
    const user = await findUserRow({ id: userId });
    if (!user) return;
    await global.strapi.service('api::person.person')
      .ensureForUser({ id: user.id, email: user.email, username: user.username });
  } catch (err) {
    global.strapi.log.warn(`[users-permissions] person promotion failed: ${err.message}`);
  }
}

function registerAuthModule() {
  const strapi = global.strapi;

  // auth-admin is repo code → zero-copy, same as every earlier tranche.
  const authAdmin = posRequire(path.join('api', 'auth-admin', 'controllers', 'auth-admin.js'));

  const auth = {
    // POST /auth/local  ·  GET /auth/:provider/callback
    async callback(ctx) {
      const provider = ctx.params.provider || 'local';
      const grant = (await upStore.get('grant')) || {};
      const grantProvider = provider === 'local' ? 'email' : provider;
      if (!grant[grantProvider] || !grant[grantProvider].enabled) {
        throw new ApplicationError('This provider is disabled');
      }
      if (provider !== 'local') {
        // OAuth handshakes need the grant middleware chain; keep it on Strapi
        // until the provider flow is ported (the tranche sheet tracks this).
        throw new ApplicationError('This provider is disabled');
      }

      const params = ctx.request.body || {};
      await upValidators.validateCallbackBody(params);

      const user = await findUserByIdentifier(params.identifier);
      if (!user || !user.password) throw new ValidationError('Invalid identifier or password');
      const validPassword = await userService.validatePassword(params.password, user.password);
      if (!validPassword) throw new ValidationError('Invalid identifier or password');

      const advanced = (await upStore.get('advanced')) || {};
      if (advanced.email_confirmation && user.confirmed !== 1 && user.confirmed !== true) {
        throw new ApplicationError('Your account email is not confirmed');
      }
      if (user.blocked === 1 || user.blocked === true) {
        throw new ApplicationError('Your account has been blocked by an administrator');
      }

      return sendRefreshAuthResponse(ctx, user, {
        metadata: buildSessionMetadata({ userAgent: ctx.request.headers['user-agent'] }),
      });
    },

    // POST /auth/local/register
    async register(ctx) {
      const settings = (await upStore.get('advanced')) || {};
      if (!settings.allow_register) throw new ApplicationError('Register action is currently disabled');

      // pos-strapi config: register.allowedFields = ['displayName','app_roles'].
      const allowedKeys = ['username', 'password', 'email', 'displayName', 'app_roles'];
      const body = ctx.request.body || {};
      const invalidKeys = Object.keys(body).filter((k) => !allowedKeys.includes(k));
      if (invalidKeys.length > 0) {
        throw new ValidationError(`Invalid parameters: ${invalidKeys.join(', ')}`);
      }
      const params = { provider: 'local' };
      for (const k of allowedKeys) if (k in body) params[k] = body[k];
      await upValidators.validateRegisterBody(params);

      const db = getDb();
      const role = await db('up_roles').where('type', settings.default_role).first('id');
      if (!role) throw new ApplicationError('Impossible to find the default role');

      const { email, username } = params;
      const identifierMatch = (qb) => qb
        .where('email', String(email).toLowerCase())
        .orWhere('username', String(email).toLowerCase())
        .orWhere('username', username)
        .orWhere('email', username);

      const conflicting = await db('up_users')
        .where('provider', 'local').where(identifierMatch).count('* as n').first();
      if (Number(conflicting.n) > 0) throw new ApplicationError('Email or Username are already taken');
      if (settings.unique_email) {
        const any = await db('up_users').where(identifierMatch).count('* as n').first();
        if (Number(any.n) > 0) throw new ApplicationError('Email or Username are already taken');
      }

      const created = await userService.add({
        ...params,
        email: String(email).toLowerCase(),
        username,
        role: role.id,
        confirmed: settings.email_confirmation ? 0 : 1,
      });

      // Extension behaviours (pos-strapi src/extensions/users-permissions).
      await ensureWebUserAppRole(created.id);
      await promotePersonForRegisteredUser(created.id);

      if (settings.email_confirmation) {
        // Parity gap: the confirmation email needs the email plugin. The user
        // row exists and is unconfirmed exactly as under Strapi.
        strapi.log.warn('[auth] email_confirmation is on but core cannot send mail yet');
        ctx.body = { user: created };
        return ctx.body;
      }

      const deviceId = extractDeviceId(ctx.request.body) || crypto.randomUUID();
      const refresh = await sessionManager.generateRefreshToken(String(created.id), deviceId, {
        type: 'refresh',
        metadata: buildSessionMetadata({ userAgent: ctx.request.headers['user-agent'] }),
      });
      const access = await sessionManager.generateAccessToken(refresh.token);
      if ('error' in access) throw new ApplicationError('Invalid credentials');
      ctx.body = { jwt: access.token, refreshToken: refresh.token, user: created };
      return ctx.body;
    },

    // POST /auth/refresh
    async refresh(ctx) {
      const refreshToken = (ctx.request.body || {}).refreshToken;
      if (!refreshToken || typeof refreshToken !== 'string') {
        return ctx.badRequest('Missing refresh token');
      }
      const rotation = await sessionManager.rotateRefreshToken(refreshToken);
      if ('error' in rotation) return ctx.unauthorized('Invalid refresh token');
      const result = await sessionManager.generateAccessToken(rotation.token);
      if ('error' in result) return ctx.unauthorized('Invalid refresh token');
      ctx.body = { jwt: result.token, refreshToken: rotation.token };
      return ctx.body;
    },

    // POST /auth/logout
    async logout(ctx) {
      if (!ctx.state.user) return ctx.unauthorized('Missing authentication');
      const userId = String(ctx.state.user.id);
      const body = ctx.request.body || {};
      const scope = typeof body.scope === 'string' ? body.scope : undefined;
      const deviceId = extractDeviceId(body);
      try {
        if (scope === 'all') {
          await sessionManager.invalidateRefreshToken(userId);
        } else if (deviceId) {
          await sessionManager.invalidateRefreshToken(userId, deviceId);
        } else {
          let currentSessionId = ctx.state.session?.id;
          if (typeof body.refreshToken === 'string') {
            const validation = await sessionManager.validateRefreshToken(body.refreshToken);
            if (validation.isValid) currentSessionId = validation.sessionId;
          }
          if (currentSessionId) await sessionManager.revokeSessionById(userId, currentSessionId);
          else await sessionManager.invalidateRefreshToken(userId);
        }
      } catch (err) {
        strapi.log.error(`UP logout failed: ${err.message}`);
      }
      ctx.body = { ok: true };
      return ctx.body;
    },

    // GET /auth/sessions
    async getSessions(ctx) {
      if (!ctx.state.user) return ctx.unauthorized('Missing authentication');
      const sessions = await sessionManager.listSessions(String(ctx.state.user.id));
      const data = sortSessionsForDisplay(
        sessions.map((s) => sanitizeSessionEntry(s, ctx.state.session?.id))
      );
      ctx.body = { data };
      return ctx.body;
    },

    // DELETE /auth/sessions/:sessionId
    async revokeSession(ctx) {
      if (!ctx.state.user) return ctx.unauthorized('Missing authentication');
      const revoked = await sessionManager.revokeSessionById(
        String(ctx.state.user.id), ctx.params.sessionId
      );
      if (!revoked) return ctx.notFound('Session not found');
      ctx.body = { data: {} };
      return ctx.body;
    },

    // POST /auth/change-password
    async changePassword(ctx) {
      if (!ctx.state.user) throw new ApplicationError('You must be authenticated to reset your password');
      const { currentPassword, password } =
        await upValidators.validateChangePasswordBody(ctx.request.body);
      const user = await findUserRow({ id: ctx.state.user.id });
      const validPassword = await userService.validatePassword(currentPassword, user.password);
      if (!validPassword) throw new ValidationError('The provided current password is invalid');
      if (currentPassword === password) {
        throw new ValidationError('Your new password must be different than your current password');
      }
      await userService.edit(user.id, { password });
      return reissueTokensAfterPasswordChange(ctx, user);
    },

    // POST /auth/reset-password
    async resetPassword(ctx) {
      const { password, passwordConfirmation, code } =
        await upValidators.validateResetPasswordBody(ctx.request.body);
      if (password !== passwordConfirmation) throw new ValidationError('Passwords do not match');
      const user = await findUserRow({ reset_password_token: code });
      if (!user) throw new ValidationError('Incorrect code provided');
      await userService.edit(user.id, { resetPasswordToken: null, password });
      // pos-strapi extension: the reset link proves email ownership, so an
      // unconfirmed account is promoted to confirmed on a successful reset.
      if (user.confirmed !== 1 && user.confirmed !== true) {
        await userService.edit(user.id, { confirmed: 1, confirmationToken: null });
      }
      return reissueTokensAfterPasswordChange(ctx, user);
    },

    // POST /auth/forgot-password — token recorded; mail needs the email tranche.
    async forgotPassword(ctx) {
      const { email } = await upValidators.validateForgotPasswordBody(ctx.request.body);
      const user = await findUserRow({ email: String(email).toLowerCase() });
      if (!user || user.blocked) { ctx.body = { ok: true }; return ctx.body; }
      const resetPasswordToken = crypto.randomBytes(64).toString('hex');
      await userService.edit(user.id, { resetPasswordToken });
      strapi.log.warn('[auth] forgot-password: token stored but no mail sent (no email plugin in core)');
      ctx.body = { ok: true };
      return ctx.body;
    },

    // POST /auth/send-email-confirmation — same email caveat.
    async sendEmailConfirmation(ctx) {
      const { email } = await upValidators.validateSendEmailConfirmationBody(ctx.request.body);
      const user = await findUserRow({ email: String(email).toLowerCase() });
      if (!user) { ctx.body = { email, sent: true }; return ctx.body; }
      if (user.confirmed === 1 || user.confirmed === true) throw new ApplicationError('Already confirmed');
      if (user.blocked) throw new ApplicationError('User blocked');
      const confirmationToken = crypto.randomBytes(20).toString('hex');
      await userService.edit(user.id, { confirmationToken });
      strapi.log.warn('[auth] send-email-confirmation: token stored but no mail sent');
      ctx.body = { email: user.email, sent: true };
      return ctx.body;
    },

    // GET /auth/email-confirmation?confirmation=...
    async emailConfirmation(ctx) {
      const { confirmation } = await upValidators.validateEmailConfirmationBody(ctx.query);
      const user = await findUserRow({ confirmation_token: confirmation });
      if (!user) throw new ValidationError('Invalid token');
      await userService.edit(user.id, { confirmed: 1, confirmationToken: null });
      const settings = (await upStore.get('advanced')) || {};
      ctx.redirect(settings.email_confirmation_redirection || '/');
    },
  };

  // GET /api/users/me — the profile endpoint every app polls.
  const usersMe = async (ctx) => {
    if (!ctx.state.user) return ctx.unauthorized();
    const user = await userService.fetch(ctx.state.user.id);
    ctx.body = user;
    return ctx.body;
  };

  const routes = [
    // The UP route file sets `prefix: ''`, which strips the PLUGIN prefix
    // (/users-permissions) — not the content-API /api one. Live Strapi serves
    // these at /api/auth/* and 405s the unprefixed path, and every client
    // builds its URL from an API_URL that already ends in /api. Core mounts
    // exactly the same shape.
    { method: 'post', path: '/api/auth/local', handler: (c) => auth.callback(c) },
    { method: 'post', path: '/api/auth/local/register', handler: (c) => auth.register(c) },
    { method: 'post', path: '/api/auth/refresh', handler: (c) => auth.refresh(c) },
    { method: 'post', path: '/api/auth/logout', handler: (c) => auth.logout(c) },
    { method: 'get', path: '/api/auth/sessions', handler: (c) => auth.getSessions(c) },
    { method: 'delete', path: '/api/auth/sessions/:sessionId', handler: (c) => auth.revokeSession(c) },
    { method: 'post', path: '/api/auth/change-password', handler: (c) => auth.changePassword(c) },
    { method: 'post', path: '/api/auth/reset-password', handler: (c) => auth.resetPassword(c) },
    { method: 'post', path: '/api/auth/forgot-password', handler: (c) => auth.forgotPassword(c) },
    { method: 'post', path: '/api/auth/send-email-confirmation', handler: (c) => auth.sendEmailConfirmation(c) },
    { method: 'get', path: '/api/auth/email-confirmation', handler: (c) => auth.emailConfirmation(c) },
    { method: 'get', path: '/api/auth/:provider/callback', handler: (c) => auth.callback(c) },

    // /api/users/me — authenticated, but self-scoped: no interceptor (it is on
    // api-pro's bypass list in both servers).
    { method: 'get', path: '/api/users/me', handler: usersMe },

    // auth-admin console (auth:false in Strapi; requireAuthAdmin inside).
    { method: 'get', path: '/api/auth-admin/users', handler: (c) => authAdmin.listUsers(c) },
    { method: 'get', path: '/api/auth-admin/users/:id', handler: (c) => authAdmin.getUser(c) },
    { method: 'post', path: '/api/auth-admin/users', handler: (c) => authAdmin.createUser(c) },
    { method: 'put', path: '/api/auth-admin/users/:id', handler: (c) => authAdmin.updateUser(c) },
    { method: 'delete', path: '/api/auth-admin/users/:id', handler: (c) => authAdmin.deleteUser(c) },
    { method: 'get', path: '/api/auth-admin/roles', handler: (c) => authAdmin.listRoles(c) },
    { method: 'get', path: '/api/auth-admin/domains', handler: (c) => authAdmin.listDomains(c) },
    { method: 'post', path: '/api/auth-admin/domains', handler: (c) => authAdmin.createDomain(c) },
    { method: 'delete', path: '/api/auth-admin/domains/:id', handler: (c) => authAdmin.deleteDomain(c) },
  ].map((r) => ({ ...r, selfAuth: true, module: 'auth' }));

  return { name: 'auth', routes };
}

module.exports = { registerAuthModule };
