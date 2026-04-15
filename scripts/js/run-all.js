#!/usr/bin/env node
'use strict';

/**
 * scripts/run-all.js — Run one app or all apps in parallel
 *
 * Usage:
 *   node scripts/run-all.js dev              → spawns all dev:* scripts
 *   node scripts/run-all.js start            → spawns all start:* scripts
 *   node scripts/run-all.js dev auth         → spawns only dev:auth
 *   node scripts/run-all.js start strapi     → spawns only start:strapi
 *
 * Single-app mode is also activated by the RUTBA_APP environment variable:
 *   RUTBA_APP=auth   node scripts/run-all.js dev   → same as passing "auth" as arg
 *
 * This allows per-installation single-app deployments without changing
 * package.json scripts — just set RUTBA_APP in the server's environment.
 *
 * In all-apps mode, Strapi is started first with a short delay so the API
 * is ready before the Next.js apps connect.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const prefix = process.argv[2];

if (!prefix) {
  console.error('Usage: node scripts/run-all.js <dev|start> [app-name]');
  process.exit(1);
}

const pkg = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
);

// ── Resolve target app (CLI arg takes priority over env var) ──

const appArg = process.argv[3] || process.env.RUTBA_APP || null;

// ── Helpers ────────────────────────────────────────────────

const children = [];

function runScript(name) {
  console.log(`\x1b[36m[run-all]\x1b[0m Starting ${name}`);
  const child = spawn('npm', ['run', name], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  });
  children.push(child);
  child.on('error', (err) => {
    console.error(`\x1b[31m[run-all]\x1b[0m ${name} error: ${err.message}`);
  });
  child.on('exit', (code) => {
    if (code) console.error(`\x1b[31m[run-all]\x1b[0m ${name} exited with code ${code}`);
  });
  return child;
}

// Graceful shutdown — kill all children on SIGINT / SIGTERM
function cleanup() {
  for (const child of children) {
    child.kill();
  }
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// ── Single-app mode ────────────────────────────────────────

if (appArg) {
  const scriptKey = `${prefix}:${appArg}`;
  const source = process.argv[3] ? 'arg' : `RUTBA_APP=${appArg}`;
  if (!pkg.scripts[scriptKey]) {
    console.error(`\x1b[31m[run-all]\x1b[0m Unknown script "${scriptKey}" (from ${source})`);
    console.error(
      '  Available:',
      Object.keys(pkg.scripts)
        .filter((k) => k.startsWith(`${prefix}:`) && k !== `${prefix}:all`)
        .join(', ')
    );
    process.exit(1);
  }
  console.log(`\x1b[36m[run-all]\x1b[0m Single-app mode (${source})`);
  runScript(scriptKey);
  // Exit when the single child exits
  children[0].on('exit', (code) => process.exit(code ?? 1));
  return;
}

// ── All-apps mode ──────────────────────────────────────────

// Self-referencing and desk scripts are excluded from the parallel run
const EXCLUDED = new Set([`${prefix}:all`, `${prefix}:desk`, prefix]);
const strapiKey = `${prefix}:strapi`;
const allKeys = Object.keys(pkg.scripts)
  .filter((k) => k.startsWith(`${prefix}:`) && !EXCLUDED.has(k) && k !== strapiKey);

if (!pkg.scripts[strapiKey] && allKeys.length === 0) {
  console.error(`[run-all] No scripts found matching "${prefix}:*"`);
  process.exit(1);
}

// Start strapi first, then all other apps after a short delay
if (pkg.scripts[strapiKey]) {
  runScript(strapiKey);
}

const delay = pkg.scripts[strapiKey] ? 3000 : 0;
setTimeout(() => {
  for (const key of allKeys) {
    runScript(key);
  }
}, delay);
