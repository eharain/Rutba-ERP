'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');

const INC_UID = 'api::hr-incident-report.hr-incident-report';

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({ where: { id } });
}

module.exports = createCoreController(INC_UID, ({ strapi }) => ({
  /** Report a health & safety incident — reporter is forced to the caller. */
  async reportIncident(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.badRequest('No employee record for this account');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const data = {
      incident_date: body.incident_date || new Date().toISOString(),
      location: body.location || null,
      type: body.type || 'Other',
      severity: body.severity || 'Low',
      description: body.description || null,
      status: 'Reported',
      reported_by: employee.documentId,
    };
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.reported_by);
    if (ownerId) data.owners = [ownerId];

    const created = await strapi.documents(INC_UID).create({ data });

    // Safety incidents are org-visible by design — notify HR/admin, not a
    // line manager (the template's `admin` audience decides the recipients).
    try {
      await strapi.service('api::notification.notification-engine').processEvent({
        event_name: 'hr.incident.reported',
        entity_type: 'hr-incident-report',
        entity_id: created.documentId,
        payload: {
          incident_id: created.documentId,
          severity: data.severity,
          incident_type: data.type,
          location: data.location,
        },
      });
    } catch (err) {
      strapi.log.warn(`[hr-incident-report/notify] ${err.message}`);
    }

    return ctx.send({ data: created });
  },

  /** Incidents the caller reported (self-service). */
  async myIncidents(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(INC_UID).findMany({
      filters: { reported_by: { documentId: { $eq: employee.documentId } } },
      sort: ['incident_date:desc'],
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },
}));
