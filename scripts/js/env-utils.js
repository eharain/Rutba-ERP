#!/usr/bin/env node
'use strict';

/**
 * scripts/env-utils.js — Shared environment utilities
 *
 * Used by load-env.js and generate-docker-env.js.
 *
 * Two loading modes:
 *
 *   File mode  (default — .env file exists at repo root)
 *     1. .env           →  determines ENVIRONMENT (+ base overrides)
 *     2. .env.<ENV>     →  full configuration (overrides .env)
 *     3. File values take precedence over process.env
 *
 *   Env-var mode  (no .env file — Docker / CI)
 *     1. ENVIRONMENT from process.env (default: development)
 *     2. Configuration pulled from process.env
 *     3. Only keys matching NEXT_PUBLIC_*, known PREFIX__*, or ENVIRONMENT
 *        are collected — random system vars (PATH, HOME, …) are ignored
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DELIM = '__';

// ── .env file parser ───────────────────────────────────────

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const vars = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

// ── build prefix list from workspace dirs ──────────────────

/**
 * Returns all launchable app directories with their env prefixes.
 *
 * @returns {{ dir: string, prefix: string }[]}
 */
function getAppDirs() {
  // config/apps.manifest.json is the single source of truth for identity.
  // Deriving the prefix from the directory name only worked while every
  // workspace sat at the repo root and was named after its env block; under
  // apps/<category>/<name> the leaf name and the env prefix are independent
  // facts, and "SERVICES/STRAPI__PORT" is not an environment variable.
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config', 'apps.manifest.json'), 'utf8')
  );
  const seen = new Set();
  const apps = [];
  for (const svc of manifest.services || []) {
    if (!svc.envPrefix || seen.has(svc.envPrefix)) continue;
    seen.add(svc.envPrefix);
    apps.push({ dir: svc.key, prefix: svc.envPrefix, workspace: svc.workspace });
  }
  return apps;
}

function getAppPrefixes() {
  return getAppDirs().map((a) => a.prefix);
}

/**
 * Resolves whatever npm was handed (--workspace= / --prefix) to an env prefix.
 * Accepts a package name (@rutba/pos), a workspace path (apps/sales/pos, with
 * either slash style, trailing slash optional) or a bare key (pos).
 *
 * A shared package (packages/*) resolves to the empty string rather than null:
 * it is a legitimate build target with no env block of its own, so it gets the
 * globals and no app-specific vars. Only a target that is in neither list is
 * unresolvable — that is a wiring mistake and the caller should fail on it.
 *
 * @param {string} target
 * @returns {string|null} the env prefix, '' for a shared package, or null when
 *                        the target matches nothing in the manifest
 */
function resolveEnvPrefix(target) {
  if (!target) return null;
  const norm = (s) => String(s).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const want = norm(target);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'config', 'apps.manifest.json'), 'utf8')
  );
  for (const svc of manifest.services || []) {
    if (!svc.envPrefix) continue;
    if (
      norm(svc.npm || '') === want ||
      norm(svc.workspace || '') === want ||
      norm(svc.key || '') === want
    ) {
      return svc.envPrefix;
    }
  }
  for (const p of manifest.packages || []) {
    if (norm(p.npm || '') === want || norm(p.path || '') === want) return '';
  }
  return null;
}

// ── resolve variables (two-mode) ───────────────────────────

/**
 * Resolves all configuration variables.
 *
 * @param {Object} [opts]
 * @param {string} [opts.environmentOverride]  Force a specific environment name
 * @returns {{ mode: 'file'|'env', environment: string, vars: Object<string,string> }}
 */
