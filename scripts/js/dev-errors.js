#!/usr/bin/env node
'use strict';

/**
 * scripts/js/dev-errors.js — Collect every dev-time error in one place
 *
 * With 22 apps sharing one window, errors scroll past and are gone. The same
 * "Module not found" can fire on every request for an hour and read as sixty
 * separate problems, while a one-off crash three minutes ago is unrecoverable.
 * Neither is a good basis for deciding what to fix.
 *
 * Everything the dev environment can see funnels through here:
 *
 *   app + backend stdout/stderr   compile failures, stack traces, crashes
 *   the gateway's proxy layer     every 4xx/5xx it forwards, and dead upstreams
 *   process lifecycle             non-zero exits
 *
 * Entries are deduplicated by a normalised signature — line numbers, timings,
 * ports, hashes and absolute paths stripped — so a hundred repeats of one fault
 * collapse to one row with a count and a first/last-seen window. The result is
 * a fix-list ordered by what is actually happening most, which is the thing you
 * want when sitting down to clear them in a single pass.
 *
 * Three surfaces, because they answer different questions:
 *
 *   http://localhost:4100/errors  the grouped fix-list, live
 *   npm run dev:errors            the same list, any time after the fact
 *   npm run dev:errors --history  every occurrence, across sessions, ungrouped
 *   .dev/logs/dev-<stamp>.log     every line from every service, verbatim
 *
 * The grouped store is rewritten each session and can be --clear-ed. The raw
 * logs and .dev/errors.jsonl are append-only and survive both, so nothing that
 * happened is ever unrecoverable — which is the point: a problem you did not
 * notice at the time is still there to be found afterwards.
 */

const fs = require('fs');
const net = require('net');
const path = require('path');

const { ROOT } = require('./dev-runtime');

const STORE_DIR = path.join(ROOT, '.dev');
const STORE = path.join(STORE_DIR, 'dev-errors.json');
const LOG_DIR = path.join(STORE_DIR, 'logs');
const JOURNAL = path.join(STORE_DIR, 'errors.jsonl');
const MAX_GROUPS = 500;
const MAX_SAMPLES = 3;
const KEEP_SESSIONS = 10;              // raw logs retained
const JOURNAL_MAX_BYTES = 16 * 1024 * 1024;

// ── durable logs ───────────────────────────────────────────
// The grouped store answers "what should I fix". It deliberately does not
// answer "what exactly happened at 12:46", because it collapses repeats and
// keeps only the first sample. Two separate files cover that:
//
//   .dev/logs/dev-<stamp>.log   every line from every service, verbatim and
//                               timestamped — the thing you grep after the
//                               terminal has scrolled or the window is closed
//   .dev/errors.jsonl           one JSON record per classified occurrence,
//                               appended and never rewritten, so a finding
//                               from three sessions ago is still there
//
// Both are written from feed(), which every service's output already passes
// through, so nothing can be logged by one path and missed by the other.

let rawStream = null;
let journalStream = null;
let sessionLogPath = null;

function two(n) { return String(n).padStart(2, '0'); }

function openLogs() {
  if (rawStream) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const d = new Date();
    const st = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}` +
               `-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
    sessionLogPath = path.join(LOG_DIR, `dev-${st}.log`);
    rawStream = fs.createWriteStream(sessionLogPath, { flags: 'a' });
    rawStream.on('error', () => { rawStream = null; });

    // Trim the journal before appending rather than after, so a long-running
    // session cannot grow it without bound between restarts.
    try {
      if (fs.statSync(JOURNAL).size > JOURNAL_MAX_BYTES) {
        const keep = fs.readFileSync(JOURNAL, 'utf8').split('\n').slice(-20000).join('\n');
        fs.writeFileSync(JOURNAL, keep);
      }
    } catch { /* absent or unreadable — the append below recreates it */ }

    journalStream = fs.createWriteStream(JOURNAL, { flags: 'a' });
    journalStream.on('error', () => { journalStream = null; });

    pruneSessions();
  } catch { /* logging must never take the dev environment down */ }
}

