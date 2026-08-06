'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const {
  resolveEmployeeForUser,
  resolveOrCreateEmployeeForUser,
  isHrManager,
  managedReportDocIds,
  ownerUserIdForEmployeeRef,
} = require('../../../utils/hr-access');

const APP_UID = 'api::hr-appraisal.hr-appraisal';
const RATING_UID = 'api::hr-appraisal-rating.hr-appraisal-rating';
const COMPETENCY_UID = 'api::hr-competency.hr-competency';

/** Populate spec for the per-competency breakdown, wherever an appraisal is returned. */
const RATINGS_POPULATE = {
  ratings: {
    fields: ['documentId', 'self_rating', 'manager_rating', 'comments'],
    populate: { competency: { fields: ['documentId', 'name', 'category'] } },
  },
};

/**
 * Strip the reviewer's side of an appraisal until it is Completed — the flat
 * manager fields AND the per-competency manager scores, which are the same
 * in-progress opinion at finer grain.
 */
function maskUnlessCompleted(row) {
  if (row?.status === 'Completed') return row;
  const { manager_rating, manager_comments, final_rating, ratings, ...rest } = row || {};
  return {
    ...rest,
    ratings: (ratings || []).map(({ manager_rating: _mr, ...r }) => r),
  };
}

const avg = (nums) => (nums.length
  ? Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * 100) / 100
  : null);

/**
 * Apply an incoming per-competency score set to one appraisal and return the
 * average of `field` across every rated competency.
 *
 * Rows are matched on the competency, so a resubmission updates in place rather
 * than stacking duplicates, and a competency the submitter left blank keeps
 * whatever it already had. Unknown competencies are ignored rather than
 * created — the competency list is HR-managed, not caller-supplied.
 */
async function applyRatings(strapi, appraisalDocId, appraisalId, incoming, field) {
  const existing = await strapi.documents(RATING_UID).findMany({
    filters: { appraisal: { documentId: { $eq: appraisalDocId } } },
    fields: ['documentId', 'self_rating', 'manager_rating'],
    populate: { competency: { fields: ['documentId'] } },
    pagination: { pageSize: 200 },
  });
  const byCompetency = new Map(
    (existing || []).filter((r) => r.competency?.documentId).map((r) => [r.competency.documentId, r]),
  );

  for (const entry of Array.isArray(incoming) ? incoming : []) {
    const competencyDocId = typeof entry?.competency === 'string'
      ? entry.competency
      : entry?.competency?.documentId;
    if (!competencyDocId) continue;
    const value = entry[field];
    const hasValue = value !== undefined && value !== null && value !== '';
    if (!hasValue && entry.comments === undefined) continue;

    const data = {};
    if (hasValue) data[field] = Number(value);
    if (entry.comments !== undefined) data.comments = entry.comments;

    const row = byCompetency.get(competencyDocId);
    if (row) {
      const updated = await strapi.documents(RATING_UID).update({ documentId: row.documentId, data });
      byCompetency.set(competencyDocId, { ...row, ...updated });
      continue;
    }
    const competency = await strapi.documents(COMPETENCY_UID).findOne({
      documentId: competencyDocId, fields: ['id'],
    });
    if (!competency) continue;
    const created = await strapi.documents(RATING_UID).create({
      data: { ...data, appraisal: appraisalId, competency: competency.id },
    });
    byCompetency.set(competencyDocId, created);
  }

  const scores = Array.from(byCompetency.values())
    .map((r) => Number(r?.[field]))
    .filter((n) => Number.isFinite(n));
  return avg(scores);
}

async function loadActor(ctx, strapi) {
  const id = ctx.state?.user?.id;
  if (!id) return null;
  return strapi.query('plugin::users-permissions.user').findOne({
    where: { id },
    populate: { role: { select: ['type'] } },
  });
}

/** Report employee documentIds for the caller as a line manager ([] if none). */
async function callerReportDocIds(strapi, user) {
  const emp = await resolveEmployeeForUser(strapi, user);
  if (!emp) return [];
  return managedReportDocIds(strapi, emp.documentId);
}