function resolveAllVariables(opts = {}) {
  const rootEnvPath = path.join(ROOT, '.env');
  const hasEnvFile = fs.existsSync(rootEnvPath);
  const allPrefixes = getAppPrefixes();

  let mode, environment, vars;

  if (hasEnvFile) {
    // ── File mode ──────────────────────────────────────────
    mode = 'file';
    const rootVars = parseEnvFile(rootEnvPath);
    environment =
      opts.environmentOverride ||
      rootVars.ENVIRONMENT ||
      process.env.ENVIRONMENT ||
      'development';

    const envFilePath = path.join(ROOT, `.env.${environment}`);
    if (!fs.existsSync(envFilePath)) {
      console.error(`[env] Environment file not found: .env.${environment}`);
      process.exit(1);
    }
    const envFileVars = parseEnvFile(envFilePath);
    // .env.<ENVIRONMENT> overrides .env base vars
    vars = { ...rootVars, ...envFileVars };

    // Operational globals that may come from the platform / system environment
    // even in file mode (same principle as ENVIRONMENT and PORT).
    const FILE_MODE_OVERRIDES = ['NEXT_BUILD_OUTPUT', 'BUILD_DEST_DIR'];
    for (const key of FILE_MODE_OVERRIDES) {
      if (!vars[key] && process.env[key]) {
        vars[key] = process.env[key];
      }
    }
  } else {
    // ── Env-var mode ───────────────────────────────────────
    mode = 'env';
    environment =
      opts.environmentOverride ||
      process.env.ENVIRONMENT ||
      'development';

    // Collect only relevant keys from process.env
    const GLOBAL_PASSTHROUGH = new Set([
      'ENVIRONMENT', 'NEXT_BUILD_OUTPUT', 'BUILD_DEST_DIR',
    ]);
    vars = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (GLOBAL_PASSTHROUGH.has(key)) {
        vars[key] = value;
        continue;
      }
      if (key.startsWith('NEXT_PUBLIC_')) {
        vars[key] = value;
        continue;
      }
      // Known PREFIX__VAR keys
      const delimIdx = key.indexOf(DELIM);
      if (delimIdx > 0) {
        const prefix = key.slice(0, delimIdx);
        if (allPrefixes.includes(prefix)) {
          vars[key] = value;
          continue;
        }
      }
    }
  }

  return { mode, environment, vars };
}

// ── split global vs app-specific ───────────────────────────

/**
 * Splits a flat variable map into globals and per-app maps.
 *
 * @param {Object<string,string>} vars       Flat key=value map
 * @param {string[]}              allPrefixes Known app prefixes
 * @returns {{ globals: Object, appVars: Object, allOrigins: Set<string> }}
 */
function splitVariables(vars, allPrefixes) {
  const globals = {};
  const appVars = {};
  const allOrigins = new Set();

  for (const [key, value] of Object.entries(vars)) {
    try { allOrigins.add(new URL(value).origin); } catch { /* not a URL */ }

    const delimIdx = key.indexOf(DELIM);
    if (delimIdx > 0) {
      const prefix = key.slice(0, delimIdx);
      if (allPrefixes.includes(prefix)) {
        if (!appVars[prefix]) appVars[prefix] = {};
        appVars[prefix][key.slice(delimIdx + DELIM.length)] = value;
        continue;
      }
    }
    globals[key] = value;
  }

  return { globals, appVars, allOrigins };
}

// ── validate variables against config ──────────────────────

const { GLOBAL_VARS, APP_VARS, DEFAULT_APP_VARS } = require('./env-config');

/**
 * Validates resolved variables against the required-variables registry.
 *
 * @param {Object<string,string>}              globals
 * @param {Object<string,Object<string,string>>} appVars
 * @param {string[]}                           allPrefixes
 * @param {Object}  [opts]
 * @param {string}  [opts.targetPrefix]  Only validate this app (null = all)
 * @returns {{ errors: string[], warnings: string[] }}
 */
function validateVariables(globals, appVars, allPrefixes, opts = {}) {
  const errors = [];
  const warnings = [];

  // Check globals
  for (const entry of GLOBAL_VARS) {
    if (!globals[entry.key] && entry.default === undefined) {
      const msg = `Missing global variable: ${entry.key} — ${entry.description}`;
      if (entry.severity === 'error') errors.push(msg);
      else warnings.push(msg);
    }
  }

  // Check app-specific
  const prefixesToCheck = opts.targetPrefix
    ? [opts.targetPrefix]
    : allPrefixes;

  for (const prefix of prefixesToCheck) {
    const varDefs = APP_VARS[prefix] || DEFAULT_APP_VARS;
    const resolved = appVars[prefix] || {};
    for (const entry of varDefs) {
      if (!resolved[entry.key] && entry.default === undefined) {
        const fullKey = `${prefix}${DELIM}${entry.key}`;
        const msg = `Missing ${prefix} variable: ${fullKey} — ${entry.description}`;
        if (entry.severity === 'error') errors.push(msg);
        else warnings.push(msg);
      }
    }
  }

  return { errors, warnings };
}

// ── build per-app env map (shared by load-env + generate-app-env) ──

