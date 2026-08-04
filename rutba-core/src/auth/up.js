'use strict';

/**
 * Users-permissions subsystem for rutba-core (tranche 8 — auth).
 *
 * Reimplements the CONTRACT of Strapi 5.51's users-permissions plugin in
 * refresh mode against the same tables, because the reference implementation
 * is plugin/runtime code (not repo code) and cannot be zero-copy loaded:
 *
 *  - SessionManager semantics ported 1:1 from
 *    @strapi/core/dist/services/session-manager.js: refresh tokens are
 *    {userId, sessionId, type:'refresh', iat, exp} signed with NO timestamp
 *    claim (iat/exp come from the strapi_sessions row), access tokens are
 *    {userId:String, sessionId, type:'access'} with accessTokenLifespan.
 *    Rotation creates a CHILD session row and marks the parent 'rotated'
 *    (idempotent: a parent with a child re-issues the same child token).
 *    Both servers share JWT_SECRET and strapi_sessions, so tokens minted by
 *    either side validate on the other.
 *
 *  - The user service (add/edit/remove/fetch/validatePassword) writes the
 *    same rows Strapi writes: bcryptjs 10 rounds for password attributes,
 *    up_users + role/app_roles link rows.
 *
 *  - Plugin-store settings (grant / advanced / email) are read from
 *    strapi_core_store_settings — the SAME rows Strapi admin edits, so
 *    toggles like email_confirmation keep working across both servers.
 *
 * What IS zero-copy: the UP yup validators (loaded from the plugin dist),
 * bcryptjs and the @strapi/utils session-display helpers — all from
 * pos-strapi's node_modules so the exact same versions run.
 */

const path = require('path');
const crypto = require('crypto');
const { get: envGet } = require('../config/env');
const { getDb } = require('../db/connection');
const { generateDocumentId } = require('../documents/write');

const POS_ROOT = path.join(__dirname, '..', '..', '..', 'pos-strapi');
const posModule = (name) => require(path.join(POS_ROOT, 'node_modules', name));

const bcrypt = posModule('bcryptjs');
const jwt = require('jsonwebtoken');
const strapiUtils = posModule('@strapi/utils');
const { ApplicationError } = strapiUtils.errors;
const { emailService } = require('../platform/email');
const upValidators = require(path.join(
  POS_ROOT, 'node_modules', '@strapi', 'plugin-users-permissions',
  'dist', 'server', 'controllers', 'validation', 'auth.js'
)).__require();

const SESSIONS_TABLE = 'strapi_sessions';
const ORIGIN = 'users-permissions';

