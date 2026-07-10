'use strict';

/** stock-adjustment lifecycle — auto-assign an adjustment_number if not supplied. */
module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (data && !data.adjustment_number) {
      data.adjustment_number = 'ADJ-' + Date.now().toString(36).toUpperCase();
    }
  },
};
