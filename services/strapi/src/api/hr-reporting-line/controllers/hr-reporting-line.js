'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const { isHrManager } = require('../../../utils/hr-access');

const LINE_UID = 'api::hr-reporting-line.hr-reporting-line';

/**
 * Secondary (matrix / dotted-line) reporting relationships.
 *
 * The PRIMARY line stays on `hr-employee.reports_to` — that is what the org
 * chart tree is built from, what the backfill fills, and what the eventual
 * cutover collapses onto. This content-type carries the additional lines that a
 * single manyToOne cannot express, each one dated so a line can start and end
 * without being deleted.
 *
 * `grants_authority` is the field that matters. A dotted line is not
 * automatically an approval right — plenty of matrix relationships are
 * advisory, and recording one should not silently hand someone the ability to
 * approve another person's leave. Only rows with `grants_authority: true` and a
 * currently-valid date window are unioned into `reportingLineDocIds`; the rest
 * are documentation that renders on the chart and changes no permission.
 *
 * The whole collection is HR-only — reads too. Editing this table edits who can
 * approve for whom, and the api-pro policy (not a controller override) is what
 * enforces that, because services/core serves seeded CRUD through a generic handler
 * that never reaches this file. A scoping override here would apply on :4010 and
 * silently not on :4020; the policy applies on both. ESS gets a person's own
 * dotted lines from the org chart's `secondary_managers`, already scoped.
 */
async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

async function assertHr(ctx, strapi) {
  const user = await loadActor(ctx, strapi);
  if (!user) return { ok: false, unauthorized: true };
  if (!isHrManager(ctx, user)) return { ok: false, unauthorized: false };
  return { ok: true, user };
}

/**
 * Reject the edits that would corrupt the graph rather than merely describe it:
 * a self-loop, or a duplicate of the primary line (which would double-count a
 * relationship that `reports_to` already expresses).
 */
async function validateEdge(strapi, employeeDocId, managerDocId) {
  if (!employeeDocId || !managerDocId) return 'Both employee and manager are required';
  if (employeeDocId === managerDocId) return 'An employee cannot report to themselves';

  const emp = await strapi.documents('api::hr-employee.hr-employee').findOne({
    documentId: employeeDocId,
    fields: ['documentId'],
    populate: { reports_to: { fields: ['documentId'] } },
  });
  if (!emp) return 'Employee not found';
  if (emp.reports_to?.documentId === managerDocId) {
    return 'That is already the primary reporting line (reports_to) for this employee';
  }
  return null;
}

// Relation values arrive as a documentId string, {documentId}, or {connect:[...]}.
function docIdOf(v) {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.length ? docIdOf(v[0]) : null;
  if (typeof v === 'object') {
    if (v.documentId) return v.documentId;
    if (v.connect) return docIdOf(v.connect);
    if (v.set) return docIdOf(v.set);
  }
  return null;
}

module.exports = createCoreController(LINE_UID, ({ strapi }) => ({
  async create(ctx) {
    const access = await assertHr(ctx, strapi);
    if (!access.ok) {
      return access.unauthorized
        ? ctx.unauthorized('You must be logged in')
        : ctx.forbidden('HR access is required to change reporting lines');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const err = await validateEdge(strapi, docIdOf(body.employee), docIdOf(body.manager));
    if (err) return ctx.badRequest(err);

    return super.create(ctx);
  },

  async update(ctx) {
    const access = await assertHr(ctx, strapi);
    if (!access.ok) {
      return access.unauthorized
        ? ctx.unauthorized('You must be logged in')
        : ctx.forbidden('HR access is required to change reporting lines');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    // Only re-validate the edge when the update actually moves it.
    if (body.employee || body.manager) {
      const existing = await strapi.documents(LINE_UID).findOne({
        documentId: ctx.params.id,
        populate: { employee: { fields: ['documentId'] }, manager: { fields: ['documentId'] } },
      });
      if (!existing) return ctx.notFound('Reporting line not found');
      const employeeDocId = docIdOf(body.employee) || existing.employee?.documentId;
      const managerDocId = docIdOf(body.manager) || existing.manager?.documentId;
      const err = await validateEdge(strapi, employeeDocId, managerDocId);
      if (err) return ctx.badRequest(err);
    }

    return super.update(ctx);
  },

  async delete(ctx) {
    const access = await assertHr(ctx, strapi);
    if (!access.ok) {
      return access.unauthorized
        ? ctx.unauthorized('You must be logged in')
        : ctx.forbidden('HR access is required to change reporting lines');
    }
    return super.delete(ctx);
  },
}));
