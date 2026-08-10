'use strict';

// IMAP connection pool for the live-read mail gateway.
//
// One long-lived ImapFlow client per mail-account, because TLS+LOGIN costs
// 300–800ms and the client is stateful (selected mailbox). Three invariants:
//
//   1. IMAP is single-channel — commands on one connection MUST be serialized.
//      Every operation chains onto a per-account promise mutex.
//   2. Every operation is deadline-bounded. The SSR-side webApi has no request
//      timeout of its own (known repo trap), so a wedged IMAP command here
//      would hang a page forever. A timed-out or connection-broken client is
//      EVICTED — the next request reconnects fresh; we never reuse a
//      connection whose state is unknown.
//   3. Benign command failures (e.g. selecting a folder that doesn't exist —
//      the server answers NO and the connection stays healthy) do NOT evict.
//
// `withAccount(strapi, account, fn)` is the only entry point for pooled work.

const { ImapFlow } = require('imapflow');
const { decrypt } = require('./crypto');

const UID = 'api::mail-account.mail-account';

class MailError extends Error {
  constructor(message, { status = 502, code = 'mail_error' } = {}) {
    super(message);
    this.name = 'MailError';
    this.status = status;
    this.code = code;
  }
}

const intEnv = (key, fallback) => {
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const opTimeoutMs = () => intEnv('MAIL_IMAP_OP_TIMEOUT_MS', 15_000);
const connectTimeoutMs = () => intEnv('MAIL_CONNECT_TIMEOUT_MS', 10_000);
const idleMs = () => intEnv('MAIL_POOL_IDLE_MS', 300_000);
const poolMax = () => intEnv('MAIL_POOL_MAX', 20);

/** documentId → { client, chain, lastUsed } */
const pool = new Map();

function deadline(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new MailError(`${label} did not complete within ${ms}ms.`, { status: 504, code: 'mail_timeout' })),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function destroyClient(client) {
  if (!client) return;
  try {
    client.logout().catch(() => {});
  } catch {
    /* already dead */
  }
  try {
    client.close();
  } catch {
    /* already closed */
  }
}

function evictAccount(documentId) {
  const entry = pool.get(documentId);
  if (!entry) return;
  pool.delete(documentId);
  destroyClient(entry.client);
}

function evictOverflow(keepKey) {
  while (pool.size > poolMax()) {
    let oldestKey = null;
    let oldestAt = Infinity;
    for (const [key, entry] of pool) {
      if (key === keepKey) continue;
      if (entry.lastUsed < oldestAt) {
        oldestAt = entry.lastUsed;
        oldestKey = key;
      }
    }
    if (!oldestKey) return;
    evictAccount(oldestKey);
  }
}

// Idle sweep — unref'd so it never keeps the process alive.
setInterval(() => {
  const cutoff = Date.now() - idleMs();
  for (const [key, entry] of pool) {
    if (entry.lastUsed < cutoff) evictAccount(key);
  }
}, 60_000).unref();

/**
 * Decrypted credentials for an account. The `*_enc` columns are
 * `private: true` — invisible to the document API — so this reads the raw row
 * (the cmp-sending-identity `tokenFor` discipline).
 */
async function credsFor(strapi, account) {
  const row = await strapi.db.query(UID).findOne({
    where: { documentId: account.documentId },
    select: ['imap_password_enc', 'smtp_password_enc'],
  });
  if (!row?.imap_password_enc) {
    throw new MailError('This account has no stored IMAP password — edit it and re-enter the password.', {
      status: 409,
      code: 'mail_no_password',
    });
  }
  const imapPassword = decrypt(row.imap_password_enc);
  const smtpPassword = row.smtp_password_enc ? decrypt(row.smtp_password_enc) : imapPassword;
  return { imapPassword, smtpPassword };
}

function imapConfig(account, password) {
  return {
    host: account.imap_host,
    port: Number(account.imap_port) || 993,
    secure: account.imap_secure !== false,
    auth: { user: account.imap_username || account.email, pass: password },
    logger: false,
    connectionTimeout: connectTimeoutMs(),
    greetingTimeout: connectTimeoutMs(),
  };
}

/** Map raw imapflow / socket errors onto the MailError taxonomy. */
function normalizeError(e) {
  if (e instanceof MailError) return e;
  if (e?.authenticationFailed) {
    return new MailError('IMAP login failed — check the username and password.', {
      status: 502,
      code: 'mail_auth_failed',
    });
  }
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(e?.code)) {
    return new MailError(`Mail server unreachable: ${e.code}`, { status: 504, code: 'mail_unreachable' });
  }
  return new MailError(e?.responseText || e?.message || 'IMAP operation failed.', {
    status: 502,
    code: 'mail_imap_error',
  });
}

/**
 * Run `fn(client)` against the account's pooled IMAP connection.
 *
 * @param {object} strapi
 * @param {object} account   mail-account document (documentId + settings; no secrets)
 * @param {(client: import('imapflow').ImapFlow) => Promise<any>} fn
 * @param {object} [opts]
 * @param {string} [opts.label]      for timeout messages
 * @param {number} [opts.timeoutMs]  per-op deadline override (downloads need more)
 */
async function withAccount(strapi, account, fn, { label = 'IMAP operation', timeoutMs } = {}) {
  if (!account?.documentId) throw new MailError('Mail account not resolved.', { status: 500, code: 'mail_no_account' });
  if (account.is_active === false) {
    throw new MailError('This mail account is deactivated.', { status: 409, code: 'mail_account_inactive' });
  }

  const key = account.documentId;
  let entry = pool.get(key);
  if (!entry) {
    entry = { client: null, chain: Promise.resolve(), lastUsed: Date.now() };
    pool.set(key, entry);
    evictOverflow(key);
  }

  const run = async () => {
    entry.lastUsed = Date.now();

    if (!entry.client || !entry.client.usable) {
      destroyClient(entry.client);
      entry.client = null;
      const { imapPassword } = await credsFor(strapi, account);
      const client = new ImapFlow(imapConfig(account, imapPassword));
      // Without a listener, a socket error between commands crashes the
      // process ('error' on an EventEmitter). Errors during a command still
      // reject that command's promise.
      client.on('error', () => {
        const current = pool.get(key);
        if (current?.client === client) {
          pool.delete(key);
          try { client.close(); } catch { /* gone */ }
        }
      });
      await deadline(client.connect(), connectTimeoutMs() + 2_000, `IMAP connect (${account.imap_host})`);
      entry.client = client;
    }

    try {
      const result = await deadline(Promise.resolve(fn(entry.client)), timeoutMs || opTimeoutMs(), label);
      entry.lastUsed = Date.now();
      return result;
    } catch (e) {
      // Timed out or connection-broken → state unknown → evict. A healthy
      // connection that answered NO stays pooled.
      if (e?.code === 'mail_timeout' || !entry.client?.usable) {
        if (pool.get(key) === entry) evictAccount(key);
      }
      throw e;
    }
  };

  // Per-account mutex: chain regardless of the previous op's outcome.
  const p = entry.chain.then(run, run);
  entry.chain = p.then(() => undefined, () => undefined);

  try {
    return await p;
  } catch (e) {
    throw normalizeError(e);
  }
}

module.exports = { MailError, withAccount, credsFor, evictAccount, deadline, imapConfig, connectTimeoutMs, opTimeoutMs, intEnv };
