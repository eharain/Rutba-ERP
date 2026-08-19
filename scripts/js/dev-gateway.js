#!/usr/bin/env node
'use strict';

/**
 * scripts/js/dev-gateway.js — Boot Next.js apps on first request, idle them out
 *
 * THE PROBLEM
 * -----------
 * There are 22 Next.js apps. A dev box has 4 cores and 16 GB. A `next dev`
 * server costs roughly 500-900 MB resident and pegs a core while compiling, so
 * starting all 22 asks for ~15 GB and 22 concurrent compiles on 8 threads —
 * the machine swaps, and every app's compile slows down in proportion.
 *
 * But nobody works on 22 apps at once. A normal session touches two or three.
 * The other 19 are started only so their URLs resolve when you click through
 * the app launcher (packages/shared/lib/roles.js APP_URLS links every app).
 *
 * THE FIX
 * -------
 * The gateway binds the real manifest port for every app (4000, 4001, 4002 …)
 * from a single process — 22 listening sockets, one Node instance, a few MB.
 * Nothing is compiled. When a request actually arrives for :4002, only then is
 * pos started, on a shadow port (5002), and the connection is proxied through.
 * After RUTBA_DEV_IDLE_MIN minutes with no traffic the app is shut down and its
 * memory returned; the next request boots it again.
 *
 * The upshot: every URL in the launcher works, all the time, but you only pay
 * for the apps you actually open. Because the gateway owns the public port, the
 * URLs are unchanged — no path prefixes, no rewritten links, and the original
 * Host header is forwarded so absolute URLs and auth callbacks stay correct.
 */

const http = require('http');
const net = require('net');

const { apps, findService, spawnApp, killTree, lineBuffer } = require('./dev-runtime');
const errors = require('./dev-errors');

const SHADOW_OFFSET = 1000;          // 4002 (public) → 5002 (real next dev)
const STATUS_PORT = 4100;
const DEFAULT_IDLE_MIN = 15;

// ── state ──────────────────────────────────────────────────

/** key → { service, state, child, shadowPort, lastHit, startedAt, log } */
const registry = new Map();

let IDLE_MS = (Number(process.env.RUTBA_DEV_IDLE_MIN) || DEFAULT_IDLE_MIN) * 60_000;
let notify = () => {};

// ── lifecycle ──────────────────────────────────────────────

function ensureStarted(entry) {
  if (entry.state === 'ready' || entry.state === 'starting') return;

  entry.state = 'starting';
  entry.startedAt = Date.now();
  entry.log = [];

  const shadowPort = entry.service.port + SHADOW_OFFSET;
  entry.shadowPort = shadowPort;

  notify(`booting ${entry.service.key} on demand (:${entry.service.port})`);

  const { child } = spawnApp(entry.service, { port: shadowPort });
  entry.child = child;

  // The app really listens on the shadow port, but every URL it prints would
  // then send the reader to :5002 instead of the :4002 they should open. Swap
  // it back so the log matches the address that actually works.
  const shadowRe = new RegExp(`:${shadowPort}\\b`, 'g');
  const capture = lineBuffer((raw) => {
    // Rewrite once, then use the same text everywhere. Feeding the raw line to
    // the collector put shadow ports into the durable log and the error store,
    // so anything read back later pointed at :5018 — an address that is real
    // but that nobody should ever open.
    const line = raw.replace(shadowRe, `:${entry.service.port}`);
    entry.log.push(line);
    if (entry.log.length > 200) entry.log.shift();
    errors.feed(entry.service.key, line);
    process.stdout.write(`\x1b[2m[${entry.service.key}]\x1b[0m ${line}\n`);
  });
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);

  child.on('exit', (code) => {
    // stop() clears entry.child synchronously, but the kill it issues is async,
    // so by the time this fires the state has already been reset. Without the
    // explicit flag a deliberate idle shutdown reports itself as a crash.
    if (!entry.stopping) {
      errors.lifecycle(entry.service.key, `exited with code ${code}`);
      notify(`${entry.service.key} exited (code ${code}) — will retry on next request`);
    }
    entry.stopping = false;
    entry.state = 'idle';
    entry.child = null;
  });

  waitForPort(shadowPort, entry);
}

/**
 * Poll the shadow port until `next dev` is listening. We deliberately flip to
 * "ready" as soon as the socket accepts rather than waiting for a compile to
 * finish: Next binds first and blocks the request while it compiles, which is
 * exactly the behaviour a directly-run dev server has.
 */
