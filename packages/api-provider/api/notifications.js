/**
 * NotificationsEndpoints — in-app notification center.
 *
 * These routes are `auth: false` at the Strapi layer (custom action names
 * fall outside Strapi's CRUD scope whitelist) but the controller manually
 * re-authenticates via ensureUser() — every action still requires a real,
 * valid JWT. Not api-pro policy-gated (no interceptor for auth:false
 * routes), so `apps`/`approle` here are bookkeeping only: any authenticated
 * user in any app can read/mark-read their own notifications.
 */
export const NotificationsEndpoints = {
    meta: {
        uid: 'api::notification.notification',
        domains: ['ess', 'hr'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own notifications. `unreadOnly`/`category`/`limit` are optional query filters. */
    listMine: ({ unreadOnly, category, limit } = {}) => ({
        path: '/notifications/me',
        action: 'myNotifications',
        method: 'get',
        apps: ['ess', 'hr'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: {
            ...(unreadOnly !== undefined ? { unreadOnly } : {}),
            ...(category ? { category } : {}),
            ...(limit ? { limit } : {}),
        },
    }),

    markAsRead: (documentId) => ({
        path: `/notifications/${documentId}/read`,
        action: 'markAsRead',
        method: 'post',
        apps: ['ess', 'hr'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),
};
