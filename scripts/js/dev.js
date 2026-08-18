#!/usr/bin/env node
'use strict';

/**
 * scripts/js/dev.js — One-window dev environment for the Rutba monorepo
 *
 * Replaces dev-start.bat, which opened 24 `cmd /k` windows and started all 22
 * Next.js apps eagerly. See dev-runtime.js for why that was expensive and
 * dev-gateway.js for how the on-demand mode works.
 *
 *   npm run dev                 backend + auth eagerly, other 20 apps on demand
 *   npm run dev pos crm         backend + auth + pos + crm eagerly, nothing lazy
 *   npm run dev -- --all        all 22 eagerly (the old dev-start.bat behaviour)
 *   npm run dev -- --cat sales  every app in the "sales" category
 *   npm run dev -- --core       use services/core (:4020) instead of Strapi
 *   npm run dev -- --no-backend attach to a backend that is already running
 *
 * Ctrl-C stops everything this process started — and nothing else. dev-stop.bat
 * had to `taskkill /f /im node.exe`, which killed every Node process on the
 * machine including unrelated editors and agents.
 */

const {
  ROOT, apps, services, findService, prepareEnv, envForService, scaffoldOnce,
  spawnApp, spawnBackend, killTree, lineBuffer,
} = require('./dev-runtime');

const { startGateway, STATUS_PORT } = require('./dev-gateway');
const errors = require('./dev-errors');

// ── output ─────────────────────────────────────────────────

const PALETTE = [36, 32, 33, 35, 34, 91, 92, 93, 95, 94, 96, 31];
const C = (n, s) => `\x1b[${n}m${s}\x1b[0m`;
const DIM = (s) => `\x1b[2m${s}\x1b[0m`;

let width = 0;
const colorOf = new Map();

function tag(key) {
  if (!colorOf.has(key)) colorOf.set(key, PALETTE[colorOf.size % PALETTE.length]);
  return C(colorOf.get(key), key.padEnd(width));
}

function say(msg) { console.log(`${C(36, '▸'.padEnd(width))} ${msg}`); }

/**
 * Prefix every line of a child's output so one window stays readable, and pass
 * it to the collector on the way past — eager apps and the backend land in the
 * same error store as the gateway's on-demand ones.
 */
function pipeOutput(key, child) {
  const onData = lineBuffer((line) => {
    errors.feed(key, line);
    process.stdout.write(`${tag(key)} ${line}\n`);
  });
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
}

// ── argument parsing ───────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    keys: [], all: false, backend: 'strapi', useBackend: true,
    lazy: true, categories: [], idleMinutes: undefined, worker: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') { opts.all = true; opts.lazy = false; }
    else if (a === '--core') opts.backend = 'core';
    else if (a === '--strapi') opts.backend = 'strapi';
    else if (a === '--no-backend') opts.useBackend = false;
    else if (a === '--no-lazy' || a === '--eager') opts.lazy = false;
    else if (a === '--worker') opts.worker = true;
    else if (a === '--cat' || a === '--category') opts.categories.push(argv[++i]);
    else if (a === '--idle') opts.idleMinutes = Number(argv[++i]);
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('-')) {
      console.error(`Unknown flag: ${a}`);
      process.exit(1);
    } else opts.keys.push(a);
  }
  return opts;
}

function usage() {
  const list = apps().map((a) => a.key).join(', ');
  console.log(`
Rutba dev environment — one window, apps on demand

  npm run dev                    backend + auth eagerly, the rest on demand
  npm run dev pos crm            only these apps (plus backend + auth)
  npm run dev -- --cat sales     every app in a category
  npm run dev -- --all           all 22 apps eagerly (slow; needs ~15 GB)

Flags
  --core | --strapi   which backend to run          (default: strapi)
  --no-backend        assume a backend is already up
  --eager             start the named apps only, no on-demand gateway
  --idle <minutes>    idle shutdown for gateway apps (default: 15)
  --worker            also start the marketplace sync worker

Errors
  Every app's output and every request the gateway proxies is recorded and
  grouped, so repeats of one fault collapse into a single counted row.
    http://localhost:${STATUS_PORT}/errors   live fix-list (json at /errors.json)
    npm run dev:errors             the same list, any time after the fact
  A digest also prints on Ctrl-C, and the store survives in .dev/dev-errors.json.

Categories  ${[...new Set(apps().map((a) => a.category).filter(Boolean))].join(', ')}
Apps        ${list}
`);
}

/**
 * Warn when NEXT_PUBLIC_API_URL does not point at the backend being started.
 *
 * The two backends listen on different ports (strapi 4010, core 4020) and the
 * apps reach whichever NEXT_PUBLIC_API_URL names — a file value, so it cannot
 * be switched from the command line. Start the other one and every browser
 * call is refused at the socket, which axios reports as a bare "Network Error"
 * with no URL attached. That reads like the app is broken, and it costs an
 * afternoon to discover that the app is fine and the port is simply wrong.
 *
 * Cheap to detect here, and impossible to misread once stated.
 */