function waitForPort(port, entry, attempt = 0) {
  if (entry.state !== 'starting') return;
  if (attempt > 600) {                       // 5 min ceiling
    notify(`${entry.service.key} never opened :${port} — giving up`);
    stop(entry);
    return;
  }

  const sock = net.connect({ port, host: '127.0.0.1' });
  sock.once('connect', () => {
    sock.destroy();
    if (entry.state !== 'starting') return;
    entry.state = 'ready';
    entry.lastHit = Date.now();
    const secs = ((Date.now() - entry.startedAt) / 1000).toFixed(1);
    notify(`${entry.service.key} ready in ${secs}s`);
  });
  sock.once('error', () => {
    sock.destroy();
    setTimeout(() => waitForPort(port, entry, attempt + 1), 500);
  });
}

function stop(entry, reason = '') {
  if (!entry.child) { entry.state = 'idle'; return; }
  entry.stopping = true;
  entry.state = 'stopping';
  notify(`stopping ${entry.service.key}${reason ? ` (${reason})` : ''}`);

  // Close our own sockets before killing the app. Letting the process die
  // underneath a live HMR websocket is what produced the ECONNRESET in the
  // first place; tearing them down deliberately means there is no reset to
  // handle, and the browser reconnects on the next request as it always does.
  for (const s of entry.sockets) {
    try { s.destroy(); } catch { /* already gone */ }
  }
  entry.sockets.clear();

  killTree(entry.child);
  entry.child = null;
  entry.state = 'idle';
}

/** Render the idle window without collapsing sub-minute values to '0m'. */
function idleLabel() {
  const mins = IDLE_MS / 60_000;
  return mins >= 1 ? `${Math.round(mins)} min` : `${Math.round(IDLE_MS / 1000)}s`;
}

function sweepIdle() {
  if (!IDLE_MS) return;
  const now = Date.now();
  for (const entry of registry.values()) {
    if (entry.state === 'ready' && entry.lastHit && now - entry.lastHit > IDLE_MS) {
      stop(entry, `idle ${idleLabel()}`);
    }
  }
}

// ── proxying ───────────────────────────────────────────────

function proxy(entry, req, res) {
  entry.lastHit = Date.now();

  const upstream = http.request(
    {
      host: '127.0.0.1',
      port: entry.shadowPort,
      method: req.method,
      path: req.url,
      // Headers pass through untouched, Host included: the app must keep
      // believing it is served from its public port so redirects, NextAuth
      // callbacks and absolute asset URLs resolve to :4002 and not :5002.
      headers: req.headers,
    },
    (up) => {
      // Every request for every app crosses this line, which makes it the one
      // place that sees the whole environment's HTTP failures.
      errors.httpFailure(entry.service.key, req.method, req.url, up.statusCode);
      // The upstream RESPONSE is a separate stream from the request, with its
      // own error channel. Killing the app mid-response resets it, and an
      // unhandled 'error' here is as fatal to the supervisor as one on a
      // websocket — same crash, different stream.
      up.on('error', () => { up.destroy(); res.destroy(); });
      res.writeHead(up.statusCode, up.headers);
      up.pipe(res);
    }
  );

  upstream.on('error', (err) => {
    errors.lifecycle(entry.service.key, `upstream ${err.code || err.message} proxying ${req.url}`);
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(entry, `Upstream error: ${escapeHtml(err.message)}`, false));
  });

  // The browser navigating away mid-request aborts these; without listeners
  // that is another unhandled 'error'.
  res.on('error', () => upstream.destroy());
  req.on('error', () => upstream.destroy());

  req.pipe(upstream);
}

function handle(entry, req, res) {
  entry.lastHit = Date.now();

  if (entry.state === 'ready') return proxy(entry, req, res);

  ensureStarted(entry);

  const wantsHtml = (req.headers.accept || '').includes('text/html');

  // A navigation gets an immediate holding page that refreshes itself, so the
  // browser shows progress instead of a spinner for half a minute. Everything
  // else (assets, XHR, HMR polls) simply waits for the port to open.
  if (wantsHtml) {
    res.writeHead(503, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '3',
    });
    return res.end(page(entry, `Starting ${entry.service.key}…`, true));
  }

  const started = Date.now();
  const poll = () => {
    if (res.writableEnded || req.destroyed) return;
    if (entry.state === 'ready') return proxy(entry, req, res);
    if (Date.now() - started > 300_000) {
      res.writeHead(504).end();
      return;
    }
    setTimeout(poll, 300);
  };
  poll();
}