// ── config (mirrors pos-strapi/config/plugins.js users-permissions block) ──
function toSeconds(value, fallback) {
  const v = String(value ?? fallback).trim().toLowerCase();
  const match = v.match(/^(\d+)([smhd]?)$/);
  if (!match) return fallback;
  const n = Number(match[1]);
  const mult = { '': 1, s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  return n * mult;
}

function sessionConfig() {
  return {
    jwtSecret: envGet('JWT_SECRET'),
    algorithm: 'HS256',
    accessTokenLifespan: toSeconds(envGet('UP_ACCESS_TOKEN_LIFESPAN', '120m'), 7200),
    maxRefreshTokenLifespan: toSeconds(envGet('UP_MAX_REFRESH_TOKEN_LIFESPAN', '30d'), 2592000),
    idleRefreshTokenLifespan: toSeconds(envGet('UP_IDLE_REFRESH_TOKEN_LIFESPAN', '30d'), 2592000),
  };
}

// ── plugin store (strapi_core_store_settings) ──────────────────────────────
const upStore = {
  async get(key) {
    const row = await getDb()('strapi_core_store_settings')
      .where('key', `plugin_users-permissions_${key}`).first('value');
    if (!row || row.value == null) return null;
    return typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
  },
  async set(key, value) {
    const storeKey = `plugin_users-permissions_${key}`;
    const serialized = JSON.stringify(value);
    const existing = await getDb()('strapi_core_store_settings').where('key', storeKey).first('id');
    if (existing) {
      await getDb()('strapi_core_store_settings').where('id', existing.id).update({ value: serialized });
    } else {
      await getDb()('strapi_core_store_settings').insert({ key: storeKey, value: serialized, type: 'object' });
    }
  },
};

// ── session rows ───────────────────────────────────────────────────────────
function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    childId: row.child_id,
    deviceId: row.device_id,
    origin: row.origin,
    type: row.type,
    status: row.status,
    metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    expiresAt: row.expires_at,
    absoluteExpiresAt: row.absolute_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function insertSessionRow(values) {
  const now = new Date();
  const db = getDb();
  const [id] = await db(SESSIONS_TABLE).insert({
    document_id: generateDocumentId(),
    user_id: values.userId,
    session_id: values.sessionId,
    child_id: null,
    device_id: values.deviceId || null,
    origin: ORIGIN,
    type: values.type,
    status: values.status,
    metadata: values.metadata ? JSON.stringify(values.metadata) : null,
    expires_at: values.expiresAt,
    absolute_expires_at: values.absoluteExpiresAt,
    created_at: now,
    updated_at: now,
    published_at: now,
  });
  return rowToSession(await db(SESSIONS_TABLE).where('id', id).first());
}

const findBySessionId = async (sessionId) =>
  rowToSession(await getDb()(SESSIONS_TABLE).where({ session_id: sessionId }).first());

// Cleanup cadence matches the reference (every 50th issuance).
let cleanupCounter = 0;
async function maybeCleanupExpired() {
  cleanupCounter += 1;
  if (cleanupCounter >= 50) {
    cleanupCounter = 0;
    await getDb()(SESSIONS_TABLE).where('absolute_expires_at', '<', new Date()).del();
  }
}

const sessionManager = {
  generateSessionId: () => crypto.randomBytes(16).toString('hex'),

  async generateRefreshToken(userId, deviceId, options = {}) {
    await maybeCleanupExpired();
    const config = sessionConfig();
    const sessionId = this.generateSessionId();
    const now = Date.now();
    const expiresAt = new Date(now + config.idleRefreshTokenLifespan * 1000);
    const absoluteExpiresAt = new Date(now + config.maxRefreshTokenLifespan * 1000);
    const record = await insertSessionRow({
      userId, sessionId, deviceId,
      type: options.type || 'refresh', status: 'active',
      metadata: options.metadata || null,
      expiresAt, absoluteExpiresAt,
    });
    const payload = {
      userId, sessionId, type: 'refresh',
      iat: Math.floor(new Date(record.createdAt).getTime() / 1000),
      exp: Math.floor(new Date(record.expiresAt).getTime() / 1000),
    };
    const token = jwt.sign(payload, config.jwtSecret, { algorithm: config.algorithm, noTimestamp: true });
    return { token, sessionId, absoluteExpiresAt: absoluteExpiresAt.toISOString() };
  },

  async validateRefreshToken(token) {
    const config = sessionConfig();
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, { algorithms: [config.algorithm] });
    } catch {
      return { isValid: false };
    }
    if (payload.type !== 'refresh') return { isValid: false };
    const session = await findBySessionId(payload.sessionId);
    if (!session) return { isValid: false };
    const now = new Date();
    if (new Date(session.expiresAt) <= now) return { isValid: false };
    if (session.absoluteExpiresAt && new Date(session.absoluteExpiresAt) <= now) return { isValid: false };
    if (session.status !== 'active') return { isValid: false };
    if (session.userId !== payload.userId) return { isValid: false };
    return { isValid: true, userId: payload.userId, sessionId: payload.sessionId };
  },

  async generateAccessToken(refreshToken) {
    const validation = await this.validateRefreshToken(refreshToken);
    if (!validation.isValid) return { error: 'invalid_refresh_token' };
    const config = sessionConfig();
    const token = jwt.sign(
      { userId: String(validation.userId), sessionId: validation.sessionId, type: 'access' },
      config.jwtSecret,
      { algorithm: config.algorithm, expiresIn: config.accessTokenLifespan }
    );
    return { token };
  },

  async rotateRefreshToken(refreshToken) {
    const config = sessionConfig();
    let payload;
    try {
      payload = jwt.verify(refreshToken, config.jwtSecret, { algorithms: [config.algorithm] });
    } catch {
      return { error: 'invalid_refresh_token' };
    }
    if (!payload || payload.type !== 'refresh') return { error: 'invalid_refresh_token' };
    const current = await findBySessionId(payload.sessionId);
    if (!current) return { error: 'invalid_refresh_token' };

    const signChild = (child) => jwt.sign({
      userId: child.userId, sessionId: child.sessionId, type: 'refresh',
      iat: Math.floor(new Date(child.createdAt).getTime() / 1000),
      exp: Math.floor(new Date(child.expiresAt).getTime() / 1000),
    }, config.jwtSecret, { algorithm: config.algorithm, noTimestamp: true });

    // Idempotent rotation: a parent that already rotated re-issues its child.
    if (current.childId) {
      const child = await findBySessionId(current.childId);
      if (child) {
        return {
          token: signChild(child),
          sessionId: child.sessionId,
          absoluteExpiresAt: child.absoluteExpiresAt
            ? new Date(child.absoluteExpiresAt).toISOString() : new Date(0).toISOString(),
          type: child.type || 'refresh',
        };
      }
    }

    const now = Date.now();
    const idleLifespan = config.idleRefreshTokenLifespan;
    if (current.createdAt && now - new Date(current.createdAt).getTime() > idleLifespan * 1000) {
      return { error: 'idle_window_elapsed' };
    }
    const absolute = current.absoluteExpiresAt ? new Date(current.absoluteExpiresAt).getTime() : now;
    if (absolute <= now) return { error: 'max_window_elapsed' };

    const childSessionId = this.generateSessionId();
    const childRecord = await insertSessionRow({
      userId: current.userId, sessionId: childSessionId, deviceId: current.deviceId,
      type: current.type || 'refresh', status: 'active',
      metadata: current.metadata || null,
      expiresAt: new Date(now + idleLifespan * 1000),
      absoluteExpiresAt: current.absoluteExpiresAt || new Date(absolute),
    });
    await getDb()(SESSIONS_TABLE).where({ session_id: current.sessionId })
      .update({ status: 'rotated', child_id: childSessionId, updated_at: new Date() });
    return {
      token: signChild(childRecord),
      sessionId: childSessionId,
      absoluteExpiresAt: new Date(childRecord.absoluteExpiresAt).toISOString(),
      type: childRecord.type,
    };
  },

  async invalidateRefreshToken(userId, deviceId) {
    await getDb()(SESSIONS_TABLE).where({
      user_id: userId, origin: ORIGIN,
      ...(deviceId ? { device_id: deviceId } : {}),
    }).del();
  },

  async listSessions(userId) {
    const rows = await getDb()(SESSIONS_TABLE)
      .where({ user_id: userId, origin: ORIGIN, status: 'active' })
      .orderBy('created_at', 'desc');
    return rows.map(rowToSession);
  },

  async revokeSessionById(userId, sessionId) {
    const session = await findBySessionId(sessionId);
    if (!session || session.userId !== userId || session.origin !== ORIGIN) return false;
    await getDb()(SESSIONS_TABLE).where({ session_id: sessionId }).del();
    return true;
  },
};

