'use strict';

/**
 * crm-segment controller — saved audiences / report views (CRM plan §5.3).
 *
 * Four custom actions on top of CRUD:
 *   GET  /crm-segments/fields             the field catalog the builder renders
 *   POST /crm-segments/resolve            run an UNSAVED definition (live preview)
 *   GET  /crm-segments/:documentId/members  run a SAVED segment
 *   POST /crm-segments/:documentId/recount  refresh the cached member count
 *
 * Every one of them goes through crm-segment-engine.compile(), which only
 * emits filters for whitelisted fields. A definition is client-authored JSON
 * and is never handed to the query layer as-is.
 */

const { createCoreController } = require('@strapi/strapi').factories;
const engine = require('../../../utils/crm-segment-engine');

const UID = 'api::crm-segment.crm-segment';

/**
 * Run a compiled segment and return rows projected to person identity.
 * Shared by resolve (unsaved) and members (saved) so a preview and a run can
 * never drift apart.
 */
async function runSegment(strapi, { entity, definition, columns, sort, page, pageSize }) {
  const targetUid = engine.CATALOG[entity].uid;
  const filters = engine.compile(entity, definition);
  const { keys, paths } = engine.columnFields(entity, columns);
  const size = engine.clampPageSize(pageSize);
  const pageNo = Math.max(1, Number(page) || 1);

  const [rows, total] = await Promise.all([
    strapi.documents(targetUid).findMany({
      filters,
      fields: paths,
      populate: engine.personPopulate(entity),
      sort: engine.compileSort(entity, sort),
      pagination: { page: pageNo, pageSize: size },
    }),
    strapi.documents(targetUid).count({ filters }),
  ]);

  // Selectable columns are scalars on the base table by construction, so the
  // catalog path is the row key — no traversal needed here.
  const fieldsOf = engine.CATALOG[entity].fields;
  return {
    data: rows.map((row) => ({
      documentId: row.documentId,
      values: Object.fromEntries(keys.map((k) => [k, row[fieldsOf[k].path] ?? null])),
      person: engine.projectPerson(entity, row),
    })),
    meta: {
      entity,
      columns: keys,
      pagination: { page: pageNo, pageSize: size, total, pageCount: Math.ceil(total / size) },
    },
  };
}

