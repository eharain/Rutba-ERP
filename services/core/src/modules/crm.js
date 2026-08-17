'use strict';

/**
 * CRM / contact cluster tranche (playbook tranche 3): address self-service,
 * contact tickets, crm-lead assignment.
 *
 * Same zero-copy porting model as mfg/hr — controllers and the person service
 * are require()d from pos-strapi source and run against the compat strapi.
 * No content-type in this cluster has lifecycles, so the module registers no
 * document middlewares.
 *
 * Auth models:
 *  - address /me/addresses + contact-ticket routes are `auth: false` +
 *    ensureUser in Strapi → selfAuth here (interceptor never saw them there).
 *    The seeded rows for /me/addresses carry plain CRUD action names
 *    (find/create/update/delete — the descriptor's verb-whitelist dialect), so
 *    without this module core mounted a PLAIN find handler on /me/addresses;
 *    claiming the verb+path first fixes that. The contact-ticket routes have
 *    no descriptor at all (Strapi mounts them from the route file) → they were
 *    404 in core until now.
 *  - crm-lead routes are authenticated Strapi routes → interceptor-gated with
 *    uid + action. find/findOne/create/update are CORE-ACTION OVERRIDES
 *    (assigned_to targets a UP user, which content-API validation rejects, so
 *    the controller strips it and applies it via the query layer, attaching a
 *    sanitized assignee projection on reads); `assignees` is the literal-path
 *    picker endpoint.
 *
 * Crons: none (pos-strapi schedules no crm/contact tasks).
 */

const path = require('path');
const { posRequire, instantiateController } = require('../compat/strapi');

function ctrl(apiName, strapi) {
  return instantiateController(
    posRequire(path.join('api', apiName, 'controllers', `${apiName}.js`)),
    strapi
  );
}

