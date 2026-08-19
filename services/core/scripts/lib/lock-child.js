'use strict';

/**
 * The second process in smoke-packaging.js's lock test.
 *
 * Takes the named advisory lock, tells the parent over IPC that it is holding
 * it, and keeps holding for a while. A cross-process lock cannot be tested from
 * one process — a single process asking itself twice is a different question,
 * and on MySQL it is one that answers "yes, you already have it".
 *
 *   node lock-child.js <name> <holdMs>
 */

const { withAdvisoryLock } = require('../../src/platform/advisory-lock');
const { closeDb } = require('../../src/db/connection');

const [name, holdMs] = process.argv.slice(2);

withAdvisoryLock(name, async () => {
  if (process.send) process.send({ holding: true, pid: process.pid });
  await new Promise((resolve) => setTimeout(resolve, Number(holdMs) || 5000));
}, { timeoutMs: 10000 })
  .then(async () => {
    await closeDb();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(`[lock-child] ${error.message}`);
    try { await closeDb(); } catch { /* ignore */ }
    process.exit(1);
  });
