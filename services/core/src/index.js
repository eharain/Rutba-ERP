'use strict';

/**
 * services/core process entrypoint.
 *
 * Until now core only ever ran inside a smoke script, which composed the
 * pieces by hand and tore them down at the end of the test. This is the long-
 * running form: boot once, serve, and shut down cleanly when systemd or Docker
 * says stop.
 *
 * buildServer() already calls buildCompatStrapi() and initModules() — this adds
 * what only a real process needs: the cron scheduler, signal handling, and a
 * startup banner that makes it obvious which database and port were resolved
 * (the env precedence chain has bitten us before: PORT used to fall through to
 * POS_STRAPI__PORT and land on Strapi's 4010).
 *
 *   npm run start --workspace-equivalent:  node services/core/src/index.js
 *
 * Env of note:
 *   PORT                 listen port (CORE__PORT or bare PORT; never
 *                        inherits POS_STRAPI__PORT — see config/env CORE_OWNED)
 *   RUTBA_CORE_CRONS=1   master switch for the scheduler. Leave OFF while
 *                        services/strapi still schedules the same tasks — the two
 *                        must never run the same cron at the same time.
 */

const { get, loadVars } = require('./config/env');
const { start } = require('./http/server');
const { getRegistry } = require('./documents');
const { ensurePolicySeed } = require('./policy');
const { startCrons, stopCrons, tasks } = require('./platform/cron');
const { closeDb } = require('./db/connection');
const { flushLogs } = require('./http/logger');

// How long a shutdown may take before we stop being polite. systemd's default
// TimeoutStopSec is 90s, so this has to fire well before that or the unit gets
// SIGKILLed mid-drain and we learn nothing from the logs.
const SHUTDOWN_GRACE_MS = 15000;

let server = null;
let shuttingDown = false;

async function shutdown(signal, code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[core] ${signal} — shutting down`);

  const forced = setTimeout(() => {
    console.error(`[core] shutdown exceeded ${SHUTDOWN_GRACE_MS}ms — forcing exit`);
    process.exit(code || 1);
  }, SHUTDOWN_GRACE_MS);
  forced.unref();

  try {
    stopCrons();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
      console.log('[core] http server closed');
    }
    await closeDb();
    console.log('[core] database pool closed');
  } catch (err) {
    console.error(`[core] error during shutdown: ${err.message}`);
    code = code || 1;
  }
  clearTimeout(forced);
  // Request logs are batched, so the last few live in a queue that the exit
  // would otherwise discard — exactly the lines that explain why we are exiting.
  flushLogs();
  process.exit(code);
}

async function main() {
  const { environment } = loadVars();
  const port = parseInt(get('PORT', '4020'), 10);

  // Before the server, not after: buildServer() reads the route table out of
  // the api_pro_* tables, so a descriptor added since the last boot only gets
  // a mounted route if the seed has already run. This is what makes core
  // Strapi-free in the daily loop — edit a descriptor, restart, it serves.
  // Skips itself in ~10ms when nothing changed (src/policy/checkpoint.js).
  const policy = await ensurePolicySeed({ registry: getRegistry() });

  server = await start(port);

  const started = startCrons();
  console.log(
    `[core] ready — env=${environment} db=${get('DATABASE_NAME')}@${get('DATABASE_HOST')} `
    + `port=${port} crons=${started}/${tasks.size} mail=${get('RUTBA_CORE_EMAIL', 'send')} `
    + `policy=${policy.skipped ? 'unchanged' : 'seeded'}`
  );

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => { shutdown(signal); });
  }

  // A rejected promise that nobody caught means a request path swallowed an
  // error. Exiting lets the supervisor restart us clean rather than leaving a
  // process in an unknown state serving traffic.
  process.on('unhandledRejection', (reason) => {
    console.error('[core] unhandled rejection:', reason instanceof Error ? reason.stack : reason);
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err) => {
    console.error('[core] uncaught exception:', err.stack || err);
    shutdown('uncaughtException', 1);
  });
}

main().catch(async (err) => {
  // A port clash is the one startup failure with a boring cause and a boring
  // fix, and under nodemon it happens routinely — a file save restarts the
  // process before the old one has let go of the socket. A stack trace buries
  // that; say what it is.
  if (err && err.code === 'EADDRINUSE') {
    const port = parseInt(get('PORT', '4020'), 10);
    console.error(`[core] port ${port} is already in use — another services/core is running `
      + '(or the previous one has not exited yet). Stop it, or set CORE__PORT.');
  } else {
    console.error('[core] failed to start:', err.stack || err);
  }
  try { await closeDb(); } catch {}
  process.exit(1);
});
