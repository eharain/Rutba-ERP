'use strict';

/**
 * Request logging.
 *
 * Strapi runs `strapi::logger` and prints an http line per request; core
 * printed nothing after its boot banner, so a dev watching the window (or an
 * operator reading container logs) had no idea what the server was doing —
 * which request 404'd, which one was slow, which one threw.
 *
 * One line per request, fixed columns, cheapest to scan first:
 *
 *   time            ms status method url
 *   21:04:19.812  12ms 200 GET    http://localhost:4020/api/products?filters[…]
 *   21:04:20.104 361ms 400 POST   http://localhost:4020/api/auth/local ValidationError
 *   21:04:22.900   3ms 401 GET    http://localhost:4020/api/me/permissions UnauthorizedError anon
 *
 * The url comes last and is never truncated: everything left of it is a fixed
 * width, so the columns stay aligned however long the query string runs, and the
 * url stays whole enough to click or paste into curl straight from the terminal.
 *
 * Controlled by RUTBA_CORE_LOG:
 *   requests  every request                             (default in development)
 *   errors    only 4xx/5xx — quiet, still shows failures (default otherwise)
 *   off       nothing
 */

const { get: envGet, loadVars } = require('../config/env');
const { subjectOf, IDENTITY_SOURCES } = require('../platform/identity');

const MODES = new Set(['requests', 'errors', 'off']);

// ── the write path ─────────────────────────────────────────────────────────
/**
 * Log lines are queued and flushed on a timer, never written from the request
 * handler.
 *
 * console.log is not free: on Windows, writes to a TTY (and to a file) are
 * SYNCHRONOUS, so a per-request console.log puts a blocking write in the path
 * of every request — the one place a server can least afford it. Queueing turns
 * hundreds of small syscalls per second into one batched write per interval,
 * and the handler only ever does an array push.
 *
 * The flush itself is still a synchronous write when stdout is a TTY — that is
 * Node's behaviour and not something userland can opt out of — but it happens
 * on a timer tick rather than inside a response, and it happens ~20×/s instead
 * of once per request.
 *
 * Backpressure is respected: if stdout says it is full, flushing stops until
 * 'drain' rather than piling writes on. If the queue ever runs away (a stalled
 * pipe), lines are dropped with a count instead of growing without bound —
 * logging must never be the reason the process dies.
 */
const FLUSH_MS = 50;
const MAX_QUEUED = 10000;

const queue = [];
let flushTimer = null;
let draining = false;
let dropped = 0;

function flush() {
  flushTimer = null;
  if (draining || queue.length === 0) return;
  if (dropped > 0) {
    queue.push(`[core] log: dropped ${dropped} line(s) — stdout could not keep up`);
    dropped = 0;
  }
  const chunk = `${queue.join('\n')}\n`;
  queue.length = 0;
  if (!process.stdout.write(chunk)) {
    draining = true;
    process.stdout.once('drain', () => {
      draining = false;
      schedule();
    });
  }
}

function schedule() {
  if (flushTimer || draining) return;
  // unref: a pending log flush must never hold the process open at shutdown.
  flushTimer = setTimeout(flush, FLUSH_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

function emit(line) {
  if (queue.length >= MAX_QUEUED) { dropped += 1; return; }
  queue.push(line);
  schedule();
}

/** Drain whatever is queued — called on shutdown so the tail is not lost. */
function flushLogs() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (queue.length === 0) return;
  const chunk = `${queue.join('\n')}\n`;
  queue.length = 0;
  try { process.stdout.write(chunk); } catch { /* nothing useful to do here */ }
}

function mode() {
  const raw = String(envGet('RUTBA_CORE_LOG', '') || '').trim().toLowerCase();
  if (MODES.has(raw)) return raw;
  return loadVars().environment === 'development' ? 'requests' : 'errors';
}

// Colour only when a human is watching; a redirected log file gets plain text.
const useColour = Boolean(process.stdout.isTTY);
const paint = (code, s) => (useColour ? `[${code}m${s}[0m` : s);
const dim = (s) => paint(90, s);
const bold = (s) => paint(1, s);

function statusColour(status) {
  if (status >= 500) return 31;      // red
  if (status >= 400) return 33;      // yellow
  if (status >= 300) return 36;      // cyan
  return 32;                         // green
}

function stamp() {
  // Time only: the date is in the boot banner and every line would repeat it.
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/**
 * The whole url, host included. It is the last column, so its length costs no
 * alignment, and a complete url is the one you can paste into curl or a browser
 * without rebuilding it from the boot banner. Falls back to the path alone when
 * a request arrives with no Host header.
 */
function fullUrl(ctx) {
  const path = ctx.querystring ? `${ctx.path}?${ctx.querystring}` : ctx.path;
  return ctx.host ? `${ctx.protocol}://${ctx.host}${path}` : path;
}

/** Right-aligned so the digits line up and a slow outlier reads at a glance. */
const MS_WIDTH = 5;
function duration(ms) {
  const text = `${ms.toFixed(0)}ms`.padStart(MS_WIDTH);
  // Slow requests are the ones worth spotting; bold past 500ms.
  return ms >= 500 ? bold(text) : dim(text);
}

/**
 * Who made the call — the thing you actually want when a 403 shows up.
 *
 * Read from the identity seam, so one line renders every door: a local JWT
 * today, a portal assertion when that opens, and no second rendering to keep in
 * step. subjectOf() is synchronous and touches no database, which is what makes
 * it safe here — this runs in a finally block on every single request.
 *
 * The token NAME is looked up separately and only as a label: it is not part of
 * an identity (the subject is `token:<id>`), but "token:marketplace-worker"
 * is what makes a log line readable at 2am.
 */
function actor(ctx) {
  let who;
  try {
    who = subjectOf(ctx);
  } catch {
    // A log line must never change a response. The one thing subjectOf refuses
    // on is an assertion naming another org, which the gate has already turned
    // into a 403 — this line still has to print, and this is what it prints.
    return dim('foreign-org');
  }
  const trace = who.req_id ? dim(` #${who.req_id}`) : '';

  if (who.source === IDENTITY_SOURCES.SERVICE) {
    const label = (ctx.state.apiToken && ctx.state.apiToken.name) || who.sub;
    return dim(`token:${label}`) + trace;
  }
  if (who.source === IDENTITY_SOURCES.ANONYMOUS) return dim('anon') + trace;

  // A person, local or portal: the app and role they claimed are what turn a
  // 403 into a diagnosis, and both arrive as headers on the request.
  const app = ctx.get('x-rutba-app');
  const role = ctx.get('x-rutba-app-role');
  return dim(`${who.sub}${app ? `@${app}` : ''}${role ? `/${role}` : ''}`) + trace;
}

function createRequestLogger() {
  const current = mode();
  if (current === 'off') return { middleware: null, mode: current };

  const middleware = async function requestLogger(ctx, next) {
    const started = process.hrtime.bigint();
    try {
      await next();
    } finally {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      const status = ctx.status;
      if (current === 'errors' && status < 400) return;

      const parts = [
        dim(stamp()),
        duration(ms),
        paint(statusColour(status), String(status)),
        ctx.method.padEnd(6),
        fullUrl(ctx),
      ];
      // The error name is what turns "400" into something actionable.
      if (status >= 400 && ctx.body && ctx.body.error && ctx.body.error.name) {
        parts.push(dim(ctx.body.error.name));
      }
      if (status === 401 || status === 403) parts.push(actor(ctx));
      emit(parts.join(' '));
    }
  };

  return { middleware, mode: current };
}

module.exports = { createRequestLogger, flushLogs };
