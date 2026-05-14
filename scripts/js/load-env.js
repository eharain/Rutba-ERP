#!/usr/bin/env node
'use strict';

/**
 * scripts/load-env.js — Centralized environment loader for Rutba POS
 *
 * Operates in two discrete modes:
 *
 *   File mode  (default — .env file exists at repo root)
 *     1. Reads .env           → determines ENVIRONMENT (+ base vars)
 *     2. Reads .env.<ENV>     → full configuration (overrides .env)
 *     3. File values take precedence over process.env
 *
 *   Env-var mode  (no .env file — Docker / CI)
 *     1. ENVIRONMENT from process.env (default: development)
 *     2. All config pulled from process.env
 *     3. Only keys matching known prefixes or NEXT_PUBLIC_* collected
 *
 * In both modes the loader:
 *   - Validates variables against the registry in scripts/env-config.js
 *   - Errors on missing critical variables, warns on optional ones
 *   - Splits globals vs PREFIX__VAR app-specific variables
 *   - Passes through PORT from explicit config (PREFIX__PORT) or platform
 *   - Auto-computes CORS_ORIGINS for pos-strapi
 *   - Spawns <command> with the merged environment
 *
 * Usage:
 *   node scripts/load-env.js -- <command> [args...]
 *
 * The target app is auto-detected from --workspace=<dir> or --prefix <dir>
 * in the command arguments.
 *
 * Prefix convention:
 *   workspace dir "pos-auth"       → prefix POS_AUTH
 *   workspace dir "rutba-web-user" → prefix RUTBA_WEB_USER
 *   Double underscore (__) separates prefix from var name:
 *     POS_STRAPI__PORT=4010  →  PORT=4010  (for pos-strapi only)
 */
console.log('Time Now' , new Date().toISOString());
const { spawn } = require('child_process');
const {
  resolveAllVariables,
  getAppPrefixes,
  splitVariables,
  validateVariables,
  buildEnvForApp,
} = require('./env-utils');

// ── detect target from command arguments ───────────────────

function findTargetDir(cmdArgs) {
  for (let i = 0; i < cmdArgs.length; i++) {
    const wsMatch = cmdArgs[i].match(/^--workspace=(.+)$/);
    if (wsMatch) return wsMatch[1];
    if (cmdArgs[i] === '--prefix' && cmdArgs[i + 1]) return cmdArgs[i + 1];
  }
  return null;
}

// ── CLI parsing ────────────────────────────────────────────

const cliArgs = process.argv.slice(2);
const sepIdx = cliArgs.indexOf('--');

if (sepIdx < 0 || !cliArgs[sepIdx + 1]) {
  console.error('Usage: node scripts/load-env.js -- <command> [args...]');
  process.exit(1);
}

const command = cliArgs[sepIdx + 1];
const commandArgs = cliArgs.slice(sepIdx + 2);

const targetDir = findTargetDir(commandArgs);
if (!targetDir) {
  console.error(
    'Could not detect target app. Use --workspace=<dir> or --prefix <dir> in the command.'
  );
  process.exit(1);
}

const targetPrefix = targetDir.toUpperCase().replace(/-/g, '_');
const allPrefixes = getAppPrefixes();

// ── 1. Resolve variables (file mode or env-var mode) ───────

const { mode, environment, vars } = resolveAllVariables();
console.log(
  `[env] Environment Mode: ${mode} | Environment: ${environment} | Target: ${targetPrefix}`
);

// ── 2. Split global vs app-specific ────────────────────────

const { globals, appVars, allOrigins } = splitVariables(vars, allPrefixes);

// ── 3. Validate against required-variables registry ────────

const { errors, warnings } = validateVariables(
  globals, appVars, allPrefixes, { targetPrefix }
);

for (const w of warnings) console.warn(`[env] WARN: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`[env] ERROR: ${e}`);
  console.error(
    `[env] ${errors.length} required variable(s) missing — aborting.`
  );
  process.exit(1);
}

// ── 4–6. Build env map for the target app ─────────────────
//  Delegates to buildEnvForApp() in env-utils.js which handles:
//    • globals + prefix-stripped app vars
//    • PORT pass-through (explicit config only — PREFIX__PORT or platform)
//    • CORS_ORIGINS injection for POS_STRAPI

const platformPort = process.env.PORT;

const envForApp = buildEnvForApp({
  targetDir,
  targetPrefix,
  globals,
  appVars,
  allOrigins,
  platformPort,
});

if (platformPort && envForApp.PORT === platformPort) {
  console.log(
    `[env] PORT override: platform provides ${platformPort}`
  );
}

// ── 7. One-shot scaffold ───────────────────────────────────
// Every dev/build/start runs the api-provider scaffolder once before
// launching its command, so generated providers are always in sync with the
// `api/` descriptors at process start. The scaffolder is idempotent and
// content-aware — repeat invocations from sibling workspaces are cheap and
// don't churn webpack caches.
//
// RUTBA_API_SCAFFOLDED=1 short-circuits this so a parent process (run-all.js)
// can scaffold once for the whole tree and have children skip.
//
// Developers actively editing `api/` descriptors should run the watcher
// in a side terminal:
//   npm run watch --workspace=@rutba/api-provider
const path = require('path');

function scaffoldOnce() {
  if (process.env.RUTBA_API_SCAFFOLDED === '1') return;
  if (targetDir === 'packages/api-provider' || targetDir.endsWith('/api-provider')) return;
  const { spawnSync } = require('child_process');
  const scriptPath = path.resolve(
    __dirname, '..', '..', 'packages', 'api-provider', 'scripts', 'scaffold-endpoint-providers.mjs'
  );
  if (!require('fs').existsSync(scriptPath)) return;
  console.log('[env] scaffolding @rutba/api-provider (one-shot)');
  const res = spawnSync('node', [scriptPath], { stdio: 'inherit' });
  if (res.status !== 0) {
    console.warn('[env] api-provider scaffolder exited non-zero — continuing');
  }
  process.env.RUTBA_API_SCAFFOLDED = '1';
}
scaffoldOnce();

// ── 8. Spawn the command ───────────────────────────────────

const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...envForApp },
});

function shutdown(code) {
  process.exit(code ?? 1);
}

child.on('exit', (code) => shutdown(code));
child.on('error', (err) => {
  console.error(`Failed to start: ${err.message}`);
  shutdown(1);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
