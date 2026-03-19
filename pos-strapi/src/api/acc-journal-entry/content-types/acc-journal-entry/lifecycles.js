'use strict';

/**
 * Journal Entry Lifecycles
 *
 * Protects the integrity of posted journal entries:
 *   - Posted entries cannot be updated (except to mark as Reversed).
 *   - Non-Draft entries cannot be deleted.
 */

module.exports = {
  async beforeUpdate(event) {
    const { data, where } = event.params;

    // Determine the id being updated
    const id = where?.id || where;
    if (!id) return;

    const existing = await strapi.entityService.findOne(
      'api::acc-journal-entry.acc-journal-entry',
      id,
      { fields: ['status'] }
    );

    if (!existing) return;

    // Allow only the transition  Posted → Reversed
    if (existing.status === 'Posted') {
      const newStatus = data?.status;
      if (newStatus === 'Reversed') {
        // This is the reversal workflow — allow it
        return;
      }
      throw new Error(
        'Posted journal entries are immutable. Reverse the entry instead of editing it.'
      );
    }

    // Reversed entries are completely locked
    if (existing.status === 'Reversed') {
      throw new Error(
        'Reversed journal entries cannot be modified.'
      );
    }
  },

  async beforeDelete(event) {
    const { where } = event.params;
    const id = where?.id || where;
    if (!id) return;

    const existing = await strapi.entityService.findOne(
      'api::acc-journal-entry.acc-journal-entry',
      id,
      { fields: ['status'] }
    );

    if (!existing) return;

    if (existing.status !== 'Draft') {
      throw new Error(
        `Only Draft journal entries can be deleted. This entry is "${existing.status}".`
      );
    }
  },
};
