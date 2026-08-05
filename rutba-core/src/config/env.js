'use strict';

/**
 * Environment loading for rutba-core.
 *
 * Mirrors scripts/js/load-env.js semantics for the subset rutba-core needs:
 *   1. repo-root .env            → determines ENVIRONMENT (+ base vars)
 *   2. repo-root .env.<ENV>      → overrides .env
 *   3. file values take precedence over process.env
 *
 * Variable precedence for a given NAME:
 *   RUTBA_CORE__NAME  >  POS_STRAPI__NAME  >  NAME
 * (POS_STRAPI__ is honored because rutba-core connects to the same database
 *  as pos-strapi during the strangler migration.)
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

// Per-process settings that must NOT inherit pos-strapi's value: both servers
// run side by side during the strangler migration, so taking POS_STRAPI__PORT
// would make core try to bind the port Strapi is already listening on.
const CORE_OWNED = new Set(['PORT', 'HOST']);

let cached = null;

function loadVars() {
  if (cached) return cached;
  const base = parseEnvFile(path.join(REPO_ROOT, '.env'));
  const environment =
    base.ENVIRONMENT || process.env.ENVIRONMENT || 'development';
  const envSpecific = parseEnvFile(path.join(REPO_ROOT, `.env.${environment}`));
  // fileVars = only what the .env files declare. Callers that scan values
  // rather than look one up (CORS origin discovery) need this: process.env
  // carries hundreds of unrelated entries, several of which parse as URLs.
  const fileVars = { ...base, ...envSpecific };
  cached = { environment, fileVars, vars: { ...process.env, ...fileVars } };
  hydrateProcessEnv(cached.vars);
  return cached;
}

/**
 * Publish the resolved values back onto process.env under their bare names.
 *
 * scripts/js/load-env.js does this for every other app by spawning it with a
 * merged environment (POS_STRAPI__FRONTEND_URL → FRONTEND_URL). rutba-core is
 * started directly, so without this step the pos-strapi code it loads zero-copy
 * reads `process.env.X` and gets nothing — silently, since almost every such
 * read has a fallback. ORDER_ALERT_EMAIL resolving to '' is the sharp case:
 * notification-service only sends when it has a recipient, so order alerts
 * would just never go out.
 *
 * Resolution matches get() exactly, so ported code and core code always see
 * the same value for the same name.
 */
function hydrateProcessEnv(vars) {
  const names = new Set();
  for (const key of Object.keys(vars)) {
    const bare = key.replace(/^(?:RUTBA_CORE__|POS_STRAPI__)/, '');
    if (bare && !CORE_OWNED.has(bare)) names.add(bare);
  }
  for (const name of names) {
    for (const key of [`RUTBA_CORE__${name}`, `POS_STRAPI__${name}`, name]) {
      if (vars[key] !== undefined && vars[key] !== '') {
        process.env[name] = vars[key];
        break;
      }
    }
  }
}

function get(name, fallback) {
  const { vars } = loadVars();
  const keys = CORE_OWNED.has(name)
    ? [`RUTBA_CORE__${name}`, name]
    : [`RUTBA_CORE__${name}`, `POS_STRAPI__${name}`, name];
  for (const key of keys) {
    if (vars[key] !== undefined && vars[key] !== '') return vars[key];
  }
  return fallback;
}

function dbConfig() {
  const client = get('DATABASE_CLIENT', 'mysql');
  const clientMap = { mysql: 'mysql2', postgres: 'pg' };
  return {
    client: clientMap[client] || client,
    connection: {
      host: get('DATABASE_HOST', '127.0.0.1'),
      port: parseInt(get('DATABASE_PORT', client === 'postgres' ? '5432' : '3306'), 10),
      database: get('DATABASE_NAME', 'pos_db'),
      user: get('DATABASE_USERNAME', 'root'),
      password: get('DATABASE_PASSWORD', ''),
      // Contract parity with Strapi's serialization (see contract-diff.js):
      // decimals as numbers, DATE columns as yyyy-mm-dd strings.
      ...(client === 'mysql' ? { decimalNumbers: true, dateStrings: ['DATE'] } : {}),
    },
    pool: { min: 0, max: 10 },
  };
}

module.exports = { REPO_ROOT, loadVars, get, dbConfig };
