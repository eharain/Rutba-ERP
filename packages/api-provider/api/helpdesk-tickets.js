/**
 * HelpdeskTicketsEndpoints — the Helpdesk ticket surface (spec §27.3, §27.5, §27.6).
 *
 * Anchored on `api::contact-ticket.contact-ticket` deliberately (spec decision D3):
 * the Helpdesk Ticket aggregate IS the existing contact_tickets recording, extended
 * additively. Renaming the UID would touch services/strapi, Core, every descriptor, the
 * generated clients and the notification templates for zero functional gain.
 *
 * Because the UID is shared with `contact-tickets.js` (the legacy ESS/HR flow), every
 * method NAME and every `action` in this file is unique against that file's
 * `listMine`/`submitInternal`/`listTeam`/`resolve` and its
 * `myTickets`/`submitInternalTicket`/`teamTickets`/`resolveTicket` actions. api-pro keys
 * method rows on `${interfaceKey}:${methodName}` and resolves policies on
 * (uid × action × role) — a duplicate on either axis silently overwrites or shadows.
 *
 * Three namespaces, structurally separate (§27.2): `/helpdesk/*` is the agent+admin
 * surface and is api-pro gated; `/me/helpdesk/*` is the requester surface and is
 * selfAuth (the handler resolves the caller to a person and gates on identity, never
 * on role); `/helpdesk/public/*` is anonymous intake. The separation is the point — a
 * scoping mistake in an agent endpoint cannot reach a requester surface.
 *
 * Method-name prefixes are not cosmetic. The api-pro seeder only walks descriptor
 * methods whose NAME starts with one of its whitelisted verbs
 * (list|by|get|find|create|update|del|remove|assign|merge|run|set|…). `reopen`,
 * `hold`, `claim`, `route`, `split`, `bulk`, `handover` and friends are all outside it,
 * so a natural name like `reopenTicket()` would be skipped by the seeder and surface
 * later as an unexplainable 403. Every lifecycle intent therefore carries a `run`
 * prefix and every read a `list`/`get`/`by` prefix; the wire `action` underneath is the
 * spec's name and must equal the handler name in services/core/src/modules/helpdesk.js.
 *
 * Route registration order matters on the server side, not here: koa-router matches in
 * registration order, so `/helpdesk/tickets/bulk` must mount before
 * `/helpdesk/tickets/:documentId`. The literal-path methods are listed first below to
 * document that requirement.
 */

// Per-role server-side scope for the agent surface.
//
// Deliberately unrestricted at the route layer. Helpdesk's row scope is
// `desk membership ∩ branch ∩ ownership` (§4.4) and NONE of it is expressible as an
// api-pro filter template: the policy resolver only understands $user / $claim /
// $query / $params / $body tokens, and there is no token for "the desks this user is a
// member of". Faking it with an `owner` shorthand would be actively wrong — an agent
// must see UNASSIGNED tickets in their queue, which an ownership filter hides.
//
// The authoritative gate is TicketService: every method takes the actor and applies
// desk/branch/ownership itself, and the thread read model strips internal messages in
// SQL (§29.9). This block exists so the Policy Editor shows the intent rather than an
// absent row, and so a future reviewer does not "fix" the gap by inventing a filter here.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: {},
};

// `claim` is self-assignment only for agents (§29.3 `ticket.assign.self`). Stamping the
// actor into the body at the route layer is defence in depth — TicketService.claim is
// still the gate — but it means a staff-level caller cannot claim a ticket ON BEHALF of
// someone else even if the handler is later loosened to read `assigned_to` from the body.
const CLAIM_SCOPES = {
    admin: {},
    manager: {},
    staff: { body: { assigned_to: '$user.id' } },
};

// §27.2 pins the list contract to flat `?page=&pageSize=&sort=` with the Strapi filter
// dialect for `filters`/`populate`/`fields`. listParams() from __param_builders would
// emit `pagination[page]`, which is the Strapi CRUD shape, not this one.
function listQuery({ page, pageSize, sort, filters, populate, fields } = {}) {
    return {
        ...(page !== undefined ? { page } : {}),
        ...(pageSize !== undefined ? { pageSize } : {}),
        ...(sort !== undefined ? { sort } : {}),
        ...(filters !== undefined ? { filters } : {}),
        ...(populate !== undefined ? { populate } : {}),
        ...(fields !== undefined ? { fields } : {}),
    };
}

