'use strict';

/**
 * Business-time arithmetic for the SLA engine (spec 12 §12.5).
 *
 * An SLA promise is made in business time, not wall-clock time: "four hours"
 * means four hours the desk was open for, so a ticket raised at 17:55 on a
 * Friday is not late at 22:00. Every number the SLA engine stores — a due-at, a
 * pause total, an at-risk instant — comes out of this file.
 *
 * DELIBERATELY FREE OF DATABASE ACCESS. The sweep runs these functions tens of
 * thousands of times per pass, and the acceptance criteria for §12 ask for the
 * calculation to be unit-tested across weekends, holidays, split shifts,
 * out-of-hours creation and timezone boundaries. Both require pure functions
 * over a plain calendar object, so SLAService does the loading and this file
 * does only the arithmetic.
 *
 * THE TIMEZONE RULE, which is the one that bites. Instants are UTC everywhere —
 * in the database, in arguments, in return values. A calendar's working hours
 * are wall-clock times in the CALENDAR's zone, never the server's and never the
 * viewer's, or two people reading the same breach disagree about whether it is
 * one. So every interval boundary is converted zone → UTC here, at the only
 * boundary that knows the zone, and all overlap arithmetic happens in UTC ms.
 * Pakistan is UTC+5 with no DST, which makes the common case a constant offset;
 * nothing below assumes that, because multi-region tenants are on the roadmap.
 *
 * ELAPSED BUSINESS TIME IS REAL ELAPSED TIME inside working intervals. On a
 * spring-forward day a 09:00–18:00 shift is eight hours, not nine, because that
 * is how long the desk was actually staffed. Computing durations in wall-clock
 * space instead would silently credit the desk with an hour nobody worked (and
 * charge it one every autumn).
 *
 * TWO AMBIGUITIES ARE RESOLVED, NOT AVOIDED. A wall-clock time inside a
 * spring-forward gap does not exist, and one inside a fall-back overlap happens
 * twice. utcFromWall resolves the first forward, to the first instant that does
 * exist, and the second to the earlier of the two. Both are deterministic, which
 * matters more than which one is "right": a due-at that moved between two reads
 * would be worse than either choice.
 *
 * A MALFORMED CALENDAR THROWS rather than degrading. Dropping an unparseable
 * interval would quietly shrink the working day and push every due-at later —
 * a wrong answer that looks like a right one. SLAService catches the throw and
 * marks the ticket `indeterminate`, which is §12.5's specified behaviour for a
 * calendar that does not resolve.
 */

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Index matches Date#getUTCDay, so a weekday lookup is an array index.
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

// A ticket open for a decade is absurd but possible; a calendar that never
// opens would otherwise spin forever. Both walks are bounded.
const MAX_SPAN_DAYS = 3660;
const MAX_LOOKAHEAD_DAYS = 400;
const DAY_CACHE_LIMIT = 4096;

const NORMALIZED = Symbol('rutba.helpdesk.businessCalendar');
const DAY_CACHE = Symbol('rutba.helpdesk.businessCalendar.days');

class ValidationError extends Error {
  constructor(message) { super(message); this.name = 'ValidationError'; }
}

const formatters = new Map();

function pad2(value) { return String(value).padStart(2, '0'); }

