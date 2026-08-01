'use strict';

// Engine health — specifically, whether our Strapi service token still works.
//
// Why this exists: the worker's Strapi credentials are read from env once at
// startup, so a missing or stale STRAPI_SERVICE_TOKEN cannot fix itself. Before
// this, every scheduled job kept firing on its normal cadence regardless, each
// one 401ing and logging a warning nobody was watching. On the LAN box that was
// 281 identical failures over four days — no back-off, no alert, and the
// operator's only symptom was that marketplace data silently stopped updating.
//
// So: record credential faults centrally, let the recurring scheduler stand down
// while one is active (probing occasionally in case the token starts working
// again), and expose the state so the UI can tell the operator what to fix.
//
// ONLY 401 counts as a credential fault. A 403 means Strapi authenticated us and
// then declined that particular route — a policy/permission problem on one
// endpoint, not a dead token — and must not stand the whole engine down.

// How often to let one job through while credentials are known-bad, so a fixed
// token is picked up without needing a restart to notice.
const PROBE_INTERVAL_MS = 15 * 60 * 1000;

const state = {
  ok: true,
  failures: 0,
  since: null,        // when the CURRENT fault started
  lastError: null,
  lastFailureAt: null,
  lastOkAt: null,
  skippedRuns: 0,     // scheduled runs suppressed by the breaker
};

let lastProbeAt = 0;

/** Record a 401 from Strapi. Idempotent — repeated faults keep the original
 *  `since` so the UI can show how long this has been broken. */
function noteAuthFailure({ status, method, path, message } = {}) {
  const firstFailure = state.ok;
  state.ok = false;
  state.failures += 1;
  state.lastFailureAt = new Date().toISOString();
  state.lastError = [method, path].filter(Boolean).join(' ') + (message ? ` — ${message}` : '');
  if (firstFailure) {
    state.since = state.lastFailureAt;
    // Log loudly ONCE per fault, not once per attempt: the point of the breaker
    // is that the log stops being a wall of identical lines.
    console.error(
      `[marketplace] Strapi rejected our service token (${status}). ` +
      `Scheduled syncs are standing down until it works. ` +
      `Fix RUTBA_MARKETPLACE__STRAPI_SERVICE_TOKEN and restart the worker. ` +
      `Last error: ${state.lastError}`
    );
  }
}

/** Any successful Strapi call clears the fault. */
function noteAuthOk() {
  if (!state.ok) {
    console.log(
      `[marketplace] Strapi service token is working again after ${state.failures} failure(s) ` +
      `since ${state.since}; resuming scheduled syncs.`
    );
    state.failures = 0;
    state.since = null;
    state.lastError = null;
    state.skippedRuns = 0;
  }
  state.ok = true;
  state.lastOkAt = new Date().toISOString();
}

/**
 * Ask permission to start a SCHEDULED run. Manual/operator-triggered runs must
 * NOT go through this — when someone presses "Run now" they should get a real
 * attempt and a real error message rather than silence.
 *
 * @returns {{allowed: boolean, probe?: boolean, retryInMs?: number}}
 */
function claimScheduledRun() {
  if (state.ok) return { allowed: true };

  const now = Date.now();
  const elapsed = now - lastProbeAt;
  if (elapsed >= PROBE_INTERVAL_MS) {
    lastProbeAt = now;
    return { allowed: true, probe: true };
  }

  state.skippedRuns += 1;
  return { allowed: false, retryInMs: PROBE_INTERVAL_MS - elapsed };
}

/** Snapshot for the health endpoint / UI. */
function getHealth() {
  return {
    strapiAuth: {
      ok: state.ok,
      failures: state.failures,
      since: state.since,
      lastError: state.lastError,
      lastFailureAt: state.lastFailureAt,
      lastOkAt: state.lastOkAt,
      skippedRuns: state.skippedRuns,
      probeIntervalMs: PROBE_INTERVAL_MS,
    },
  };
}

/** Test seam. */
function _reset() {
  Object.assign(state, {
    ok: true, failures: 0, since: null, lastError: null,
    lastFailureAt: null, lastOkAt: null, skippedRuns: 0,
  });
  lastProbeAt = 0;
}

module.exports = {
  PROBE_INTERVAL_MS,
  noteAuthFailure,
  noteAuthOk,
  claimScheduledRun,
  getHealth,
  _reset,
};
