#!/usr/bin/env node
'use strict';

/**
 * scripts/load-env.js — Centralized environment loader for Rutba POS
 *
 * Usage:
 *   node scripts/load-env.js -- <command> [args...]
 *
 * The target app is auto-detected from --workspace=<dir> or --prefix <dir>
 * in the command arguments. No separate app name needed.
 *
 * How it works:
 *   1. Reads .env to determine ENVIRONMENT (default: development)
 *   2. Reads .env.<ENVIRONMENT> for all configuration
 *   3. Builds the known-prefix list from package.json workspaces + pos-strapi
 *   4. Variables with no known prefix   → global (passed to every app)
 *      Variables with PREFIX__VARNAME   → app-specific (prefix + __ stripped,
 *                                         only injected into that app)
 *   5. For pos-strapi, auto-computes CORS_ORIGINS from all URL values
 *   6. Spawns <command> with the merged environment
 *
 * Prefix convention:
 *   workspace dir "pos-auth"      → prefix POS_AUTH
 *   workspace dir "rutba-web-user" → prefix RUTBA_WEB_USER
 *   Double underscore (__) separates prefix from var name:
 *     POS_STRAPI__PORT=4010  →  PORT=4010  (for pos-strapi only)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

// ── .env parser ────────────────────────────────────────────

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

// ── detect target from command arguments ───────────────────

function findTargetDir(cmdArgs) {
  for (let i = 0; i < cmdArgs.length; i++) {
    const wsMatch = cmdArgs[i].match(/^--workspace=(.+)$/);
    if (wsMatch) return wsMatch[1];
    if (cmdArgs[i] === '--prefix' && cmdArgs[i + 1]) return cmdArgs[i + 1];
  }
  return null;
}

/** Extract the origin (scheme + host + port) from a URL string. */
function extractOrigin(value) {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
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

const targetPrefix = targetDir.toUpperCase().replace(/-/g, '_'); // "pos-auth" → "POS_AUTH"
const allPrefixes = getAppPrefixes(); // ["POS_SHARED","POS_DESK","POS_STOCK", ...]

// ── 1. Read .env → ENVIRONMENT ─────────────────────────────

const rootVars = parseEnvFile(path.join(ROOT, '.env'));
const environment = rootVars.ENVIRONMENT || 'development';

// ── 2. Read .env.<environment> ─────────────────────────────

const envFilePath = path.join(ROOT, `.env.${environment}`);
if (!fs.existsSync(envFilePath)) {
  console.error(`Environment file not found: .env.${environment}`);
  process.exit(1);
}
const allVars = parseEnvFile(envFilePath);

// ── 3. Split global vs app-specific ────────────────────────
// Convention: PREFIX__VARNAME  (double underscore)

const DELIM = '__';
const envForApp = {};
const allOrigins = new Set();

for (const [key, value] of Object.entries(allVars)) {
  const origin = extractOrigin(value);
  if (origin) allOrigins.add(origin);

  const delimIdx = key.indexOf(DELIM);
  if (delimIdx > 0) {
    const prefix = key.slice(0, delimIdx);
    if (allPrefixes.includes(prefix)) {
      // App-specific variable
      if (prefix === targetPrefix) {
        const stripped = key.slice(delimIdx + DELIM.length);
        envForApp[stripped] = value;
      }
      continue; // belongs to another app — skip
    }
  }
  // No known prefix (or no __) → global
  envForApp[key] = value;
}

// ── 4. Auto-derive PORT from matching NEXT_PUBLIC_*_URL ────
//    pos-auth → strip "pos-" → AUTH → NEXT_PUBLIC_AUTH_URL
//    rutba-web-user → strip "rutba-" → WEB_USER → NEXT_PUBLIC_WEB_USER_URL
//    Explicit APP__PORT in .env always wins (already in envForApp).

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
      const port = new URL(urlValue).port;
      if (port) envForApp.PORT = port;
    } catch { /* ignore invalid URLs */ }
  }
}

// ── 5. For pos-strapi, inject CORS_ORIGINS ─────────────────

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

// ── 6. Spawn the command ───────────────────────────────────

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
