'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { ValidationError } = require('@strapi/utils').errors;

const UID = 'api::crm-lead.crm-lead';

// `assigned_to` targets plugin::users-permissions.user, which the content-API
// input validator rejects ("Invalid key") unless the role can read UP users —
// a grant we deliberately never make. So the field is stripped from the body
// before core validation and applied server-side via the query layer.
// Accepts { connect: [ref] }, a bare documentId/id, or null (unassign).
// Returns undefined when the request didn't mention assigned_to at all.
function popAssignedTo(ctx) {
    const data = ctx.request?.body?.data;
    if (!data || !Object.prototype.hasOwnProperty.call(data, 'assigned_to')) return undefined;
    const value = data.assigned_to;
    delete data.assigned_to;

    if (value == null) return null;
    if (typeof value === 'string' || typeof value === 'number') return value;
    const ref = Array.isArray(value.connect) ? value.connect[0] : null;
    if (ref == null) return null;
    if (typeof ref === 'object') return ref.documentId ?? ref.id ?? null;
    return ref;
}

module.exports = createCoreController(UID, ({ strapi }) => ({

    // UP-user relations are stripped from content-API responses (populate=*
    // skips them; explicit populate is rejected), so find/findOne attach a
    // sanitized assignee projection server-side.
    async find(ctx) {
        const response = await super.find(ctx);
        await attachAssignees(strapi, response?.data);
        return response;
    },

    async findOne(ctx) {
        const response = await super.findOne(ctx);
        await attachAssignees(strapi, response?.data ? [response.data] : []);
        return response;
    },

    async create(ctx) {
        const assignedRef = popAssignedTo(ctx);
        const response = await super.create(ctx);
        const documentId = response?.data?.documentId;
        if (assignedRef !== undefined && documentId) {
            await applyAssignedTo(strapi, documentId, assignedRef);
        }
        return response;
    },

    async update(ctx) {
        const assignedRef = popAssignedTo(ctx);
        const response = await super.update(ctx);
        const documentId = response?.data?.documentId;
        if (assignedRef !== undefined && documentId) {
            await applyAssignedTo(strapi, documentId, assignedRef);
        }
        return response;
    },

    /**
     * GET /crm-leads/assignees — users holding an active CRM app-role,
     * for the lead "assigned to" picker. Returns a minimal projection only.
     *
     * The UP grant admits every rutba_app_user, so the CRM-membership check
     * lives here: only callers who themselves hold a CRM app-role may list
     * CRM staff.
     */
    async assignees(ctx) {
        const callerId = ctx.state?.user?.id;
        if (!callerId) return ctx.unauthorized();

        const caller = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { id: callerId, app_roles: { isActive: true, appDomains: { key: 'crm' } } },
            select: ['id'],
        });
        if (!caller) return ctx.forbidden('CRM role required');

        const users = await strapi.db.query('plugin::users-permissions.user').findMany({
            where: {
                blocked: false,
                app_roles: {
                    isActive: true,
                    appDomains: { key: 'crm' },
                },
            },
            select: ['id', 'documentId', 'username', 'email'],
            orderBy: { username: 'asc' },
        });

        ctx.send({
            data: users.map((u) => ({
                id: u.id,
                documentId: u.documentId,
                username: u.username,
                email: u.email,
            })),
        });
    },

}));

// Attach `assigned_to: { id, documentId, username, email } | null` to each
// lead row in place, reading the relation through the trusted query layer.
async function attachAssignees(strapi, rows) {
    const leads = (rows || []).filter((r) => r && r.documentId);
    if (leads.length === 0) return;

    const linked = await strapi.db.query(UID).findMany({
        where: { documentId: { $in: leads.map((l) => l.documentId) } },
        select: ['id', 'documentId'],
        populate: { assigned_to: { select: ['id', 'documentId', 'username', 'email'] } },
    });
    const byDoc = new Map(linked.map((l) => [l.documentId, l.assigned_to || null]));
    for (const lead of leads) {
        const u = byDoc.get(lead.documentId) || null;
        lead.assigned_to = u
            ? { id: u.id, documentId: u.documentId, username: u.username, email: u.email }
            : null;
    }
}

// Resolve the assignee ref (documentId or numeric id) to a UP user that holds
// an active CRM app-role, then link it. Null unassigns.
async function applyAssignedTo(strapi, leadDocumentId, ref) {
    let userId = null;
    if (ref !== null) {
        const where = /^\d+$/.test(String(ref))
            ? { id: Number(ref) }
            : { documentId: String(ref) };
        const user = await strapi.db.query('plugin::users-permissions.user').findOne({
            where: { ...where, blocked: false, app_roles: { isActive: true, appDomains: { key: 'crm' } } },
            select: ['id'],
        });
        if (!user) throw new ValidationError('assigned_to must reference a user with a CRM role');
        userId = user.id;
    }
    await strapi.db.query(UID).update({
        where: { documentId: leadDocumentId },
        data: { assigned_to: userId },
    });
}
