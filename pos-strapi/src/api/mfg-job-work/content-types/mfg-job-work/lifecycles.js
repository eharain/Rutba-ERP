'use strict';

/**
 * mfg-job-work lifecycle — auto-assign a jw_number when the caller
 * doesn't provide one (same scheme as stock-transfer's transfer_number).
 */

module.exports = {
  beforeCreate(event) {
    const { data } = event.params;
    if (data && !data.jw_number) {
      data.jw_number = 'JW-' + Date.now().toString(36).toUpperCase();
    }
  },
};
