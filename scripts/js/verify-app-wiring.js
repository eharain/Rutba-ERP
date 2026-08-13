#!/usr/bin/env node
'use strict';

/**
 * scripts/js/verify-app-wiring.js — cross-check that every app is registered
 * everywhere it needs to be.
 *
 * Adding an app to this monorepo means touching eight unrelated files. Miss
 * one and the failure is silent and delayed: an app with no PREFIX__PORT falls
 * back to Next's default 3000 and crash-loops on EADDRINUSE behind whichever
 * app bound it first — which is exactly how rutba-ess, rutba-inventory and
 * rutba-marketplace sat dead on the deploy box for months while `systemctl`
 * cheerfully reported "activating".
 *
 * Source of truth is scripts/rutba_apps.sh (the systemd service registry).
 * Everything else is checked against it.
 *
 * Usage:
 *   node scripts/js/verify-app-wiring.js            # human-readable report
 *   node scripts/js/verify-app-wiring.js --quiet    # only problems
 *
 * Exit codes:  0 = all wired   1 = at least one hard failure
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const QUIET = process.argv.includes('--quiet');

const read = (p) => {
  try { return fs.readFileSync(path.join(ROOT, p), 'utf8'); } catch { return null; }
};

const errors = [];
const warnings = [];
const fail = (app, msg) => errors.push(`${app}: ${msg}`);
const warn = (app, msg) => warnings.push(`${app}: ${msg}`);

// ── 1. Parse the shell registry ────────────────────────────

const appsSh = read('scripts/rutba_apps.sh');
if (!appsSh) {
  console.error('[verify] scripts/rutba_apps.sh not found — cannot verify.');
  process.exit(1);
}

function parseArrayBlock(src, name) {
  const m = src.match(new RegExp(`${name}=\\(([^)]*)\\)`, 'm'));
  if (!m) return [];
  return m[1].split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

function parseAssocBlock(src, name) {
  const m = src.match(new RegExp(`declare -A ${name}=\\(([\\s\\S]*?)\\n\\)`, 'm'));
  const out = {};
  if (!m) return out;
  const re = /\[([^\]]+)\]="([^"]*)"/g;
  let hit;
  while ((hit = re.exec(m[1])) !== null) out[hit[1]] = hit[2];
  return out;
}

const SERVICES = parseArrayBlock(appsSh, 'RUTBA_SERVICES');
const SVC_CMD = parseAssocBlock(appsSh, 'RUTBA_SVC_CMD');
const SVC_PORT = parseAssocBlock(appsSh, 'RUTBA_SVC_PORT');

if (!SERVICES.length) {
  console.error('[verify] could not parse RUTBA_SERVICES from rutba_apps.sh');
  process.exit(1);
}

// ── 2. Load the other sources ──────────────────────────────

const pkg = JSON.parse(read('package.json'));
const envConfig = read('scripts/js/env-config.js') || '';
const dockerfile = read('Dockerfile') || '';
const compose = read('docker-compose.yml') || '';
const devStart = read('dev-start.bat') || '';
const sampleEnv = read('sample.env.enviromentname.txt') || '';
const envDev = read('.env.development');          // gitignored — may be absent
const envProd = read('.env.production');          // gitignored — may be absent
const rolesJs = read('packages/pos-shared/lib/roles.js') || '';

// packages/pos-shared/lib/roles.js APP_URLS carries a hard-coded localhost
// fallback per app. It only bites when the NEXT_PUBLIC_*_URL is absent, which
// is exactly when nobody is watching — `web` sat on 4010 (pos-strapi's port)
// instead of 4000, so a cross-app link out of any admin app landed on Strapi.
const rolesUrlPorts = new Map();
for (const m of rolesJs.matchAll(
  /^\s*'?([\w-]+)'?\s*:\s*process\.env\.(NEXT_PUBLIC_\w+)\s*\|\|\s*'http:\/\/localhost:(\d+)'/gm
)) {
  rolesUrlPorts.set(m[1], { envKey: m[2], port: m[3] });
}

const dockerStages = new Set(
  [...dockerfile.matchAll(/^FROM\s+\S+\s+AS\s+([\w-]+)/gm)].map((m) => m[1])
);
const composeServices = new Set(
  [...compose.matchAll(/^ {2}([a-z][\w-]*):$/gm)].map((m) => m[1])
);

/** pos-auth -> AUTH, rutba-web-user -> WEB_USER; pos-strapi is special (API). */
function urlToken(dir) {
  if (dir === 'pos-strapi') return 'API';
  return dir.replace(/^(pos|rutba)-/, '').toUpperCase().replace(/-/g, '_');
}
/** pos-auth -> POS_AUTH */
const envPrefix = (dir) => dir.toUpperCase().replace(/-/g, '_');

