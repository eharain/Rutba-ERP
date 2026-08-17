'use strict';

/**
 * stock-transfer lifecycle — auto-assign a transfer_number when the caller
 * doesn't supply one. Base36 timestamp keeps it short, sortable-ish and unique
 * enough for a manual reference code.
 */
module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (data && !data.transfer_number) {
      data.transfer_number = 'TR-' + Date.now().toString(36).toUpperCase();
    }
  },
};