function checkBackendUrl(backendKey) {
  const svc = findService(backendKey);
  const { env } = envForService(svc);
  const url = env.NEXT_PUBLIC_API_URL;
  if (!url || !svc?.port) return;

  let port;
  try { port = Number(new URL(url).port); } catch { return; }
  if (!port || port === svc.port) return;

  const other = apps().concat(services().filter((s) => s.kind === 'backend'))
    .find((s) => s.kind === 'backend' && s.port === port);

  console.log('');
  say(C(33, `NEXT_PUBLIC_API_URL points at :${port}, but you are starting ${backendKey} on :${svc.port}.`));
  say(C(33, `  ${url}`));
  say(C(33, '  Every API call from the browser will fail with "Network Error" (nothing is'));
  say(C(33, `  listening on :${port}). Either start the matching backend:`));
  say(C(33, `      npm run dev -- --${other ? other.key : 'core'}`));
  say(C(33, '  or point NEXT_PUBLIC_API_URL in .env.development at ' +
            `:${svc.port}.`));
  console.log('');
}

// ── main ───────────────────────────────────────────────────

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();

  const all = apps();
  const valid = new Set(all.map((a) => a.key));

  for (const k of opts.keys) {
    if (!valid.has(k)) {
      console.error(`Unknown app "${k}". Run with --help for the list.`);
      process.exit(1);
    }
  }

  // Resolve which apps start eagerly.
  let eager;
  if (opts.all) {
    eager = all.map((a) => a.key);
  } else {
    eager = [...opts.keys];
    for (const cat of opts.categories) {
      for (const a of all) if (a.category === cat) eager.push(a.key);
    }
    // Every app bounces through the auth portal for SSO
    // (packages/shared/lib/roles.js APP_URLS.auth), so it is only useful to
    // omit it when nothing at all is being started eagerly.
    if (eager.length && !eager.includes('auth')) eager.push('auth');
    if (!eager.length) eager = ['auth'];
    eager = [...new Set(eager)];
  }

  const lazy = opts.lazy ? all.map((a) => a.key).filter((k) => !eager.includes(k)) : [];

  // Column width for the log prefix.
  width = Math.max(
    ...[...eager, ...lazy, opts.backend, 'gateway'].map((s) => s.length), 7
  );

  const { mode, environment } = prepareEnv();

  console.log('');
  say(`Rutba dev  ${DIM(`· env ${environment} (${mode}) · ${ROOT}`)}`);
  say(`eager: ${eager.join(', ')}`);
  if (lazy.length) say(`on demand: ${lazy.length} apps ${DIM('(boot on first request)')}`);
  console.log('');

  scaffoldOnce(say);

  if (opts.useBackend) checkBackendUrl(opts.backend);

  // Sample the API the apps are configured to call, so each recorded error
  // knows whether the backend was reachable when it fired.
  try {
    const { env } = envForService(findService(opts.backend));
    errors.watchBackend(env.NEXT_PUBLIC_API_URL);
  } catch { /* diagnostics are optional; never block startup on them */ }

  const children = [];
  let shuttingDown = false;

  function track(key, child) {
    children.push({ key, child });
    pipeOutput(key, child);
    child.on('exit', (code) => {
      if (!shuttingDown && code) {
        errors.lifecycle(key, `exited with code ${code}`);
        say(`${C(31, key)} exited with code ${code}`);
      }
    });
    child.on('error', (err) => {
      errors.lifecycle(key, `failed to start: ${err.message}`);
      say(`${C(31, key)} failed to start: ${err.message}`);
    });
  }

  // ── backend ──
  if (opts.useBackend) {
    const svc = findService(opts.backend);
    say(`starting ${opts.backend} ${DIM(`:${svc.port}`)}`);
    const { child } = spawnBackend(opts.backend);
    track(opts.backend, child);
  }

  // ── eager apps ──
  for (const key of eager) {
    const service = findService(key);
    // Named envErrors, not errors: the bare name is the collector module in
    // this file's scope, and shadowing it here would silently disable
    // error recording for everything below.
    const { child, port, errors: envErrors } = spawnApp(service);
    for (const e of envErrors) say(`${C(33, key)} env warning: ${e}`);
    say(`starting ${key} ${DIM(`:${port}`)}`);
    track(key, child);
  }

  // ── worker ──
  if (opts.worker) {
    const { spawn } = require('child_process');
    const child = spawn('npm', ['run', 'worker:marketplace'], {
      cwd: ROOT, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, RUTBA_API_SCAFFOLDED: '1' },
    });
    say('starting marketplace worker');
    track('worker', child);
  }

  // ── gateway for everything else ──
  let gateway = null;
  if (lazy.length) {
    gateway = startGateway({
      keys: lazy,
      idleMinutes: opts.idleMinutes,
      log: (m) => process.stdout.write(`${tag('gateway')} ${m}\n`),
    });
    say(`gateway fronting ${lazy.length} apps ${DIM(`· status http://localhost:${STATUS_PORT}`)}`);
  }

  console.log('');
  say(DIM('Ctrl-C stops everything started here (and nothing else).'));
  console.log('');

  // ── shutdown ──
  // Persist periodically as well as on exit, so a session that is killed
  // outright (or that takes the machine down with it) still leaves its findings
  // behind for `npm run dev:errors`.
  const saver = setInterval(() => errors.save(), 30_000);
  saver.unref();

  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(saver);
    errors.save();
    if (errors.counts().groups) {
      console.log(errors.text({ limit: 12 }));
    }
    console.log('');
    say('shutting down…');
    if (gateway) gateway.stopAll();
    for (const { child } of children) killTree(child);
    setTimeout(() => process.exit(0), 1500).unref();
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Ctrl-C in a Windows console does not always deliver SIGINT to a piped
  // child, so watch stdin for the raw ETX byte as well.
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (b) => { if (b[0] === 3) shutdown(); });
  }
}

main();
