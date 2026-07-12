'use strict';

/**
 * Business-local "today" as YYYY-MM-DD.
 *
 * Expiry logic (sweep, block-at-attach, allocator exclusion) compares against
 * "today". Using `new Date().toISOString().slice(0,10)` yields the UTC date,
 * which is a day behind for a UTC+5 tenant until ~05:00 local — so the 02:15
 * sweep and the attach guard both operate on "yesterday". Compute the date in
 * the tenant timezone instead (Asia/Karachi has no DST, but Intl handles any
 * zone correctly). Override with APP_TZ if the deployment moves.
 */
function localDateISO(date = new Date(), tz = process.env.APP_TZ || 'Asia/Karachi') {
  // en-CA formats as YYYY-MM-DD; timeZone shifts to the local calendar date.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

module.exports = { localDateISO };
