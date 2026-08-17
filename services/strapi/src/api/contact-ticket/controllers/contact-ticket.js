// @ts-nocheck
'use strict';

const { factories } = require('@strapi/strapi');
const { ensureUser } = require('../../../utils/ensure-user');
const { resolveOrCreateEmployeeForUser, resolveEmployeeForUser, isHrManager, managedReportDocIds } = require('../../../utils/hr-access');

const TICKET_UID = 'api::contact-ticket.contact-ticket';
const HELPDESK_CATEGORIES = ['IT', 'HR', 'Facilities'];

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

async function callerReportDocIds(strapi, user) {
  const emp = await resolveEmployeeForUser(strapi, user);
  if (!emp) return [];
  return managedReportDocIds(strapi, emp.documentId);
}

module.exports = factories.createCoreController(TICKET_UID, (/** @type {{ strapi: any }} */ { strapi }) => ({
    /** Submit an internal HR/IT/Facilities helpdesk ticket — authenticated employee self-service. */
    async submitInternalTicket(ctx) {
        const user = await loadActor(ctx, strapi);
        if (!user) return ctx.unauthorized('You must be logged in');

        const employee = await resolveOrCreateEmployeeForUser(strapi, user);
        if (!employee) return ctx.badRequest('No employee record for this account');

        const body = ctx.request.body?.data ?? ctx.request.body ?? {};
        const subject = String(body.subject || '').trim();
        const message = String(body.message || '').trim();
        const category = HELPDESK_CATEGORIES.includes(body.category) ? body.category : 'IT';
        if (!subject) return ctx.badRequest('subject is required');
        if (!message) return ctx.badRequest('message is required');

        const ticket = await strapi.documents(TICKET_UID).create({
            data: {
                subject,
                message,
                category,
                status: 'open',
                user: user.id,
                employee: employee.documentId,
                last_reply_by: 'user',
                last_reply_at: new Date(),
            },
        });
        return ctx.send({ data: ticket });
    },

    /** The caller's own helpdesk tickets (self-service). */
    async myTickets(ctx) {
        const user = await loadActor(ctx, strapi);
        if (!user) return ctx.unauthorized('You must be logged in');

        const employee = await resolveOrCreateEmployeeForUser(strapi, user);
        if (!employee) return ctx.send({ data: [] });

        const rows = await strapi.documents(TICKET_UID).findMany({
            filters: { employee: { documentId: { $eq: employee.documentId } } },
            sort: ['createdAt:desc'],
            pagination: { pageSize: 200 },
        });
        return ctx.send({ data: rows || [] });
    },

    /** Open helpdesk tickets the caller may resolve: HR manager/admin -> org-wide; line manager -> their reports. */
    async teamTickets(ctx) {
        const user = await loadActor(ctx, strapi);
        if (!user) return ctx.unauthorized('You must be logged in');

        let filters = { category: { $in: HELPDESK_CATEGORIES }, status: { $ne: 'resolved' } };
        if (!isHrManager(ctx, user)) {
            const reports = await callerReportDocIds(strapi, user);
            if (!reports.length) return ctx.send({ data: [] });
            filters = { ...filters, employee: { documentId: { $in: reports } } };
        }

        const rows = await strapi.documents(TICKET_UID).findMany({
            filters,
            sort: ['createdAt:desc'],
            populate: { employee: { fields: ['name'] } },
            pagination: { pageSize: 200 },
        });
        return ctx.send({ data: rows || [] });
    },

    /** HR/IT resolves a helpdesk ticket. */
    async resolveTicket(ctx) {
        const user = await loadActor(ctx, strapi);
        if (!user) return ctx.unauthorized('You must be logged in');

        const { documentId } = ctx.params;
        const current = await strapi.documents(TICKET_UID).findOne({
            documentId,
            populate: { employee: { fields: ['documentId'] } },
        });
        if (!current) return ctx.notFound('Ticket not found');

        if (!isHrManager(ctx, user)) {
            const reports = await callerReportDocIds(strapi, user);
            const targetDoc = current.employee?.documentId;
            if (!targetDoc || !reports.includes(targetDoc)) {
                return ctx.forbidden('You can only resolve tickets from your team');
            }
        }

        const updated = await strapi.documents(TICKET_UID).update({
            documentId,
            data: { status: 'resolved', resolved_at: new Date().toISOString() },
        });
        return ctx.send({ data: updated });
    },

    async submit(/** @type {any} */ ctx) {
        const user = await ensureUser(ctx, strapi);
        if (!user) return;

        const body = ctx.request.body || {};
        const subject = String(body.subject || '').trim();
        const message = String(body.message || '').trim();
        const slaHours = Number(body.sla_hours || 24);

        if (!subject) return ctx.badRequest('subject is required');
        if (!message) return ctx.badRequest('message is required');

        // Resolve the canonical person identity for this user so tickets
        // are reachable via the contact-unification graph (helps CRM
        // correlate "who is this human" across orders, leads, etc.).
        let personId = null;
        try {
            const person = await strapi.service('api::person.person').ensureForUser(user);
            personId = person?.id || null;
        } catch (err) {
            strapi.log.warn(`[contact-ticket] person resolve failed: ${err.message}`);
        }

        const ticket = await strapi.documents('api::contact-ticket.contact-ticket').create({
            data: {
                subject,
                message,
                status: 'open',
                user: { id: user.id },
                ...(personId ? { person: { id: personId } } : {}),
                last_reply_by: 'user',
                last_reply_at: new Date(),
                sla_due_at: new Date(Date.now() + slaHours * 60 * 60 * 1000),
            },
        });

        await strapi.service('api::notification.notification-engine').processEvent({
            event_name: 'contact.submitted',
            entity_type: 'contact-ticket',
            entity_id: ticket.documentId,
            payload: {
                user_id: user.id,
                ticket_id: ticket.documentId,
                subject,
                status: 'open',
            },
        });

        return ctx.send({ data: ticket });
    },

    async addReply(/** @type {any} */ ctx) {
        const actor = await ensureUser(ctx, strapi);
        if (!actor) return;

        const { documentId } = ctx.params;
        const body = ctx.request.body || {};
        const reply = String(body.reply || '').trim();
        const replyBy = String(body.reply_by || '').trim().toLowerCase();

        if (!reply) return ctx.badRequest('reply is required');
        if (!['user', 'agent'].includes(replyBy)) return ctx.badRequest('reply_by must be user or agent');

        const ticket = await strapi.documents('api::contact-ticket.contact-ticket').findOne({
            documentId,
            populate: {
                user: { fields: ['id', 'email'] },
                assigned_to: { fields: ['id', 'email'] },
            },
        });
        if (!ticket) return ctx.notFound('Ticket not found');

        const updated = await strapi.documents('api::contact-ticket.contact-ticket').update({
            documentId,
            data: {
                last_reply_by: replyBy,
                last_reply_at: new Date(),
                status: ticket.status === 'resolved' ? 'in_progress' : ticket.status,
                metadata: {
                    ...(ticket.metadata || {}),
                    latest_reply: reply,
                    latest_reply_by_user_id: actor.id,
                },
            },
        });

        await strapi.service('api::notification.notification-engine').processEvent({
            event_name: 'contact.reply.added',
            entity_type: 'contact-ticket',
            entity_id: ticket.documentId,
            payload: {
                user_id: ticket.user?.id,
                assigned_to: ticket.assigned_to?.id,
                ticket_id: ticket.documentId,
                reply_by: replyBy,
                reply,
            },
        });

        return ctx.send({ data: updated });
    },

    async reportSlaBreach(/** @type {any} */ ctx) {
        const actor = await ensureUser(ctx, strapi);
        if (!actor) return;

        const { documentId } = ctx.params;

        const ticket = await strapi.documents('api::contact-ticket.contact-ticket').findOne({
            documentId,
            populate: {
                user: { fields: ['id'] },
                assigned_to: { fields: ['id'] },
            },
        });
        if (!ticket) return ctx.notFound('Ticket not found');

        await strapi.service('api::notification.notification-engine').processEvent({
            event_name: 'contact.sla.breach',
            entity_type: 'contact-ticket',
            entity_id: ticket.documentId,
            payload: {
                user_id: ticket.user?.id,
                assigned_to: ticket.assigned_to?.id,
                ticket_id: ticket.documentId,
                status: ticket.status,
                sla_due_at: ticket.sla_due_at,
            },
        });

        return ctx.send({ data: { ticket_id: ticket.documentId, sla_breach_reported: true } });
    },
}));
