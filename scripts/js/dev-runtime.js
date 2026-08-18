#!/usr/bin/env node
'use strict';

/**
 * scripts/js/dev-runtime.js — Shared plumbing for the dev supervisor and gateway
 *
 * The old dev-start.bat opened one `cmd /k` window per service, and each window
 * ran the chain:
 *
 *     cmd.exe → npm run dev:<app> → node load-env.js → npm run dev -w <app> → next
 *
 * That is five processes per app and ~110 processes for the full 24-service set,
 * before a single line of application code is compiled. Worse, each window is a
 * separate process tree, so RUTBA_API_SCAFFOLDED=1 cannot propagate and the
 * api-provider scaffolder runs once per window instead of once per machine.
 *
 * This module collapses that: env is resolved ONCE in-process (the same
 * env-utils the load-env.js CLI uses, so the resulting environment is
 * byte-identical), the scaffolder runs ONCE, and each app is spawned as a bare
 * `node next dev` — one process instead of five.
 *
 * Consumed by:
 *   scripts/js/dev.js          — supervisor: run N apps in one window
 *   scripts/js/dev-gateway.js  — gateway: boot apps on first request, idle them out
 */

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const {
  getAppPrefixes,
  resolveAllVariables,
  splitVariables,
  validateVariables,
  buildEnvForApp,
} = require('./env-utils');

// ── repo root ──────────────────────────────────────────────
// Windows keeps whatever drive-letter case the caller used, and the bundler
// treats `d:\Rutba\ERP` and `D:\Rutba\ERP` as two different trees: starting an
// app with a lower-case cwd produced 111 "case-semantic" warnings and a
// duplicated @rutba/shared module graph, against 0 with an upper-case one
// (measured 2026-08-19). Normalising at the single point where the root is
// computed means no launcher can reintroduce that — `cd /d d:\rutba\erp`
// included.
function normalizePath(p) {
  return p.replace(/^([a-z]):/, (_, d) => `${d.toUpperCase()}:`);
}

const ROOT = normalizePath(path.resolve(__dirname, '..', '..'));

// ── manifest ───────────────────────────────────────────────

const MANIFEST = path.join(ROOT, 'config', 'apps.manifest.json');

let _services = null;

/** Every entry in config/apps.manifest.json, `$comment` keys stripped. */
function services() {
  if (_services) return _services;
  const raw = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  _services = raw.services.filter((s) => s && s.key);
  return _services;
}

/** Launchable Next.js apps only — no backends, no workers. */
function apps() {
  return services().filter((s) => s.kind === 'app');
}

function findService(key) {
  return services().find((s) => s.key === key) || null;
}

// ── one-shot env resolution ────────────────────────────────
// load-env.js does this per process. We do it once and hand each child its own
// slice, which is both faster and guarantees every app in a run sees the same
// resolved ENVIRONMENT rather than re-reading .env files at staggered times.

let _env = null;

function prepareEnv() {
  if (_env) return _env;

  const allPrefixes = getAppPrefixes();
  const { mode, environment, vars } = resolveAllVariables();
  const { globals, appVars, allOrigins } = splitVariables(vars, allPrefixes);

  _env = { mode, environment, allPrefixes, globals, appVars, allOrigins };
  return _env;
}

/**
 * Build the environment for one service, validating it the same way
 * load-env.js would. Returns { env, errors, warnings } — callers decide
 * whether a validation error is fatal (the supervisor skips that app and
 * keeps the rest running, rather than taking down the whole session).
 */
function envForService(service) {
  const { allPrefixes, globals, appVars, allOrigins } = prepareEnv();
  const targetPrefix = service.envPrefix;

  const { errors, warnings } = validateVariables(globals, appVars, allPrefixes, {
    targetPrefix,
  });

  const env = buildEnvForApp({
    targetDir: service.workspace,
    targetPrefix,
    globals,
    appVars,
    allOrigins,
    platformPort: undefined,
  });

  return { env, errors, warnings };
}

