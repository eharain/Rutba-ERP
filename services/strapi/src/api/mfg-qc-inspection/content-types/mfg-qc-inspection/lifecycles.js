'use strict';

/**
 * mfg-qc-inspection lifecycle.
 *
 *  - beforeCreate: stamp inspected_at; if quantity_failed wasn't given, derive it
 *    from the defect lines so the failed count is never silently zero.
 *  - afterCreate: when the inspection records failures, emit QC_FAILED (for future
 *    escalation / dashboards) and put the inspected bundle on QC hold so it can't
 *    drift to Completed until staff route it to rework or reject.
 */

const QC_UID = 'api::mfg-qc-inspection.mfg-qc-inspection';
const BUNDLE_UID = 'api::mfg-bundle.mfg-bundle';

function emitMfgEvent(type, payload = {}) {
  try { strapi.eventHub?.emit?.(`mfg.${type}`, payload); } catch (_) { /* no-op */ }
  try { strapi.log.info(`[mfg-event] ${type} ${JSON.stringify(payload)}`); } catch (_) { /* no-op */ }
}

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (!data) return;
    if (!data.inspected_at) data.inspected_at = new Date();
    if (data.quantity_failed == null && Array.isArray(data.defect_lines)) {
      data.quantity_failed = data.defect_lines.reduce(
        (s, d) => s + (Number(d?.quantity) || 0), 0
      );
    }
  },

  async afterCreate(event) {
    const qc = event.result;
    const failed = (Number(qc?.quantity_failed) || 0) > 0
      || ['Fail', 'Rework'].includes(qc?.result);
    if (!failed) return;

    // Re-read to get the bundle relation (not populated on `result`).
    let bundleDocId = null;
    try {
      const fresh = await strapi.db.query(QC_UID).findOne({
        where: { id: qc.id },
        populate: { bundle: { select: ['documentId', 'status'] } },
      });
      bundleDocId = fresh?.bundle?.documentId || null;
      if (bundleDocId && ['InProgress', 'Issued'].includes(fresh.bundle.status)) {
        await strapi.documents(BUNDLE_UID).update({
          documentId: bundleDocId,
          data: { status: 'QCHold' },
        });
      }
    } catch (err) {
      strapi.log.warn(`[mfg-qc-inspection] bundle QC-hold failed: ${err.message}`);
    }

    emitMfgEvent('QC_FAILED', {
      qcId: qc.id,
      result: qc.result,
      quantity_failed: qc.quantity_failed,
      bundle: bundleDocId,
    });
  },
};
