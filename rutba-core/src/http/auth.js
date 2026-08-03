'use strict';

/**
 * Authentication middleware: users-permissions JWT (verify-only — pos-strapi
 * stays the issuer until Phase 7) and Strapi admin API tokens (used by the
 * marketplace worker and inter-instance sync; api-pro skips policy
 * enforcement for token requests, matching pos-strapi behavior).
 */

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { get } = require('../config/env');
const { getDb } = require('../db/connection');
const { documents } = require('../documents');

function unauthorized(ctx, message) {
  ctx.status = 401;
  ctx.body = { data: null, error: { status: 401, name: 'UnauthorizedError', message } };
}

/** Strapi hashes API token access keys with sha512; both known recipes checked. */
function hashCandidates(accessKey, salt) {
  const out = [crypto.createHash('sha512').update(accessKey).digest('hex')];
  if (salt) {
    out.push(crypto.createHmac('sha512', salt).update(accessKey).digest('hex'));
    out.push(crypto.createHash('sha512').update(`${salt}${accessKey}`).digest('hex'));
  }
  return out;
}

async function resolveApiToken(rawToken) {
  const db = getDb();
  const salt = get('API_TOKEN_SALT', '');
  const hashes = hashCandidates(rawToken, salt);
  const row = await db('strapi_api_tokens').whereIn('access_key', hashes).first();
  if (!row) return null;
  if (row.expires_at && new Date(row.expires_at) < new Date()) return null;
  return { id: row.id, name: row.name, type: row.type };
}

/**
 * `optional: true` builds the auth used on module selfAuth routes — parity
 * with Strapi's `auth: false`, where the framework never rejects a request:
 * a valid token still populates ctx.state.user (so the controllers'
 * ensureUser short-circuits), but a missing OR invalid token falls through
 * anonymously and the controller's own gate decides. A storefront holding an
 * expired JWT must still be served the public CMS reads.
 */
function createAuthMiddleware({ isBypassed, optional = false } = {}) {
  const jwtSecret = get('JWT_SECRET');
  const reject = (ctx, next, message) =>
    optional ? next() : unauthorized(ctx, message);
  return async function auth(ctx, next) {
    const header = ctx.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      // Bypass-listed paths (public web routes etc.) run unauthenticated —
      // parity with pos-strapi where those routes are auth: false.
      if (isBypassed && isBypassed(ctx.path)) return next();
      return reject(ctx, next, 'Missing or invalid credentials');
    }

    // 1. users-permissions JWT — two shapes:
    //    legacy {id} and session-based {userId, sessionId, type:'access'}
    //    (Strapi 5.51 jwtManagement:'refresh', what the frontends actually send).
    if (jwtSecret) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        let userId = null;
        if (payload && payload.type === 'access' && payload.userId && payload.sessionId) {
          const db = getDb();
          // A ROTATED session still authenticates its already-issued access
          // tokens: refresh mints the child and marks the parent 'rotated', so
          // requests in flight during a rotation legitimately name the parent.
          // (Strapi checks no session row at all here — it trusts the access
          // token until it expires. Core stays stricter: a session that was
          // deleted by logout/revoke, or has passed its expiry, stops
          // authenticating immediately instead of lingering for the token's
          // full lifespan.)
          const session = await db('strapi_sessions')
            .where({ session_id: payload.sessionId, origin: 'users-permissions' })
            .whereIn('status', ['active', 'rotated'])
            .first('user_id', 'absolute_expires_at');
          if (session && String(session.user_id) === String(payload.userId)
              && (!session.absolute_expires_at
                  || new Date(session.absolute_expires_at) > new Date())) {
            userId = payload.userId;
          }
        } else if (payload && payload.id) {
          userId = payload.id;
        }
        if (userId !== null) {
          const user = await documents('plugin::users-permissions.user').findFirst({
            filters: { id: { $eq: userId } },
          });
          if (!user || user.blocked || user.confirmed === false) {
            return reject(ctx, next, 'User blocked or unconfirmed');
          }
          ctx.state.user = user;
          return next();
        }
      } catch {
        // fall through to API-token check
      }
    }

    // 2. admin API token (no ctx.state.user → api-pro interceptor skips)
    const apiToken = await resolveApiToken(token);
    if (apiToken) {
      ctx.state.apiToken = apiToken;
      // Strapi shape: a content-API token authenticates via the
      // 'content-api-token' strategy and sets ctx.state.auth (never .user).
      // Ported worker gates (isServiceToken) read exactly this.
      ctx.state.auth = { strategy: { name: 'content-api-token' }, credentials: apiToken };
      return next();
    }

    return reject(ctx, next, 'Missing or invalid credentials');
  };
}

module.exports = { createAuthMiddleware };
