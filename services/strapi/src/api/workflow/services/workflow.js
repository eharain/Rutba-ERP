'use strict';

/**
 * workflow service
 */

const { createCoreService } = require('@strapi/strapi').factories;
const engine = require('../../../utils/workflow-engine');

const WF_UID = 'api::workflow.workflow';

module.exports = createCoreService(WF_UID, ({ strapi }) => ({
  /**
   * Scan every active, SLA-configured workflow for entities that have
   * overslept their current stage, and fire one (deduped) notification event
   * per overdue entity. Read-only against the target entities — this only
   * flags, it never auto-transitions or auto-approves.
   */
  async sweepOverdueStages() {
    const workflows = await strapi.documents(WF_UID).findMany({
      filters: { is_active: true },
      populate: { stages: true, transitions: true },
      pagination: { pageSize: 200 },
    });

    let flagged = 0;
    for (const wf of workflows || []) {
      const entityUid = wf.entity_uid;
      if (!entityUid || !(wf.stages || []).length) continue;
      // Skip workflows with no SLA configured on any transition at all — avoids
      // a full-table scan of every workflow-enabled content-type every run.
      const hasSla = (wf.transitions || []).some((t) => Number(t.sla_hours) > 0);
      if (!hasSla) continue;

      let rows;
      try {
        rows = await strapi.documents(entityUid).findMany({
          fields: ['documentId', 'stage_key', 'status', 'updatedAt'],
          pagination: { pageSize: 500 },
        });
      } catch (err) {
        strapi.log.warn(`[workflow] SLA sweep: couldn't read ${entityUid}: ${err.message}`);
        continue;
      }

      for (const entity of rows || []) {
        if (!engine.isStageOverdue(wf, entity)) continue;
        const stage = engine.currentStage(wf, entity);
        try {
          await strapi.service('api::notification.notification-engine').processEvent({
            event_name: 'workflow.sla_breach',
            entity_type: entityUid,
            entity_id: entity.documentId,
            payload: {
              entity_uid: entityUid,
              document_id: entity.documentId,
              stage_key: stage?.key || null,
              stage_name: stage?.name || null,
              status: entity.status,
              // dedup_key must live inside payload — notification-engine's
              // buildDedupKey() only reads payload.dedup_key, not a top-level one.
              dedup_key: `workflow-sla:${entityUid}:${entity.documentId}:${stage?.key || 'unknown'}`,
            },
          });
          flagged++;
        } catch (err) {
          strapi.log.warn(`[workflow] SLA breach notify failed for ${entityUid}/${entity.documentId}: ${err.message}`);
        }
      }
    }

    if (flagged > 0) strapi.log.info(`[workflow] SLA sweep: flagged ${flagged} overdue stage(s)`);
    return { flagged };
  },
}));
