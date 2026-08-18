'use strict';

/**
 * Environment loading for services/core.
 *
 * Mirrors scripts/js/load-env.js semantics for the subset services/core needs:
 *   1. repo-root .env            → determines ENVIRONMENT (+ base vars)
 *   2. repo-root .env.<ENV>      → overrides .env
 *   3. file values take precedence over process.env
 *
 * Variable precedence for a given NAME:
 *   CORE__NAME  >  POS_STRAPI__NAME  >  NAME
 * (POS_STRAPI__ is honored because services/core connects to the same database
 *  as services/strapi during the strangler migration.)
 */

const fs = require('fs');
const path = require('path');

// services/core/src/config -> repo root. Four levels, not three: core moved
// from rutba-core/ into services/core/ in the P3 restructure, and getting this
// wrong is silent — REPO_ROOT lands on services/, no .env is found there, and
// every database credential resolves to empty.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

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

// Per-process settings that must NOT inherit services/strapi's value: both servers
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
 * merged environment (POS_STRAPI__FRONTEND_URL → FRONTEND_URL). services/core is
 * started directly, so without this step the services/strapi code it loads zero-copy
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
    const bare = key.replace(/^(?:CORE__|POS_STRAPI__)/, '');
    if (bare && !CORE_OWNED.has(bare)) names.add(bare);
  }
  for (const name of names) {
    for (const key of [`CORE__${name}`, `POS_STRAPI__${name}`, name]) {
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
    ? [`CORE__${name}`, name]
    : [`CORE__${name}`, `POS_STRAPI__${name}`, name];
  for (const key of keys) {
    if (vars[key] !== undefined && vars[key] !== '') return vars[key];
  }
  return fallback;
}

// SQLite is addressed by file, not by host:port, so it does not fit the shape
// the server/client branch below builds. Accepted spellings all land on the
// same driver — `sqlite` is what Strapi's DATABASE_CLIENT uses, `sqlite3` is
// knex's own client name, and `better-sqlite3` is the package doing the work.
const SQLITE_CLIENTS = new Set(['sqlite', 'sqlite3', 'better-sqlite3']);

function sqliteConfig() {
  const filename = get(
    'DATABASE_FILENAME',
    path.join(REPO_ROOT, '.data', 'services/core.sqlite'),
  );

  // better-sqlite3 opens the file but will not create the directory holding
  // it, and fails with a bare SQLITE_CANTOPEN if it is missing. `:memory:`
  // (and the file: URI form) name no directory at all.
  if (filename !== ':memory:' && !filename.startsWith('file:')) {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  return {
    client: 'better-sqlite3',
    connection: { filename },
    // knex insists on this for SQLite: without it, every insert that leaves a
    // column undefined logs a deprecation warning instead of writing NULL.
    useNullAsDefault: true,
    pool: {
      // One connection, deliberately. SQLite takes a database-wide write lock,
      // so a pool wide enough for two concurrent writers only converts a
      // queue into SQLITE_BUSY errors. Serializing here means withTransaction()
      // in src/db/connection.js behaves the way its callers already assume.
      min: 1,
      max: 1,
      // With a pool of one, code that escapes the AsyncLocalStorage context
      // inside a transaction (a stray setTimeout, an unawaited promise) asks
      // for a second connection that cannot arrive until the first is
      // released — a deadlock. Fail loudly instead of hanging: the caller's
      // bug is then visible in a stack trace rather than as a wedged process.
      acquireTimeoutMillis: 30000,
    },
  };
}

function dbConfig() {
  const client = get('DATABASE_CLIENT', 'mysql');
  if (SQLITE_CLIENTS.has(client)) return sqliteConfig();

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
