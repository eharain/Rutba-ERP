'use strict';

// Pure template-rendering logic for campaigns — no Strapi, no DB, no HTTP, so
// it can be exercised directly. Same split Rutba-MTA uses for its relay logic.
//
// The division of labour with the MTA is the thing to keep straight:
//
//   • A REAL SEND ships the template with its `{{key}}` placeholders INTACT to
//     POST /v1/send/batch alongside per-recipient `data`. The MTA renders once
//     per recipient. Pre-rendering here would give every recipient identical
//     merge values.
//   • A PREVIEW or TEST SEND renders here, because there is no recipient list.
//   • UTM is per-CAMPAIGN, not per-recipient, so it is applied once to the HTML
//     before hand-off.

// {{ key }} — letters, digits, underscore, dot. Deliberately NOT a Mustache
// parser: no {{#section}}, {{/section}}, {{!comment}} or {{{raw}}}. The MTA's
// renderer is flat substitution and this must agree with it.
const MERGE_TOKEN = /\{\{\s*([a-zA-Z_][\w.]*)\s*\}\}/g;

// Keys the MTA generates per recipient from a batch's `actions[]`. They look
// like merge fields but an audience must never be asked to supply them.
const RESERVED_KEYS = new Set([
  'accept_url', 'decline_url', 'confirm_url', 'cta_url',
  'unsubscribe_url', 'list_unsubscribe',
]);

/** Resolve a dotted path against an object without throwing on gaps. */
function lookup(data, key) {
  return key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), data);
}

/** Every distinct merge key used across the given sources, sorted. */
function extractMergeKeys(...sources) {
  const found = new Set();
  for (const src of sources) {
    if (typeof src !== 'string' || !src) continue;
    for (const m of src.matchAll(MERGE_TOKEN)) {
      if (!RESERVED_KEYS.has(m[1])) found.add(m[1]);
    }
  }
  return [...found].sort();
}

/**
 * Flat {{key}} substitution. Unknown keys collapse to '' rather than leaking the
 * raw token into someone's inbox. Reserved action keys are left untouched so the
 * MTA can fill them per recipient.
 */
function renderWith(source, data = {}) {
  if (typeof source !== 'string' || !source) return source || '';
  return source.replace(MERGE_TOKEN, (whole, key) => {
    if (RESERVED_KEYS.has(key)) return whole;
    const v = lookup(data, key);
    return v == null ? '' : String(v);
  });
}

/** Which of a template's merge keys the supplied data would leave empty. */
function missingKeys(keys, data = {}) {
  return keys.filter((k) => {
    const v = lookup(data, k);
    return v == null || v === '';
  });
}

/**
 * Append UTM parameters to every outbound link in the HTML.
 *
 * Skipped deliberately:
 *   • hrefs containing a {{token}} — the URL isn't known until the MTA renders
 *     it, and rewriting here would corrupt the placeholder.
 *   • non-http schemes (mailto:, tel:, #anchors).
 *   • URLs that already carry utm_source, so re-saving doesn't stack duplicates.
 *
 * A #fragment is preserved after the query, which is the only ordering a URL
 * parser will accept.
 */
function withUtm(html, utm = {}) {
  const params = Object.entries({
    utm_source: utm.utm_source,
    utm_medium: utm.utm_medium,
    utm_campaign: utm.utm_campaign,
    utm_content: utm.utm_content,
  }).filter(([, v]) => v != null && String(v).trim() !== '');

  if (!params.length || typeof html !== 'string' || !html) return html || '';

  const qs = params.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&');

  return html.replace(/href\s*=\s*"([^"]*)"/gi, (whole, url) => {
    if (!/^https?:\/\//i.test(url)) return whole;
    if (url.includes('{{')) return whole;
    if (/[?&]utm_source=/i.test(url)) return whole;

    const hashAt = url.indexOf('#');
    const base = hashAt === -1 ? url : url.slice(0, hashAt);
    const hash = hashAt === -1 ? '' : url.slice(hashAt);
    const sep = base.includes('?') ? '&' : '?';
    return `href="${base}${sep}${qs}${hash}"`;
  });
}

module.exports = { MERGE_TOKEN, RESERVED_KEYS, extractMergeKeys, renderWith, missingKeys, withUtm };