// ── 3. Per-service checks ──────────────────────────────────

const rows = [];
const seenPorts = new Map();

for (const svc of SERVICES) {
  const cmd = SVC_CMD[svc] || '';
  const port = SVC_PORT[svc] || '-';

  const wsMatch = cmd.match(/--workspace=(\S+)/);
  const pfMatch = cmd.match(/--prefix\s+(\S+)/);
  const dir = wsMatch ? wsMatch[1] : pfMatch ? pfMatch[1] : null;
  const isWorker = / run worker /.test(` ${cmd} `);

  if (!dir) { fail(svc, `cannot determine workspace dir from RUTBA_SVC_CMD "${cmd}"`); continue; }

  const row = { svc, dir, port, ok: [], bad: [] };
  const check = (cond, label) => { cond ? row.ok.push(label) : row.bad.push(label); return cond; };

  // -- workspace exists and is declared --------------------
  if (!check(fs.existsSync(path.join(ROOT, dir, 'package.json')), 'workspace-dir')) {
    fail(svc, `workspace directory ${dir}/ has no package.json`);
  }
  const declared = (pkg.workspaces || []).includes(dir) || dir === 'pos-strapi';
  if (!check(declared, 'in-workspaces')) {
    fail(svc, `${dir} is not listed in package.json "workspaces" (and is not pos-strapi)`);
  }

  // -- npm scripts the systemd unit will invoke -------------
  // The unit runs `npm <RUTBA_SVC_CMD>` directly, so what must exist is the
  // script inside the workspace, not a root-level alias.
  let wsPkg = null;
  try { wsPkg = JSON.parse(read(`${dir}/package.json`)); } catch { /* reported above */ }
  const wantScript = isWorker ? 'worker' : 'start';
  if (wsPkg && !check(!!(wsPkg.scripts || {})[wantScript], `ws:${wantScript}`)) {
    fail(svc, `${dir}/package.json has no "${wantScript}" script, but the unit runs \`npm ${cmd}\``);
  }

  // -- root convenience scripts (dev/start/build) -----------
  const shortNames = Object.keys(pkg.scripts || {})
    .filter((k) => k.startsWith('start:') && (pkg.scripts[k].includes(`--workspace=${dir}`) ||
                                              pkg.scripts[k].includes(`--prefix ${dir} `)))
    .map((k) => k.slice('start:'.length));
  const short = shortNames[0] || null;

  if (!isWorker) {
    if (!check(!!short, 'root:start')) fail(svc, `no root "start:*" script targets ${dir}`);
    if (short) {
      check(!!pkg.scripts[`dev:${short}`], 'root:dev') ||
        warn(svc, `no root "dev:${short}" script — dev-start.bat cannot launch it`);
      check(!!pkg.scripts[`build:${short}`], 'root:build') ||
        fail(svc, `no root "build:${short}" script — build:all will skip it on deploy`);
    }
  }

  // -- ports ------------------------------------------------
  if (port !== '-') {
    if (seenPorts.has(port)) fail(svc, `port ${port} already claimed by ${seenPorts.get(port)}`);
    else seenPorts.set(port, svc);

    const prefix = envPrefix(dir);
    const portKey = `${prefix}__PORT`;
    const inSample = new RegExp(`^\\s*${portKey}\\s*=`, 'm').test(sampleEnv);
    if (!check(inSample, 'sample:PORT')) {
      fail(svc, `${portKey} missing from sample.env.enviromentname.txt — a first-time deploy seeds .env.production from this file, so the app would fall back to port 3000`);
    }
    for (const [label, body] of [['.env.development', envDev], ['.env.production', envProd]]) {
      if (body === null) continue;                       // gitignored / not present
      if (!new RegExp(`^\\s*${portKey}\\s*=`, 'm').test(body)) {
        fail(svc, `${portKey} missing from ${label}`);
      }
    }
  }

  // -- public URL variable ----------------------------------
  if (!isWorker) {
    const urlKey = `NEXT_PUBLIC_${urlToken(dir)}_URL`;
    if (!check(envConfig.includes(urlKey), 'env-config:URL')) {
      fail(svc, `${urlKey} not declared in scripts/js/env-config.js GLOBAL_VARS — a missing value would never be reported`);
    }
    if (!check(new RegExp(`^\\s*${urlKey}\\s*=`, 'm').test(sampleEnv), 'sample:URL')) {
      fail(svc, `${urlKey} missing from sample.env.enviromentname.txt`);
    }
    for (const [label, body] of [['.env.development', envDev], ['.env.production', envProd]]) {
      if (body === null) continue;
      if (!new RegExp(`^\\s*${urlKey}\\s*=`, 'm').test(body)) fail(svc, `${urlKey} missing from ${label}`);
    }

    // -- roles.js APP_URLS fallback port ----------------------
    const entry = [...rolesUrlPorts].find(([, v]) => v.envKey === urlKey);
    const isBackend = dir === 'pos-strapi' || dir === 'rutba-core';
    if (entry) {
      const [appKey, { port: fallbackPort }] = entry;
      if (!check(port === '-' || fallbackPort === port, 'roles.js:port')) {
        fail(svc, `roles.js APP_URLS.${appKey} falls back to localhost:${fallbackPort}, but the ` +
          `registry says ${port}. Cross-app links land on the wrong app whenever ${urlKey} is unset.`);
      }
    } else if (!isBackend && !check(false, 'roles.js:entry')) {
      warn(svc, `no APP_URLS entry in packages/pos-shared/lib/roles.js keyed on ${urlKey} — ` +
        `the app launcher cannot link to it`);
    }
  }

  // -- docker ------------------------------------------------
  const dockerName = isWorker ? 'marketplace-worker' : (short || dir);
  if (!check(dockerStages.has(dockerName), 'docker:stage')) {
    warn(svc, `no Dockerfile stage "${dockerName}" — the Docker path cannot build it`);
  }
  if (!check(composeServices.has(dockerName), 'docker:compose')) {
    warn(svc, `no docker-compose service "${dockerName}"`);
  }

  // -- dev launcher ------------------------------------------
  if (short) {
    const devCmd = isWorker ? `worker:${short}` : `dev:${short}`;
    if (!check(devStart.includes(devCmd), 'dev-start.bat')) {
      warn(svc, `dev-start.bat never runs "npm run ${devCmd}"`);
    }
  }

  rows.push(row);
}

// ── 4. Report ──────────────────────────────────────────────

if (!QUIET) {
  console.log('');
  console.log(`[verify] ${SERVICES.length} services in scripts/rutba_apps.sh\n`);
  const w = Math.max(...rows.map((r) => r.svc.length));
  for (const r of rows) {
    const mark = r.bad.length === 0 ? 'OK  ' : 'GAP ';
    console.log(`  [${mark}] ${r.svc.padEnd(w)}  ${String(r.port).padStart(5)}  ${r.dir}` +
      (r.bad.length ? `\n           missing: ${r.bad.join(', ')}` : ''));
  }
  console.log('');
}

for (const w of warnings) console.warn(`[verify] WARN  ${w}`);
if (warnings.length) console.warn('');
for (const e of errors) console.error(`[verify] ERROR ${e}`);

if (errors.length) {
  console.error(`\n[verify] ${errors.length} problem(s), ${warnings.length} warning(s).\n`);
  process.exit(1);
}
console.log(`[verify] All ${SERVICES.length} services fully wired` +
  (warnings.length ? ` (${warnings.length} warning(s)).` : '.') + '\n');