// ── user rows ──────────────────────────────────────────────────────────────
const PRIVATE_USER_COLUMNS = new Set([
  'password', 'reset_password_token', 'confirmation_token',
  'created_by_id', 'updated_by_id',
]);

const snakeToCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

/** Serialize an up_users row the way Strapi's content API sanitizes a user. */
function sanitizeUserRow(row) {
  if (!row) return null;
  const out = {};
  for (const [col, val] of Object.entries(row)) {
    if (PRIVATE_USER_COLUMNS.has(col)) continue;
    if (col === 'document_id') { out.documentId = val; continue; }
    out[snakeToCamel(col)] = val;
  }
  if ('confirmed' in out) out.confirmed = out.confirmed == null ? null : Boolean(out.confirmed);
  if ('blocked' in out) out.blocked = out.blocked == null ? null : Boolean(out.blocked);
  return out;
}

// ── transactional mail (reset password / confirm account) ──────────────────
//
// Reproduces @strapi/plugin-users-permissions' `forgotPassword` controller and
// `sendConfirmationEmail` service. The bodies come from the SAME core-store row
// Strapi admin edits (plugin_users-permissions_email), so whichever server
// sends, the customer gets the same mail.

const lodash = posModule('lodash');

/**
 * The plugin's `users-permissions.template` service: lodash interpolation
 * restricted to the variable names actually passed, so an unrelated `<%= %>`
 * in an admin-edited template raises instead of executing.
 */