function upgrade(entry, req, socket, head) {
  // HMR runs over a websocket. If the app is not up yet there is nothing to
  // talk to, so drop the socket — the client reconnects on its own.
  if (entry.state !== 'ready') return socket.destroy();
  entry.lastHit = Date.now();

  // A raw socket that emits 'error' with no listener throws, and an unhandled
  // 'error' event takes down the whole supervisor — all 22 apps and the
  // backend with it. That is precisely what happened whenever an idle app was
  // reaped while a browser still held its HMR websocket: killing the app reset
  // the upstream socket, nothing was listening for it, and the environment
  // died. Both ends are now guarded, and both are torn down together.
  const shutBoth = () => { socket.destroy(); };
  socket.on('error', shutBoth);
  socket.on('close', () => entry.sockets.delete(socket));
  entry.sockets.add(socket);

  const up = http.request({
    host: '127.0.0.1',
    port: entry.shadowPort,
    method: req.method,
    path: req.url,
    headers: req.headers,
  });

  up.on('upgrade', (upRes, upSocket, upHead) => {
    upSocket.on('error', shutBoth);
    entry.sockets.add(upSocket);
    upSocket.on('close', () => entry.sockets.delete(upSocket));

    const lines = Object.entries(upRes.headers).map(([k, v]) => `${k}: ${v}`);
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`
    );
    if (upHead && upHead.length) socket.unshift(upHead);
    upSocket.pipe(socket).pipe(upSocket);
  });
  up.on('error', shutBoth);
  if (head && head.length) up.write(head);
  up.end();
}

// ── holding / status pages ─────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
  ));
}

const SHELL = (title, body) => `<!doctype html><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; margin: 0;
         min-height: 100vh; display: grid; place-items: center;
         background: Canvas; color: CanvasText; }
  .card { max-width: 34rem; padding: 2rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: .25rem 0; opacity: .75; }
  code { font-family: ui-monospace, monospace; font-size: .9em;
         background: color-mix(in srgb, CanvasText 8%, transparent);
         padding: .1em .35em; border-radius: .25em; }
  .spin { display:inline-block; width:.7em; height:.7em; margin-right:.5em;
          border:2px solid currentColor; border-right-color:transparent;
          border-radius:50%; animation:s .7s linear infinite; }
  @keyframes s { to { transform: rotate(360deg) } }
  table { border-collapse: collapse; width: 100%; }
  td, th { text-align: left; padding: .3rem .75rem .3rem 0; }
  a { color: inherit; }
</style>
<div class="card">${body}</div>`;

function page(entry, title, starting) {
  const secs = entry.startedAt ? ((Date.now() - entry.startedAt) / 1000).toFixed(0) : '0';
  return SHELL(title, `
  <h1>${starting ? '<span class="spin"></span>' : ''}${escapeHtml(title)}</h1>
  <p>First request to <code>${escapeHtml(entry.service.key)}</code> — the dev
     gateway is compiling it now. This page reloads itself when it is up.</p>
  <p>Elapsed: ${secs}s &middot; idles out after
     ${idleLabel()} of no traffic.</p>
  ${starting ? '<script>setTimeout(() => location.reload(), 3000)</script>' : ''}`);
}

/**
 * The fix-list. Ordered by severity then frequency, because the useful question
 * at the end of a session is "what is firing most", not "what fired last".
 */
function errorsPage() {
  const c = errors.counts();
  const list = errors.all();

  if (!list.length) {
    return SHELL('Dev errors', `
      <h1>No errors recorded</h1>
      <p>Nothing has failed since the dev environment started.</p>
      <p><a href="/">← app status</a></p>
      <script>setTimeout(() => location.reload(), 10000)</script>`);
  }

  const rows = list.map((g) => {
    const tone = g.severity === 'error' ? '#e5484d' : '#f5a524';
    const detail = g.detail?.length
      ? `<pre>${escapeHtml(g.detail.join('\n'))}</pre>` : '';
    const samples = g.samples?.length
      ? `<p class="muted">e.g. ${g.samples.map(escapeHtml).join(' · ')}</p>` : '';

    const facts = [];
    if (g.method && g.url) facts.push(`${g.method} ${g.url}`);
    if (g.status) facts.push(`status ${g.status}`);
    if (g.code) facts.push(g.code);
    if (g.role) facts.push(`role ${g.role}`);
    const factLine = facts.length
      ? `<p class="facts">${facts.map(escapeHtml).join('  ·  ')}</p>` : '';

    const where = g.from || g.at;
    const fromLine = where ? `<p class="muted">from ${escapeHtml(where)}</p>` : '';

    const v = errors.verdict(g);
    const verdictLine = v ? `<p class="verdict">→ ${escapeHtml(v)}</p>` : '';

    return `<article>
      <p class="head">
        <span class="count" style="background:${tone}">${g.count}×</span>
        <strong>${escapeHtml(g.source)}</strong>
        ${g.origin === 'browser' ? '<span class="muted">browser</span>' : ''}
        <span class="muted">${escapeHtml(g.kind)}</span>
        <span class="muted right" title="first seen ${escapeHtml(errors.stamp(g.first))}">
          ${escapeHtml(errors.stamp(g.first))} → ${escapeHtml(errors.stamp(g.last))}
          (${errors.ago(g.last)} ago)
        </span>
      </p>
      <p class="msg">${escapeHtml(g.message)}</p>
      ${factLine}${fromLine}${verdictLine}${detail}${samples}
    </article>`;
  }).join('');

  const be = errors.backendState();
  const beLine = be.url
    ? `<p class="${be.up === false ? 'verdict' : 'muted'}">API <code>${escapeHtml(be.url)}</code> — ${
        be.up === null ? 'not probed' : be.up ? 'reachable' : '<strong>UNREACHABLE</strong>'}</p>`
    : '';

  return SHELL('Dev errors', `
    <style>
      .card { max-width: 62rem; }
      article { border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
                padding: .85rem 0; }
      .head { display: flex; gap: .6rem; align-items: baseline; margin: 0 0 .2rem; opacity: 1; }
      .right { margin-left: auto; font-size: .82em; }
      .count { color: #fff; border-radius: .35em; padding: .05em .45em;
               font-size: .8em; font-weight: 600; }
      .muted { opacity: .6; }
      .msg { margin: .1rem 0; font-family: ui-monospace, monospace; font-size: .88em; }
      .facts { margin: .15rem 0; font-family: ui-monospace, monospace; font-size: .82em;
               color: #3b82f6; }
      .verdict { margin: .15rem 0; font-size: .85em; color: #d97706; }
      pre { margin: .35rem 0 0; padding: .5rem .7rem; overflow-x: auto; font-size: .8em;
            background: color-mix(in srgb, CanvasText 7%, transparent);
            border-radius: .35em; opacity: .8; }
      .bar { display: flex; gap: 1rem; align-items: baseline; margin-bottom: .5rem; }
    </style>
    <div class="bar">
      <h1>${c.errors} error${c.errors === 1 ? '' : 's'}${c.warns ? `, ${c.warns} warning${c.warns === 1 ? '' : 's'}` : ''}</h1>
      <span class="muted">${c.occurrences} occurrences</span>
      <span class="right muted" style="margin-left:auto">
        <a href="/">status</a> · <a href="/errors.json">json</a> · <a href="/errors/clear">clear</a>
      </span>
    </div>
    ${beLine}
    <p class="muted">Grouped by normalised signature — repeats of one fault collapse
       into a single row, so this is a fix-list, not a log.</p>
    ${rows}
    <script>setTimeout(() => location.reload(), 10000)</script>`);
}

function statusPage() {
  const rows = [...registry.values()]
    .sort((a, b) => a.service.port - b.service.port)
    .map((e) => {
      const dot = { ready: '🟢', starting: '🟡', stopping: '🟠' }[e.state] || '⚪';
      const since = e.lastHit ? `${Math.round((Date.now() - e.lastHit) / 1000)}s ago` : '—';
      return `<tr><td>${dot}</td>
        <td><a href="http://localhost:${e.service.port}">${escapeHtml(e.service.key)}</a></td>
        <td><code>:${e.service.port}</code></td>
        <td>${e.state}</td><td>${since}</td></tr>`;
    })
    .join('');

  const live = [...registry.values()].filter((e) => e.state === 'ready').length;
  const c = errors.counts();
  const errLine = c.groups
    ? `<p><a href="/errors"><strong>${c.errors} error${c.errors === 1 ? '' : 's'}</strong>` +
      `${c.warns ? ` and ${c.warns} warning${c.warns === 1 ? '' : 's'}` : ''} recorded</a>` +
      ` <span style="opacity:.6">(${c.occurrences} occurrences)</span></p>`
    : '<p><a href="/errors">No errors recorded</a></p>';

  return SHELL('Rutba dev gateway', `
    <h1>Dev gateway</h1>
    <p>${live} of ${registry.size} apps running. Apps boot on first request and
       stop after ${idleLabel()} idle.</p>
    ${errLine}
    <table><tr><th></th><th>App</th><th>Port</th><th>State</th><th>Last hit</th></tr>
    ${rows}</table>
    <script>setTimeout(() => location.reload(), 5000)</script>`);
}

// ── entry point ────────────────────────────────────────────

/**
 * @param {object}   opts
 * @param {string[]} opts.keys    app keys to front (those NOT started eagerly)
 * @param {Function} opts.log
 * @param {number}   [opts.idleMinutes]
 * @returns {{ servers: import('http').Server[], stopAll: Function }}
 */
function startGateway({ keys, log = console.log, idleMinutes } = {}) {
  notify = log;
  if (idleMinutes !== undefined) IDLE_MS = idleMinutes * 60_000;

  const servers = [];

  for (const key of keys) {
    const service = findService(key);
    if (!service || service.kind !== 'app') continue;

    const entry = { service, state: 'idle', stopping: false, child: null, shadowPort: null,
                    lastHit: null, startedAt: null, log: [], sockets: new Set() };
    registry.set(key, entry);

    const server = http.createServer((req, res) => handle(entry, req, res));
    server.on('upgrade', (req, socket, head) => upgrade(entry, req, socket, head));
    // A malformed or abruptly-reset client connection reaches the server as
    // 'clientError'; the default action is fine, but the socket still needs
    // destroying explicitly or it can surface as an unhandled error.
    server.on('clientError', (_err, sock) => { try { sock.destroy(); } catch {} });
    server.on('error', (err) => {
      log(`cannot front ${key} on :${service.port} — ${err.code === 'EADDRINUSE'
        ? 'port already in use (started elsewhere?)' : err.message}`);
      registry.delete(key);
    });
    server.listen(service.port, '0.0.0.0');
    servers.push(server);
  }

  const status = http.createServer((req, res) => {
    const route = req.url.split('?')[0];

    if (route === '/errors.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ counts: errors.counts(), groups: errors.all() }, null, 2));
    }
    if (route === '/errors/clear') {
      errors.reset();
      errors.save();
      res.writeHead(302, { location: '/errors' });
      return res.end();
    }
    if (route === '/errors') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(errorsPage());
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(statusPage());
  });
  // Never swallow this. A silently unbound status server means /errors and the
  // app table answer from whatever already owns the port — in practice a stale
  // gateway from an earlier session — and you read someone else's state while
  // believing it is this run's.
  status.on('error', (err) => {
    log(err.code === 'EADDRINUSE'
      ? `status port :${STATUS_PORT} is already in use — another dev session is ` +
        'probably still running. Run `npm run dev:stop`, then start again.'
      : `status server error: ${err.message}`);
  });
  status.listen(STATUS_PORT, '0.0.0.0');
  servers.push(status);

  const sweeper = setInterval(sweepIdle, 30_000);
  sweeper.unref();

  function stopAll() {
    clearInterval(sweeper);
    for (const entry of registry.values()) stop(entry, 'shutdown');
    for (const s of servers) { try { s.close(); } catch {} }
  }

  return { servers, stopAll, registry, statusPort: STATUS_PORT };
}

module.exports = { startGateway, SHADOW_OFFSET, STATUS_PORT };

// Standalone: front every app in the manifest.
if (require.main === module) {
  const { scaffoldOnce } = require('./dev-runtime');
  scaffoldOnce((m) => console.log(`[gateway] ${m}`));
  const g = startGateway({
    keys: apps().map((a) => a.key),
    log: (m) => console.log(`\x1b[36m[gateway]\x1b[0m ${m}`),
  });
  console.log(`[gateway] fronting ${g.registry.size} apps — status on :${STATUS_PORT}`);
  process.on('SIGINT', () => { g.stopAll(); process.exit(0); });
  process.on('SIGTERM', () => { g.stopAll(); process.exit(0); });
}
