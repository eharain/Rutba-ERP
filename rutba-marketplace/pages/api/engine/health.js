import { operatorGet } from '../../../lib/api-handler';
import strapi from '../../../lib/strapi';
import health from '../../../lib/engine-health';
import config from '../../../lib/config';

// GET /api/engine/health
//
// Is the engine actually able to talk to Strapi? The back-office needs a real
// answer, because a bad service token is invisible from the UI: the browser
// reads Strapi directly with the operator's own JWT and looks perfectly healthy
// while the engine — which uses the service token — cannot sync anything.
//
// The sync worker is a SEPARATE process (worker.js / rutba_marketplace_worker),
// so its in-memory breaker state is not visible here. We therefore probe
// live: one cheap authenticated call over the same code path and the same
// token the worker uses. If that call 401s, lib/strapi records the fault and
// getHealth() reports it — so the answer reflects the token, not a guess.
export default operatorGet(async () => {
  const tokenConfigured = Boolean(config.strapi.token);
  let probe = { ok: false, error: null };

  if (tokenConfigured) {
    try {
      // Cheapest authenticated read available; we only care that auth passes.
      await strapi.listAccounts({ documentId: { $eq: '__engine_health_probe__' } });
      probe.ok = true;
    } catch (e) {
      probe.ok = false;
      probe.error = e?.message || String(e);
      probe.status = e?.status ?? null;
    }
  } else {
    probe.error = 'RUTBA_MARKETPLACE__STRAPI_SERVICE_TOKEN is not set';
    probe.status = 401;
  }

  const snapshot = health.getHealth();
  return {
    tokenConfigured,
    strapiApiUrl: config.strapi.apiUrl,
    probe,
    // `ok` is the single field the UI banner keys off.
    ok: probe.ok,
    ...snapshot,
  };
});
