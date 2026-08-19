'use strict';

/**
 * "Which database am I about to touch?" as one printable line.
 *
 * Shared by scripts/migrate.js and scripts/smoke-packaging.js, because the
 * answer is the thing an operator has to read before pressing on — and the
 * interesting part of it is NOT the database name. Every environment in this
 * repo calls it `pos_db` and reaches it on 127.0.0.1: dev, the LAN box and
 * live all do (see .env.development and .env.production). So a line that
 * prints only the name, or only the host, cannot tell you which machine you
 * are aimed at. The discriminator is ENVIRONMENT, because that is what selects
 * .env.<ENVIRONMENT> and therefore the credentials; host and port are printed
 * beside it so a tunnelled or overridden connection is still visible.
 *
 * Credentials are never included. This line goes to logs and to CI output.
 */

const { loadVars } = require('../../src/config/env');

/** Format an already-resolved knex config (the shape dbConfig() returns). */
function describeConfig(config) {
  const connection = (config && config.connection) || {};
  const client = (config && config.client) || 'unknown';
  const { environment } = loadVars();

  // SQLite is addressed by file, so host/port/database are all undefined and
  // printing them would read as "unknown database on an unknown host".
  const where = connection.filename
    ? `file ${connection.filename}`
    : `${connection.host || '?'}:${connection.port || '?'}/${connection.database || '?'}`;

  return `${client} ${where} [ENVIRONMENT=${environment}]`;
}

/** Same, for a live knex instance. Reads its resolved config — never re-resolves env. */
function describeTarget(db) {
  return describeConfig((db && db.client && db.client.config) || {});
}

module.exports = { describeTarget, describeConfig };
