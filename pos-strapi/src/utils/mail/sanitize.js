'use strict';

// Foreign-HTML defense for rendering email inside the ERP.
//
// Threat model (docs/todo/email-program/08-security.md): a hostile message
// rendered in an authenticated origin. Everything here is server-side; the
// client additionally renders the result in a sandboxed iframe.
//
// Remote images are NOT loaded by default: `src` is renamed to
// `data-remote-src` and the caller gets `hasRemoteImages: true` so the UI can
// offer per-message click-to-load. Inline cid: images are resolved to data
// URIs by the caller-supplied resolver (the message parse already holds the
// parts in memory), within a fixed budget.

const sanitizeHtml = require('sanitize-html');

// One conservative regex for every allowed style value: no url(), no
// expression(), no braces. Blocks CSS exfiltration and background-image fetches.
const SAFE_VALUE = [/^(?!.*url\s*\()(?!.*expression\s*\()[^;{}]*$/i];

const ALLOWED_STYLES = Object.fromEntries([
  'color', 'background', 'background-color', 'font', 'font-family', 'font-size',
  'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align',
  'text-decoration', 'text-transform', 'vertical-align', 'white-space',
  'word-break', 'overflow-wrap', 'margin', 'margin-top', 'margin-right',
  'margin-bottom', 'margin-left', 'padding', 'padding-top', 'padding-right',
  'padding-bottom', 'padding-left', 'border', 'border-top', 'border-right',
  'border-bottom', 'border-left', 'border-color', 'border-style', 'border-width',
  'border-radius', 'border-collapse', 'border-spacing', 'table-layout',
  'width', 'max-width', 'min-width', 'height', 'max-height', 'display', 'float',
].map((prop) => [prop, SAFE_VALUE]));

const ALLOWED_TAGS = [
  'a', 'abbr', 'address', 'b', 'bdi', 'bdo', 'big', 'blockquote', 'br',
  'caption', 'center', 'cite', 'code', 'col', 'colgroup', 'dd', 'del', 'div',
  'dl', 'dt', 'em', 'font', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i',
  'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p', 'pre', 'q', 's', 'samp',
  'small', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody', 'td',
  'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var', 'wbr',
];

const ALLOWED_ATTRIBUTES = {
  '*': ['style', 'align', 'valign', 'dir', 'lang', 'width', 'height', 'border',
        'cellpadding', 'cellspacing', 'bgcolor', 'color', 'title'],
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'data-remote-src', 'alt', 'hspace', 'vspace'],
  font: ['face', 'size', 'color'],
  td: ['colspan', 'rowspan', 'scope', 'nowrap'],
  th: ['colspan', 'rowspan', 'scope', 'nowrap'],
  ol: ['start', 'type'],
  li: ['type', 'value'],
};

const stripCid = (src) => String(src).replace(/^cid:/i, '').replace(/[<>]/g, '');

/**
 * Sanitize a message body for display.
 *
 * @param {string} html
 * @param {object} [opts]
 * @param {(cid: string) => string|null} [opts.cidResolver]
 *   Returns a data: URI for an inline part, or null (budget spent / unknown).
 * @returns {{ html: string, hasRemoteImages: boolean }}
 */
function sanitizeEmailHtml(html, { cidResolver } = {}) {
  let hasRemoteImages = false;

  const clean = sanitizeHtml(String(html || ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: { '*': ALLOWED_STYLES },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['data'] },
    transformTags: {
      a: (tagName, attribs) => ({
        tagName: 'a',
        attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' },
      }),
      img: (tagName, attribs) => {
        const { src = '', ...rest } = attribs;
        if (/^cid:/i.test(src)) {
          const resolved = cidResolver ? cidResolver(stripCid(src)) : null;
          if (resolved) return { tagName: 'img', attribs: { ...rest, src: resolved } };
          return { tagName: 'img', attribs: { ...rest, alt: attribs.alt || '[inline image]' } };
        }
        if (/^https?:\/\//i.test(src)) {
          hasRemoteImages = true;
          return { tagName: 'img', attribs: { ...rest, 'data-remote-src': src } };
        }
        if (/^data:image\//i.test(src)) return { tagName: 'img', attribs };
        // javascript:, file:, unknown — drop the src entirely.
        return { tagName: 'img', attribs: rest };
      },
    },
  });

  return { html: clean, hasRemoteImages };
}

/**
 * Sanitize a user-authored signature. Same allowlist, but remote images stay
 * loadable — this is the user's own outbound content, not foreign input.
 */
function sanitizeSignature(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: { '*': ALLOWED_STYLES },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https', 'data'] },
  });
}

module.exports = { sanitizeEmailHtml, sanitizeSignature };
