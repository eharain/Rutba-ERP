'use strict';

/**
 * rutba-core process entrypoint.
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
 *   npm run start --workspace-equivalent:  node rutba-core/src/index.js
 *
 * Env of note:
 *   PORT                 listen port (RUTBA_CORE__PORT or bare PORT; never
 *                        inherits POS_STRAPI__PORT — see config/env CORE_OWNED)
 *   RUTBA_CORE_CRONS=1   master switch for the scheduler. Leave OFF while
 *                        pos-strapi still schedules the same tasks — the two
 *                        must never run the same cron at the same time.
 */

const { get, loadVars } = require('./config/env');
const { start } = require('./http/server');
const { startCrons, stopCrons, tasks } = require('./platform/cron');
const { closeDb } = require('./db/connection');

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
  process.exit(code);
}

async function main() {
  const { environment } = loadVars();
  const port = parseInt(get('PORT', '4020'), 10);

  server = await start(port);

  const started = startCrons();
  console.log(
    `[core] ready — env=${environment} db=${get('DATABASE_NAME')}@${get('DATABASE_HOST')} `
    + `port=${port} crons=${started}/${tasks.size} mail=${get('RUTBA_CORE_EMAIL', 'send')}`
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
  console.error('[core] failed to start:', err.stack || err);
  try { await closeDb(); } catch {}
  process.exit(1);
});
