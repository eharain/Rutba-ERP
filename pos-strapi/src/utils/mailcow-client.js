'use strict';

// HTTP client for the mailcow admin API (M5 — docs/todo/email-program/06).
// mta-client discipline: every call time-bounded, callers never see a raw
// fetch error, and nothing here is ever logged with its payload (payloads
// carry mailbox passwords).
//
// Auth: X-API-Key (a read-write admin key). Mailcow's mutation responses are
// arrays of { type: 'success'|'danger', msg: [...] } — a 'danger' entry is an
// error even under HTTP 200, so normalize() throws on it.
//
// Server config: every operation takes an optional trailing `cfg`
// ({ baseUrl, apiKey, timeoutMs }) so DB-registered mail servers (the
// api::mail-server registry managed from rutba-users) can be targeted;
// omitting it falls back to the MAILCOW_* env — the original single-server
// wiring — so existing callers are unchanged.

const DEFAULT_TIMEOUT_MS = 10_000;

class MailcowError extends Error {
  constructor(message, { status = 502, code = 'mailcow_error' } = {}) {
    super(message);
    this.name = 'MailcowError';
    this.status = status;
    this.code = code;
  }
}

const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

function baseUrl(cfg) {
  const raw = cfg?.baseUrl || process.env.MAILCOW_BASE_URL || '';
  return raw ? trimSlash(raw) : null;
}

function apiKey(cfg) {
  return cfg?.apiKey || process.env.MAILCOW_API_KEY || null;
}

const isConfigured = (cfg) => Boolean(baseUrl(cfg) && apiKey(cfg));

function timeoutMs(cfg) {
  if (Number.isFinite(cfg?.timeoutMs) && cfg.timeoutMs > 0) return cfg.timeoutMs;
  const n = Number.parseInt(process.env.MAILCOW_TIMEOUT_MS, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

async function request(method, path, body, cfg) {
  if (!isConfigured(cfg)) {
    throw new MailcowError('Mailcow is not configured (set MAILCOW_BASE_URL and MAILCOW_API_KEY, or register a mail server).', {
      status: 503,
      code: 'mailcow_not_configured',
    });
  }
  const ms = timeoutMs(cfg);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);

  let res;
  try {
    res = await fetch(`${baseUrl(cfg)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey(cfg),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e?.name === 'AbortError';
    throw new MailcowError(
      aborted ? `Mailcow did not respond within ${ms}ms.` : `Mailcow unreachable: ${e.message}`,
      { status: 504, code: aborted ? 'mailcow_timeout' : 'mailcow_unreachable' },
    );
  } finally {
    clearTimeout(timer);
  }

  let parsed = null;
  const text = await res.text();
  if (text) {
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text.slice(0, 300) }; }
  }
  if (!res.ok) {
    throw new MailcowError(`Mailcow returned ${res.status}.`, { status: res.status, code: 'mailcow_http_error' });
  }
  return normalize(parsed);
}

/** Throw on mailcow's in-band 'danger' results; pass reads through. */
function normalize(parsed) {
  if (Array.isArray(parsed)) {
    const danger = parsed.find((r) => r?.type === 'danger');
    if (danger) {
      const msg = Array.isArray(danger.msg) ? danger.msg.join(' ') : String(danger.msg || 'operation failed');
      throw new MailcowError(`Mailcow: ${msg}`, { status: 422, code: 'mailcow_rejected' });
    }
  }
  return parsed;
}

/* ------------------------------------------------------------ operations */

const addMailbox = ({ localPart, domain, name, password, quotaMb = 1024 }, cfg) =>
  request('POST', '/api/v1/add/mailbox', {
    local_part: localPart,
    domain,
    name: name || localPart,
    password,
    password2: password,
    quota: String(quotaMb),
    active: '1',
    force_pw_update: '0',
    tls_enforce_in: '0',
    tls_enforce_out: '0',
  }, cfg);

const getMailbox = (email, cfg) => request('GET', `/api/v1/get/mailbox/${encodeURIComponent(email)}`, undefined, cfg);

/** All mailboxes on the server — also the cheapest credential/reachability probe. */
const listMailboxes = (cfg) => request('GET', '/api/v1/get/mailbox/all', undefined, cfg);

/** Domains the server hosts (mailcow domain objects). */
const listDomains = (cfg) => request('GET', '/api/v1/get/domain/all', undefined, cfg);

const deleteMailbox = (email, cfg) => request('POST', '/api/v1/delete/mailbox', [email], cfg);

const addAlias = ({ address, goto }, cfg) =>
  request('POST', '/api/v1/add/alias', { address, goto, active: '1' }, cfg);

module.exports = { MailcowError, isConfigured, baseUrl, request, addMailbox, getMailbox, listMailboxes, listDomains, deleteMailbox, addAlias };
