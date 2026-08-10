/**
 * NotificationPreferencesEndpoints
 * Per-user notification settings (9 categories × in-app/email toggles +
 * minimum priority). Server-side the controller self-scopes rows to the
 * caller; users/auth admins may target any user (userId param / `user` in the
 * create body). create is an UPSERT by (user, category) so the UI can toggle
 * a category without knowing whether its row exists yet.
 */

export const NotificationPreferencesEndpoints = {

    meta: {
        uid: 'api::notification-preference.notification-preference',
        domains: ['users'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** Target user's rows (userId only honored for users/auth admins). */
    list: ({ userId } = {}) => ({
        path: '/notification-preferences',
        action: 'find',
        method: 'get',
        apps: ['users'],
        approle: ['admin', 'manager', 'staff'],
        params: { ...(userId ? { userId } : {}) },
    }),

    /** Upsert one category — { category, in_app_enabled?, email_enabled?, minimum_priority?, user? }. */
    create: (data) => ({
        path: '/notification-preferences',
        action: 'create',
        method: 'post',
        apps: ['users'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    update: (documentId, data) => ({
        path: `/notification-preferences/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['users'],
        approle: ['admin', 'manager', 'staff'],
        data,
    }),

    /** Remove a row — the category falls back to its defaults. */
    del: (documentId) => ({
        path: `/notification-preferences/${documentId}`,
        action: 'delete',
        method: 'delete',
        apps: ['users'],
        approle: ['admin', 'manager', 'staff'],
    }),

};
