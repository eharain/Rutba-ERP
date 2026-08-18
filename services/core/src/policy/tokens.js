'use strict';

/**
 * API tokens, minted by core.
 *
 * Core has always been able to *verify* these (src/http/auth.js): the
 * marketplace worker, content-sync and inter-instance sync all authenticate
 * server-to-server with one. Issuing a new one still meant opening the Strapi
 * admin panel — which is a problem twice over. It is one of the last reasons to
 * keep that panel alive, and tenant provisioning (ERP 2.0 P5) has to mint a
 * service token per tenant with no human in the loop at all.
 *
 * The formats below are Strapi's, reproduced exactly, so a token minted here
 * works in both backends during the coexistence window and keeps working after
 * services/strapi is gone:
 *
 *   accessKey     256 hex chars (crypto.randomBytes(128)) — shown once, never stored
 *   access_key    HMAC-SHA512(API_TOKEN_SALT, accessKey), hex — what is stored
 *   encrypted_key AES-256-GCM under sha256(ENCRYPTION_KEY), `v1:iv:ct:tag`,
 *                 so the panel (and `reveal` below) can show the key again
 *
 * Verified against @strapi/admin's api-token and encryption services rather
 * than inferred: a token whose hash recipe is a guess authenticates nowhere,
 * and one whose `encrypted_key` is malformed breaks the admin list view for
 * every OTHER token too.
 *
 * Custom-scope tokens (`type: 'custom'`, with rows in
 * strapi_api_token_permissions) are deliberately not supported — the estate has
 * never used one, and api-pro, not the token's action list, is what actually
 * scopes access here.
 */

const crypto = require('crypto');
const { get } = require('../config/env');
const { getDb } = require('../db/connection');
const { generateDocumentId } = require('../documents/write');

const TABLE = 'strapi_api_tokens';
const TYPES = new Set(['read-only', 'full-access']);
const ENCRYPTION_VERSION = 'v1';
const IV_LENGTH = 16;

function requireSecret(name) {
  const value = get(name, '');
  if (!value) throw new Error(`[token] ${name} is not set — cannot mint a token that anything will accept`);
  return value;
}

/** The stored form of an access key. Must match @strapi/admin's `hash`. */
function hashAccessKey(accessKey) {
  return crypto.createHmac('sha512', requireSecret('API_TOKEN_SALT')).update(accessKey).digest('hex');
}

function encryptionKey() {
  return crypto.createHash('sha256').update(requireSecret('ENCRYPTION_KEY')).digest();
}

function encryptAccessKey(accessKey) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = cipher.update(accessKey, 'utf8', 'hex') + cipher.final('hex');
  return `${ENCRYPTION_VERSION}:${iv.toString('hex')}:${encrypted}:${cipher.getAuthTag().toString('hex')}`;
}

function decryptAccessKey(stored) {
  if (!stored) return null;
  const [version, ivHex, encryptedHex, tagHex] = String(stored).split(':');
  if (version !== ENCRYPTION_VERSION) throw new Error(`[token] unsupported encryption version: ${version}`);
  if (!ivHex || !encryptedHex || !tagHex) throw new Error('[token] malformed encrypted key');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  try {
    return decipher.update(Buffer.from(encryptedHex, 'hex'), undefined, 'utf8') + decipher.final('utf8');
  } catch {
    // Wrong ENCRYPTION_KEY, or the row was written under a different one.
    return null;
  }
}

/** Row → the shape it is safe to print. */
function publicView(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type,
    kind: row.kind,
    lifespan: row.lifespan ? Number(row.lifespan) : null,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
    revealable: Boolean(row.encrypted_key),
  };
}

async function list() {
  const rows = await getDb()(TABLE).orderBy('id', 'asc');
  return rows.map(publicView);
}

async function findOne(idOrName) {
  const db = getDb();
  const byId = /^\d+$/.test(String(idOrName))
    ? await db(TABLE).where('id', Number(idOrName)).first()
    : null;
  return byId || db(TABLE).where('name', idOrName).first();
}

/**
 * Mint a token. The plaintext access key is returned once and never stored in
 * recoverable form anywhere but `encrypted_key`.
 *
 * @param {object} opts
 * @param {string} opts.name          unique, human-readable
 * @param {string} [opts.description]
 * @param {'read-only'|'full-access'} [opts.type]
 * @param {number|null} [opts.lifespanDays]  null = never expires (Strapi's default)
 */
async function mint({ name, description = '', type = 'full-access', lifespanDays = null } = {}) {
  if (!name || !String(name).trim()) throw new Error('[token] a name is required');
  if (!TYPES.has(type)) throw new Error(`[token] type must be one of ${[...TYPES].join(', ')}`);
  if (lifespanDays !== null && !(Number(lifespanDays) > 0)) {
    throw new Error('[token] lifespanDays must be a positive number of days, or null for no expiry');
  }

  const db = getDb();
  if (await db(TABLE).where('name', name).first('id')) {
    throw new Error(`[token] a token named '${name}' already exists — revoke it first, or pick another name`);
  }

  const accessKey = crypto.randomBytes(128).toString('hex');
  const now = new Date();
  const lifespan = lifespanDays === null ? null : Math.round(Number(lifespanDays) * 24 * 60 * 60 * 1000);

  const row = {
    document_id: generateDocumentId(),
    name,
    description,
    type,
    // 'content-api' is what Strapi 5 stamps on tokens issued for the content
    // API; 'admin' tokens are a different auth path core does not serve.
    kind: 'content-api',
    access_key: hashAccessKey(accessKey),
    encrypted_key: encryptAccessKey(accessKey),
    lifespan,
    expires_at: lifespan ? new Date(now.getTime() + lifespan) : null,
    created_at: now,
    updated_at: now,
    published_at: now,
  };

  const [id] = await db(TABLE).insert(row);
  return { token: publicView({ ...row, id }), accessKey };
}

/** The plaintext key of an existing token, if it was minted with an encrypted copy. */
async function reveal(idOrName) {
  const row = await findOne(idOrName);
  if (!row) throw new Error(`[token] no token matching '${idOrName}'`);
  if (!row.encrypted_key) {
    throw new Error(`[token] '${row.name}' has no stored encrypted key — it predates encryption, so it cannot be revealed`);
  }
  const accessKey = decryptAccessKey(row.encrypted_key);
  if (!accessKey) throw new Error(`[token] '${row.name}' could not be decrypted — ENCRYPTION_KEY has changed since it was minted`);
  return { token: publicView(row), accessKey };
}

async function revoke(idOrName) {
  const db = getDb();
  const row = await findOne(idOrName);
  if (!row) throw new Error(`[token] no token matching '${idOrName}'`);
  // Permission rows exist only for `custom` tokens, which core never mints —
  // cleared anyway so a hand-made custom token leaves nothing behind.
  await db('strapi_api_token_permissions_token_lnk').where('api_token_id', row.id).del().catch(() => {});
  await db(TABLE).where('id', row.id).del();
  return publicView(row);
}

module.exports = {
  mint,
  list,
  reveal,
  revoke,
  findOne,
  hashAccessKey,
  encryptAccessKey,
  decryptAccessKey,
  TABLE,
  TYPES,
};
