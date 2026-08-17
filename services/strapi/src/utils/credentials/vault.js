'use strict';

/**
 * Shared credential vault — AES-256-GCM for every integration secret this
 * codebase stores.
 *
 * Lifted verbatim (crypto-wise) from `utils/mail/crypto.js`, which has guarded
 * IMAP/SMTP passwords since the mail programme. That module still exists and
 * re-exports this one, so its five consumers in the mail cluster do not churn.
 *
 * ── Why this is shared now ────────────────────────────────────────────────
 * The mail pair was encrypted and four other credential tables were not —
 * social-account, marketplace-account, cmp-sending-identity and
 * social-relay-provider all stored `private: true` plaintext. That asymmetry was
 * a documented, deliberate call when the count was one table and the secret was
 * a campaign trust token. It stopped scaling: a Daraz seller token moves real
 * inventory and real money, and any mysqldump, replica, read-only analytics
 * grant or SQL injection anywhere in a 118-content-type surface yielded all of
 * them in the clear. See docs/todo/admin-console-program/02-integrations-and-credentials.md §1.
 *
 * ── Ciphertext format ─────────────────────────────────────────────────────
 *   v1:<iv_b64>:<tag_b64>:<ct_b64>
 * Random 12-byte IV per encryption; auth tag verified on decrypt. The version
 * prefix is the rotation seam — see "Key rotation" below.
 *
 * ── The invariant that must never be relaxed ──────────────────────────────
 * There is NO PLAINTEXT FALLBACK ON WRITE. A missing or malformed key throws
 * before anything is stored. If you ever find yourself adding a `catch` that
 * stores the plaintext instead, the correct move is to fail the request.
 *
 * `decryptIfNeeded()` is NOT a violation of that. It is the dual-read half of a
 * migration: while a table is half-converted, a row may legitimately hold either
 * a `v1:` blob or a legacy plaintext value, and both must be readable so the
 * backfill is re-runnable and a rollback loses nothing. It never writes.
 *
 * ── Key rotation (a procedure, not a comment) ─────────────────────────────
 * The `v1:` prefix exists so a key change is a sweep rather than a flag day:
 *   1. Generate the new key: `openssl rand -hex 32`.
 *   2. Set it as RUTBA_CRED_KEY_NEXT alongside the current RUTBA_CRED_KEY.
 *   3. Run the sweep: for every registered credential field, decrypt with the
 *      old key and re-encrypt with the new one, writing `v2:` blobs. Do it in
 *      batches, idempotently — `isEncrypted(value, 'v2')` tells you what is
 *      already done, so an interrupted sweep resumes.
 *   4. Promote: RUTBA_CRED_KEY = the new key, drop RUTBA_CRED_KEY_NEXT.
 *   5. Only then remove v1 support.
 * Steps 2–4 are deliberately not automated here — rotation is an operator-timed
 * act on live credentials, and the sweep must be able to stop halfway.
 *
 * Generate a key: openssl rand -hex 32
 */

const crypto = require('crypto');

const VERSION = 'v1';

/**
 * RUTBA_CRED_KEY is the general name; MAIL_CRED_KEY is the original and is
 * still honoured as the fallback. Both the LAN box and rutba.pk already have
 * MAIL_CRED_KEY set, and a rename that silently broke mail would be the worst
 * possible outcome of a security change — so existing deployments need no env
 * edit, and a deployment that sets only the new name works too.
 */
function rawKey() {
  return String(process.env.RUTBA_CRED_KEY || process.env.MAIL_CRED_KEY || '').trim();
}

/** True when a usable key is configured. Never throws — for boot checks. */
function hasKey() {
  return /^[0-9a-fA-F]{64}$/.test(rawKey());
}

