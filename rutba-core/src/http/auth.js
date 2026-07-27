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

function createAuthMiddleware({ isBypassed } = {}) {
  const jwtSecret = get('JWT_SECRET');
  return async function auth(ctx, next) {
    const header = ctx.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) {
      // Bypass-listed paths (public web routes etc.) run unauthenticated —
      // parity with pos-strapi where those routes are auth: false.
      if (isBypassed && isBypassed(ctx.path)) return next();
      return unauthorized(ctx, 'Missing or invalid credentials');
    }

    // 1. users-permissions JWT
    if (jwtSecret) {
      try {
        const payload = jwt.verify(token, jwtSecret);
        if (payload && payload.id) {
          const user = await documents('plugin::users-permissions.user').findFirst({
            filters: { id: { $eq: payload.id } },
          });
          if (!user || user.blocked || user.confirmed === false) {
            return unauthorized(ctx, 'User blocked or unconfirmed');
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
      return next();
    }

    return unauthorized(ctx, 'Missing or invalid credentials');
  };
}

module.exports = { createAuthMiddleware };
