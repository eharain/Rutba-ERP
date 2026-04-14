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

const ROOT = path.resolve(__dirname, '..');
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

function getAppPrefixes() {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
  );
  const dirs = [];
  for (const ws of pkg.workspaces || []) {
    if (ws.includes('*')) {
      const base = ws.replace(/\/?\*$/, '');
      const fullBase = path.join(ROOT, base);
      if (fs.existsSync(fullBase)) {
        for (const entry of fs.readdirSync(fullBase, { withFileTypes: true })) {
          if (entry.isDirectory()) dirs.push(entry.name);
        }
      }
    } else {
      dirs.push(ws);
    }
  }
  // pos-strapi is not in workspaces but is a launchable app
  dirs.push('pos-strapi');
  return dirs.map((d) => d.toUpperCase().replace(/-/g, '_'));
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
  } else {
    // ── Env-var mode ───────────────────────────────────────
    mode = 'env';
    environment =
      opts.environmentOverride ||
      process.env.ENVIRONMENT ||
      'development';

    // Collect only relevant keys from process.env
    vars = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (key === 'ENVIRONMENT') {
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
  getAppPrefixes,
  resolveAllVariables,
  splitVariables,
  validateVariables,
  extractOrigin,
};
