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
 *   - Auto-derives PORT from NEXT_PUBLIC_*_URL when not explicit
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

const { spawn } = require('child_process');
const {
  resolveAllVariables,
  getAppPrefixes,
  splitVariables,
  validateVariables,
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
  `[env] Mode: ${mode} | Environment: ${environment} | Target: ${targetPrefix}`
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

// ── 4. Build env map for the target app ────────────────────

const envForApp = {};

// Globals go to every app
for (const [key, value] of Object.entries(globals)) {
  envForApp[key] = value;
}

// App-specific vars (prefix stripped)
const targetAppVars = appVars[targetPrefix] || {};
for (const [key, value] of Object.entries(targetAppVars)) {
  envForApp[key] = value;
}

// ── 5. Auto-derive PORT from matching NEXT_PUBLIC_*_URL ────
//    pos-auth → strip "pos-" → AUTH → NEXT_PUBLIC_AUTH_URL
//    rutba-web-user → strip "rutba-" → WEB_USER → NEXT_PUBLIC_WEB_USER_URL
//
//    Resolution order (first match wins):
//      1. Explicit PREFIX__PORT already in envForApp  → already set, skip block
//      2. Explicit port in URL  (http://host:4003)    → use it directly
//      3. No port in URL, unique host                 → use scheme default
//                                                        http:  → 80
//                                                        https: → 443
//      4. No port in URL, multiple apps share same host → each gets a unique
//         incremental port starting at 40000, assigned in sorted URL-name order
//         (prevents every app silently binding to the same scheme-default port)

if (!envForApp.PORT) {
  const shortName = targetDir
    .replace(/^pos-/, '')
    .replace(/^rutba-/, '')
    .toUpperCase()
    .replace(/-/g, '_');
  const urlKey = `NEXT_PUBLIC_${shortName}_URL`;
  const urlValue = envForApp[urlKey];

  if (urlValue) {
    try {
      const parsed = new URL(urlValue);

      if (parsed.port) {
        // Tier 2 — explicit port present in the URL
        envForApp.PORT = parsed.port;
      } else {
        // Tier 3 / 4 — URL uses a standard port (no explicit :port in string)
        const SCHEME_PORT = { 'http:': 80, 'https:': 443 };
        const schemePort = SCHEME_PORT[parsed.protocol] ?? 80;
        const hostKey = `${parsed.protocol}//${parsed.hostname}`;

        // Collect every app URL that shares this exact scheme+host and also
        // carries no explicit port — these would all collide on schemePort.
        const NON_APP = new Set(['API', 'IMAGE', 'IMAGE_HOST']);
        const APP_URL_RE = /^NEXT_PUBLIC_(\w+)_URL$/;
        const sharedApps = [];

        for (const [k, v] of Object.entries(envForApp)) {
          const m = k.match(APP_URL_RE);
          if (!m || NON_APP.has(m[1])) continue;
          try {
            const u = new URL(v);
            if (!u.port && `${u.protocol}//${u.hostname}` === hostKey) {
              sharedApps.push(m[1]); // e.g. 'AUTH', 'STOCK', 'WEB', …
            }
          } catch { /* skip non-URL values */ }
        }

        if (sharedApps.length > 1) {
          // Tier 4 — shared host: assign a unique port per app
          sharedApps.sort(); // deterministic, independent of env-file order
          const idx = sharedApps.indexOf(shortName);
          envForApp.PORT = String(40000 + (idx >= 0 ? idx : sharedApps.length));
        } else {
          // Tier 3 — only this app on this host: safe to use scheme default
          envForApp.PORT = String(schemePort);
        }
      }
    } catch { /* ignore invalid URLs */ }
  }
}

// ── 6. For pos-strapi, inject CORS_ORIGINS ─────────────────

if (targetPrefix === 'POS_STRAPI') {
  const strapiPort = envForApp.PORT || '4010';
  const strapiOrigins = [
    `http://localhost:${strapiPort}`,
    `http://127.0.0.1:${strapiPort}`,
  ];
  const corsOrigins = [...allOrigins].filter(
    (o) => !strapiOrigins.includes(o)
  );
  envForApp.CORS_ORIGINS = corsOrigins.join(',');
}

// ── 7. Spawn the command ───────────────────────────────────

const child = spawn(command, commandArgs, {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, ...envForApp },
});

child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (err) => {
  console.error(`Failed to start: ${err.message}`);
  process.exit(1);
});
