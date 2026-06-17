'use strict';

/**
 * Derive total_days (inclusive of both endpoints) from start_date/end_date
 * whenever both are present in a create or update payload. Keeps the field
 * authoritative server-side rather than trusting the client to send it; a
 * status-only update (e.g. an approval) carries no dates, so it is left as-is.
 */

function computeTotalDays(data) {
  if (!data || !data.start_date || !data.end_date) return;
  const start = new Date(data.start_date);
  const end = new Date(data.end_date);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;
  const days = Math.floor((end - start) / 86400000) + 1;
  if (days > 0) data.total_days = days;
}

module.exports = {
  beforeCreate(event) {
    computeTotalDays(event.params.data);
  },
  beforeUpdate(event) {
    computeTotalDays(event.params.data);
  },
};
