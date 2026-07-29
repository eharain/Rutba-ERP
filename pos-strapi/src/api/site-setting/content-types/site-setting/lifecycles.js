'use strict';

const UID = 'api::site-setting.site-setting';

/**
 * Keep `is_default` singular.
 *
 * The resolver falls back to the row flagged `is_default`, so two flagged rows
 * would make the fallback depend on row order — an app would silently get a
 * different site identity depending on insert order. Rather than validate and
 * reject (which makes the CMS list awkward: you'd have to unflag one row before
 * you could flag another), setting the flag on one row clears it on the rest.
 * Last write wins, which is what "make this the default" means to the person
 * clicking it.
 *
 * Scoped by documentId, NOT by row id: this content type has Draft & Publish,
 * so publishing clones the draft into a second row with its own id but the same
 * documentId. Excluding only `id` would clear the flag on the published twin of
 * the very row being saved.
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
