'use strict';

module.exports = {
  async beforeUpdate(event) {
    const { data, where } = event.params;

    // Only act when the status field is being changed
    if (!data.status) return;

    const itemId = where?.id;
    if (!itemId) return;

    // Load the current record to compare the old status
    const existing = await strapi.entityService.findOne(
      'api::stock-item.stock-item',
      itemId,
      { populate: { status_history: true } }
    );

    if (!existing) return;

    // No change — nothing to record
    if (existing.status === data.status) return;

    const history = Array.isArray(existing.status_history)
      ? existing.status_history.map(({ id, ...rest }) => rest)
      : [];

    history.push({
      status: data.status,
      cost_price: data.cost_price ?? existing.cost_price ?? null,
      selling_price: data.selling_price ?? existing.selling_price ?? null,
      createdAt: new Date().toISOString().split('T')[0],
    });

    // Inject the updated history into the payload so Strapi persists it
    data.status_history = history;
  },

  async beforeCreate(event) {
    const { data } = event.params;

    if (!data.status) return;

    // Seed the very first history entry on creation
    const history = Array.isArray(data.status_history) ? [...data.status_history] : [];

    history.push({
      status: data.status,
      cost_price: data.cost_price ?? null,
      selling_price: data.selling_price ?? null,
      createdAt: new Date().toISOString().split('T')[0],
    });

    data.status_history = history;
  },
};
