'use strict';

/**
 * Request logging.
 *
 * Strapi runs `strapi::logger` and prints an http line per request; core
 * printed nothing after its boot banner, so a dev watching the window (or an
 * operator reading container logs) had no idea what the server was doing —
 * which request 404'd, which one was slow, which one threw.
 *
 * Format mirrors Strapi's http line closely enough to read the two side by side
 * during the migration:
 *
 *   [21:04:19.812] GET  /api/products?filters… 200 12ms
 *   [21:04:20.104] POST /api/auth/local        400 361ms  ValidationError
 *   [21:04:22.900] GET  /api/me/permissions    401 3ms    anon
 *
 * Controlled by RUTBA_CORE_LOG:
 *   requests  every request                             (default in development)
 *   errors    only 4xx/5xx — quiet, still shows failures (default otherwise)
 *   off       nothing
 */

const { get: envGet, loadVars } = require('../config/env');

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
 * Long query strings dominate the line and push the status column out of
 * alignment, which is the whole point of the column. Fixed width: the path is
 * what you scan, the query is context.
 */
const PATH_WIDTH = 52;
function shortPath(ctx) {
  const full = ctx.querystring ? `${ctx.path}?${ctx.querystring}` : ctx.path;
  return full.length > PATH_WIDTH
    ? `${full.slice(0, PATH_WIDTH - 1)}…`
    : full.padEnd(PATH_WIDTH);
}

/** Who made the call — the thing you actually want when a 403 shows up. */
function actor(ctx) {
  if (ctx.state.user) {
    const app = ctx.get('x-rutba-app');
    const role = ctx.get('x-rutba-app-role');
    return dim(`u${ctx.state.user.id}${app ? `@${app}` : ''}${role ? `/${role}` : ''}`);
  }
  if (ctx.state.apiToken) return dim(`token:${ctx.state.apiToken.name || ctx.state.apiToken.id}`);
  return dim('anon');
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
        ctx.method.padEnd(6),
        shortPath(ctx),
        paint(statusColour(status), String(status)),
        // Slow requests are the ones worth spotting; bold past 500ms.
        ms >= 500 ? bold(`${ms.toFixed(0)}ms`) : dim(`${ms.toFixed(0)}ms`),
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