function renderUpTemplate(layout, data) {
  const interpolate = strapiUtils.template.createStrictInterpolationRegExp(
    strapiUtils.objects.keysDeep(data), 'g'
  );
  try {
    return lodash.template(layout, { interpolate, evaluate: false, escape: false })(data);
  } catch {
    throw new ApplicationError('Invalid email template');
  }
}

/** `from` assembly, copied from the plugin (name+email → "Name <email>"). */
function templateFrom(options) {
  const from = options.from || {};
  return from.email || from.name ? `${from.name} <${from.email}>` : undefined;
}

/** The public origin core builds links against (pos-strapi: server.absoluteUrl). */
function publicUrl() {
  return String(envGet('PUBLIC_URL', '') || '').replace(/\/+$/, '');
}

const upEmail = {
  async sendResetPassword(userRow, resetPasswordToken) {
    const [emailSettings, advanced] = await Promise.all([upStore.get('email'), upStore.get('advanced')]);
    const options = (emailSettings || {}).reset_password?.options || {};
    const vars = {
      URL: advanced?.email_reset_password || '',
      SERVER_URL: publicUrl(),
      ADMIN_URL: publicUrl(),
      USER: sanitizeUserRow(userRow),
      TOKEN: resetPasswordToken,
    };
    const body = renderUpTemplate(options.message, vars);
    await emailService.send({
      to: userRow.email,
      from: templateFrom(options),
      replyTo: options.response_email,
      subject: renderUpTemplate(options.object, { USER: vars.USER }),
      text: body,
      html: body,
    });
  },

  async sendConfirmation(userRow, confirmationToken) {
    const emailSettings = await upStore.get('email');
    const options = (emailSettings || {}).email_confirmation?.options || {};
    const vars = {
      // pos-strapi: urlJoin(server.absoluteUrl, api.rest.prefix, '/auth/email-confirmation').
      // config/api.js sets no rest.prefix, so Strapi's default /api applies.
      URL: `${publicUrl()}/api/auth/email-confirmation`,
      SERVER_URL: publicUrl(),
      ADMIN_URL: publicUrl(),
      USER: sanitizeUserRow(userRow),
      CODE: confirmationToken,
    };
    const body = renderUpTemplate(options.message, vars);
    await emailService.send({
      to: userRow.email,
      from: templateFrom(options),
      replyTo: options.response_email,
      subject: renderUpTemplate(options.object, { USER: vars.USER }),
      text: body,
      html: body,
    });
  },
};

async function findUserRow(where) {
  return getDb()('up_users').where(where).first();
}