module.exports = createCoreController(APP_UID, ({ strapi }) => ({
  /**
   * The caller's own appraisals. Manager comments/ratings are intentionally
   * included — an employee is entitled to see their own completed review — but
   * only once the manager has submitted it (status Completed), so an in-progress
   * draft review stays private to the reviewer.
   */
  async myAppraisals(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee) return ctx.send({ data: [] });

    const rows = await strapi.documents(APP_UID).findMany({
      filters: { employee: { documentId: { $eq: employee.documentId } } },
      sort: ['createdAt:desc'],
      populate: { cycle: { fields: ['name', 'status'] }, ...RATINGS_POPULATE },
      pagination: { pageSize: 200 },
    });

    return ctx.send({ data: (rows || []).map(maskUnlessCompleted) });
  },

  /** Appraisals the caller reviews: HR manager org-wide, line manager → reports. */
  async teamAppraisals(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    let filters = {};
    if (!isHrManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      if (!reports.length) return ctx.send({ data: [] });
      filters = { employee: { documentId: { $in: reports } } };
    }

    const rows = await strapi.documents(APP_UID).findMany({
      filters,
      sort: ['createdAt:desc'],
      populate: {
        employee: { fields: ['name'] },
        cycle: { fields: ['name', 'status'] },
        ...RATINGS_POPULATE,
      },
      pagination: { pageSize: 200 },
    });
    return ctx.send({ data: rows || [] });
  },

  /** Employee submits their own self-assessment. */
  async submitSelfAssessment(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const { documentId } = ctx.params;
    const current = await strapi.documents(APP_UID).findOne({
      documentId,
      populate: { employee: { fields: ['documentId'] } },
    });
    if (!current) return ctx.notFound('Appraisal not found');

    const employee = await resolveOrCreateEmployeeForUser(strapi, user);
    if (!employee || current.employee?.documentId !== employee.documentId) {
      return ctx.forbidden('You can only submit your own self-assessment');
    }
    if (['ManagerReview', 'Completed'].includes(current.status)) {
      return ctx.badRequest(`This appraisal is already at ${current.status} and cannot be re-submitted.`);
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    // Per-competency scores are the detail; the flat self_rating is their
    // average unless the submitter states one explicitly.
    const rolledUp = await applyRatings(strapi, documentId, current.id, body.ratings, 'self_rating');
    const updated = await strapi.documents(APP_UID).update({
      documentId,
      data: {
        self_rating: body.self_rating ?? rolledUp ?? current.self_rating,
        self_comments: body.self_comments ?? current.self_comments,
        status: 'ManagerReview',
        submitted_at: new Date().toISOString(),
      },
      populate: RATINGS_POPULATE,
    });
    return ctx.send({ data: updated });
  },

  /** Reviewer (HR manager org-wide, else line manager) completes the review. */
  async submitManagerReview(ctx) {
    const user = await loadActor(ctx, strapi);
    if (!user) return ctx.unauthorized('You must be logged in');

    const { documentId } = ctx.params;
    const current = await strapi.documents(APP_UID).findOne({
      documentId,
      populate: { employee: { fields: ['documentId'], populate: { user: { fields: ['id'] } } } },
    });
    if (!current) return ctx.notFound('Appraisal not found');

    if (!isHrManager(ctx, user)) {
      const reports = await callerReportDocIds(strapi, user);
      const targetDoc = current.employee?.documentId;
      if (!targetDoc || !reports.includes(targetDoc)) {
        return ctx.forbidden('You can only review appraisals for your team');
      }
    }
    if (current.status === 'Completed') {
      return ctx.badRequest('This appraisal is already completed.');
    }

    const body = ctx.request.body?.data ?? ctx.request.body ?? {};
    const rolledUp = await applyRatings(strapi, documentId, current.id, body.ratings, 'manager_rating');
    const managerRating = body.manager_rating ?? rolledUp ?? current.manager_rating;
    const updated = await strapi.documents(APP_UID).update({
      documentId,
      data: {
        manager_rating: managerRating,
        manager_comments: body.manager_comments ?? current.manager_comments,
        final_rating: body.final_rating ?? managerRating ?? current.final_rating,
        status: 'Completed',
        completed_at: new Date().toISOString(),
      },
      populate: RATINGS_POPULATE,
    });

    const employeeUserId = current.employee?.user?.id;
    if (employeeUserId) {
      try {
        await strapi.service('api::notification.notification-engine').processEvent({
          event_name: 'hr.appraisal.completed',
          entity_type: 'hr-appraisal',
          entity_id: documentId,
          payload: { user_id: employeeUserId, appraisal_id: documentId, final_rating: updated.final_rating },
        });
      } catch (err) {
        strapi.log.warn(`[hr-appraisal/notify] ${err.message}`);
      }
    }

    return ctx.send({ data: updated });
  },

  async create(ctx) {
    ctx.request.body = ctx.request.body || {};
    const data = ctx.request.body.data || ctx.request.body || {};
    if (!data.owners) {
      const ownerId = await ownerUserIdForEmployeeRef(strapi, data.employee);
      if (ownerId) data.owners = [ownerId];
    }
    // Default the reviewer to the employee's line manager. Still overridable —
    // skip-level and matrix reviews are legitimate — but the common case
    // shouldn't need HR to restate what the org chart already says.
    if (!data.reviewer && typeof data.employee === 'string') {
      const emp = await strapi.documents('api::hr-employee.hr-employee').findOne({
        documentId: data.employee,
        populate: { reports_to: { fields: ['documentId'] } },
      });
      if (emp?.reports_to?.documentId) data.reviewer = emp.reports_to.documentId;
    }
    ctx.request.body.data = data;
    const response = await super.create(ctx);

    // Seed one rating row per active competency so the self-assessment form has
    // something to show. Without this the competency list would only appear on
    // an appraisal if the client happened to know to send it, which is how
    // hr-competency ended up unused in the first place.
    const created = response?.data ?? ctx.body?.data;
    if (created?.documentId) {
      try {
        // The sanitized create response is not guaranteed to carry the row id.
        const appraisalId = created.id
          ?? (await strapi.documents(APP_UID).findOne({ documentId: created.documentId, fields: ['id'] }))?.id;
        if (!appraisalId) throw new Error('could not resolve appraisal row id');

        const competencies = await strapi.documents(COMPETENCY_UID).findMany({
          filters: { is_active: { $eq: true } },
          fields: ['id'],
          sort: ['name:asc'],
          pagination: { pageSize: 200 },
        });
        for (const c of competencies || []) {
          await strapi.documents(RATING_UID).create({
            data: { appraisal: appraisalId, competency: c.id, ...(data.owners ? { owners: data.owners } : {}) },
          });
        }
      } catch (err) {
        // The appraisal itself is already created and usable — a seeding
        // failure must not turn a 200 into a 500.
        strapi.log.warn(`[hr-appraisal] competency seeding failed for ${created.documentId}: ${err.message}`);
      }
    }
    return response;
  },
}));
