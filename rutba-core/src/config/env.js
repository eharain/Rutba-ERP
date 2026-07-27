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

let cached = null;

function loadVars() {
  if (cached) return cached;
  const base = parseEnvFile(path.join(REPO_ROOT, '.env'));
  const environment =
    base.ENVIRONMENT || process.env.ENVIRONMENT || 'development';
  const envSpecific = parseEnvFile(path.join(REPO_ROOT, `.env.${environment}`));
  cached = { environment, vars: { ...process.env, ...base, ...envSpecific } };
  return cached;
}

function get(name, fallback) {
  const { vars } = loadVars();
  for (const key of [`RUTBA_CORE__${name}`, `POS_STRAPI__${name}`, name]) {
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
    },
    pool: { min: 0, max: 10 },
  };
}

module.exports = { REPO_ROOT, loadVars, get, dbConfig };
