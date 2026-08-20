'use strict';

// Open/click tracking for campaigns — the §5 decision, taken as option (b):
// track locally in the ERP. Rutba-MTA scopes generic open/click tracking out
// (FUNCTION.md "out of scope for now"), so the ERP injects its own pixel and
// link redirects at run time. The webhook ingester already accepts
// `opened`/`clicked` events, so if the MTA ever gains native tracking the
// injection here is simply switched off and nothing downstream moves.
//
// How a tracked link stays per-recipient inside ONE batch: the MTA renders
// `{{key}}` merge data per recipient, so the instrumented HTML carries a
// `{{_trk}}` placeholder and each recipient's `data` carries their own signed
// token. The URL itself never travels in the link — the click endpoint looks
// it up from the run's `tracked_links` by index, which is also what makes an
// open redirect impossible.
//
// Token = `<recipientDocumentId>.<hmac-sha256 prefix>`. Stateless to verify,
// no expiry (a year-old newsletter click should still redirect); rotating the
// key only stops NEW recording on old links — the deliberate trade.

const crypto = require('crypto');

// Merge key carrying the per-recipient token. Underscore prefix keeps it out
// of any audience's way; template-render's MERGE_TOKEN accepts it.
const TRACK_KEY = '_trk';
const SIG_LEN = 20; // hex chars = 80 bits — plenty for a non-guessable click token

function trackingSecret(strapi) {
  if (process.env.CMP_TRACK_SECRET) return process.env.CMP_TRACK_SECRET;
  const keys = strapi.config.get('server.app.keys');
  if (Array.isArray(keys) && keys[0]) return keys[0];
  throw new Error('cmp-tracking: no CMP_TRACK_SECRET and no server.app.keys — cannot sign tokens.');
}

const sig = (secret, docId) => crypto.createHmac('sha256', secret).update(String(docId)).digest('hex').slice(0, SIG_LEN);

function tokenFor(secret, recipientDocumentId) {
  return `${recipientDocumentId}.${sig(secret, recipientDocumentId)}`;
}

/** → recipient documentId, or null on any malformation/tamper. */
function verifyToken(secret, token) {
  const raw = String(token || '');
  const dot = raw.lastIndexOf('.');
  if (dot <= 0) return null;
  const docId = raw.slice(0, dot);
  const given = raw.slice(dot + 1);
  const expected = sig(secret, docId);
  if (given.length !== expected.length) return null;
  try {
    if (!crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  return docId;
}

/**
 * Rewrite the campaign HTML for tracking. Runs AFTER withUtm (UTM belongs on
 * the destination URL) and after the subject/body are final.
 *
 * Click rewrite skips exactly what withUtm skips: non-http(s) schemes and
 * hrefs containing a `{{token}}` (the real URL doesn't exist until the MTA
 * renders — wrapping it would store an unrendered template). Identical URLs
 * share one index so the report reads per-destination.
 *
 * @returns {{ html: string, links: string[] }} links[i] is the destination
 *   behind /cmp/t/c/<token>/<i>. Empty when trackClicks is off.
 */
function instrumentHtml(html, { baseUrl, trackOpens = true, trackClicks = true } = {}) {
  const src = typeof html === 'string' ? html : '';
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base || (!trackOpens && !trackClicks)) return { html: src, links: [] };

  const links = [];
  const indexOf = new Map();
  let out = src;

  if (trackClicks) {
    out = out.replace(/href\s*=\s*"([^"]*)"/gi, (whole, url) => {
      if (!/^https?:\/\//i.test(url)) return whole;
      if (url.includes('{{')) return whole;
      let idx = indexOf.get(url);
      if (idx === undefined) {
        idx = links.length;
        links.push(url);
        indexOf.set(url, idx);
      }
      return `href="${base}/api/cmp/t/c/{{${TRACK_KEY}}}/${idx}"`;
    });
  }

  if (trackOpens) {
    const pixel = `<img src="${base}/api/cmp/t/o/{{${TRACK_KEY}}}" width="1" height="1" alt="" style="display:none;max-width:1px;max-height:1px" />`;
    out = /<\/body\s*>/i.test(out)
      ? out.replace(/<\/body\s*>/i, `${pixel}</body>`)
      : out + pixel;
  }

  return { html: out, links };
}

// 1×1 transparent GIF, served to every open-pixel request — including ones
// that fail verification, so a broken token never renders as a broken image.
const PIXEL_GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

module.exports = { TRACK_KEY, trackingSecret, tokenFor, verifyToken, instrumentHtml, PIXEL_GIF };
