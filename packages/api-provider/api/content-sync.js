/**
 * Content sync triggers.
 *
 * Lets an app kick off a content push/pull to the paired instance without a
 * Strapi admin session — the plugin's own controls live on admin routes that an
 * app JWT cannot reach, so pos-strapi brokers the call.
 *
 * Method names deliberately start with `sync`/`get`, which are on api-pro's
 * descriptor verb whitelist. A verb outside that list is skipped silently by
 * the seeder and every request then 403s.
 */
export const ContentSyncEndpoints = {
    meta: {
        uid: 'api::content-sync.content-sync',
        domains: ['cms', 'order-management'],
        roles: ['admin', 'manager'],
    },

    /** What a sync would cover, and whether a peer is configured at all. */
    getSyncConfig: () => ({
        path: '/content-sync/config',
        method: 'get',
    }),

    /**
     * Start a run. Returns a jobId immediately — a full push outlives an HTTP
     * request, so poll getSyncStatus rather than awaiting completion.
     * data: { uids?, direction?: 'push' | 'pull', includeMedia?: boolean }
     */
    syncRun: (data) => ({
        path: '/content-sync/run',
        action: 'run',
        method: 'post',
        data,
    }),

    getSyncStatus: (jobId) => ({
        path: jobId ? `/content-sync/status/${jobId}` : '/content-sync/status',
        method: 'get',
    }),

    syncCancel: (jobId) => ({
        path: `/content-sync/cancel/${jobId}`,
        action: 'cancel',
        method: 'post',
    }),
};
