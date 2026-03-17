'use strict';

// Guard against recursive afterUpdate when we write back status_history
let _updatingHistory = false;

module.exports = {
  async beforeUpdate(event) {
    if (_updatingHistory) return;

    const { data, where } = event.params;

    // Only act when the status field is being changed
    if (!data.status) return;

    const itemId = where?.id;
    if (!itemId) return;

    // Load the current record to compare the old status (lightweight query)
    const existing = await strapi.db.query('api::stock-item.stock-item').findOne({
      where: { id: itemId },
      select: ['id', 'status', 'cost_price', 'selling_price'],
    });

    if (!existing || existing.status === data.status) return;

    // Stash context so afterUpdate can persist the history entry
    event.state = {
      statusChanged: true,
      newStatus: data.status,
      costPrice: data.cost_price ?? existing.cost_price ?? null,
      sellingPrice: data.selling_price ?? existing.selling_price ?? null,
    };
  },

  async afterUpdate(event) {
    if (_updatingHistory) return;
    if (!event.state?.statusChanged) return;

    const { result } = event;
    const itemId = result?.id;
    if (!itemId) return;

    const { newStatus, costPrice, sellingPrice } = event.state;

    // Load existing history
    const existing = await strapi.entityService.findOne(
      'api::stock-item.stock-item',
      itemId,
      { populate: { status_history: true } }
    );

    const history = Array.isArray(existing?.status_history)
      ? existing.status_history.map(({ id, ...rest }) => rest)
      : [];

    history.push({
      status: newStatus,
      cost_price: costPrice,
      selling_price: sellingPrice,
      createdAt: new Date().toISOString().split('T')[0],
    });

    // Write back using entityService (handles component persistence);
    // guard flag prevents infinite recursion
    _updatingHistory = true;
    try {
      await strapi.entityService.update(
        'api::stock-item.stock-item',
        itemId,
        { data: { status_history: history } }
      );
    } finally {
      _updatingHistory = false;
    }
  },

  async beforeCreate(event) {
    const { data } = event.params;

    if (!data.status) return;

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