function formatterFor(timezone) {
  const hit = formatters.get(timezone);
  if (hit) return hit;
  let fmt;
  try {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch (err) {
    throw new ValidationError(`[business-time] unknown timezone ${JSON.stringify(timezone)}`);
  }
  formatters.set(timezone, fmt);
  return fmt;
}

function zonedFields(timezone, utcMs) {
  const out = {};
  for (const part of formatterFor(timezone).formatToParts(new Date(utcMs))) {
    if (part.type !== 'literal') out[part.type] = Number(part.value);
  }
  // Some ICU builds still emit hour 24 for midnight; h23 asks for 00.
  if (out.hour === 24) out.hour = 0;
  return out;
}

/**
 * Offset of `timezone` at that instant. Derived by formatting the instant in the
 * zone and reading the result back as if it were UTC — the difference is the
 * offset, including whatever DST rule applied on that date. Seconds are the
 * finest granularity Intl reports, so the comparison truncates to the second.
 */
function offsetMsAt(timezone, utcMs) {
  const f = zonedFields(timezone, utcMs);
  const asIfUtc = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second);
  return asIfUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Wall-clock ms: a fake-UTC timestamp whose UTC fields read as local fields. */
function wallFromUtc(timezone, utcMs) {
  return utcMs + offsetMsAt(timezone, utcMs);
}

/**
 * The inverse. Two passes, because the offset depends on the very instant being
 * solved for: the first guess lands within an hour or two, the second lands on
 * it.
 *
 * When the two passes disagree, wallMs sits on a DST boundary and the candidates
 * must be told apart by round-tripping them. Whichever reads back as the wall
 * time that was asked for is the real one. When NEITHER does, the wall time does
 * not exist — it is inside a spring-forward gap — and the LATER candidate is the
 * first instant that does. Resolving forward rather than backward is not a
 * preference: a shift declared 02:00–06:00 on the day 02:00 never happened was
 * staffed for three hours, and resolving backward to 01:00 would credit the desk
 * with a fourth hour nobody worked. The fall-back overlap resolves to the
 * earlier of its two occurrences, which the equal-offset path below already
 * does. Both are deterministic, which matters more than which one is "right": a
 * due-at that moved between two reads would be worse than either choice.
 */
function utcFromWall(timezone, wallMs) {
  const firstOffset = offsetMsAt(timezone, wallMs);
  const first = wallMs - firstOffset;
  const secondOffset = offsetMsAt(timezone, first);
  if (secondOffset === firstOffset) return first;

  // Once the offsets disagree, `first` cannot read back as wallMs by
  // construction, so `second` is the only candidate that can be the real
  // instant — and if it is not, there is no real instant.
  const second = wallMs - secondOffset;
  if (second + offsetMsAt(timezone, second) === wallMs) return second;
  return Math.max(first, second);
}

function wallDayStart(timezone, utcMs) {
  const f = zonedFields(timezone, utcMs);
  return Date.UTC(f.year, f.month - 1, f.day);
}

function dateKeyOfWall(wallMs) {
  const d = new Date(wallMs);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function parseJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (err) {
    throw new ValidationError(`[business-time] calendar json is unparseable: ${err.message}`);
  }
}

/** 'HH:MM' / 'HH:MM:SS' / a minute count, to minutes past local midnight. */
function parseClock(value, label) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 1440) throw new ValidationError(`[business-time] ${label}: ${value} is outside 0..1440`);
    return Math.round(value);
  }
  const text = String(value === null || value === undefined ? '' : value).trim();
  const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(text);
  if (!match) throw new ValidationError(`[business-time] ${label}: ${JSON.stringify(text)} is not HH:MM`);
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || (hours === 24 && minutes > 0)) {
    throw new ValidationError(`[business-time] ${label}: ${text} is outside 00:00..24:00`);
  }
  return hours * 60 + minutes;
}

function toSpan(raw, label) {
  let start;
  let end;
  if (typeof raw === 'string') {
    const parts = raw.split('-');
    if (parts.length !== 2) throw new ValidationError(`[business-time] ${label}: ${JSON.stringify(raw)} is not "HH:MM-HH:MM"`);
    [start, end] = parts;
  } else if (Array.isArray(raw)) {
    [start, end] = raw;
  } else if (raw && typeof raw === 'object') {
    start = raw.start !== undefined ? raw.start : raw.from;
    end = raw.end !== undefined ? raw.end : raw.to;
  } else {
    throw new ValidationError(`[business-time] ${label}: expected an interval, got ${JSON.stringify(raw)}`);
  }
  const from = parseClock(start, `${label}.start`);
  const to = parseClock(end, `${label}.end`);
  if (to <= from) throw new ValidationError(`[business-time] ${label}: ${from} → ${to} does not move forward`);
  return [from, to];
}