async function findUserByIdentifier(identifier) {
  return getDb()('up_users')
    .where({ provider: 'local' })
    .where(function () {
      this.where('email', String(identifier).toLowerCase()).orWhere('username', identifier);
    })
    .first();
}

async function setUserRole(userId, roleId) {
  const db = getDb();
  await db('up_users_role_lnk').where({ user_id: userId }).del();
  if (roleId) await db('up_users_role_lnk').insert({ user_id: userId, role_id: roleId });
}

async function setUserAppRoles(userId, roleIds) {
  const db = getDb();
  await db('up_users_app_roles_lnk').where({ user_id: userId }).del();
  for (const roleId of roleIds || []) {
    await db('up_users_app_roles_lnk').insert({ user_id: userId, app_role_id: roleId });
  }
}

/** Scalar user attribute → column writes (relations handled separately). */
function userScalarColumns(values) {
  const cols = {};
  const map = {
    username: 'username', email: 'email', provider: 'provider',
    password: 'password', confirmed: 'confirmed', blocked: 'blocked',
    displayName: 'display_name',
    resetPasswordToken: 'reset_password_token', confirmationToken: 'confirmation_token',
  };
  for (const [attr, col] of Object.entries(map)) {
    if (attr in values && values[attr] !== undefined) cols[col] = values[attr];
  }
  return cols;
}

const userService = {
  validatePassword: (password, hash) => bcrypt.compare(password, hash),
  hashPassword: (password) => bcrypt.hash(password, 10),

  async add(values) {
    const db = getDb();
    const now = new Date();
    const cols = userScalarColumns(values);
    if (cols.password) cols.password = await this.hashPassword(cols.password);
    const [id] = await db('up_users').insert({
      document_id: generateDocumentId(),
      provider: 'local',
      ...cols,
      created_at: now, updated_at: now, published_at: now,
    });
    if (values.role) await setUserRole(id, Number(values.role.id || values.role));
    if (Array.isArray(values.app_roles)) await setUserAppRoles(id, values.app_roles.map(Number));
    return sanitizeUserRow(await findUserRow({ id }));
  },

  async edit(id, values) {
    const db = getDb();
    const cols = userScalarColumns(values);
    if (cols.password) cols.password = await this.hashPassword(cols.password);
    if (Object.keys(cols).length) {
      await db('up_users').where('id', id).update({ ...cols, updated_at: new Date() });
    }
    if (values.role !== undefined && values.role !== null) {
      await setUserRole(id, Number(values.role.id || values.role));
    }
    if (Array.isArray(values.app_roles)) await setUserAppRoles(id, values.app_roles.map(Number));
    return sanitizeUserRow(await findUserRow({ id }));
  },

  async remove(params) {
    const db = getDb();
    if (params.id) {
      await sessionManager.invalidateRefreshToken(String(params.id));
    }
    const row = await findUserRow(params);
    if (row) await db('up_users').where('id', row.id).del();
    return sanitizeUserRow(row);
  },

  async fetch(id) {
    return sanitizeUserRow(await findUserRow({ id }));
  },

  async fetchAuthenticatedUser(id) {
    const row = await findUserRow({ id });
    if (!row) return null;
    const user = sanitizeUserRow(row);
    const role = await getDb()('up_users_role_lnk as l')
      .join('up_roles as r', 'r.id', 'l.role_id')
      .where('l.user_id', row.id)
      .first('r.id', 'r.name', 'r.type', 'r.description');
    if (role) user.role = role;
    return user;
  },
};

module.exports = {
  sessionManager,
  upStore,
  upEmail,
  userService,
  upValidators,
  sanitizeUserRow,
  findUserRow,
  findUserByIdentifier,
  sessionConfig,
  strapiSessionHelpers: {
    buildSessionMetadata: strapiUtils.buildSessionMetadata,
    sanitizeSessionEntry: strapiUtils.sanitizeSessionEntry,
    sortSessionsForDisplay: strapiUtils.sortSessionsForDisplay,
  },
};
