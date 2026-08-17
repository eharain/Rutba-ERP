'use strict';

/**
 * mfg-material-lot lifecycle.
 *
 * Convenience defaults on create so a freshly received lot is immediately a
 * valid, queryable balance without the caller having to spell out every field:
 *   - quantity_remaining defaults to quantity_received (nothing consumed yet)
 *   - total_cost defaults to unit_cost * quantity_received
 *   - received_at defaults to now
 *
 * The running balance itself is owned by the mfg-material-issue lifecycle, which
 * calls api::mfg-material-lot.recomputeLotRemaining whenever an issue row is
 * written. This hook only seeds sensible initial values.
 */

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  async beforeCreate(event) {
    const { data } = event.params;
    if (!data) return;

    const received = num(data.quantity_received);

    if (data.quantity_remaining == null && received != null) {
      data.quantity_remaining = received;
    }

    if (data.total_cost == null) {
      const unit = num(data.unit_cost);
      if (unit != null && received != null) {
        data.total_cost = unit * received;
      }
    }

    if (!data.received_at) {
      data.received_at = new Date();
    }
  },
};