/** Overlapping shifts would otherwise be counted twice. */
function mergeSpans(spans) {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [start, end] of sorted) {
    const last = out[out.length - 1];
    if (last && start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      out.push([start, end]);
    }
  }
  return out;
}

/**
 * A DATE column arrives as 'YYYY-MM-DD' from mysql2 (dbConfig sets
 * dateStrings:['DATE']) and as a local-midnight Date from pg, so both are
 * accepted — and the Date branch reads LOCAL fields, because that is the
 * midnight the driver constructed.
 */
function toDateKey(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${String(value.getFullYear()).padStart(4, '0')}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value === null || value === undefined ? '' : value).trim());
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function truthy(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (value === null || value === undefined) return false;
  return ['1', 'true', 'yes', 'y'].includes(String(value).trim().toLowerCase());
}

/**
 * Turn a helpdesk_business_calendars row (plus its holidays) into the shape the
 * functions below expect. Idempotent: a calendar already returned from here
 * passes straight through, so callers can pass either without checking.
 *
 * @param {object} calendar  { timezone, working_days, holidays[], key?, id? }
 */
function normalizeCalendar(calendar) {
  if (!calendar) throw new ValidationError('[business-time] no calendar supplied');
  if (calendar[NORMALIZED]) return calendar;

  const label = calendar.key || calendar.name || (calendar.id !== undefined ? `#${calendar.id}` : 'calendar');
  const timezone = String(calendar.timezone || 'UTC').trim() || 'UTC';
  formatterFor(timezone);

  const raw = parseJson(calendar.working_days !== undefined ? calendar.working_days : calendar.workingDays);
  if (!raw || typeof raw !== 'object') {
    throw new ValidationError(`[business-time] calendar ${label} declares no working days`);
  }

  let weeklyMinutes = 0;
  const days = DAY_KEYS.map((key) => {
    const declared = raw[key];
    if (declared === null || declared === undefined) return [];
    const list = Array.isArray(declared) ? declared : [declared];
    const spans = mergeSpans(list.map((entry, i) => toSpan(entry, `${label}.${key}[${i}]`)));
    for (const [start, end] of spans) weeklyMinutes += end - start;
    return spans;
  });
  if (!weeklyMinutes) {
    throw new ValidationError(`[business-time] calendar ${label} is never open — every weekday is empty`);
  }

  const holidays = new Set();
  const recurringHolidays = new Set();
  for (const entry of calendar.holidays || []) {
    const value = entry && typeof entry === 'object' && !(entry instanceof Date)
      ? (entry.holiday_date !== undefined ? entry.holiday_date : entry.date)
      : entry;
    const key = toDateKey(value);
    if (!key) continue;
    if (entry && typeof entry === 'object' && truthy(entry.is_recurring)) recurringHolidays.add(key.slice(5));
    else holidays.add(key);
  }

  const normalized = {
    id: calendar.id !== undefined ? calendar.id : null,
    key: calendar.key || null,
    label,
    timezone,
    days,
    holidays,
    recurringHolidays,
    weeklyMs: weeklyMinutes * MINUTE_MS,
  };
  Object.defineProperty(normalized, NORMALIZED, { value: true, enumerable: false });
  Object.defineProperty(normalized, DAY_CACHE, { value: new Map(), enumerable: false });
  return normalized;
}

/**
 * The UTC intervals a single local calendar day is open for. Memoised per
 * calendar because a sweep evaluates hundreds of tickets against the same
 * handful of days, and each boundary costs two Intl conversions.
 */
function dayIntervals(cal, wallDayMs) {
  const cache = cal[DAY_CACHE];
  const hit = cache.get(wallDayMs);
  if (hit) return hit;

  const key = dateKeyOfWall(wallDayMs);
  let spans = [];
  if (!cal.holidays.has(key) && !cal.recurringHolidays.has(key.slice(5))) {
    spans = cal.days[new Date(wallDayMs).getUTCDay()]
      .map(([start, end]) => [
        utcFromWall(cal.timezone, wallDayMs + start * MINUTE_MS),
        utcFromWall(cal.timezone, wallDayMs + end * MINUTE_MS),
      ])
      .filter(([start, end]) => end > start);
  }

  if (cache.size >= DAY_CACHE_LIMIT) cache.clear();
  cache.set(wallDayMs, spans);
  return spans;
}