export const HelpdeskTicketsEndpoints = {

    meta: {
        uid: 'api::contact-ticket.contact-ticket',
        domains: ['helpdesk'],
        roles: ['admin', 'manager', 'staff'],
    },

    // ── Agent + admin surface (api-pro gated) ────────────────────────────────────

    /** Bulk action over many tickets — per-action, per-ticket entitlement re-checked. */
    runBulk: (data) => ({
        path: '/helpdesk/tickets/bulk',
        action: 'bulk',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        // Capped at 100 tickets server-side, but each one is a full transition —
        // entitlement re-check, workflow side effects, notifications, audit trail
        // — run serially. A hundred of those is minutes, not seconds.
        timeoutMs: 300_000,
        data,
    }),

    /**
     * RULE-14: a merged ticket number keeps resolving — the payload carries `redirect_to`
     * rather than 404ing, so a number quoted to a customer never goes dead.
     * Literal path: it mounts before `/helpdesk/tickets/:documentId` on the server.
     */
    byNumber: (ticketNo) => ({
        path: `/helpdesk/tickets/by-number/${ticketNo}`,
        action: 'findByNumber',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    list: ({ page, pageSize, sort, filters, populate, fields } = {}) => ({
        path: '/helpdesk/tickets',
        action: 'find',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listQuery({ page, pageSize, sort, filters, populate, fields }),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/helpdesk/tickets/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: {
            ...(populate !== undefined ? { populate } : {}),
            ...(fields !== undefined ? { fields } : {}),
        },
    }),

    create: (data) => ({
        path: '/helpdesk/tickets',
        action: 'create',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Partial update. `status` is not a writable field — only a transition moves it. */
    update: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}`,
        action: 'update',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * The moves legal for THIS actor on THIS ticket right now — the agent workspace
     * builds its action buttons from this, so without it the UI has no source of truth
     * for what it may offer.
     */
    listTransitions: (documentId) => ({
        path: `/helpdesk/tickets/${documentId}/transitions`,
        action: 'transitions',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    /** { to_stage, resolution?, resolution_code?, reason? } — the workflow gates the move. */
    runTransition: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/transition`,
        action: 'transition',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Named alias for the canonical resolve transition. */
    runResolve: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/resolve`,
        action: 'resolve',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    runClose: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/close`,
        action: 'close',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    runReopen: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/reopen`,
        action: 'reopen',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Cancel is the closest thing to a delete — tickets are never deleted (RULE-13). */
    runCancel: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/cancel`,
        action: 'cancel',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    runHold: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/hold`,
        action: 'hold',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Assign to another agent — managers and admins only (§29.3 `ticket.assign`). */
    assignTicket: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/assign`,
        action: 'assign',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    runUnassign: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/unassign`,
        action: 'unassign',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Self-assignment. Agents may claim; they may not assign to anyone else. */
    runClaim: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/claim`,
        action: 'claim',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: CLAIM_SCOPES,
        data,
    }),

    /** Re-run the routing rules for one ticket. */
    runRoute: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/route`,
        action: 'route',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    mergeTicket: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/merge`,
        action: 'merge',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    runSplit: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/split`,
        action: 'split',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Link the ticket to any entity: { subject_entity_uid, subject_document_id }. */
    setSubject: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/subject`,
        action: 'linkSubject',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Full thread INCLUDING internal notes — the read model filters per caller. */
    listMessages: (documentId, { page, pageSize, sort } = {}) => ({
        path: `/helpdesk/tickets/${documentId}/messages`,
        action: 'messages',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listQuery({ page, pageSize, sort }),
    }),

    /** { body, visibility: 'public'|'internal', attachments? } — no message is ever editable. */
    createMessage: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/messages`,
        action: 'addMessage',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Redaction leaves a tombstone and is admin-only (§29.4). */
    runRedactMessage: (documentId, messageDocumentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/messages/${messageDocumentId}/redact`,
        action: 'redactMessage',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    listWatchers: (documentId) => ({
        path: `/helpdesk/tickets/${documentId}/watchers`,
        action: 'watchers',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    createWatcher: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/watchers`,
        action: 'addWatcher',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * `userId` is a UP user id, NOT a documentId — the watcher table keys on the user and
     * the service compares it numerically, so a documentId here removes nothing silently.
     * It is the same identifier `listWatchers` returns and `createWatcher` accepts.
     */
    removeWatcher: (documentId, userId) => ({
        path: `/helpdesk/tickets/${documentId}/watchers/${userId}`,
        action: 'removeWatcher',
        method: 'delete',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    listParticipants: (documentId) => ({
        path: `/helpdesk/tickets/${documentId}/participants`,
        action: 'participants',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    createParticipant: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/participants`,
        action: 'addParticipant',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    removeParticipant: (documentId, participantDocumentId) => ({
        path: `/helpdesk/tickets/${documentId}/participants/${participantDocumentId}`,
        action: 'removeParticipant',
        method: 'delete',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    listTasks: (documentId) => ({
        path: `/helpdesk/tickets/${documentId}/tasks`,
        action: 'tasks',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    createTask: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/tasks`,
        action: 'addTask',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateTask: (documentId, taskDocumentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/tasks/${taskDocumentId}`,
        action: 'updateTask',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    listAttachments: (documentId) => ({
        path: `/helpdesk/tickets/${documentId}/attachments`,
        action: 'attachments',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    createAttachment: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/attachments`,
        action: 'addAttachment',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    listTimeEntries: (documentId) => ({
        path: `/helpdesk/tickets/${documentId}/time-entries`,
        action: 'timeEntries',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    createTimeEntry: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/time-entries`,
        action: 'addTimeEntry',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Immutable audit trail for one ticket — read-only by construction (RULE-12). */
    listActivity: (documentId, { page, pageSize } = {}) => ({
        path: `/helpdesk/tickets/${documentId}/activity`,
        action: 'activity',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listQuery({ page, pageSize }),
    }),

    /** Due timestamps, pause windows and breach state for the ticket's SLA. */
    getSla: (documentId) => ({
        path: `/helpdesk/tickets/${documentId}/sla`,
        action: 'sla',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    /** Extending an SLA is a manager decision, never an agent one (§29.6). */
    runExtendSla: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/extend-sla`,
        action: 'extendSla',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    runApplyMacro: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/apply-macro`,
        action: 'applyMacro',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    runRequestApproval: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/request-approval`,
        action: 'requestApproval',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Shift handover: pass context and open work to the next agent on duty. */
    runHandover: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/handover`,
        action: 'handover',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    createChild: (documentId, data) => ({
        path: `/helpdesk/tickets/${documentId}/children`,
        action: 'createChild',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // ── Requester surface (selfAuth — the handler gates on identity) ─────────────
    //
    // These are `auth:false` equivalents in Core: the api-pro interceptor never runs,
    // so the grants below are declarative only. They exist so the generated client is
    // typed and so the surface is enumerable in the Policy Editor. Authorization is
    // "the caller resolves to the requester person, or to an explicit participant" —
    // identity, never role (§4.6). `web` is listed as a caller because the storefront
    // customer portal is a first-class requester surface.

    listMyTickets: ({ page, pageSize, sort, filters } = {}) => ({
        path: '/me/helpdesk/tickets',
        action: 'myHelpdeskTickets',
        method: 'get',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: listQuery({ page, pageSize, sort, filters }),
    }),

    getMyTicket: (documentId) => ({
        path: `/me/helpdesk/tickets/${documentId}`,
        action: 'myHelpdeskTicket',
        method: 'get',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    createMyTicket: (data) => ({
        path: '/me/helpdesk/tickets',
        action: 'createMyTicket',
        method: 'post',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** Public thread only — internal notes are stripped in SQL, not in the client. */
    listMyTicketMessages: (documentId, { page, pageSize } = {}) => ({
        path: `/me/helpdesk/tickets/${documentId}/messages`,
        action: 'myTicketMessages',
        method: 'get',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: listQuery({ page, pageSize }),
    }),

    createMyTicketMessage: (documentId, data) => ({
        path: `/me/helpdesk/tickets/${documentId}/messages`,
        action: 'addMyTicketMessage',
        method: 'post',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    runMyReopen: (documentId, data) => ({
        path: `/me/helpdesk/tickets/${documentId}/reopen`,
        action: 'reopenMyTicket',
        method: 'post',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    runMyClose: (documentId, data) => ({
        path: `/me/helpdesk/tickets/${documentId}/close`,
        action: 'closeMyTicket',
        method: 'post',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** CSAT on resolution: { rating, comment? }. */
    runMyRate: (documentId, data) => ({
        path: `/me/helpdesk/tickets/${documentId}/rate`,
        action: 'rateMyTicket',
        method: 'post',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** "Any update?" — rate-limited server-side so it cannot be used to spam a desk. */
    runMyNudge: (documentId, data) => ({
        path: `/me/helpdesk/tickets/${documentId}/nudge`,
        action: 'nudgeMyTicket',
        method: 'post',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** ESS alias with identical semantics — employees think in "requests", not tickets. */
    listMyRequests: ({ page, pageSize, sort, filters } = {}) => ({
        path: '/me/helpdesk/requests',
        action: 'myRequests',
        method: 'get',
        apps: ['helpdesk', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: listQuery({ page, pageSize, sort, filters }),
    }),

    // ── Public surface (anonymous intake) ────────────────────────────────────────

    /**
     * Anonymous intake on desks with `allow_anonymous`. selfAuth + rate-limited
     * (5/hour per IP, 3/hour per email) and `Idempotency-Key` is REQUIRED — a customer
     * double-tapping Submit must not open two tickets (§27.10). There is deliberately
     * no public read counterpart: a reference number must never be sufficient to read a
     * ticket, or sequential references leak the whole tenant (§4.3).
     */
    createPublicTicket: (data) => ({
        path: '/helpdesk/public/tickets',
        action: 'createPublicTicket',
        method: 'post',
        apps: ['storefront', 'helpdesk'],
        approle: ['public', 'user', 'admin', 'manager', 'staff'],
        data,
    }),

};
