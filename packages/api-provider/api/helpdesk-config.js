/**
 * HelpdeskConfigEndpoints — the configurable behaviour of a desk (spec §27.4):
 * workflows, SLA policies and calendars, the service catalog, automation and routing
 * rules, macros, resolution codes and module settings.
 *
 * This is the "general, not vertical" half of the module (standing decision 2): none of
 * these are enum branches in code, they are configured rows, so the whole file is
 * essentially one admin surface with a few reads opened up to managers and agents who
 * need the vocabulary to do their job — an agent cannot render the legal next stages
 * without reading the workflow, or apply a macro without listing macros.
 *
 * Like `helpdesk-desks.js`, these are Core-owned tables with no services/strapi
 * `schema.json`. The seeder writes `meta.uid` verbatim without resolving it against
 * `strapi.contentTypes`, and Core's route gate builds `ctx.state.route.handler` as
 * `"<uid>.<action>"`, so the UID below is a CONTRACT with
 * services/core/src/modules/helpdesk.js: every configuration route it registers must carry
 * `uid: 'api::helpdesk-config.helpdesk-config'` or it 403s.
 *
 * One interface per file — the seeder reads `meta.uid` only and ignores a per-method
 * `uid:` override — so all nine resources share this UID and are separated by `action`.
 * That is why nothing here uses a bare `find`/`create`: the actions are resource-named
 * (`findSlaPolicies`, `createMacro`, …) and must equal the handler names in
 * modules/helpdesk.js exactly, since api-pro resolves policies on (uid × action × role).
 *
 * Routing rules live here rather than under a `helpdesk-routing-rule` UID of their own
 * for exactly that reason: a separate UID would need a separate FILE, and routing is
 * desk behaviour. modules/helpdesk.js registers the five routing routes under this UID.
 *
 * Method-name prefixes are load-bearing: the seeder only walks whitelisted names, and a
 * name outside that set is silently skipped, surfacing later as a 403 nobody can trace.
 */

// Unrestricted at the route layer at every level. Configuration rows carry no ownership
// or recency dimension to filter on — the real separation here is WHICH LEVELS appear in
// each method's `approle`, which is how §29.7/§29.8 ("`sla.configure` admin only",
// "`macro.manage` admin + scoped manager") is expressed. A manager's "own desks" scope
// on macros and routing rules is not expressible as an api-pro filter template — there
// is no token for desk membership — so the service applies it (§29.9).
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: {},
};

