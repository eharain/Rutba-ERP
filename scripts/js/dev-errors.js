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
 * Read it while running at http://localhost:4100/errors, on exit as a printed
 * summary, or any time afterwards with `npm run dev:errors` — the store is
 * persisted, so it outlives the session that produced it.
 */

const fs = require('fs');
const path = require('path');

const { ROOT } = require('./dev-runtime');

const STORE_DIR = path.join(ROOT, '.dev');
const STORE = path.join(STORE_DIR, 'dev-errors.json');
const MAX_GROUPS = 500;
const MAX_SAMPLES = 3;

// ── classification ─────────────────────────────────────────

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;
const strip = (s) => s.replace(ANSI, '');

/**
 * Ordered rules — first match wins, so put the specific ones above the generic
 * `Error:` catch-all. `kind` is what gets grouped in the digest; `severity`
 * decides whether it counts as a problem or just noise worth keeping.
 */
const RULES = [
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
    re: /Warning: |validateDOMNesting|Each child in a list should have a unique/ },
  { kind: 'deprecation', severity: 'warn', re: /DeprecationWarning|is deprecated/ },
  // Next prints a bare ⨯ for request-level failures; Strapi/Koa use [ERROR].
  { kind: 'runtime', severity: 'error',
    re: /^\s*[⨯✗]|^\[ERROR\]|\b(TypeError|ReferenceError|RangeError|AssertionError)\b/ },
  { kind: 'runtime', severity: 'error', re: /(^|\s)Error:\s/ },
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
    .replace(/\bin \d+(?:\.\d+)?\s*m?s\b/g, 'in <time>')
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
let started = Date.now();

function bump(source, kind, severity, text, extra) {
  const sig = signature(source, kind, text);
  let g = groups.get(sig);

  if (!g) {
    if (groups.size >= MAX_GROUPS) return null;   // runaway guard
    g = {
      source, kind, severity,
      message: strip(text).trim().slice(0, 400),
      count: 0, first: Date.now(), last: 0,
      samples: [], detail: null, ...extra,
    };
    groups.set(sig, g);
  }

  g.count += 1;
  g.last = Date.now();
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

/** One line of child output — classify it, or attach it to the open group. */
function feed(source, line) {
  if (ingestContinuation(source, line)) return null;
  return ingest(source, line);
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
      started, saved: Date.now(), counts: counts(), groups: all(),
    }, null, 2));
  } catch { /* never let bookkeeping take the dev server down */ }
}

function load() {
  try { return JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch { return null; }
}

function reset() {
  groups.clear();
  httpTotal = 0;
  started = Date.now();
}

const ago = (t) => {
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};

/** Terminal digest — what to print on Ctrl-C, and what `dev:errors` shows. */
function text({ limit = 20, color = true } = {}) {
  const C = (n, s) => (color ? `\x1b[${n}m${s}\x1b[0m` : s);
  const list = all();
  if (!list.length) return C(32, 'No errors recorded.');

  const c = counts();
  const out = [
    '',
    C(1, `${c.errors} distinct error${c.errors === 1 ? '' : 's'}` +
         `${c.warns ? ` and ${c.warns} warning${c.warns === 1 ? '' : 's'}` : ''}` +
         ` across ${c.occurrences} occurrence${c.occurrences === 1 ? '' : 's'}`),
    '',
  ];

  for (const g of list.slice(0, limit)) {
    const sev = g.severity === 'error' ? C(31, '●') : C(33, '●');
    out.push(`${sev} ${C(1, `${g.count}×`)} ${C(36, g.source)} ${C(2, g.kind)}`);
    out.push(`    ${g.message}`);
    if (g.detail?.length) out.push(C(2, `    ${g.detail[0].trim()}`));
    if (g.samples?.length) out.push(C(2, `    e.g. ${g.samples[0]}`));
    out.push(C(2, `    first ${ago(g.first)} ago, last ${ago(g.last)} ago`));
    out.push('');
  }

  if (list.length > limit) out.push(C(2, `  …and ${list.length - limit} more`));
  out.push(C(2, `  full list: npm run dev:errors    stored in .dev/dev-errors.json`));
  return out.join('\n');
}

module.exports = {
  feed, ingest, httpFailure, lifecycle,
  all, counts, save, load, reset, text, ago, STORE,
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
  // Rehydrate so the shared renderer can be reused verbatim.
  for (const g of saved.groups) groups.set(`${g.source}|${g.kind}|${g.message}`, g);
  started = saved.started;
  const limitArg = process.argv.indexOf('--limit');
  console.log(text({ limit: limitArg > -1 ? Number(process.argv[limitArg + 1]) : 40 }));
  console.log(`  recorded ${new Date(saved.saved).toLocaleString()}\n`);
}
