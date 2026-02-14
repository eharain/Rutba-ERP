'use strict';

/**
 * app-access-guard
 *
 * Global Strapi middleware that enforces two rules:
 *
 *  1. APP-ACCESS GATE — checks the user's `app_accesses` keys
 *     against config/app-access-routes.js to decide whether the
 *     user may call this content-type action at all.
 *
 *  2. OWNER SCOPING — for content-types that have an `owners`
 *     relation, automatically:
 *       • connects the current user as an owner on create
 *       • filters find/findOne so users only see own records
 *       • blocks update/delete if the user doesn't own the record
 *     Users with the 'auth' app-access OR users who are admin
 *     of the app identified by the X-App-Name header bypass
 *     owner filtering.
 *
 * Strapi's built-in role/permission check runs BEFORE this
 * middleware.  If Strapi already denied the request (e.g.
 * unauthenticated user hitting a protected route), this
 * middleware never executes.
 */

const routeMap = require('../../config/app-access-routes');

// ───────────────────── helpers ──────────────────────────────

/**
 * Normalise a route-map entry into an array of allowed keys
 * for the given action.
 *
 *  'stock'                         → ['stock']
 *  ['stock','sale']                → ['stock','sale']
 *  { find:['stock','sale'], ... }  → depends on action
 */
function allowedKeys(entry, action) {
    if (!entry) return null;                       // not in map → unguarded
    if (typeof entry === 'string') return [entry];
    if (Array.isArray(entry)) return entry;

    // object with per-action arrays
    const val = entry[action];
    if (!val) return null;                         // action not listed → unguarded
    return Array.isArray(val) ? val : [val];
}

/**
 * Map Strapi controller action names to our config action names.
 *   find / search         → find
 *   findOne               → find
 *   create                → create
 *   update                → update
 *   delete                → delete
 */
function normaliseAction(action) {
    if (!action) return null;
    if (action === 'findOne' || action === 'search') return 'find';
    if (action === 'destroy') return 'delete';
    return action; // find, create, update, delete
}

/** Quick set-intersection check */
function hasAny(userKeys, requiredKeys) {
    return requiredKeys.some(k => userKeys.includes(k));
}

// ───────────────────── middleware ────────────────────────────

module.exports = (config, { strapi }) => {

    // cache: userId → { appKeys: ['stock','sale',…], adminKeys: ['stock',…] }
    const accessCache = new Map();

    async function getUserAppAccess(userId) {
        if (accessCache.has(userId)) return accessCache.get(userId);

        const user = await strapi.query('plugin::users-permissions.user').findOne({
            where: { id: userId },
            populate: {
                app_accesses: { select: ['key'] },
                admin_app_accesses: { select: ['key'] },
            },
        });

        const result = {
            appKeys: (user?.app_accesses || []).map(a => a.key),
            adminKeys: (user?.admin_app_accesses || []).map(a => a.key),
        };
        accessCache.set(userId, result);

        // Evict after 60s so changes take effect without a restart
        setTimeout(() => accessCache.delete(userId), 60_000);

        return result;
    }

    return async (ctx, next) => {

        // ── 0.  Only apply to content-api routes ────────────────
        //    Admin-panel requests and public (unauthenticated)
        //    requests are left to Strapi's own system.
        const user = ctx.state?.user;
        if (!user) return next();                     // public / unauthenticated

        const route = ctx.state?.route;
        if (!route) return next();

        // Identify the content-type UID from the route info
        // Strapi 5 populates route.info.apiName or we derive from the handler
        const handler = route.handler || '';          // e.g. "api::sale.sale.find"
        const parts = handler.split('.');
        // handler format: "api::sale.sale.find" or "plugin::users-permissions.user.me"
        if (parts.length < 3) return next();          // not a standard CRUD route

        const uid = `${parts[0]}.${parts[1]}`;       // "api::sale.sale"
        const action = normaliseAction(parts[2]);     // "find"

        // ── 1.  APP-ACCESS GATE ─────────────────────────────────
        const entry = routeMap[uid];
        if (!entry) return next();                    // not in the map → no guard

        const required = allowedKeys(entry, action);
        if (!required) return next();                 // action not restricted

        const { appKeys: userKeys, adminKeys } = await getUserAppAccess(user.id);

        // Global admin bypass — users with 'auth' pass everything
        const isGlobalAdmin = userKeys.includes('auth');

        if (!isGlobalAdmin && !hasAny(userKeys, required)) {
            return ctx.forbidden(
                `Your account does not have access to this resource. ` +
                `Required app access: ${required.join(' or ')}`
            );
        }

        // ── 2.  OWNER SCOPING ───────────────────────────────────
        //    Only applies to content-types that have an `owners`
        //    manyToMany relation to the user entity.
        const model = strapi.contentTypes[uid];
        const hasOwner = model?.attributes?.owners && model.attributes.owners.target === 'plugin::users-permissions.user';

        // Determine admin bypass for owner scoping:
        //  - Global admin ('auth' app-access) always bypasses
        //  - Per-app admin: if X-App-Name header matches one of the
        //    user's admin_app_accesses, bypass owner filtering
        const requestAppName = (ctx.request.headers['x-app-name'] || '').trim().toLowerCase();
        const isAppAdmin = requestAppName && adminKeys.includes(requestAppName);
        const bypassOwnerScoping = isGlobalAdmin || isAppAdmin;

        if (hasOwner && !bypassOwnerScoping) {

            if (action === 'create') {
                // Auto-connect the current user as an owner
                const body = ctx.request.body;
                if (body?.data) {
                    // Strapi 5 manyToMany connect syntax
                    body.data.owners = { connect: [user.documentId || user.id] };
                } else if (body) {
                    ctx.request.body = {
                        ...body,
                        data: { ...(body.data || {}), owners: { connect: [user.documentId || user.id] } },
                    };
                }
            }

            if (action === 'find') {
                // Inject owners filter so the user only sees records they own
                ctx.query = ctx.query || {};
                ctx.query.filters = ctx.query.filters || {};
                ctx.query.filters.owners = { id: { $eq: user.id } };
            }

            if (action === 'update' || action === 'delete') {
                // Verify the current user is one of the owners
                const id = ctx.params?.id;
                if (id) {
                    try {
                        const record = await strapi.entityService.findOne(uid, id, {
                            populate: { owners: { fields: ['id'] } },
                        });
                        if (!record) {
                            return ctx.notFound('Record not found');
                        }
                        const owners = record.owners || [];
                        const isOwner = Array.isArray(owners)
                            ? owners.some(o => o.id === user.id)
                            : owners.id === user.id;
                        if (!isOwner) {
                            return ctx.forbidden('You can only modify your own records');
                        }
                    } catch (err) {
                        strapi.log.warn(`[app-access-guard] ownership check error: ${err.message}`);
                        // fall through — let Strapi's own handler deal with it
                    }
                }
            }
        }

        return next();
    };
};