// ── api-provider scaffolder ────────────────────────────────

let _scaffolded = false;

/**
 * Run the api-provider scaffolder once per supervisor/gateway process. Children
 * inherit RUTBA_API_SCAFFOLDED=1 so load-env.js short-circuits if anything in
 * the chain still goes through it.
 */
function scaffoldOnce(log = console.log) {
  if (_scaffolded || process.env.RUTBA_API_SCAFFOLDED === '1') return;
  const script = path.join(
    ROOT, 'packages', 'api-provider', 'scripts', 'scaffold-endpoint-providers.mjs'
  );
  if (!fs.existsSync(script)) return;

  log('scaffolding @rutba/api-provider (once for this session)');
  const res = spawnSync(process.execPath, [script], { cwd: ROOT, stdio: 'inherit' });
  if (res.status !== 0) log('api-provider scaffolder exited non-zero — continuing');

  process.env.RUTBA_API_SCAFFOLDED = '1';
  _scaffolded = true;
}

// ── spawning ───────────────────────────────────────────────

const NEXT_BIN = path.join(ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

/**
 * Start a Next.js app as a single `node next dev` process.
 *
 * No shell, no cmd.exe, no npm: those layers only existed to resolve the env
 * and pick the workspace, and both are already settled by the time we get here.
 * Skipping them removes ~4 processes and ~6-9s of startup per app.
 *
 * @param {object} service  manifest entry
 * @param {object} [opts]
 * @param {number} [opts.port]  override the manifest port (the gateway boots
 *                              apps on a shadow port so it can own the real one)
 */
function spawnApp(service, opts = {}) {
  const { env, errors, warnings } = envForService(service);
  const port = String(opts.port || env.PORT || service.port);

  const child = spawn(
    process.execPath,
    [NEXT_BIN, 'dev', '--turbopack', '-p', port],
    {
      cwd: path.join(ROOT, service.workspace),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...env,
        PORT: port,
        RUTBA_API_SCAFFOLDED: '1',
        FORCE_COLOR: '1',
      },
    }
  );

  return { child, port: Number(port), errors, warnings };
}

/**
 * Start a backend. Strapi and Core keep their npm indirection — they are one
 * process each, run at most once per session, and their package scripts do
 * meaningful work (strapi's CLI, core's nodemon) that we should not reimplement.
 */
function spawnBackend(which) {
  const service = findService(which);
  if (!service) throw new Error(`Unknown backend "${which}"`);

  const { env } = envForService(service);
  const script = which === 'strapi' ? 'develop' : 'dev';

  const child = spawn(
    'npm',
    ['--prefix', service.workspace, 'run', script],
    {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: { ...process.env, ...env, RUTBA_API_SCAFFOLDED: '1', FORCE_COLOR: '1' },
    }
  );

  return { child, port: service.port };
}

/**
 * Split a stream into whole lines before handing them to a formatter.
 *
 * Child stdout arrives in arbitrary chunks that routinely cut a line in half,
 * so prefixing raw chunks interleaves two apps' output mid-line. Holding the
 * partial tail until its newline arrives keeps one window readable.
 */
function lineBuffer(onLine) {
  let carry = '';
  return (buf) => {
    const parts = (carry + buf.toString()).split('\n');
    carry = parts.pop();
    for (const line of parts) if (line.trim()) onLine(line);
  };
}

/**
 * Kill a child and everything it spawned. On Windows child.kill() only reaches
 * the direct child, which for the npm-wrapped backends leaves the real server
 * orphaned and holding its port — the reason dev-stop.bat resorted to
 * `taskkill /f /im node.exe` and took down every unrelated Node process on the
 * machine with it.
 */
function killTree(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

module.exports = {
  ROOT,
  normalizePath,
  services,
  apps,
  findService,
  prepareEnv,
  envForService,
  scaffoldOnce,
  lineBuffer,
  spawnApp,
  spawnBackend,
  killTree,
};