/** Keep the most recent KEEP_SESSIONS raw logs; older ones are noise. */
function pruneSessions() {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter((f) => /^dev-\d{8}-\d{6}\.log$/.test(f))
      .sort();
    for (const f of files.slice(0, Math.max(0, files.length - KEEP_SESSIONS))) {
      try { fs.unlinkSync(path.join(LOG_DIR, f)); } catch { /* in use */ }
    }
  } catch { /* nothing to prune */ }
}

function closeLogs() {
  try { rawStream?.end(); } catch {}
  try { journalStream?.end(); } catch {}
  rawStream = null;
  journalStream = null;
}

// ── classification ─────────────────────────────────────────

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');

/**
 * Ordered rules — first match wins, so put the specific ones above the generic
 * `Error:` catch-all. `kind` is what gets grouped in the digest; `severity`
 * decides whether it counts as a problem or just noise worth keeping.
 */
const RULES = [
  // Transport failures come first and get their own kind. They are the single
  // most common thing in this environment and they are NOT generic runtime
  // errors: they mean the API was not reachable, which has one cause and one
  // fix, however many different call sites report it.
  //
  // The generic /Error:\s/ rule below cannot catch these — in "AxiosError:
  // Network Error" the colon-bearing token is preceded by "Axios", not
  // whitespace — so without this rule the commonest failure in the log was
  // silently unclassified and never appeared in the digest at all.
  { kind: 'api-unreachable', severity: 'error',
    re: /AxiosError|Network Error|ERR_NETWORK|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed/i },
  { kind: 'api-status', severity: 'error',
    re: /Request failed with status code \d+|\bstatus=(4|5)\d\d\b/ },
  { kind: 'module-not-found', severity: 'error',
    re: /Module not found|Can't resolve ['"]|Cannot find module ['"]/ },
  { kind: 'compile', severity: 'error',
    re: /Failed to compile|Syntax ?Error|Parsing ecmascript source code failed|Unexpected token/ },
  { kind: 'hydration', severity: 'error',
    re: /Hydration failed|did not match|Text content does not match/ },
  { kind: 'port-taken', severity: 'error', re: /EADDRINUSE/ },
  { kind: 'missing-file', severity: 'error', re: /ENOENT/ },
  { kind: 'unhandled-rejection', severity: 'error',
    re: /UnhandledPromiseRejection|Unhandled Runtime Error|unhandledRejection/ },
  { kind: 'react-warning', severity: 'warn',
    re: /Warning: |validateDOMNesting|Each child in a list should have a unique|two children with the same key|Encountered two children/ },
  // Next's own advisory notices — real, but a config nudge rather than a fault.
  { kind: 'next-advisory', severity: 'warn',
    re: /Detected `scroll-behavior|nextjs\.org\/docs\/messages\// },
  { kind: 'deprecation', severity: 'warn', re: /DeprecationWarning|is deprecated/ },
  // Next prints a bare ⨯ for request-level failures; Strapi/Koa use [ERROR].
  { kind: 'runtime', severity: 'error',
    re: /^\s*[⨯✗]|^\[ERROR\]|\b(TypeError|ReferenceError|RangeError|AssertionError)\b/ },
  { kind: 'runtime', severity: 'error', re: /(^|\s)Error:\s/ },
  // Last resort, and deliberately last: anything problem-shaped that no rule
  // above recognised. Without it a failure phrased in a way the rules do not
  // anticipate is dropped silently, which is exactly the "goes unnoticed" case.
  // It is a warning, not an error, because it is a guess — and it doubles as a
  // visible measure of where the classifier is blind.
  { kind: 'unclassified', severity: 'warn',
    re: /\b(failed|failure|exception|denied|refused|unable to|not permitted|forbidden|unauthori[sz]ed|invalid)\b/i },
];

/** A stack frame or a bare continuation of the line above it. */
const CONTINUATION = /^\s+(at\s|\.\.\.|\||\d+\s*\||\^)/;

/**
 * Lines that look like errors but are not. Next lists its enabled experiments
 * with ✓/⨯ as on/off markers — `⨯ clientRouterFilter` means the flag is off,
 * and reading it as a failure puts a permanent phantom at the top of the
 * fix-list for every app that disables one.
 */
const IGNORE = [
  /^\s*[-•]?\s*Experiments \(use with caution\)/,
  /^\s*[⨯✗✓]\s*[\w-]+\s*$/,          // marker followed by a single bare flag name
  // Ordinary request logs. `GET /x 404 in 5ms` is traffic, not a fault — the
  // gateway records real HTTP failures itself via httpFailure(), with the route
  // and method already parsed, so matching these here would double-count them.
  /^\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+\d{3}\s+in\s/,
  /^\s*[✓√]\s|^\s*(Ready|Local|Network|Compiled|Starting|- Local|- Network)\b/,
];

function classify(line) {
  const text = strip(line);
  if (!text.trim()) return null;
  for (const re of IGNORE) if (re.test(text)) return null;
  for (const rule of RULES) if (rule.re.test(text)) return { ...rule, text };
  return null;
}

/**
 * Collapse the parts of a message that vary between otherwise-identical
 * occurrences, so repeats group instead of filling the list.
 */
function signature(source, kind, text) {
  const norm = strip(text)
    .replace(/[A-Za-z]:[\\/][^\s:)'"]+/g, '<path>')   // absolute Windows paths
    .replace(/(?:\.\.?[\\/])?[\w.-]+[\\/][\w./\\-]+/g, '<path>')
    .replace(/:\d+:\d+/g, ':<line>')
    // Durations must be collapsed explicitly. The generic \b\d{2,}\b below
    // cannot do it: in "after=39ms" there is no word boundary between the 9
    // and the m, so two runs of the same fault that differed only by a
    // millisecond were landing in two separate groups — which is exactly the
    // duplication this function exists to prevent.
    .replace(/\b(after|in|took)\s*[=:]?\s*\d+(?:\.\d+)?\s*(?:ms|s)\b/gi, '$1=<t>')
    .replace(/\b\d+(?:\.\d+)?\s*ms\b/gi, '<t>ms')
    .replace(/\b\d{2,}\b/g, '<n>')
    .replace(/0x[0-9a-f]+/gi, '<hex>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
  return `${source}|${kind}|${norm}`;
}

// ── store ──────────────────────────────────────────────────

/** signature → group */
const groups = new Map();
let httpTotal = 0;
let overflowed = false;
let started = Date.now();

// ── backend reachability ───────────────────────────────────
// Half the confusing errors in this environment are downstream of one fact:
// was the API answering at the time? Strapi takes ~50s to boot, and every
// browser call made in that window fails identically to a call made against a
// wrong port an hour later. Sampling it turns "Network Error ×40" into either
// "all during startup, ignore" or "still failing after the API came up, fix".

let backendUp = null;              // null = never probed
let backendUrl = null;
const transitions = [];            // [{ at, up }]

/**
 * @param {string} url  the API base the apps are configured to call
 */
function watchBackend(url, intervalMs = 15000) {
  if (!url) return null;
  backendUrl = url;

  let host, port;
  try {
    const u = new URL(url);
    host = u.hostname;
    port = Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
  } catch { return null; }

  // A TCP connect, not an HTTP request. The question is only "is anything
  // listening", and asking it over HTTP made the backend log a 404 every few
  // seconds — the diagnostic filling the log it exists to help you read.
  // Connecting and hanging up answers the same question silently.
  const probe = () => {
    const sock = net.connect({ host, port });
    const done = (up) => { sock.destroy(); setUp(up); };
    sock.setTimeout(3000);
    sock.once('connect', () => done(true));
    sock.once('error', () => done(false));
    sock.once('timeout', () => done(false));
  };

  const setUp = (up) => {
    if (backendUp === up) return;
    backendUp = up;
    transitions.push({ at: Date.now(), up });
  };

  probe();
  const timer = setInterval(probe, intervalMs);
  timer.unref();
  return timer;
}

function backendState() {
  return { url: backendUrl, up: backendUp, transitions };
}

/**
 * Pull the structured facts out of a message so the digest can show them as
 * fields rather than leaving them buried in prose.
 *
 * `api.js annotateError` appends `[GET <url> · app=pos · role=x · status=403]`
 * to every failed request in development, and Next's browser-log forwarding
 * appends `(path/to/file.js:62:25)` to anything logged from the client. Both
 * are the parts you actually navigate by.
 */
function extractFields(text) {
  const out = {};
  const t = strip(text);

  const url = t.match(/\b(GET|POST|PUT|PATCH|DELETE|HEAD)\s+(https?:\/\/\S+?)(?=[\s·\])]|$)/i);
  if (url) { out.method = url[1].toUpperCase(); out.url = url[2]; }

  const app = t.match(/\bapp=([\w-]+)/);        if (app) out.app = app[1];
  const role = t.match(/\brole=([\w:.-]+)/);    if (role) out.role = role[1];
  const status = t.match(/\bstatus=(\d{3})\b/); if (status) out.status = Number(status[1]);
  const code = t.match(/\bcode=([A-Z_]+)/);     if (code) out.code = code[1];
  const from = t.match(/\bfrom=([^·\]]+)/);     if (from) out.from = from[1].trim();
  const after = t.match(/\bafter=(\d+)ms/);     if (after) out.afterMs = Number(after[1]);

  // Next appends the originating module to forwarded browser logs.
  const at = t.match(/\(([^()\s]+\.[jt]sx?):(\d+):(\d+)\)\s*$/);
  if (at) out.at = `${at[1]}:${at[2]}`;

  if (/^\[browser\]|\s\[browser\]\s/.test(t)) out.origin = 'browser';
  return out;
}

function bump(source, kind, severity, text, extra) {
  const sig = signature(source, kind, text);
  let g = groups.get(sig);

  if (!g) {
    // A cap that silently drops findings is the failure this whole module
    // exists to prevent, so overflow is itself recorded — once — and points at
    // the journal, which is uncapped and has the dropped occurrences.
    if (groups.size >= MAX_GROUPS) {
      if (!overflowed) {
        overflowed = true;
        groups.set('__overflow__', {
          source: 'dev-errors', kind: 'group-limit', severity: 'error',
          message: `More than ${MAX_GROUPS} distinct problems — further kinds are ` +
                   `no longer grouped here. Every occurrence is still in .dev/errors.jsonl.`,
          count: 1, first: Date.now(), last: Date.now(),
          samples: [], detail: null, origin: 'server',
        });
      }
      return null;
    }
    g = {
      source, kind, severity,
      // The trailing [GET … · app=… · role=…] block is lifted into structured
      // fields and rendered separately, so keeping it inline as well would
      // print every fact twice and push the actual sentence off the line.
      message: strip(text).replace(/\s*\[(?:GET|POST|PUT|PATCH|DELETE|HEAD)\s[^\]]*\]\s*$/i, '')
        .trim().slice(0, 400),
      count: 0, first: Date.now(), last: 0,
      // Whether the API was reachable when this first fired. A wall of
      // "Network Error" raised while the backend was still booting is noise;
      // the same wall raised after it came up is a real defect, and the two
      // are indistinguishable without recording which side of the line it fell.
      backendUpAtFirst: backendUp,
      backendUpAtLast: backendUp,
      origin: 'server',
      samples: [], detail: null,
      ...extractFields(text), ...extra,
    };
    groups.set(sig, g);
  }

  g.count += 1;
  g.last = Date.now();
  g.backendUpAtLast = backendUp;
  return g;
}

/** Feed one line of a child's output. Returns the group it landed in, if any. */
function ingest(source, line) {
  const hit = classify(line);
  if (!hit) {
    lastGroup = null;
    return null;
  }
  const g = bump(source, hit.kind, hit.severity, hit.text);
  lastGroup = g;
  return g;
}

// Stack frames arrive on the lines after the message they belong to, so the
// most recent group stays open to receive them.
let lastGroup = null;

function ingestContinuation(source, line) {
  if (!lastGroup || !CONTINUATION.test(strip(line))) return false;
  if (!lastGroup.detail) lastGroup.detail = [];
  if (lastGroup.detail.length < 12) lastGroup.detail.push(strip(line).trimEnd());
  return true;
}

/**
 * One line of child output. Everything passes through here, so this is where
 * the verbatim record is written — before any classification decision, so a
 * line the rules do not recognise is still on disk and still findable.
 */
function feed(source, line) {
  openLogs();
  const text = strip(line);
  if (rawStream) {
    try { rawStream.write(`${clock(Date.now())} ${source.padEnd(14)} ${text}\n`); } catch {}
  }

  if (ingestContinuation(source, line)) return null;
  const g = ingest(source, line);

  // Append the occurrence, not the group: the grouped store keeps one sample,
  // and "it happened 40 times" is a different question from "what did the
  // fourth one say". The journal survives restarts, so a finding from an
  // earlier session is still there tomorrow.
  if (g && journalStream) {
    try {
      journalStream.write(JSON.stringify({
        at: new Date().toISOString(), source, kind: g.kind, severity: g.severity,
        message: g.message, url: g.url, status: g.status, role: g.role,
        code: g.code, from: g.from, origin: g.origin,
      }) + '\n');
    } catch { /* never let logging break the run */ }
  }
  return g;
}

/** A 4xx/5xx the gateway proxied. */
function httpFailure(source, method, url, status) {
  if (status < 400) return null;
  httpTotal += 1;
  // Query strings and ids are the noisy part; the route shape is the signal.
  const route = String(url).split('?')[0].replace(/\/[0-9a-f]{8,}/gi, '/<id>')
    .replace(/\/\d+/g, '/<n>');
  const g = bump(source, `http-${status}`, status >= 500 ? 'error' : 'warn',
    `${status} ${method} ${route}`, { http: true });
  if (g && g.samples.length < MAX_SAMPLES && !g.samples.includes(url)) g.samples.push(url);
  return g;
}

/** A crash, a failed spawn, a dead upstream — anything not in the log stream. */
function lifecycle(source, message, severity = 'error') {
  return bump(source, 'lifecycle', severity, message);
}

// ── reporting ──────────────────────────────────────────────

function all() {
  return [...groups.values()].sort(
    (a, b) => (b.severity === 'error') - (a.severity === 'error') || b.count - a.count
  );
}

function counts() {
  let errors = 0, warns = 0, occurrences = 0;
  for (const g of groups.values()) {
    if (g.severity === 'error') errors += 1; else warns += 1;
    occurrences += g.count;
  }
  return { groups: groups.size, errors, warns, occurrences, httpTotal };
}

function save() {
  try {
    fs.mkdirSync(STORE_DIR, { recursive: true });
    fs.writeFileSync(STORE, JSON.stringify({
      started, saved: Date.now(), counts: counts(),
      backend: backendState(), groups: all(),
    }, null, 2));
  } catch { /* never let bookkeeping take the dev server down */ }
}

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return null; }
}

function sessionLog() { return sessionLogPath; }
function journalPath() { return JOURNAL; }

function reset() {
  groups.clear();
  httpTotal = 0;
  overflowed = false;
  started = Date.now();
}

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};

/** Wall-clock, to the second — the form you compare against "when I fixed it". */
const clock = (t) => new Date(t).toTimeString().slice(0, 8);
const stamp = (t) => `${new Date(t).toISOString().slice(0, 10)} ${clock(t)}`;

/**
 * The one-line verdict for a group: is this still happening, and was the API
 * even up when it did? Written out rather than left for the reader to infer,
 * because the whole point is to decide what to fix without re-deriving context.
 */
function verdict(g) {
  const netish = g.kind === 'runtime' || g.code === 'ECONNREFUSED' ||
                 /network error/i.test(g.message);
  if (netish && g.backendUpAtFirst === false && g.backendUpAtLast === false) {
    return 'API was unreachable throughout — likely a wrong API URL or a backend that never started';
  }
  if (netish && g.backendUpAtFirst === false && g.backendUpAtLast === true) {
    return 'started while the API was still booting, and has not recurred since it came up';
  }
  if (netish && g.backendUpAtLast === true) {
    return 'the API is up and this is still failing — a real fault, not startup noise';
  }
  if (g.status === 401) return 'unauthenticated — token missing or expired';
  if (g.status === 403) return `forbidden${g.role ? ` for role ${g.role}` : ''} — a grant is missing for this route`;
  return null;
}

/**
 * Parse a --since value: a clock time ("14:05", "14:05:30"), an ISO instant,
 * or a relative window ("10m", "2h"). Anything after that moment is "since the
 * fix"; anything before it is history.
 */
function parseSince(raw) {
  if (!raw) return null;
  const rel = String(raw).match(/^(\d+(?:\.\d+)?)\s*([smh])$/i);
  if (rel) {
    const mult = { s: 1000, m: 60_000, h: 3_600_000 }[rel[2].toLowerCase()];
    return Date.now() - Number(rel[1]) * mult;
  }
  const hhmm = String(raw).match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (hhmm) {
    const d = new Date();
    d.setHours(Number(hhmm[1]), Number(hhmm[2]), Number(hhmm[3] || 0), 0);
    return d.getTime();
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

/** Terminal digest — what to print on Ctrl-C, and what `dev:errors` shows. */
function text({ limit = 20, color = true, since = null } = {}) {
  const C = (n, s) => (color ? `\x1b[${n}m${s}\x1b[0m` : s);
  // Filter on `last`, not `first`: a fault that started before the fix but is
  // still firing after it is exactly what you want to see, and filtering on
  // first-seen would hide it.
  const list = since ? all().filter((g) => g.last >= since) : all();
  if (!list.length) {
    return C(32, since ? `No errors since ${stamp(since)}.` : 'No errors recorded.');
  }

  // Counted from the rendered list, not the whole store — otherwise a --since
  // view claims totals it is not showing.
  const errs = list.filter((g) => g.severity === 'error').length;
  const warns = list.length - errs;
  const occ = list.reduce((n, g) => n + g.count, 0);

  const out = [
    '',
    C(1, `${errs} distinct error${errs === 1 ? '' : 's'}` +
         `${warns ? ` and ${warns} warning${warns === 1 ? '' : 's'}` : ''}` +
         ` across ${occ} occurrence${occ === 1 ? '' : 's'}` +
         (since ? ` since ${stamp(since)}` : '')),
  ];

  const be = backendState();
  if (be.url) {
    out.push(C(2, `  API ${be.url} — ` +
      (be.up === null ? 'not probed' : be.up ? 'reachable' : C(31, 'UNREACHABLE'))));
  }
  out.push('');

  for (const g of list.slice(0, limit)) {
    const sev = g.severity === 'error' ? C(31, '●') : C(33, '●');
    const where = g.origin === 'browser' ? C(2, ' browser') : '';
    out.push(`${sev} ${C(1, `${g.count}×`)} ${C(36, g.source)}${where} ${C(2, g.kind)}`);
    out.push(`    ${g.message}`);

    // The facts you navigate by, on their own line rather than inside prose.
    const facts = [];
    if (g.method && g.url) facts.push(`${g.method} ${g.url}`);
    if (g.status) facts.push(`status ${g.status}`);
    if (g.code) facts.push(g.code);
    if (g.role) facts.push(`role ${g.role}`);
    if (facts.length) out.push(C(36, `    ${facts.join('  ·  ')}`));

    // Where the call came from, on its own line: this is the thing you open.
    const origin = g.from || g.at;
    if (origin) out.push(C(2, `    from ${origin}`));

    if (g.detail?.length) out.push(C(2, `    ${g.detail[0].trim()}`));
    if (g.samples?.length) out.push(C(2, `    e.g. ${g.samples[0]}`));

    const v = verdict(g);
    if (v) out.push(C(33, `    → ${v}`));

    // Absolute timestamps, not just "3m ago": the question after a change is
    // "did this happen before or after my fix", and only a clock answers it.
    out.push(C(2, `    first ${stamp(g.first)}   last ${stamp(g.last)}   (${ago(g.last)} ago)`));
    out.push('');
  }

  if (list.length > limit) out.push(C(2, `  …and ${list.length - limit} more`));
  out.push(C(2, `  full list: npm run dev:errors    stored in .dev/dev-errors.json`));
  return out.join('\n');
}

module.exports = {
  feed, ingest, httpFailure, lifecycle,
  all, counts, save, load, reset, text, ago, stamp, clock, verdict, parseSince,
  watchBackend, backendState, closeLogs, sessionLog, journalPath,
  STORE, JOURNAL, LOG_DIR,
};

// ── CLI ────────────────────────────────────────────────────

if (require.main === module) {
  const saved = load();
  if (!saved) {
    console.log('No error store yet — run `npm run dev` first.');
    process.exit(0);
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(saved, null, 2));
    process.exit(0);
  }
  if (process.argv.includes('--clear')) {
    reset();
    save();
    console.log('Error store cleared. Re-run the failing flow, then `npm run dev:errors`.');
    process.exit(0);
  }

  // Rehydrate so the shared renderer can be reused verbatim.
  for (const g of saved.groups) groups.set(`${g.source}|${g.kind}|${g.message}`, g);
  started = saved.started;
  if (saved.backend) { backendUrl = saved.backend.url; backendUp = saved.backend.up; }

  const arg = (name, fallback) => {
    const i = process.argv.indexOf(name);
    return i > -1 ? process.argv[i + 1] : fallback;
  };

  const sinceRaw = arg('--since');
  const since = parseSince(sinceRaw);
  if (sinceRaw && since === null) {
    console.error(`Could not read --since "${sinceRaw}". Use 14:05, 30m, 2h, or an ISO time.`);
    process.exit(1);
  }

  // --history reads the append-only journal instead of the grouped store: it
  // is the only view that survives `--clear` and spans earlier sessions.
  if (process.argv.includes('--history')) {
    let lines = [];
    try { lines = fs.readFileSync(JOURNAL, 'utf8').split('\n').filter(Boolean); }
    catch { console.log('No journal yet — run `npm run dev` first.'); process.exit(0); }

    const n = Number(arg('--limit', 60));
    const rows = lines.slice(-n).map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean)
      .filter((r) => !since || Date.parse(r.at) >= since);

    console.log(`\n${rows.length} occurrence(s) from .dev/errors.jsonl` +
      `${since ? ` since ${stamp(since)}` : ''}, ${lines.length} recorded in total\n`);
    for (const r of rows) {
      const t = stamp(Date.parse(r.at));
      const sev = r.severity === 'error' ? '\x1b[31m●\x1b[0m' : '\x1b[33m●\x1b[0m';
      console.log(`${sev} ${t}  \x1b[36m${r.source}\x1b[0m \x1b[2m${r.kind}\x1b[0m`);
      console.log(`    ${r.message}`);
      const facts = [r.url && `${r.url}`, r.status && `status ${r.status}`,
        r.role && `role ${r.role}`, r.from && `from ${r.from}`].filter(Boolean);
      if (facts.length) console.log(`    \x1b[2m${facts.join('  ·  ')}\x1b[0m`);
    }
    console.log('');
    process.exit(0);
  }

  console.log(text({ limit: Number(arg('--limit', 40)), since }));

  let logs = [];
  try { logs = fs.readdirSync(LOG_DIR).filter((f) => f.endsWith('.log')).sort(); } catch {}
  if (logs.length) {
    console.log(`  full output: .dev/logs/${logs[logs.length - 1]}` +
      `${logs.length > 1 ? ` (+${logs.length - 1} earlier session${logs.length > 2 ? 's' : ''})` : ''}`);
  }
  console.log(`  recorded ${stamp(saved.saved)}` +
    '   ·   --since 10m | --since 14:05 | --history | --clear\n');
}
