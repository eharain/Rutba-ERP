'use strict';

const UID = 'api::return-policy.return-policy';

/**
 * Keep `is_default` singular — see the matching lifecycle on site-setting for
 * the reasoning. Setting the flag on one row clears it on the others, so "make
 * this the default" behaves the way the person clicking it expects.
 *
 * This content type has draftAndPublish OFF, so one document is one row and
 * excluding by documentId is equivalent to excluding by id. It is written the
 * same way as site-setting's deliberately: if D&P is ever enabled here, the
 * rule stays correct instead of quietly clearing the published twin.
 */
async function clearOtherDefaults(event) {
  const row = event.result;
  if (!row?.is_default || !row?.documentId) return;

  await strapi.db.query(UID).updateMany({
    where: {
      is_default: true,
      documentId: { $ne: row.documentId },
    },
    data: { is_default: false },
  });
}

module.exports = {
  async afterCreate(event) {
    await clearOtherDefaults(event);
  },
  async afterUpdate(event) {
    await clearOtherDefaults(event);
  },
};
