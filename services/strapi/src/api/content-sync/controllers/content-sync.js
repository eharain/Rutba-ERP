'use strict';

const PLUGIN_ID = 'strapi-content-sync-pro';

/**
 * App-facing trigger for content sync.
 *
 * strapi-content-sync-pro exposes its controls on ADMIN routes, which need a
 * Strapi admin session. The Rutba apps authenticate with a users-permissions
 * JWT, so they cannot call those directly. This thin API is the bridge: it
 * calls the plugin's services in-process and is exposed on the content API,
 * where api-pro governs who may trigger a sync.
 *
 * It deliberately holds no sync logic of its own — direction, conflict
 * strategy, phases and ordering all stay in the plugin, configured from its
 * own admin UI. This only says "run it now, for these content types".
 */
function plugin(strapi) {
  const p = strapi.plugin(PLUGIN_ID);
  if (!p) {
    const err = new Error(`${PLUGIN_ID} is not installed on this instance`);
    err.status = 503;
    throw err;
  }
  return p;
}

/**
 * The content types a CMS push should carry: whatever the operator enabled in
 * the plugin's Content Types tab, optionally narrowed by an explicit list.
 * Falling back to "everything enabled" keeps the button honest — it syncs
 * exactly what the plugin is configured to sync, with no second source of
 * truth about scope.
 */
async function resolveScopeUids(strapi, requested) {
  const config = await plugin(strapi).service('syncConfig').getSyncConfig();
  const enabled = (config.contentTypes || []).filter((ct) => ct.enabled).map((ct) => ct.uid);

  if (!Array.isArray(requested) || requested.length === 0) return enabled;

  const wanted = new Set(requested);
  return enabled.filter((uid) => wanted.has(uid));
}

module.exports = {
  /**
   * POST /content-sync/run
   * body: { uids?: string[], direction?: 'push'|'pull', includeMedia?: boolean }
   *
   * Starts a bulk transfer and returns immediately with the job id — a full
   * content push is far longer than an HTTP request, so the caller polls
   * /content-sync/status/:jobId rather than holding the connection open.
   */
  async run(ctx) {
    const body = ctx.request.body || {};
    const direction = body.direction === 'pull' ? 'pull' : 'push';

    try {
      const uids = await resolveScopeUids(strapi, body.uids);
      if (uids.length === 0) {
        return ctx.badRequest(
          'No content types are enabled for sync. Enable them in the Content Sync Pro admin panel first.'
        );
      }

      const bulk = plugin(strapi).service('bulkTransfer');
      const scopes = { content: true, media: body.includeMedia !== false, users: false, admins: false };

      // Preview first so the job can be narrowed to the requested content
      // types: the planner expands every syncable type, and the caller may
      // have asked for a subset.
      const preview = await bulk.preview({ direction, scopes });
      const wanted = new Set(uids);
      const selectedIndexes = (preview.chunks || [])
        .filter((c) => (c.uid ? wanted.has(c.uid) : true)) // keep media chunks
        .map((c) => c.index);

      if (selectedIndexes.length === 0) {
        return ctx.badRequest('Nothing to sync for the requested content types.');
      }

      const job = await bulk.start({
        direction,
        scopes,
        autoContinue: true,
        selectedIndexes,
      });

      ctx.body = {
        data: {
          jobId: job.id,
          status: job.status,
          direction,
          total: job.total,
          contentTypes: uids,
        },
      };
    } catch (err) {
      if (err.status === 503) return ctx.throw(503, err.message);
      return ctx.badRequest(err.message);
    }
  },

  /**
   * GET /content-sync/status/:jobId — progress of one run.
   * GET /content-sync/status          — every run this process knows about.
   */
  async status(ctx) {
    try {
      const bulk = plugin(strapi).service('bulkTransfer');
      const { jobId } = ctx.params;

      if (jobId) {
        const job = bulk.getStatus(jobId);
        if (!job) return ctx.notFound('Sync job not found (jobs are lost on server restart)');
        return (ctx.body = { data: job });
      }

      ctx.body = { data: bulk.listJobs() };
    } catch (err) {
      if (err.status === 503) return ctx.throw(503, err.message);
      return ctx.badRequest(err.message);
    }
  },

  /**
   * GET /content-sync/config — what a sync would cover, so the UI can show the
   * scope and tell the operator when nothing is configured yet.
   */
  async config(ctx) {
    try {
      const p = plugin(strapi);
      const [syncConfig, remote] = await Promise.all([
        p.service('syncConfig').getSyncConfig(),
        p.service('config').getConfig({ safe: true }).catch(() => null),
      ]);

      const enabled = (syncConfig.contentTypes || [])
        .filter((ct) => ct.enabled)
        .map((ct) => ({
          uid: ct.uid,
          direction: ct.direction || 'both',
          displayName: strapi.contentTypes?.[ct.uid]?.info?.displayName || ct.uid,
        }));

      ctx.body = {
        data: {
          enabled,
          configured: !!remote?.baseUrl,
          remoteBaseUrl: remote?.baseUrl || null,
        },
      };
    } catch (err) {
      if (err.status === 503) return ctx.throw(503, err.message);
      return ctx.badRequest(err.message);
    }
  },

  /**
   * POST /content-sync/cancel/:jobId
   */
  async cancel(ctx) {
    try {
      const job = await plugin(strapi).service('bulkTransfer').cancel(ctx.params.jobId);
      ctx.body = { data: job };
    } catch (err) {
      return ctx.badRequest(err.message);
    }
  },
};