function toMs(value, field) {
  if (value instanceof Date) {
    const ms = value.getTime();
    if (Number.isNaN(ms)) throw new ValidationError(`[business-time] ${field} is an invalid Date`);
    return ms;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return ms;
  }
  throw new ValidationError(`[business-time] ${field} is not an instant: ${JSON.stringify(value)}`);
}

/** Whether the desk is open at that instant. Intervals are half-open, [start, end). */
function isWorkingTime(calendar, instant) {
  const cal = normalizeCalendar(calendar);
  const at = toMs(instant, 'instant');
  // The previous day is checked too so the answer does not depend on an
  // interval never being pushed across local midnight by a DST shift.
  const today = wallDayStart(cal.timezone, at);
  for (const day of [today - DAY_MS, today]) {
    for (const [start, end] of dayIntervals(cal, day)) {
      if (at >= start && at < end) return true;
    }
  }
  return false;
}

/**
 * Business milliseconds between two instants — the sum of the working intervals
 * they overlap. Zero when `to` is not after `from`; a negative span is not an
 * error, because callers routinely compare a stamp against a due-at that has
 * not arrived yet.
 */
function elapsedBusinessMs(calendar, from, to) {
  const cal = normalizeCalendar(calendar);
  const start = toMs(from, 'from');
  const end = toMs(to, 'to');
  if (end <= start) return 0;

  let total = 0;
  let day = wallDayStart(cal.timezone, start) - DAY_MS;
  const lastDay = wallDayStart(cal.timezone, end);
  for (let walked = 0; day <= lastDay; day += DAY_MS, walked += 1) {
    if (walked > MAX_SPAN_DAYS) {
      throw new ValidationError(`[business-time] refusing to measure more than ${MAX_SPAN_DAYS} days of ${cal.label}`);
    }
    for (const [open, close] of dayIntervals(cal, day)) {
      const a = open > start ? open : start;
      const b = close < end ? close : end;
      if (b > a) total += b - a;
    }
  }
  return total;
}

/**
 * The instant at which `ms` of business time will have elapsed from `from` —
 * the due-at. `ms` of 0 returns the next working instant at or after `from`,
 * which is §12.5's "a ticket created outside working hours starts its clock at
 * the next working minute": a promise made at 22:00 is measured from 09:00.
 */
function addBusinessMs(calendar, from, ms) {
  const cal = normalizeCalendar(calendar);
  const start = toMs(from, 'from');
  const amount = Number(ms);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new ValidationError(`[business-time] cannot add ${JSON.stringify(ms)} of business time`);
  }

  let remaining = Math.round(amount);
  let day = wallDayStart(cal.timezone, start) - DAY_MS;
  for (let walked = 0; walked <= MAX_LOOKAHEAD_DAYS; walked += 1, day += DAY_MS) {
    for (const [open, close] of dayIntervals(cal, day)) {
      if (close <= start) continue;
      const at = open > start ? open : start;
      if (remaining === 0) return new Date(at);
      const available = close - at;
      if (available >= remaining) return new Date(at + remaining);
      remaining -= available;
    }
  }
  throw new ValidationError(
    `[business-time] calendar ${cal.label} has no working time within ${MAX_LOOKAHEAD_DAYS} days of `
    + `${new Date(start).toISOString()} — check its holidays`
  );
}

/** The first instant at or after `instant` at which the desk is open. */
function nextWorkingInstant(calendar, instant) {
  return addBusinessMs(calendar, instant, 0);
}

module.exports = {
  normalizeCalendar,
  elapsedBusinessMs,
  addBusinessMs,
  isWorkingTime,
  nextWorkingInstant,
  ValidationError,
  MAX_LOOKAHEAD_DAYS,
  MAX_SPAN_DAYS,
};