module.exports = createCoreController(UID, ({ strapi }) => ({

  /**
   * GET /crm-segments/fields[?entity=person]
   *
   * The builder reads its field list, operator list and enum SOURCES from
   * here — it never ships its own copy. Enum values themselves still come
   * from /enums/:name/:field (see each field's `enum_source`), so a schema
   * change shows up in the UI without a frontend release.
   */
  async fields(ctx) {
    const { entity } = ctx.query || {};
    try {
      return entity ? { data: engine.describe(String(entity)) } : { data: engine.describeAll() };
    } catch (err) {
      return ctx.badRequest(err.message);
    }
  },

  /**
   * POST /crm-segments/resolve
   * Body: { entity, definition, columns?, sort?, page?, pageSize? }
   *
   * Live preview for the builder — nothing is persisted.
   */
  async resolve(ctx) {
    const body = ctx.request?.body?.data ?? ctx.request?.body ?? {};
    const entity = String(body.entity || 'person');
    if (!engine.CATALOG[entity]) return ctx.badRequest(`Unknown segment entity '${entity}'`);

    try {
      return await runSegment(strapi, {
        entity,
        definition: body.definition,
        columns: body.columns,
        sort: body.sort,
        page: body.page,
        pageSize: body.pageSize,
      });
    } catch (err) {
      if (err.name === 'ValidationError') return ctx.badRequest(err.message);
      throw err;
    }
  },

  /** GET /crm-segments/:documentId/members?page=&pageSize= */
  async members(ctx) {
    const { documentId } = ctx.params;
    const segment = await strapi.documents(UID).findOne({ documentId });
    if (!segment) return ctx.notFound('Segment not found');

    try {
      const result = await runSegment(strapi, {
        entity: segment.entity,
        definition: segment.definition,
        columns: ctx.query?.columns ? String(ctx.query.columns).split(',') : segment.columns,
        sort: segment.sort,
        page: ctx.query?.page,
        pageSize: ctx.query?.pageSize,
      });
      result.meta.segment = { documentId: segment.documentId, name: segment.name };
      return result;
    } catch (err) {
      if (err.name === 'ValidationError') return ctx.badRequest(err.message);
      throw err;
    }
  },

  /**
   * GET /crm-segments/:documentId/audience?channel=email|phone|any|none
   *
   * The SEND list, as opposed to `members` (the report grid).
   *
   * Three differences, all of which matter to anything that actually
   * contacts these people:
   *   - one row per HUMAN, not per base entity — two leads for the same
   *     person is one audience member, not two sends;
   *   - only contactable identities (`channel`), because a row with no email
   *     isn't an audience row;
   *   - merged-away duplicates excluded — the survivor holds the identity.
   *
   * Resolved by querying `person` with the segment's filter pushed down (see
   * engine.audienceFilter), so it de-duplicates in the database and pages
   * correctly rather than needing the whole set in memory.
   */
  async audience(ctx) {
    const { documentId } = ctx.params;
    const channel = String(ctx.query?.channel || 'email');
    if (!engine.CHANNELS.includes(channel)) {
      return ctx.badRequest(`channel must be one of ${engine.CHANNELS.join(', ')}`);
    }

    const segment = await strapi.documents(UID).findOne({ documentId });
    if (!segment) return ctx.notFound('Segment not found');

    const page = Math.max(1, Number(ctx.query?.page) || 1);
    const pageSize = engine.clampPageSize(ctx.query?.pageSize);

    try {
      const filters = engine.audienceFilter(segment.entity, segment.definition, { channel });

      const [rows, total, reach] = await Promise.all([
        strapi.documents(engine.PERSON_UID).findMany({
          filters,
          fields: ['name', 'email', 'phone'],
          // Total order — see engine.compileSort. Paging an audience on a
          // non-unique sort would skip people.
          sort: { id: 'asc' },
          pagination: { page, pageSize },
        }),
        strapi.documents(engine.PERSON_UID).count({ filters }),
        // How many distinct humans the segment reaches at all, regardless of
        // channel — the denominator for "N of M are emailable".
        strapi.documents(engine.PERSON_UID).count({
          filters: engine.audienceFilter(segment.entity, segment.definition, { channel: 'none' }),
        }),
      ]);

      return {
        data: rows.map((p) => ({
          documentId: p.documentId,
          name: p.name,
          email: p.email || null,
          phone: p.phone || null,
        })),
        meta: {
          segment: { documentId: segment.documentId, name: segment.name, entity: segment.entity },
          channel,
          reachable: total,
          people: reach,
          unreachable: Math.max(0, reach - total),
          pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
        },
      };
    } catch (err) {
      if (err.name === 'ValidationError') return ctx.badRequest(err.message);
      throw err;
    }
  },

  /**
   * POST /crm-segments/:documentId/recount
   * Refreshes member_count + last_run_at. Cheap enough to call on save and
   * from the segment list, and it's what the dashboard widgets (§5.9) read
   * instead of re-running every segment on page load.
   */
  async recomputeCount(ctx) {
    const { documentId } = ctx.params;
    const segment = await strapi.documents(UID).findOne({ documentId });
    if (!segment) return ctx.notFound('Segment not found');

    try {
      const targetUid = engine.CATALOG[segment.entity]?.uid;
      if (!targetUid) return ctx.badRequest(`Unknown segment entity '${segment.entity}'`);

      const total = await strapi.documents(targetUid).count({
        filters: engine.compile(segment.entity, segment.definition),
      });
      const updated = await strapi.documents(UID).update({
        documentId,
        data: { member_count: total, last_run_at: new Date() },
      });
      return { data: updated };
    } catch (err) {
      if (err.name === 'ValidationError') return ctx.badRequest(err.message);
      throw err;
    }
  },

  /** Validate the definition at write time so a segment can never be saved broken. */
  async create(ctx) {
    const bad = validateBody(ctx, 'person');
    if (bad) return ctx.badRequest(bad);

    // `owners` targets a UP user, which content-API validation rejects unless
    // the role can read UP users — a grant we never make (same constraint as
    // crm-activity.actor). Strip anything inbound and stamp the creator
    // through the query layer.
    if (ctx.request?.body?.data) delete ctx.request.body.data.owners;

    const response = await super.create(ctx);
    const userId = ctx.state?.user?.id;
    const documentId = response?.data?.documentId;
    if (userId && documentId) {
      try {
        await strapi.db.query(UID).update({
          where: { documentId },
          data: { owners: [userId] },
        });
      } catch (err) {
        strapi.log.warn(`[crm-segment] failed to stamp owner on ${documentId}: ${err.message}`);
      }
    }
    return response;
  },

  async update(ctx) {
    // A partial update may change the definition without restating the
    // entity — compile against the stored one, not the 'person' default.
    const existing = await strapi.documents(UID).findOne({ documentId: ctx.params.documentId });
    const bad = validateBody(ctx, existing?.entity || 'person');
    if (bad) return ctx.badRequest(bad);
    if (ctx.request?.body?.data) delete ctx.request.body.data.owners;
    return super.update(ctx);
  },

}));

// Compile the inbound definition and surface the error now, at save time,
// rather than leaving a segment that 400s every time anyone runs it.
function validateBody(ctx, fallbackEntity) {
  const data = ctx.request?.body?.data ?? {};
  if (data.entity && !engine.CATALOG[data.entity]) return `Unknown segment entity '${data.entity}'`;
  if (data.definition === undefined) return null;
  try {
    engine.compile(data.entity || fallbackEntity, data.definition);
    return null;
  } catch (err) {
    return err.message;
  }
}
