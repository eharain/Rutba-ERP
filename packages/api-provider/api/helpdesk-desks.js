/**
 * HelpdeskDesksEndpoints — desks (spec §27.4).
 *
 * Desks are the module's primary scoping dimension: effective ticket visibility is
 * `role capability ∩ desk scope ∩ branch scope ∩ ownership` (§4.4), and desk membership
 * is what "an IT agent does not see HR tickets" actually means. That makes this file
 * the org-structure half of the Helpdesk permission surface, kept separate from
 * `helpdesk-config.js` (the behaviour half) so the two can be reviewed independently.
 *
 * Desks are a Core-owned table created by rutba-core migrations, so they have no
 * pos-strapi `schema.json` and no Strapi content-type. That is fine here: the api-pro
 * seeder writes the interface row from `meta.uid` verbatim and never resolves it against
 * `strapi.contentTypes`, and Core's route gate composes `ctx.state.route.handler` as
 * `"<uid>.<action>"` from whatever the module route declares. The UID below is therefore
 * a CONTRACT with rutba-core/src/modules/helpdesk.js — the module's desk routes must
 * carry `uid: 'api::helpdesk-desk.helpdesk-desk'` or every one of them 403s.
 *
 * The seeder walks descriptors one interface per FILE (it reads `meta.uid` only, never a
 * per-method `uid:` override — the README's claim that methods may override it is stale
 * against the current seeder), and resolves policies on (uid × action × role). Every
 * `action` below is therefore BYTE-IDENTICAL to a handler name in
 * rutba-core/src/modules/helpdesk.js; a near-miss seeds a policy for a route that does
 * not exist and 403s the one that does.
 *
 * Desk membership, teams and queues are deliberately ABSENT. They are specified in §27.4
 * but no Core route serves them yet, and a seeded policy for a missing route reads later
 * as a working feature. They come back here in the same change that adds the handlers.
 *
 * Method names carry `list`/`by`/`get`/`create`/`update`/`run` prefixes because the seeder
 * only walks whitelisted method names; a name outside that set is skipped and shows up
 * later as an unexplainable 403.
 *
 * Desks are addressed by numeric id OR by `key` (`:idOrKey` in the Core route) — they are
 * Core-owned rows and carry no `documentId`.
 */

// Unrestricted at the route layer for every level, deliberately.
//
// A desk row is readable by any agent (they need the desk list to filter and to see
// where a ticket could be routed); WRITE separation is expressed by `approle` per
// method, not by a filter template. Membership-scoped reads — "which desks am I on" —
// are computed by the service from the member rows, and there is no api-pro token for
// that, so no filter here could express it. §29.9: the service layer is the gate.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: {},
};

export const HelpdeskDesksEndpoints = {

    meta: {
        uid: 'api::helpdesk-desk.helpdesk-desk',
        domains: ['helpdesk'],
        roles: ['admin', 'manager', 'staff'],
    },

    // ── Desks ───────────────────────────────────────────────────────────────────

    /** `includeInactive` widens the list to archived desks; the default is active only. */
    list: ({ includeInactive } = {}) => ({
        path: '/helpdesk/desks',
        action: 'listDesks',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: {
            ...(includeInactive !== undefined ? { includeInactive } : {}),
        },
    }),

    byId: (idOrKey) => ({
        path: `/helpdesk/desks/${idOrKey}`,
        action: 'getDesk',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    /** Creating a desk is `desk.configure` — admin only (§29.8). */
    create: (data) => ({
        path: '/helpdesk/desks',
        action: 'createDesk',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    update: (idOrKey, data) => ({
        path: `/helpdesk/desks/${idOrKey}`,
        action: 'updateDesk',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * A desk is archived, never deleted — its tickets carry the FK. §32.4: deactivating
     * a desk that still holds open tickets requires nominating a target desk in `data`.
     */
    runDeactivate: (idOrKey, data) => ({
        path: `/helpdesk/desks/${idOrKey}/deactivate`,
        action: 'deactivateDesk',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    runActivate: (idOrKey) => ({
        path: `/helpdesk/desks/${idOrKey}/activate`,
        action: 'activateDesk',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
    }),

};
