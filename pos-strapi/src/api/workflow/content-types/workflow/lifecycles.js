'use strict';

const engine = require('../../../../utils/workflow-engine');

const WF_UID = 'api::workflow.workflow';

// Keep at most one active default workflow per entity_uid. Uses the low-level
// query engine (updateMany) so it does NOT re-fire document lifecycles — no
// recursion. Runs after the saved row lands.
async function ensureSingleDefault(result) {
  try {
    if (!result?.id || !result.entity_uid) return;
    if (result.is_default === false || result.is_active === false) return;
    await strapi.db.query(WF_UID).updateMany({
      where: { entity_uid: result.entity_uid, id: { $ne: result.id }, is_default: true },
      data: { is_default: false },
    });
  } catch (err) {
    try { strapi.log.warn(`[workflow] ensureSingleDefault failed: ${err.message}`); } catch (_) { /* no-op */ }
  }
}

// Workflow definitions are cached by the engine — drop the cache on any change
// so edits take effect immediately instead of after the TTL.
module.exports = {
  async afterCreate(event) { await ensureSingleDefault(event.result); engine.invalidate(); },
  async afterUpdate(event) { await ensureSingleDefault(event.result); engine.invalidate(); },
  afterDelete() { engine.invalidate(); },
};
