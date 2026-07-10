'use strict';

/** stock-count lifecycle — auto-assign a count_number if not supplied. */
module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (data && !data.count_number) {
      data.count_number = 'CNT-' + Date.now().toString(36).toUpperCase();
    }
  },
};
