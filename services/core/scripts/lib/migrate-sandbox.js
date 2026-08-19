'use strict';

/**
 * The last line of defence for the migrations-on-boot smoke: given the
 * connection config env.js actually resolved, is it the throwaway file we
 * asked for?
 *
 * A separate, pure function rather than an `if` inside migrate-child.js so it
 * can be asserted directly. Its whole job is to catch a case that cannot be
 * reproduced from a test's environment — the repo-root .env files win over
 * process.env for the same key (src/config/env.js `loadVars`), so a
 * `CORE__DATABASE_CLIENT` landing in .env one day would dissolve the sandbox
 * with both sandbox variables still set and everything still looking fine.
 * Simulating that from a child process is not possible without editing the
 * real .env, so the predicate is tested and the wiring is tested separately.
 *
 * Returns null when the sandbox holds, or a human-readable reason when it does
 * not. There is no third answer: anything unrecognised is a refusal.
 */

const path = require('path');

function sandboxRefusal(config, expectedFile) {
  if (!expectedFile) return 'no throwaway database file was named';
  if (!config || !config.client) return 'the database config resolved to nothing';

  if (config.client !== 'better-sqlite3') {
    return `the sandbox did not take — DATABASE_CLIENT resolved to '${config.client}', not SQLite`;
  }

  const resolved = (config.connection && config.connection.filename) || '';
  if (!resolved) return 'the sandbox did not take — SQLite resolved with no filename';

  if (path.resolve(resolved) !== path.resolve(expectedFile)) {
    return `the sandbox did not take — resolved file '${resolved}' is not the throwaway file '${expectedFile}'`;
  }

  return null;
}

module.exports = { sandboxRefusal };