export const HelpdeskConfigEndpoints = {

    meta: {
        uid: 'api::helpdesk-config.helpdesk-config',
        domains: ['helpdesk'],
        roles: ['admin', 'manager', 'staff'],
    },

    // ── Workflows ───────────────────────────────────────────────────────────────
    //
    // Read is open to agents because the agent workspace renders its stage buttons from
    // the workflow definition. Authoring is admin only (`workflow.configure`, §29.8) —
    // a workflow maps custom stages onto canonical statuses, so anyone who can edit one
    // can bypass a lifecycle side effect.

    listWorkflows: ({ filters } = {}) => ({
        path: '/helpdesk/workflows',
        action: 'findWorkflows',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: { ...(filters !== undefined ? { filters } : {}) },
    }),

    getWorkflow: (documentId) => ({
        path: `/helpdesk/workflows/${documentId}`,
        action: 'findOneWorkflow',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    createWorkflow: (data) => ({
        path: '/helpdesk/workflows',
        action: 'createWorkflow',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateWorkflow: (documentId, data) => ({
        path: `/helpdesk/workflows/${documentId}`,
        action: 'updateWorkflow',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    // ── SLA policies and calendars ──────────────────────────────────────────────

    listSlaPolicies: ({ filters } = {}) => ({
        path: '/helpdesk/sla/policies',
        action: 'findSlaPolicies',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        params: { ...(filters !== undefined ? { filters } : {}) },
    }),

    getSlaPolicy: (documentId) => ({
        path: `/helpdesk/sla/policies/${documentId}`,
        action: 'findOneSlaPolicy',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
    }),

    createSlaPolicy: (data) => ({
        path: '/helpdesk/sla/policies',
        action: 'createSlaPolicy',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateSlaPolicy: (documentId, data) => ({
        path: `/helpdesk/sla/policies/${documentId}`,
        action: 'updateSlaPolicy',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Business calendars — working hours and holidays the SLA clock pauses on. */
    listSlaCalendars: () => ({
        path: '/helpdesk/sla/calendars',
        action: 'findSlaCalendars',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
    }),

    createSlaCalendar: (data) => ({
        path: '/helpdesk/sla/calendars',
        action: 'createSlaCalendar',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateSlaCalendar: (documentId, data) => ({
        path: `/helpdesk/sla/calendars/${documentId}`,
        action: 'updateSlaCalendar',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    // ── Service catalog ─────────────────────────────────────────────────────────
    //
    // The catalog is the one configuration surface requesters see, so `ess` and `web`
    // are legitimate callers of the reads and of submit. §27.5 puts the requester read
    // on the agent path with `?audience=` rather than under `/me/helpdesk`, which is why
    // these two methods carry a wider `apps` list than anything else in this file; the
    // handler is selfAuth and filters items to the caller's audience itself.

    listCatalog: ({ audience, filters } = {}) => ({
        path: '/helpdesk/catalog',
        action: 'findCatalog',
        method: 'get',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        params: {
            ...(audience !== undefined ? { audience } : {}),
            ...(filters !== undefined ? { filters } : {}),
        },
    }),

    getCatalogItem: (documentId) => ({
        path: `/helpdesk/catalog/${documentId}`,
        action: 'findOneCatalogItem',
        method: 'get',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    createCatalogItem: (data) => ({
        path: '/helpdesk/catalog',
        action: 'createCatalogItem',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateCatalogItem: (documentId, data) => ({
        path: `/helpdesk/catalog/${documentId}`,
        action: 'updateCatalogItem',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    publishCatalogItem: (documentId, data) => ({
        path: `/helpdesk/catalog/${documentId}/publish`,
        action: 'publishCatalogItem',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Submitting a catalog item opens a ticket from its template — requester-facing. */
    runCatalogSubmit: (documentId, data) => ({
        path: `/helpdesk/catalog/${documentId}/submit`,
        action: 'submitCatalogRequest',
        method: 'post',
        apps: ['helpdesk', 'ess', 'storefront'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    // ── Automation rules ────────────────────────────────────────────────────────
    //
    // An automation rule acts as `helpdesk_system` and can create, transition and
    // assign, so authoring one is effectively delegating those powers — admin only.
    // Managers may read and hand-run a rule over their own desks (§29.7).

    listAutomationRules: ({ filters } = {}) => ({
        path: '/helpdesk/automation/rules',
        action: 'findAutomationRules',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        params: { ...(filters !== undefined ? { filters } : {}) },
    }),

    getAutomationRule: (documentId) => ({
        path: `/helpdesk/automation/rules/${documentId}`,
        action: 'findOneAutomationRule',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
    }),

    createAutomationRule: (data) => ({
        path: '/helpdesk/automation/rules',
        action: 'createAutomationRule',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateAutomationRule: (documentId, data) => ({
        path: `/helpdesk/automation/rules/${documentId}`,
        action: 'updateAutomationRule',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    runAutomationRule: (documentId, data) => ({
        path: `/helpdesk/automation/rules/${documentId}/run`,
        action: 'runAutomationRule',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    // ── Routing rules ───────────────────────────────────────────────────────────

    listRoutingRules: ({ filters } = {}) => ({
        path: '/helpdesk/routing/rules',
        action: 'findRoutingRules',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        params: { ...(filters !== undefined ? { filters } : {}) },
    }),

    createRoutingRule: (data) => ({
        path: '/helpdesk/routing/rules',
        action: 'createRoutingRule',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateRoutingRule: (ruleId, data) => ({
        path: `/helpdesk/routing/rules/${ruleId}`,
        action: 'updateRoutingRule',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    /** Dry-run the rule set against a sample ticket — writes nothing. */
    runRoutingPreview: (data) => ({
        path: '/helpdesk/routing/preview',
        action: 'previewRouting',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    /**
     * Why nobody is available — the same checks `route()` runs, reported instead of
     * applied. This is what turns "routing did nothing" into an answer.
     */
    getRoutingAvailability: ({ deskId, deskKey, teamId } = {}) => ({
        path: '/helpdesk/routing/availability',
        action: 'availability',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        params: {
            ...(deskId !== undefined ? { deskId } : {}),
            ...(deskKey !== undefined ? { deskKey } : {}),
            ...(teamId !== undefined ? { teamId } : {}),
        },
    }),

    // ── Macros ──────────────────────────────────────────────────────────────────

    listMacros: ({ filters } = {}) => ({
        path: '/helpdesk/macros',
        action: 'findMacros',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: { ...(filters !== undefined ? { filters } : {}) },
    }),

    createMacro: (data) => ({
        path: '/helpdesk/macros',
        action: 'createMacro',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateMacro: (documentId, data) => ({
        path: `/helpdesk/macros/${documentId}`,
        action: 'updateMacro',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    removeMacro: (documentId) => ({
        path: `/helpdesk/macros/${documentId}`,
        action: 'deleteMacro',
        method: 'delete',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
    }),

    // ── Resolution codes ────────────────────────────────────────────────────────
    //
    // Agents read these to close a ticket with a reason; the list itself is reference
    // data and never hardcoded in a frontend — the resolution picker reads this route.

    listResolutionCodes: () => ({
        path: '/helpdesk/resolution-codes',
        action: 'findResolutionCodes',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    createResolutionCode: (data) => ({
        path: '/helpdesk/resolution-codes',
        action: 'createResolutionCode',
        method: 'post',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    updateResolutionCode: (documentId, data) => ({
        path: `/helpdesk/resolution-codes/${documentId}`,
        action: 'updateResolutionCode',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

    // ── Module settings ─────────────────────────────────────────────────────────

    /** Singleton — reopen window, CSAT prompts, retention, branding, remote-support policy. */
    getSettings: () => ({
        path: '/helpdesk/settings',
        action: 'findSettings',
        method: 'get',
        apps: ['helpdesk'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
    }),

    updateSettings: (data) => ({
        path: '/helpdesk/settings',
        action: 'updateSettings',
        method: 'patch',
        apps: ['helpdesk'],
        approle: ['admin'],
        scope: ROLE_SCOPES,
        data,
    }),

};