/**
 * Builds the final env map for a single app — exactly what load-env.js
 * would inject into the child process.
 *
 * Replicates:
 *   Step 4 — globals + prefix-stripped app vars
 *   Step 5 — PORT pass-through (explicit config only, no auto-derivation)
 *   Step 6 — NEXT_BUILD_OUTPUT / BUILD_DEST_DIR resolution for Next.js apps
 *   Step 7 — CORS_ORIGINS for POS_STRAPI
 *
 * PORT is only set when explicitly configured:
 *   - process.env.PORT (platform/host override — always wins)
 *   - PREFIX__PORT in config files (e.g. AUTH__PORT=4003)
 * No PORT is derived from URLs or invented automatically.
 *
 * @param {Object}  opts
 * @param {string}  opts.targetDir       Workspace directory name (e.g. 'apps/admin/auth')
 * @param {string}  opts.targetPrefix    Env prefix (e.g. 'POS_AUTH')
 * @param {Object<string,string>} opts.globals    Global variables
 * @param {Object<string,Object<string,string>>} opts.appVars  Per-prefix vars
 * @param {Set<string>}           opts.allOrigins All URL origins found in vars
 * @param {string}  [opts.platformPort]  process.env.PORT (platform override)
 * @returns {Object<string,string>} The flat key=value map for the app
 */
function buildEnvForApp(opts) {
  const {
    targetDir, targetPrefix,
    globals, appVars, allOrigins,
    platformPort,
  } = opts;

  const envForApp = {};

  // Globals go to every app
  for (const [key, value] of Object.entries(globals)) {
    envForApp[key] = value;
  }

  // App-specific vars (prefix stripped — includes PREFIX__PORT when set)
  const targetAppVars = appVars[targetPrefix] || {};
  for (const [key, value] of Object.entries(targetAppVars)) {
    envForApp[key] = value;
  }

  // ── PORT — explicit config only ─────────────────────────
  // Platform-provided PORT (Hostinger, Railway, Docker, CI) always wins
  if (platformPort) {
    envForApp.PORT = platformPort;
  }
  // Otherwise PORT comes from PREFIX__PORT (already in envForApp via
  // targetAppVars above) or is simply not set — the app uses its own default.

  // ── NEXT_BUILD_OUTPUT / BUILD_DEST_DIR — Next.js apps only ────────
  // Strapi is not a Next.js app; these variables are irrelevant for it.
  if (targetPrefix !== 'POS_STRAPI') {
    // NEXT_BUILD_OUTPUT: app-specific wins, then global, then omit (Next.js default)
    if (!envForApp.NEXT_BUILD_OUTPUT && globals.NEXT_BUILD_OUTPUT) {
      envForApp.NEXT_BUILD_OUTPUT = globals.NEXT_BUILD_OUTPUT;
    }

    // BUILD_DEST_DIR: passed through as-is for post-build copy by run-app.js.
    // Not used as distDir (Turbopack forbids paths outside the project).
    if (!envForApp.BUILD_DEST_DIR && globals.BUILD_DEST_DIR) {
      envForApp.BUILD_DEST_DIR = globals.BUILD_DEST_DIR;
    }
  }

  // ── CORS_ORIGINS for services/strapi ─────────────────────────
  if (targetPrefix === 'POS_STRAPI') {
    const strapiPort = envForApp.PORT || '4010';
    const strapiOrigins = [
      `http://localhost:${strapiPort}`,
      `http://127.0.0.1:${strapiPort}`,
    ];
    const corsOrigins = [...allOrigins].filter(
      (o) => !strapiOrigins.includes(o)
    );

    // Expand localhost/127.0.0.1 variants so browser requests from either
    // host are accepted by Strapi CORS in local development.
    const expanded = new Set(corsOrigins);
    for (const origin of corsOrigins) {
      try {
        const u = new URL(origin);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
          const alt = new URL(origin);
          alt.hostname = u.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
          expanded.add(alt.origin);
        }
      } catch {
        // ignore invalid origins
      }
    }

    envForApp.CORS_ORIGINS = [...expanded].join(',');
  }

  return envForApp;
}

/** Extract the origin (scheme + host + port) from a URL string. */
function extractOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

module.exports = {
  ROOT,
  DELIM,
  parseEnvFile,
  getAppDirs,
  getAppPrefixes,
  resolveEnvPrefix,
  resolveAllVariables,
  splitVariables,
  validateVariables,
  buildEnvForApp,
  extractOrigin,
};