function keyFromEnv() {
  const raw = rawKey();
  if (!raw) {
    throw new Error(
      'RUTBA_CRED_KEY (or MAIL_CRED_KEY) is not set — refusing to handle integration ' +
      'credentials without encryption. Generate one with `openssl rand -hex 32` ' +
      'and add it to the environment.',
    );
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('RUTBA_CRED_KEY (or MAIL_CRED_KEY) must be exactly 64 hex characters (32 bytes).');
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Report at boot rather than at first use. A server that starts happily and
 * then 500s the first time someone opens a credential form has already wasted
 * the operator's time.
 *
 * ── Why this does not throw by default ────────────────────────────────────
 * The spec asks for a boot failure "if any registered integration has
 * credential fields and the key is absent" — a condition that only becomes
 * evaluable once the integration registry (A3) exists. Until then an
 * unconditional throw is broader than intended, and measurably dangerous:
 * `.env.production` in this repo carries `POS_STRAPI__MAIL_CRED_KEY=` with an
 * EMPTY value, so a fatal assertion would stop Strapi booting on the next
 * production deploy — turning "mail credentials are unusable" into "nothing
 * runs at all".
 *
 * So: loud by default, fatal on request. Pass `fatal: true` once the key is
 * confirmed present everywhere it needs to be, or once the registry can say
 * that a credential-bearing integration is actually configured.
 */
function assertKeyConfigured({ env = process.env.NODE_ENV, logger, fatal = false } = {}) {
  if (hasKey()) return true;

  const message =
    'RUTBA_CRED_KEY (or MAIL_CRED_KEY) is missing or malformed — integration credentials ' +
    'cannot be read or written, and any attempt to do so will throw. ' +
    'Generate one with `openssl rand -hex 32`.';
  const isDev = !env || env === 'development' || env === 'test';

  if (fatal && !isDev) throw new Error(message);
  if (isDev) logger?.warn?.(`[vault] ${message} (development — continuing)`);
  else logger?.error?.(`[vault] ${message} Integration features WILL fail until this is set.`);
  return false;
}

function encrypt(plain) {
  const key = keyFromEnv();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

function decrypt(blob) {
  const key = keyFromEnv();
  const parts = String(blob || '').split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('Unrecognized credential ciphertext — expected `v1:iv:tag:ct`.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(parts[1], 'base64'));
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

const isEncrypted = (v) => typeof v === 'string' && v.startsWith(`${VERSION}:`);

/**
 * Idempotent encrypt: already-ciphertext passes through untouched.
 * Makes a backfill safe to re-run and safe to interrupt.
 * Empty/nullish passes through as-is — an absent secret stays absent rather
 * than becoming the ciphertext of "".
 */
function encryptIfNeeded(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isEncrypted(value)) return value;
  return encrypt(value);
}

/**
 * Dual read. Ciphertext is decrypted; a legacy plaintext value is returned
 * unchanged so a half-migrated table is a valid state. READ-ONLY — never use
 * this to decide whether it is acceptable to store something unencrypted.
 */
function decryptIfNeeded(value) {
  if (value === null || value === undefined || value === '') return value;
  return isEncrypted(value) ? decrypt(value) : value;
}

/** JSON-valued secrets (`extra_config`) — encrypt the serialized form. */
function encryptJsonIfNeeded(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isEncrypted(value)) return value;
  return encrypt(typeof value === 'string' ? value : JSON.stringify(value));
}

/** Inverse of encryptJsonIfNeeded; returns the parsed object. */
function decryptJsonIfNeeded(value) {
  const raw = decryptIfNeeded(value);
  if (raw === null || raw === undefined || raw === '') return raw;
  if (typeof raw !== 'string') return raw;
  try { return JSON.parse(raw); } catch { return raw; }
}

module.exports = {
  VERSION,
  encrypt,
  decrypt,
  isEncrypted,
  encryptIfNeeded,
  decryptIfNeeded,
  encryptJsonIfNeeded,
  decryptJsonIfNeeded,
  hasKey,
  assertKeyConfigured,
};
