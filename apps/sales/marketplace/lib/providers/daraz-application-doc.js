'use strict';

// The "design documentation / data flow diagram" attachment that Daraz asks for
// when applying for a Seller Inhouse app, generated from this repo rather than
// maintained as a separate file that goes stale.
//
// The endpoint table is built from the adapter's own apiScopes (which are built
// from its API path constant), so the document can never claim a different API
// surface than the code actually calls.
//
// Rendered server-side and handed to the browser as a download. Operator-entered
// values are HTML-escaped; nothing is persisted.

/** Fields the operator fills in before downloading. Drives the form UI. */
const FIELDS = [
  {
    key: 'businessName',
    label: 'Registered business name',
    placeholder: 'As it appears on your business registration',
    required: true,
  },
  {
    key: 'storefront',
    label: 'Storefront / website',
    placeholder: 'rutba.pk',
    required: false,
  },
  {
    key: 'sellerAccount',
    label: 'Daraz seller name / ID',
    placeholder: 'As shown in Seller Center',
    required: true,
  },
  {
    key: 'contactName',
    label: 'Contact name and role',
    placeholder: 'e.g. A. Khan, Operations Manager',
    required: true,
  },
  {
    key: 'contactEmail',
    label: 'Contact email',
    type: 'email',
    placeholder: 'name@yourdomain.com',
    required: true,
  },
  {
    key: 'contactPhone',
    label: 'Contact phone',
    placeholder: '+92 …',
    required: false,
  },
  {
    key: 'retention',
    label: 'Data retention period',
    placeholder: 'e.g. 7 years, per our business records policy',
    required: false,
    help: 'How long order and customer records are kept in the ERP.',
  },
  {
    key: 'productionCallback',
    label: 'Production callback URL',
    placeholder: 'https://…/api/oauth/callback',
    required: false,
    help: 'Pre-filled from this deployment. Must match what you whitelist on Daraz, character for character.',
  },
  {
    key: 'stagingCallback',
    label: 'Staging callback URL',
    placeholder: 'Optional — leave blank if you have no staging app',
    required: false,
  },
];

/**
 * Answer for the Apply screen's FIRST question — "Briefly describe your business
 * needs, or the function or features of your APP." Plain text, ready to paste.
 *
 * The endpoint lists are pulled from the adapter's keyed apiScopes rather than
 * typed out, so this answer and the attachment can never describe different API
 * surfaces — or a surface the code does not actually call.
 *
 * `long` is the full answer; `short` is for a character-limited field.
 */
