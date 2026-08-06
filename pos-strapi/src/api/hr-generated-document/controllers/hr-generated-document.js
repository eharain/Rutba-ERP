'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { resolveOrCreateEmployeeForUser, isHrManager, ownerUserIdForEmployeeRef } = require('../../../utils/hr-access');

const DOC_UID = 'api::hr-generated-document.hr-generated-document';
const TPL_UID = 'api::hr-letter-template.hr-letter-template';
const EMP_UID = 'api::hr-employee.hr-employee';

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

/** Dotted-path lookup so templates can use {employee.designation}. */
function getPathValue(obj, dotted) {
  return String(dotted || '')
    .split('.')
    .filter(Boolean)
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

/**
 * Same substitution grammar as notification-template's renderText — #{x}, {x}
 * and {{x}} all resolve against the variable bag — so HR authors one mental
 * model for both letters and notifications.
 */
function render(template, vars) {
  if (!template) return '';
  const value = (raw) => {
    const key = String(raw || '').trim();
    if (!key) return '';
    const v = getPathValue(vars, key);
    return v === undefined || v === null ? '' : String(v);
  };
  return String(template)
    .replace(/\#\{([^}]+)\}/g, (_, k) => value(k))
    .replace(/\{\{([^}]+)\}\}/g, (_, k) => value(k))
    .replace(/\{([^}]+)\}/g, (_, k) => value(k));
}

module.exports = createCoreController(DOC_UID, ({ strapi }) => ({
  /** Letters issued to the caller (self-service download list). */
  async myDocuments(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(DOC_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['generated_at:desc', 'createdAt:desc'],
      populate: { template: { fields: ['name', 'type'] } },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /**
   * HR renders a template for an employee and stores the result. The content is
   * frozen at generation time on purpose — a later template edit must not
   * retroactively rewrite a letter that has already been issued.
   */
  async generateDocument(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');
    if (!isHrManager(ctx, user)) return ctx.forbidden('HR access is required');

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    if (!body.template || !body.employee) {
      return ctx.badRequest('template and employee are required');
    }

    const template = await strapi.documents(TPL_UID).findOne({ documentId: body.template });
    if (!template) return ctx.notFound('Letter template not found');
    if (template.is_active === false) return ctx.badRequest('This template is inactive.');

    const employee = await strapi.documents(EMP_UID).findOne({
      documentId: body.employee,
      populate: { department: { fields: ['name'] }, designation: { fields: ['name'] } },
    });
    if (!employee) return ctx.notFound('Employee not found');

    const today = new Date();
    const vars = {
      employee,
      employee_name: employee.name,
      designation: employee.designation?.name || '',
      department: employee.department?.name || '',
      date_of_joining: employee.date_of_joining || '',
      today: today.toISOString().slice(0, 10),
      // caller-supplied extras (salary figures, dates) override nothing above
      ...(body.variables && typeof body.variables === 'object' ? body.variables : {}),
    };

    const reference_no = body.reference_no
      || `${String(template.type || 'DOC').toUpperCase()}-${today.getFullYear()}-${Date.now().toString().slice(-6)}`;

    const data = {
      reference_no,
      type: template.type,
      subject: render(template.subject, vars),
      content: render(template.body_template, vars),
      generated_at: today.toISOString(),
      employee: employee.documentId,
      template: template.documentId,
      generated_by: user.id,
    };
    const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
    if (ownerId) data.owners = [ownerId];

    const created = await strapi.documents(DOC_UID).create({ data });

    if (ownerId) {
      try {
        await strapi.service('api::notification.notification-engine').processEvent({
          event_name: 'hr.document.issued',
          entity_type: 'hr-generated-document',
          entity_id: created.documentId,
          payload: { user_id: ownerId, document_id: created.documentId, document_type: data.type, reference_no },
        });
      } catch (err) {
        strapi.log.warn(`[hr-generated-document/notify] ${err.message}`);
      }
    }

    return ctx.send({ data: created });
  },
}));
