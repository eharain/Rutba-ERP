'use strict';

// Tiny dependency-free scheduler for the built-in worker.
//
// We only need the two cron shapes the engine uses — "*/N * * * *" (every N
// minutes) and "0 */N * * *" (every N hours) — so rather than pull in a cron
// dependency we map those to a setInterval. Anything we can't parse falls back
// to the provided fallbackMs. (If full cron expressivity is ever needed, swap
// this for node-cron — the schedule() signature is the only contract.)

function intervalFromCron(expr, fallbackMs) {
  try {
    const parts = String(expr).trim().split(/\s+/);
    if (parts.length >= 2) {
      const [min, hour] = parts;
      const mMin = /^\*\/(\d+)$/.exec(min);
      if (mMin) return Math.max(1, parseInt(mMin[1], 10)) * 60 * 1000;
      const mHour = /^\*\/(\d+)$/.exec(hour);
      if ((min === '0' || min === '*') && mHour) return Math.max(1, parseInt(mHour[1], 10)) * 60 * 60 * 1000;
      if (min === '0' && hour === '*') return 60 * 60 * 1000;
    }
  } catch (_) { /* fall through */ }
  return fallbackMs;
}

function schedule(name, cronExpr, fn, { fallbackMs, initialDelayMs = 15000 } = {}) {
  const intervalMs = intervalFromCron(cronExpr, fallbackMs);
  let running = false;
  const run = async () => {
    if (running) return; // never overlap a slow run with the next tick
    running = true;
    try {
      await fn();
    } catch (e) {
      console.warn(`[marketplace worker] job ${name} failed: ${e?.message || e}`);
    } finally {
      running = false;
    }
  };
  setTimeout(() => { run(); setInterval(run, intervalMs); }, initialDelayMs);
  console.log(`[marketplace worker] scheduled '${name}' every ${Math.round(intervalMs / 1000)}s`);
  return { name, intervalMs };
}

module.exports = { intervalFromCron, schedule };