function registerCrmModule() {
  const strapi = global.strapi;

  const address = ctrl('address', strapi);
  const ticket = ctrl('contact-ticket', strapi);
  const lead = ctrl('crm-lead', strapi);
  const activity = ctrl('crm-activity', strapi);
  const segment = ctrl('crm-segment', strapi);
  const contact = ctrl('crm-contact', strapi);

  const LEAD = 'api::crm-lead.crm-lead';
  const ACTIVITY = 'api::crm-activity.crm-activity';
  const SEGMENT = 'api::crm-segment.crm-segment';
  const CONTACT = 'api::crm-contact.crm-contact';
  const TICKET = 'api::contact-ticket.contact-ticket';

  const routes = [
    // ── address self-service (auth:false + ensureUser → selfAuth) ─────────
    { method: 'get', path: '/api/me/addresses', selfAuth: true, handler: (c) => address.list(c) },
    { method: 'post', path: '/api/me/addresses', selfAuth: true, handler: (c) => address.createForMe(c) },
    { method: 'put', path: '/api/me/addresses/:documentId', selfAuth: true, handler: (c) => address.updateForMe(c) },
    { method: 'delete', path: '/api/me/addresses/:documentId', selfAuth: true, handler: (c) => address.deleteForMe(c) },
    { method: 'post', path: '/api/me/addresses/:documentId/make-default', selfAuth: true, handler: (c) => address.makeDefault(c) },

    // ── contact tickets: public storefront flow (auth:false + ensureUser → selfAuth) ──
    { method: 'post', path: '/api/contact-tickets/submit', selfAuth: true, handler: (c) => ticket.submit(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/reply', selfAuth: true, handler: (c) => ticket.addReply(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/sla-breach', selfAuth: true, handler: (c) => ticket.reportSlaBreach(c) },

    // ── contact tickets: internal HR/IT/Facilities helpdesk (authenticated, interceptor-gated) ──
    { method: 'get', path: '/api/contact-tickets/mine', uid: TICKET, action: 'myTickets', handler: (c) => ticket.myTickets(c) },
    { method: 'post', path: '/api/contact-tickets/submit-internal', uid: TICKET, action: 'submitInternalTicket', handler: (c) => ticket.submitInternalTicket(c) },
    { method: 'get', path: '/api/contact-tickets/team', uid: TICKET, action: 'teamTickets', handler: (c) => ticket.teamTickets(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/resolve', uid: TICKET, action: 'resolveTicket', handler: (c) => ticket.resolveTicket(c) },

    // ── crm-lead (interceptor-gated; literal path before :documentId) ─────
    { method: 'get', path: '/api/crm-leads/assignees', uid: LEAD, action: 'assignees', handler: (c) => lead.assignees(c) },
    { method: 'get', path: '/api/crm-leads', uid: LEAD, action: 'find', handler: (c) => lead.find(c) },
    { method: 'get', path: '/api/crm-leads/:documentId', uid: LEAD, action: 'findOne', handler: (c) => lead.findOne(c) },
    { method: 'post', path: '/api/crm-leads', uid: LEAD, action: 'create', handler: (c) => lead.create(c) },
    { method: 'put', path: '/api/crm-leads/:documentId', uid: LEAD, action: 'update', handler: (c) => lead.update(c) },

    // ── crm-activity typed timeline (CRM plan §5.1) ──────────────────────
    // create/update are CORE-ACTION OVERRIDES: `actor` targets a UP user,
    // which content-API validation rejects, so the controller strips it and
    // stamps it through the query layer. timeline/followups/complete-followup
    // are custom actions; the literal paths go before /:documentId.
    { method: 'get', path: '/api/crm-activities/timeline', uid: ACTIVITY, action: 'timeline', handler: (c) => activity.timeline(c) },
    { method: 'get', path: '/api/crm-activities/followups', uid: ACTIVITY, action: 'followups', handler: (c) => activity.followups(c) },
    { method: 'post', path: '/api/crm-activities/:documentId/complete-followup', uid: ACTIVITY, action: 'completeFollowup', handler: (c) => activity.completeFollowup(c) },
    { method: 'post', path: '/api/crm-activities', uid: ACTIVITY, action: 'create', handler: (c) => activity.create(c) },
    { method: 'put', path: '/api/crm-activities/:documentId', uid: ACTIVITY, action: 'update', handler: (c) => activity.update(c) },

    // ── crm-segment saved audiences (CRM plan §5.3) ──────────────────────
    // create/update override the core actions to compile-check the
    // definition at save time; the rest are custom actions.
    { method: 'get', path: '/api/crm-segments/fields', uid: SEGMENT, action: 'fields', handler: (c) => segment.fields(c) },
    { method: 'post', path: '/api/crm-segments/resolve', uid: SEGMENT, action: 'resolve', handler: (c) => segment.resolve(c) },
    { method: 'get', path: '/api/crm-segments/:documentId/members', uid: SEGMENT, action: 'members', handler: (c) => segment.members(c) },
    { method: 'get', path: '/api/crm-segments/:documentId/audience', uid: SEGMENT, action: 'audience', handler: (c) => segment.audience(c) },
    { method: 'post', path: '/api/crm-segments/:documentId/recount', uid: SEGMENT, action: 'recomputeCount', handler: (c) => segment.recomputeCount(c) },
    { method: 'post', path: '/api/crm-segments', uid: SEGMENT, action: 'create', handler: (c) => segment.create(c) },
    { method: 'put', path: '/api/crm-segments/:documentId', uid: SEGMENT, action: 'update', handler: (c) => segment.update(c) },

    // ── crm-contact (CORE-ACTION OVERRIDES only) ─────────────────────────
    // create/update carry the contact-unification dual-write (Phase 1C.1) —
    // they resolve the row to a canonical person. Without claiming them here
    // core would mount the seeded PLAIN handlers and CRM contacts created
    // through core would silently never join a person-based segment.
    { method: 'post', path: '/api/crm-contacts', uid: CONTACT, action: 'create', handler: (c) => contact.create(c) },
    { method: 'put', path: '/api/crm-contacts/:documentId', uid: CONTACT, action: 'update', handler: (c) => contact.update(c) },
  ].map((r) => ({ ...r, module: 'crm' }));

  return { name: 'crm', routes };
}

module.exports = { registerCrmModule };
