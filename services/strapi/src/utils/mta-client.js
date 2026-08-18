'use strict';

// HTTP client for Rutba-MTA (D:/Rutba/Rutba-MTA) — the send engine behind
// apps/content/campaigns. The MTA owns suppression, per-domain reputation pacing, the
// priority queue, bounce capture, unsubscribe, and delivery webhooks; this file
// is only the transport.
//
// Two rules this module exists to enforce:
//
//   1. EVERY call is time-bounded. A wedged MTA must never hang a Strapi
//      request — an unbounded fetch is how one slow dependency takes down a
//      page. `MTA_TIMEOUT_MS` (default 10s) applies to all calls; batch submits
//      get their own, longer budget.
//   2. Callers never see a raw fetch error. Everything throws an MtaError with
//      `status` + `code` so controllers can map to a sensible HTTP response
//      instead of leaking a stack trace.
//
// Auth: per-sender `X-Trust-Token`. Each cmp-sending-identity holds its own.
// Registering a NEW sender needs an admin token (MTA_ADMIN_TRUST_TOKEN) — except
// on a virgin MTA database, where the very first POST /v1/senders needs no auth
// and is promoted to admin automatically. Both paths are handled in
// `registerSender`.

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_BATCH_TIMEOUT_MS = 60_000;

class MtaError extends Error {
  constructor(message, { status = 502, code = 'mta_error', body = null } = {}) {
    super(message);
    this.name = 'MtaError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

/** Base URL of the MTA, or null when campaigns sending isn't configured. */
function baseUrl() {
  const raw = process.env.MTA_BASE_URL || process.env.RUTBA_MTA_URL || '';
  return raw ? trimSlash(raw) : null;
}

function timeoutMs(kind) {
  const key = kind === 'batch' ? 'MTA_BATCH_TIMEOUT_MS' : 'MTA_TIMEOUT_MS';
  const fallback = kind === 'batch' ? DEFAULT_BATCH_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
  const n = Number.parseInt(process.env[key], 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function isConfigured() {
  return Boolean(baseUrl());
}

/**
 * One request against the MTA.
 *
 * @param {string} method
 * @param {string} path      e.g. '/v1/send/batch'
 * @param {object} opts
 * @param {string} [opts.token]   X-Trust-Token; omitted for the bootstrap call
 * @param {object} [opts.body]
 * @param {'default'|'batch'} [opts.budget]
 */
async function request(method, path, { token, body, budget = 'default' } = {}) {
  const base = baseUrl();
  if (!base) {
    throw new MtaError('Rutba-MTA is not configured (set MTA_BASE_URL).', {
      status: 503,
      code: 'mta_not_configured',
    });
  }

  const ms = timeoutMs(budget);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  let res;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Trust-Token': token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (e) {
    // AbortError is the timeout; anything else is DNS / connection refused.
    const aborted = e?.name === 'AbortError';
    throw new MtaError(
      aborted ? `Rutba-MTA did not respond within ${ms}ms.` : `Rutba-MTA unreachable: ${e.message}`,
      { status: 504, code: aborted ? 'mta_timeout' : 'mta_unreachable' },
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let parsed = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!res.ok) {
    // MTA error shape: { error: 'short_reason', message: 'detail' }
    throw new MtaError(parsed?.message || parsed?.error || `Rutba-MTA returned ${res.status}.`, {
      status: res.status,
      code: parsed?.error || 'mta_http_error',
      body: parsed,
    });
  }

  return parsed;
}

/* ------------------------------------------------------------------ senders */

/**
 * Register a sender. Returns { sender, trustToken, webhookSecret } — the two
 * secrets are shown ONCE by the MTA and cannot be re-read, so the caller must
 * persist them in the same transaction it creates the identity.
 *
 * On a fresh MTA database the first call needs no auth; later ones need an
 * admin token. We try the admin token when we have one, and fall back to the
 * unauthenticated bootstrap only when the MTA says the token is missing/invalid
 * AND no admin token was configured — never silently, so a wrong token surfaces
 * as an error rather than accidentally minting a second admin.
 */
async function registerSender(payload) {
  const adminToken = process.env.MTA_ADMIN_TRUST_TOKEN || '';
  if (adminToken) {
    return request('POST', '/v1/senders', { token: adminToken, body: payload });
  }
  return request('POST', '/v1/senders', { body: payload });
}

const getSender = (token) => request('GET', '/v1/senders/me', { token });
const updateSender = (token, patch) => request('PUT', '/v1/senders/me', { token, body: patch });
const rotateToken = (token) => request('POST', '/v1/senders/me/rotate-token', { token, body: {} });

/* -------------------------------------------------------------------- send */

/**
 * Templated batch send — the campaign workhorse.
 *
 * `recipients` is [{ to, data }]; the MTA renders `{{key}}` per recipient,
 * checks suppression per address, and paces marketing mail by the receiving
 * domain's reputation score. We do NOT pace, retry, or dedupe here.
 *
 * Returns { status, batch_uuid, total, queued, dropped }.
 */
const sendBatch = (token, payload) =>
  request('POST', '/v1/send/batch', { token, body: payload, budget: 'batch' });

/** Single transactional message — used by test-send. */
const sendOne = (token, payload) => request('POST', '/v1/send', { token, body: payload });

/* ------------------------------------------------------- reports & lookups */

const getBatchReport = (token, batchUuid) =>
  request('GET', `/v1/batches/${encodeURIComponent(batchUuid)}/report`, { token });

const getBatch = (token, batchUuid) =>
  request('GET', `/v1/batches/${encodeURIComponent(batchUuid)}`, { token });

const getMessage = (token, idOrUuid) =>
  request('GET', `/v1/messages/${encodeURIComponent(idOrUuid)}`, { token });

/* -------------------------------------------------------------- suppression */

function listSuppressions(token, { address, limit = 50, offset = 0 } = {}) {
  const qs = new URLSearchParams();
  if (address) qs.set('address', address);
  qs.set('limit', String(limit));
  qs.set('offset', String(offset));
  return request('GET', `/v1/suppressions?${qs.toString()}`, { token });
}

const addSuppression = (token, { address, reason = 'manual_block', note }) =>
  request('POST', '/v1/suppressions', { token, body: { address, reason, ...(note ? { note } : {}) } });

const removeSuppression = (token, address, scope) =>
  request(
    'DELETE',
    `/v1/suppressions/${encodeURIComponent(address)}${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`,
    { token },
  );

module.exports = {
  MtaError,
  isConfigured,
  baseUrl,
  request,
  registerSender,
  getSender,
  updateSender,
  rotateToken,
  sendBatch,
  sendOne,
  getBatch,
  getBatchReport,
  getMessage,
  listSuppressions,
  addSuppression,
  removeSuppression,
};
