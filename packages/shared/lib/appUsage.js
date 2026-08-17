'use client';

/**
 * appUsage — lightweight cross-app "most used apps" tracking.
 *
 * Counts are stored in one compact cookie so every ERP app can read
 * them: cookies ignore ports (all the localhost:40xx dev apps share one
 * jar) and in production the cookie is scoped to the registrable parent
 * domain (e.g. `.rutba.pk`), so auth. / orders. / my. all see the same
 * habit data. No backend involved.
 *
 * Cookie format:  rutba_app_usage = key:count:lastDay|key:count:lastDay|…
 *   count    total launches/visits (capped)
 *   lastDay  days since epoch of the most recent use — day resolution
 *            keeps the cookie byte-stable across same-day writes
 */

const COOKIE_NAME = 'rutba_app_usage';
const MAX_AGE_S = 180 * 24 * 60 * 60; // remember half a year of habit
const MAX_ENTRIES = 32;
const MAX_COUNT = 9999;
const VISIT_THROTTLE_MS = 30 * 60 * 1000;
const DAY_MS = 86400000;
const HALF_LIFE_DAYS = 45; // an unused app loses half its rank weight every 45 days

/**
 * Cookie domain that all sibling apps share. localhost and bare IPs get a
 * host-only cookie (ports are ignored by the cookie jar, so dev apps still
 * share it); real hostnames scope to the last two labels (`.rutba.pk`).
 */
function cookieDomain() {
    const host = (typeof window !== 'undefined' && window.location.hostname) || '';
    if (!host || !host.includes('.') || /^[\d.]+$/.test(host)) return null;
    return '.' + host.split('.').slice(-2).join('.');
}

/** @returns {Record<string, {count:number, lastDay:number}>} */
export function readAppUsage() {
    if (typeof document === 'undefined') return {};
    const pair = document.cookie.split('; ').find((c) => c.startsWith(COOKIE_NAME + '='));
    const raw = pair ? pair.slice(COOKIE_NAME.length + 1) : '';
    const usage = {};
    if (!raw) return usage;
    for (const part of raw.split('|')) {
        const [key, count, lastDay] = part.split(':');
        const n = parseInt(count, 10);
        const d = parseInt(lastDay, 10);
        if (!key || !Number.isFinite(n) || n <= 0) continue;
        usage[key] = { count: Math.min(n, MAX_COUNT), lastDay: Number.isFinite(d) ? d : 0 };
    }
    return usage;
}

function writeAppUsage(usage) {
    if (typeof document === 'undefined') return;
    const value = Object.entries(usage)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, MAX_ENTRIES)
        .map(([k, u]) => `${k}:${u.count}:${u.lastDay}`)
        .join('|');
    const attrs = `path=/; max-age=${MAX_AGE_S}; SameSite=Lax`;
    const domain = cookieDomain();
    if (domain) {
        document.cookie = `${COOKIE_NAME}=${value}; domain=${domain}; ${attrs}`;
        // A public-suffix domain (e.g. a .co.uk apex) is silently rejected
        // by the browser — fall back to a host-only cookie so tracking
        // still works within this app.
        if (document.cookie.includes(`${COOKIE_NAME}=${value}`)) return;
    }
    document.cookie = `${COOKIE_NAME}=${value}; ${attrs}`;
}

/** Count one deliberate launch of an app (a click on an app link). */
export function recordAppUse(appKey) {
    if (typeof document === 'undefined' || !appKey) return;
    const usage = readAppUsage();
    const today = Math.floor(Date.now() / DAY_MS);
    const u = usage[appKey] || { count: 0, lastDay: today };
    u.count = Math.min(u.count + 1, MAX_COUNT);
    u.lastDay = today;
    usage[appKey] = u;
    writeAppUsage(usage);
}

/**
 * Count a visit to the app the user is currently inside. Throttled via
 * sessionStorage so page navigation within an app doesn't inflate its
 * count — at most one bump per app per half hour per tab.
 */
export function recordAppVisit(appKey) {
    if (typeof window === 'undefined' || !appKey) return;
    try {
        const mark = `rutba_app_visited.${appKey}`;
        const last = Number(window.sessionStorage.getItem(mark) || 0);
        if (Date.now() - last < VISIT_THROTTLE_MS) return;
        window.sessionStorage.setItem(mark, String(Date.now()));
    } catch (e) { /* storage blocked — still count the visit */ }
    recordAppUse(appKey);
}

/**
 * Order app keys by usage, most used first. Ranking is frecency-style:
 * raw count decayed by how long ago the app was last used, so an app
 * hammered six months ago doesn't outrank one used daily now. Keys with
 * no usage keep their original (catalogue) order after the ranked ones.
 * @param {string[]} keys
 * @returns {string[]} a new sorted array
 */
export function rankByUsage(keys) {
    const usage = readAppUsage();
    const today = Math.floor(Date.now() / DAY_MS);
    return keys
        .map((key, i) => {
            const u = usage[key];
            const age = u ? Math.max(0, today - u.lastDay) : 0;
            const score = u ? u.count * Math.pow(0.5, age / HALF_LIFE_DAYS) : 0;
            return { key, i, score };
        })
        .sort((a, b) => (b.score - a.score) || (a.i - b.i))
        .map((s) => s.key);
}
