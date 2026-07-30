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

  const LEAD = 'api::crm-lead.crm-lead';

  const routes = [
    // ── address self-service (auth:false + ensureUser → selfAuth) ─────────
    { method: 'get', path: '/api/me/addresses', selfAuth: true, handler: (c) => address.list(c) },
    { method: 'post', path: '/api/me/addresses', selfAuth: true, handler: (c) => address.createForMe(c) },
    { method: 'put', path: '/api/me/addresses/:documentId', selfAuth: true, handler: (c) => address.updateForMe(c) },
    { method: 'delete', path: '/api/me/addresses/:documentId', selfAuth: true, handler: (c) => address.deleteForMe(c) },
    { method: 'post', path: '/api/me/addresses/:documentId/make-default', selfAuth: true, handler: (c) => address.makeDefault(c) },

    // ── contact tickets (auth:false + ensureUser → selfAuth) ──────────────
    { method: 'post', path: '/api/contact-tickets/submit', selfAuth: true, handler: (c) => ticket.submit(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/reply', selfAuth: true, handler: (c) => ticket.addReply(c) },
    { method: 'post', path: '/api/contact-tickets/:documentId/sla-breach', selfAuth: true, handler: (c) => ticket.reportSlaBreach(c) },

    // ── crm-lead (interceptor-gated; literal path before :documentId) ─────
    { method: 'get', path: '/api/crm-leads/assignees', uid: LEAD, action: 'assignees', handler: (c) => lead.assignees(c) },
    { method: 'get', path: '/api/crm-leads', uid: LEAD, action: 'find', handler: (c) => lead.find(c) },
    { method: 'get', path: '/api/crm-leads/:documentId', uid: LEAD, action: 'findOne', handler: (c) => lead.findOne(c) },
    { method: 'post', path: '/api/crm-leads', uid: LEAD, action: 'create', handler: (c) => lead.create(c) },
    { method: 'put', path: '/api/crm-leads/:documentId', uid: LEAD, action: 'update', handler: (c) => lead.update(c) },
  ].map((r) => ({ ...r, module: 'crm' }));

  return { name: 'crm', routes };
}

module.exports = { registerCrmModule };