function renderReason({ apiScopes = [], notUsed = [] } = {}) {
  const byKey = {};
  for (const s of apiScopes) if (s.key) byKey[s.key] = (s.paths || []).join(', ');
  const p = (k) => (byKey[k] ? ` (${byKey[k]})` : '');

  const long = [
    'We are a Daraz seller. Our stock, pricing and order processing are managed in our own '
    + 'in-house ERP system, which is the source of truth for our catalogue. This app connects that '
    + 'ERP to our own Daraz seller account only. It is a private, in-house back-office system: it is '
    + 'not distributed, resold, or offered to any other seller.',
    '',
    'What it does:',
    '',
    `1. Order sync. Every 15 minutes it retrieves our Daraz orders and their line items${p('orders')} `
    + 'and creates them as sales orders in the ERP, so they can be picked, packed and dispatched '
    + 'without re-keying customer and address details by hand.',
    '',
    `2. Price and stock sync. Hourly it publishes our authoritative stock quantity and price back to Daraz${p('price_stock')} `
    + 'so our listings reflect what we can actually ship. This is the main problem we are solving: '
    + 'stock sold in-store or on our website is not reflected on Daraz until someone updates it '
    + 'manually, so we oversell.',
    '',
    `3. Category and brand mapping. It reads the Daraz category tree, category attributes and brand list${p('taxonomy')} `
    + "so our catalogue can be mapped onto Daraz's taxonomy. Read-only; nothing is written back.",
    '',
    `Authorization uses OAuth${p('auth')}. Tokens are stored server-side and are never exposed to a browser.`,
    '',
    'Scope limits:',
    ...notUsed.map((n) => `- ${n}`),
    '- No access to any seller account other than our own, and no sharing of Daraz data with third parties.',
  ].join('\n');

  const short = [
    'We are a Daraz seller. This app connects our own in-house ERP to our own Daraz seller account '
    + 'only — a private back-office system, not distributed or resold.',
    '',
    'It retrieves our Daraz orders and line items every 15 minutes so they can be fulfilled from the '
    + 'ERP without manual re-keying, and pushes our authoritative stock and price back hourly so '
    + 'listings reflect what we can actually ship (today stock sold in-store or on our website is not '
    + 'reflected on Daraz until someone updates it by hand, so we oversell). It also reads Daraz '
    + 'categories, attributes and brands, read-only, to map our catalogue.',
    '',
    'No chat/message access, no listing creation or editing, no order status push-back, no access to '
    + 'any other seller account, and no sharing of Daraz data with third parties.',
  ].join('\n');

  return { long, short };
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolve one field: the operator's value, escaped — or a visibly bracketed
 * prompt so a forgotten field is obvious in the printed document instead of
 * silently rendering as an empty cell.
 */
function val(values, field) {
  const raw = values && values[field.key];
  const s = raw == null ? '' : String(raw).trim();
  if (s) return { html: esc(s), filled: true };
  return { html: `<span class="todo">[${esc(field.prompt || field.label)}]</span>`, filled: false };
}

function fieldsByKey() {
  const m = {};
  for (const f of FIELDS) m[f.key] = f;
  return m;
}

/** The architecture + data-flow figure. Print-first: dark on white, no theming. */
function diagramSvg() {
  return `<svg viewBox="0 0 750 430" xmlns="http://www.w3.org/2000/svg" role="img"
     aria-label="Data flow between the Daraz Open Platform, the integration service, and the ERP">
  <defs>
    <marker id="ar" markerWidth="9" markerHeight="7" refX="8.5" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#444"/></marker>
    <marker id="arb" markerWidth="9" markerHeight="7" refX="8.5" refY="3.5" orient="auto">
      <polygon points="0 0, 9 3.5, 0 7" fill="#b34000"/></marker>
    <marker id="arbS" markerWidth="9" markerHeight="7" refX="8.5" refY="3.5" orient="auto-start-reverse">
      <polygon points="0 0, 9 3.5, 0 7" fill="#b34000"/></marker>
  </defs>
  <g font-family="Segoe UI, Arial, sans-serif">
    <rect x="8" y="40" width="190" height="330" rx="6" fill="#fff5ef" stroke="#d94f00" stroke-width="1.5"/>
    <text x="103" y="26" font-size="13" font-weight="700" text-anchor="middle" fill="#b34000">Daraz Open Platform</text>
    <text x="103" y="62" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Auth gateway</text>
    <text x="103" y="78" font-size="9" text-anchor="middle" fill="#555">/auth/token/create</text>
    <text x="103" y="91" font-size="9" text-anchor="middle" fill="#555">/auth/token/refresh</text>
    <line x1="24" y1="103" x2="182" y2="103" stroke="#e3c4b3"/>
    <text x="103" y="122" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Order API</text>
    <text x="103" y="138" font-size="9" text-anchor="middle" fill="#555">/orders/get</text>
    <text x="103" y="151" font-size="9" text-anchor="middle" fill="#555">/order/items/get</text>
    <line x1="24" y1="163" x2="182" y2="163" stroke="#e3c4b3"/>
    <text x="103" y="182" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Product API</text>
    <text x="103" y="198" font-size="9" text-anchor="middle" fill="#555">/product/price_quantity</text>
    <text x="103" y="211" font-size="9" text-anchor="middle" fill="#555">/update</text>
    <line x1="24" y1="223" x2="182" y2="223" stroke="#e3c4b3"/>
    <text x="103" y="242" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Category &amp; Brand API</text>
    <text x="103" y="258" font-size="9" text-anchor="middle" fill="#555">/category/tree/get</text>
    <text x="103" y="271" font-size="9" text-anchor="middle" fill="#555">/category/attributes/get</text>
    <text x="103" y="284" font-size="9" text-anchor="middle" fill="#555">/category/brands/query</text>
    <line x1="24" y1="296" x2="182" y2="296" stroke="#e3c4b3"/>
    <text x="103" y="315" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Seller authorization</text>
    <text x="103" y="331" font-size="9" text-anchor="middle" fill="#555">OAuth consent screen</text>
    <text x="103" y="349" font-size="8.5" text-anchor="middle" fill="#777">(seller signs in and approves)</text>

    <rect x="288" y="40" width="190" height="330" rx="6" fill="#f4f8ff" stroke="#2c5aa0" stroke-width="1.5"/>
    <text x="383" y="26" font-size="13" font-weight="700" text-anchor="middle" fill="#2c5aa0">Integration service</text>
    <text x="383" y="62" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Operator web UI</text>
    <text x="383" y="78" font-size="9" text-anchor="middle" fill="#555">connect, monitor, map</text>
    <text x="383" y="91" font-size="8.5" text-anchor="middle" fill="#777">staff only, authenticated</text>
    <line x1="304" y1="103" x2="462" y2="103" stroke="#c8d6ea"/>
    <text x="383" y="122" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Sync worker</text>
    <text x="383" y="138" font-size="9" text-anchor="middle" fill="#555">orders — every 15 min</text>
    <text x="383" y="151" font-size="9" text-anchor="middle" fill="#555">price/stock — hourly</text>
    <text x="383" y="164" font-size="9" text-anchor="middle" fill="#555">token refresh — 4-hourly</text>
    <line x1="304" y1="176" x2="462" y2="176" stroke="#c8d6ea"/>
    <text x="383" y="195" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Daraz adapter</text>
    <text x="383" y="211" font-size="9" text-anchor="middle" fill="#555">HMAC-SHA256 request</text>
    <text x="383" y="224" font-size="9" text-anchor="middle" fill="#555">signing, retries, logging</text>
    <line x1="304" y1="236" x2="462" y2="236" stroke="#c8d6ea"/>
    <text x="383" y="255" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Credential store</text>
    <text x="383" y="271" font-size="9" text-anchor="middle" fill="#555">app key/secret,</text>
    <text x="383" y="284" font-size="9" text-anchor="middle" fill="#555">access + refresh tokens</text>
    <text x="383" y="302" font-size="8.5" text-anchor="middle" fill="#777">server-side only, never</text>
    <text x="383" y="314" font-size="8.5" text-anchor="middle" fill="#777">sent to the browser</text>
    <line x1="304" y1="328" x2="462" y2="328" stroke="#c8d6ea"/>
    <text x="383" y="346" font-size="9" text-anchor="middle" fill="#555">Audit log of every run</text>
    <text x="383" y="359" font-size="8.5" text-anchor="middle" fill="#777">counts, errors, timestamps</text>

    <rect x="568" y="40" width="174" height="330" rx="6" fill="#f3faf4" stroke="#2e7d4f" stroke-width="1.5"/>
    <text x="655" y="26" font-size="13" font-weight="700" text-anchor="middle" fill="#2e7d4f">Our ERP</text>
    <text x="655" y="62" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Catalogue</text>
    <text x="655" y="78" font-size="9" text-anchor="middle" fill="#555">products, SKUs,</text>
    <text x="655" y="91" font-size="9" text-anchor="middle" fill="#555">prices, stock levels</text>
    <line x1="584" y1="103" x2="726" y2="103" stroke="#c6e2ce"/>
    <text x="655" y="122" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Sales orders</text>
    <text x="655" y="138" font-size="9" text-anchor="middle" fill="#555">picking, packing,</text>
    <text x="655" y="151" font-size="9" text-anchor="middle" fill="#555">dispatch, accounting</text>
    <line x1="584" y1="163" x2="726" y2="163" stroke="#c6e2ce"/>
    <text x="655" y="182" font-size="10.5" font-weight="600" text-anchor="middle" fill="#333">Customer records</text>
    <text x="655" y="198" font-size="9" text-anchor="middle" fill="#555">name, phone, address</text>
    <text x="655" y="211" font-size="9" text-anchor="middle" fill="#555">used to fulfil the order</text>
    <line x1="584" y1="223" x2="726" y2="223" stroke="#c6e2ce"/>
    <text x="655" y="245" font-size="9" text-anchor="middle" fill="#777">Private network.</text>
    <text x="655" y="258" font-size="9" text-anchor="middle" fill="#777">No inbound access</text>
    <text x="655" y="271" font-size="9" text-anchor="middle" fill="#777">from the internet and</text>
    <text x="655" y="284" font-size="9" text-anchor="middle" fill="#777">no outbound calls to</text>
    <text x="655" y="297" font-size="9" text-anchor="middle" fill="#777">Daraz.</text>

    <line x1="200" y1="88" x2="288" y2="88" stroke="#b34000" stroke-width="1.6" marker-end="url(#arb)" marker-start="url(#arbS)"/>
    <circle cx="243" cy="76" r="9" fill="#b34000"/><text x="243" y="80" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">1</text>
    <line x1="200" y1="140" x2="288" y2="140" stroke="#444" stroke-width="1.6" marker-end="url(#ar)"/>
    <circle cx="243" cy="128" r="9" fill="#444"/><text x="243" y="132" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">2</text>
    <line x1="288" y1="200" x2="200" y2="200" stroke="#444" stroke-width="1.6" marker-end="url(#ar)"/>
    <circle cx="243" cy="188" r="9" fill="#444"/><text x="243" y="192" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">3</text>
    <line x1="200" y1="262" x2="288" y2="262" stroke="#444" stroke-width="1.6" marker-end="url(#ar)"/>
    <circle cx="243" cy="250" r="9" fill="#444"/><text x="243" y="254" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">4</text>
    <line x1="568" y1="140" x2="478" y2="140" stroke="#2e7d4f" stroke-width="1.6" marker-end="url(#ar)"/>
    <circle cx="523" cy="128" r="9" fill="#2e7d4f"/><text x="523" y="132" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">5</text>
    <line x1="478" y1="200" x2="568" y2="200" stroke="#2e7d4f" stroke-width="1.6" marker-end="url(#ar)"/>
    <circle cx="523" cy="188" r="9" fill="#2e7d4f"/><text x="523" y="192" font-size="10" font-weight="700" text-anchor="middle" fill="#fff">6</text>
    <text x="375" y="400" font-size="9" text-anchor="middle" fill="#777">Arrows show the direction data moves. All Daraz traffic is HTTPS and server-to-server; every call is initiated by us.</text>
  </g>
</svg>`;
}

/** Endpoint table rows, derived from the adapter's declared scopes. */
function endpointRows(apiScopes) {
  return (apiScopes || []).map((s) => {
    const paths = (s.paths || []).map((p) => `<div><code>${esc(p)}</code></div>`).join('');
    return `<tr><td>${esc(s.family)}</td><td>${paths}</td><td>${esc(s.usedFor)}</td></tr>`;
  }).join('');
}

function notUsedItems(notUsed) {
  return (notUsed || []).map((n) => `<li>${esc(n)}</li>`).join('');
}

/**
 * Build the application document.
 * @returns {{ filename: string, html: string, missing: string[] }}
 */
function render({ values = {}, redirectUri = '', apiScopes = [], notUsed = [] } = {}) {
  const F = fieldsByKey();
  const v = {};
  const missing = [];
  for (const f of FIELDS) {
    const r = val(values, f);
    v[f.key] = r.html;
    if (!r.filled) missing.push(f.key);
  }
  // The production callback defaults to this deployment's own resolved value —
  // it is the field operators are most likely to get wrong, and we know it.
  if (missing.includes('productionCallback') && redirectUri) {
    v.productionCallback = `<code>${esc(redirectUri)}</code>`;
    missing.splice(missing.indexOf('productionCallback'), 1);
  }

  const todoNote = missing.length
    ? `<div class="note"><strong>Before uploading:</strong> ${missing.length} field(s) are still
       unfilled and appear in the document as bracketed prompts —
       ${missing.map((k) => esc(F[k].label)).join(', ')}. Fill them in and download again.
       Delete this box afterwards.</div>`
    : '';

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Daraz Open Platform Integration — Design &amp; Data Flow</title>
<style>
  @page { size: A4; margin: 16mm 15mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1a1a1a; margin: 0; background: #fff; }
  h1 { font-size: 18pt; margin: 0 0 2mm; letter-spacing: -.2pt; }
  h2 { font-size: 12pt; margin: 7mm 0 2mm; padding-bottom: 1mm; border-bottom: 1.5px solid #d94f00; color: #b34000; }
  h3 { font-size: 10.5pt; margin: 4mm 0 1mm; }
  p { margin: 0 0 2.5mm; }
  ul, ol { margin: 0 0 3mm; padding-left: 5mm; }
  li { margin-bottom: 1.2mm; }
  .sub { color: #555; font-size: 9.5pt; margin-bottom: 4mm; }
  .meta { border: 1px solid #ddd; border-left: 3px solid #d94f00; padding: 3mm 4mm; margin-bottom: 5mm; background: #fafafa; }
  .meta table { border: 0; margin: 0; } .meta td { border: 0; padding: .8mm 0; font-size: 9.5pt; }
  .meta td:first-child { color: #555; width: 42mm; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 3mm; font-size: 9pt; }
  th, td { border: 1px solid #ccc; padding: 1.6mm 2mm; text-align: left; vertical-align: top; }
  th { background: #f2f2f2; font-weight: 600; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 8.6pt; }
  .fig { margin: 3mm 0 4mm; } .fig svg { width: 100%; height: auto; }
  .cap { font-size: 8.6pt; color: #666; text-align: center; margin-top: 1.5mm; }
  .note { border: 1px solid #e0c200; background: #fffbe6; padding: 2.5mm 3.5mm; font-size: 9pt; margin: 3mm 0; }
  .todo { color: #a00; background: #ffecec; padding: 0 1mm; }
  .no { color: #a00; font-weight: 600; }
  .page-break { page-break-before: always; }
  .toolbar { background: #1a1a1a; color: #fff; padding: 3mm 4mm; font-size: 10pt; display: flex; gap: 4mm; align-items: center; justify-content: space-between; }
  .toolbar button { font: inherit; padding: 1.5mm 4mm; border: 0; border-radius: 3px; background: #d94f00; color: #fff; cursor: pointer; }
  @media print { .toolbar { display: none; } }
  footer { margin-top: 7mm; padding-top: 2mm; border-top: 1px solid #ddd; font-size: 8.5pt; color: #777; }
</style></head><body>

<div class="toolbar">
  <span>Save this as a PDF to attach to your Daraz application: press Ctrl+P (Cmd+P) and choose <strong>Save as PDF</strong>.</span>
  <button type="button" onclick="window.print()">Print / Save as PDF</button>
</div>

<h1>Daraz Open Platform Integration — Design &amp; Data Flow</h1>
<div class="sub">Application category: <strong>Seller Inhouse</strong> · Single seller account · In-house use only</div>

<div class="meta"><table>
  <tr><td>Applicant</td><td><strong>${v.businessName}</strong> — Daraz seller, storefront ${v.storefront}</td></tr>
  <tr><td>Daraz seller account</td><td>${v.sellerAccount}</td></tr>
  <tr><td>Application name</td><td>Marketplace Integration (in-house ERP)</td></tr>
  <tr><td>Application type</td><td>Private, in-house back-office system. Not distributed, resold, or offered to other sellers.</td></tr>
  <tr><td>Contact</td><td>${v.contactName} · ${v.contactEmail} · ${v.contactPhone}</td></tr>
  <tr><td>Document version</td><td>1.0</td></tr>
</table></div>

${todoNote}

<h2>1. Business need</h2>
<p>We operate a retail business that sells through a physical store, our own website, and our Daraz
shop. Stock, pricing and order processing are managed in a single in-house ERP system, which is the
source of truth for our catalogue.</p>
<p>Today the Daraz shop is maintained by hand, which causes two recurring problems:</p>
<ul>
  <li><strong>Overselling.</strong> Stock sold in-store or on our website is not reflected on Daraz until
      someone updates it manually, so items remain listed after they are gone.</li>
  <li><strong>Slow, error-prone order handling.</strong> Daraz orders are re-keyed into the ERP by hand
      before they can be picked, packed and dispatched, which delays fulfilment and introduces
      mistakes in customer and address details.</li>
</ul>
<p>This application closes both gaps for <strong>our own seller account only</strong>: it pulls our Daraz
orders into the ERP automatically, and pushes our authoritative price and stock levels back to Daraz
on a schedule. It performs no function for any other seller.</p>

<h2>2. Scope</h2>
<table>
  <tr><th style="width:38%">In scope</th><th>Out of scope</th></tr>
  <tr>
    <td>Order retrieval and their line items<br>Price and stock quantity updates<br>
        Reading Daraz categories, category attributes and brands (to map our catalogue onto them)<br>
        OAuth authorization and token refresh</td>
    <td><ul style="margin:0;padding-left:4mm">${notUsedItems(notUsed)}
        <li><span class="no">No</span> access to any seller account other than our own</li>
        <li><span class="no">No</span> resale, sharing or onward transfer of Daraz data</li></ul></td>
  </tr>
</table>

<h2>3. System architecture</h2>
<p>Three components. The integration service is the only part that talks to Daraz; the ERP has no
outbound access to Daraz, and the browser never holds Daraz credentials.</p>
<div class="fig">${diagramSvg()}
<div class="cap">Figure 1 — Components and data flows. Numbers correspond to the table in section 4.</div></div>

<div class="page-break"></div>

<h2>4. Data flows</h2>
<table>
  <tr><th style="width:6%">#</th><th style="width:20%">Flow</th><th style="width:12%">Trigger</th>
      <th style="width:32%">What moves</th><th>Direction &amp; purpose</th></tr>
  <tr><td><strong>1</strong></td><td>Seller authorization</td><td>Once, manually</td>
      <td>Authorization code &rarr; access token + refresh token</td>
      <td>Our staff click <em>Connect</em>; the seller signs in on the Daraz consent screen and approves.
          Daraz redirects back to our callback URL with a code, which the server exchanges for tokens.
          Tokens are stored server-side. Refreshed automatically before expiry.</td></tr>
  <tr><td><strong>2</strong></td><td>Order retrieval</td><td>Every 15 min</td>
      <td>Orders updated since the last run, then each order&#39;s line items</td>
      <td>Daraz &rarr; ERP. Each order becomes a sales order so it can be picked, packed and dispatched.
          Deduplicated on the Daraz order id, so repeated runs never create duplicates.</td></tr>
  <tr><td><strong>3</strong></td><td>Price &amp; stock update</td><td>Hourly</td>
      <td>Seller SKU, quantity, price, sale price</td>
      <td>ERP &rarr; Daraz. Publishes our authoritative stock and price for the products we have
          selected, so the Daraz listing reflects what we can actually ship. Stock is set to zero for
          a product we deactivate.</td></tr>
  <tr><td><strong>4</strong></td><td>Category &amp; brand read</td><td>On demand</td>
      <td>Category tree, category attributes, brand list</td>
      <td>Daraz &rarr; integration service. Read-only reference data, so staff can map our own
          categories and brands onto the Daraz equivalents. Nothing is written back.</td></tr>
  <tr><td><strong>5</strong></td><td>Publish set read</td><td>Hourly</td>
      <td>Selected products with SKU, price and stock</td>
      <td>ERP &rarr; integration service. Internal only. Supplies the data for flow 3.</td></tr>
  <tr><td><strong>6</strong></td><td>Order write</td><td>Every 15 min</td>
      <td>Sales order, line items, buyer contact and delivery address</td>
      <td>Integration service &rarr; ERP. Internal only. Writes the orders retrieved in flow 2.</td></tr>
</table>

<h2>5. Daraz APIs requested</h2>
<p>This is the complete list of endpoints the application calls. It requests no other access.</p>
<table>
  <tr><th style="width:22%">API</th><th style="width:34%">Endpoint</th><th>Why it is needed</th></tr>
  ${endpointRows(apiScopes)}
</table>

<h2>6. Security and data handling</h2>
<h3>Credentials</h3>
<ul>
  <li>The app key, app secret, access token and refresh token are held server-side only. They are
      never exposed to a browser, never written into source code, and never logged.</li>
  <li>Every request is signed with HMAC-SHA256 over the sorted request parameters, as required by
      the platform. All traffic is HTTPS.</li>
  <li>The OAuth callback is restricted to a single whitelisted HTTPS URL, and the authorization
      response is verified against a one-time value issued when the flow starts, so a response that
      was not initiated by us is rejected.</li>
</ul>
<h3>Data received and how it is used</h3>
<ul>
  <li><strong>Order data</strong> (order id, status, payment method, totals, line items) is stored as a
      sales order and used to fulfil and account for that order.</li>
  <li><strong>Buyer contact and delivery details</strong> (name, phone, address) are stored against the
      order and used solely to pack, address and deliver it, and to contact the buyer about that
      order if delivery requires it.</li>
  <li>Daraz data is <strong>not</strong> shared with, sold to, or transferred to any third party, and is not
      used for marketing.</li>
  <li>Data is held in our own ERP database on infrastructure we control, with access limited to
      authorised staff. Retention: ${v.retention}.</li>
</ul>
<h3>Access control and monitoring</h3>
<ul>
  <li>Only authenticated staff with the marketplace role can connect an account or trigger a sync.</li>
  <li>Every sync run is recorded with its counts, errors and timestamps, giving a full audit trail
      and making a failed or partial run visible to staff.</li>
  <li>The connection can be disabled at any time from our side, and the seller can revoke the
      authorization from Daraz Seller Center at any time.</li>
</ul>

<h2>7. Environments</h2>
<table>
  <tr><th style="width:22%">Environment</th><th style="width:33%">Purpose</th><th>Callback URL</th></tr>
  <tr><td>Production</td><td>Live seller account</td><td>${v.productionCallback}</td></tr>
  <tr><td>Staging / test</td><td>Internal testing before release</td><td>${v.stagingCallback}</td></tr>
</table>
<p class="sub">Both callback URLs are HTTPS and are whitelisted in the app configuration. They must
match character for character.</p>

<footer>Daraz Open Platform Integration · Design &amp; Data Flow · v1.0 · Prepared for the Seller Inhouse application</footer>
</body></html>`;

  return {
    filename: 'daraz-seller-inhouse-application.html',
    html,
    missing,
    reason: renderReason({ apiScopes, notUsed }),
  };
}

module.exports = { FIELDS, render, renderReason, __test: { esc, val, endpointRows } };
