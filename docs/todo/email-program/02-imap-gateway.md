# Email Program — IMAP Gateway

`pos-strapi/src/utils/mail/` — the live-read engine. Four files, each importing
the previous: `crypto.js` → `sanitize.js` → `pool.js` → `gateway.js`.

Dependencies (pos-strapi is **not** a workspace — own install):
`npm install --prefix pos-strapi imapflow mailparser sanitize-html`.
SMTP send uses the `nodemailer` already present for the Strapi email plugin.

## Why it lives in pos-strapi

- Strapi is a long-lived Node process → a connection pool actually works.
- Credentials, the role gate (`requireAppRole`), and nodemailer are already here.
- rutba-core wraps pos-strapi controllers via `posRequire` — a future core
  `mail` module mounts these controllers unchanged, like `src/modules/crm.js`.
- Graduation path: if IDLE/push is ever wanted, the pool moves into a
  standalone worker (marketplace-worker pattern) behind the same gateway API.

## `crypto.js` — credential encryption

- AES-256-GCM, key from `MAIL_CRED_KEY` (64 hex chars = 32 bytes).
- Ciphertext format `v1:<iv_b64>:<tag_b64>:<ct_b64>` (version prefix → rotation).
- `encrypt(plain)`, `decrypt(blob)`, `isEncrypted(v)`.
- **Missing/malformed key throws immediately** — the system must never fall
  back to storing plaintext. See [`08-security.md`](./08-security.md).

## `sanitize.js` — foreign-HTML defense

`sanitizeEmailHtml(html, {cidResolver}) → {html, hasRemoteImages}`:

- `sanitize-html` allowlist: no script/iframe/form/object/embed, conservative
  tag + attribute set, `allowedStyles` subset (color, background, font,
  text-align, margins/padding, borders, width/height).
- `img[src^=http(s)]` → attribute renamed to `data-remote-src`, and
  `hasRemoteImages: true` — the client shows a "load remote images" bar and
  swaps the attribute back on click. Blocks tracking pixels by default.
- `img[src^=cid:]` → resolved to a data URI via `cidResolver(cid)` (budgeted
  ~2 MB total; unresolved cids become attachment placeholders).
- `a[href]` → `target="_blank" rel="noopener noreferrer"`.

`sanitizeSignature(html)` — same allowlist, no cid/remote handling; applied
when saving `signature_html`.

The client renders the result inside `<iframe sandbox="" srcDoc=…>` — even
sanitized HTML never shares the app origin. Defense in depth.

## `pool.js` — the connection pool

`withAccount(account, fn)` is the **only** entry point:

1. Resolve decrypted credentials (raw `db.query` select of the `*_enc`
   columns — they are `private: true` and invisible to the document API).
2. Get-or-create the `ImapFlow` client for `account.documentId`
   (`socketTimeout` + `connectionTimeout` set from env).
3. Chain `fn(client)` onto the **per-account mutex** (a promise chain) — IMAP
   is a single-channel protocol; two concurrent commands on one socket corrupt
   the session.
4. Wrap in `deadline(MAIL_IMAP_OP_TIMEOUT_MS)` — a wedged op must fail the one
   request, not queue every later request for that account behind it.
5. **On any error: evict + destroy the client.** The next request reconnects
   fresh. Never reuse a connection that threw.
6. Idle sweep: clients unused for `MAIL_POOL_IDLE_MS` are logged out; LRU
   eviction keeps at most `MAIL_POOL_MAX` live connections.

| Env knob | Default | Meaning |
|---|---|---|
| `MAIL_IMAP_OP_TIMEOUT_MS` | 15000 | per-operation deadline |
| `MAIL_CONNECT_TIMEOUT_MS` | 10000 | TLS+login budget |
| `MAIL_POOL_IDLE_MS` | 300000 | idle eviction |
| `MAIL_POOL_MAX` | 20 | max live IMAP connections |
| `MAIL_ATTACH_MAX_MB` | 15 | attachment download cap |

Rationale: the SSR-side `webApi` has **no request timeout** (known repo trap) —
if the gateway hangs, a storefront-grade hang follows. Every op is bounded
here, at the source, mta-client style.

## `gateway.js` — the operation API

All ops throw `MailError {status, code, message}` (the `MtaError` shape from
`src/utils/mta-client.js`) so controllers map errors without leaking stacks.
Folder names always arrive as **parameters/query values, never path segments**
(IMAP paths contain delimiters and UTF-7).

```
testConnection(settings)          // UNPOOLED probe of raw settings: IMAP login,
                                  // SMTP verify, SPECIAL-USE detection.
                                  // → {ok, imap:{ok,error}, smtp:{ok,error}, specialFolders}
listFolders(account)              // LIST (SPECIAL-USE) → [{path, name, delimiter,
                                  //   specialUse, flags}]
listMessages(account, folder, {page=1, pageSize=50, search})
                                  // SELECT; total = mailbox.exists; newest-first
                                  // sequence-window FETCH of ENVELOPE + FLAGS +
                                  // BODYSTRUCTURE + RFC822.SIZE + UID.
                                  // search → server-side IMAP SEARCH (uid set),
                                  // then page over uids.
                                  // → {total, uidvalidity, messages:[{uid, messageId,
                                  //   from, to, subject, date, seen, flagged,
                                  //   answered, hasAttachments, size}]}
getMessage(account, folder, uid)  // BODY[] download (sets \Seen), mailparser,
                                  // sanitizeEmailHtml → {uid, messageId, envelope,
                                  //   flags, bodyHtml, bodyText, hasRemoteImages,
                                  //   attachments:[{partId, filename, contentType,
                                  //   size, cid, inline}], headers}
getAttachment(account, folder, uid, partId)
                                  // → {filename, contentType, base64};
                                  // rejects parts over MAIL_ATTACH_MAX_MB.
                                  // (Streaming upgrade path: M1.)
setFlags(account, folder, uid, {add, remove})
                                  // whitelist: \Seen, \Flagged, \Answered only
removeMessage(account, folder, uid)
                                  // move to special_folders.trash when known;
                                  // already in Trash (or none) → \Deleted + EXPUNGE
sendMessage(account, {to, cc, bcc, subject, html, text, attachments,
                      inReplyTo, references})
                                  // ad-hoc nodemailer transport (SMTP password via
                                  // crypto.decrypt, never cached), send, then APPEND
                                  // the raw RFC822 to the Sent folder with \Seen.
                                  // → {messageId, appendedTo}
```

M1/M2 additions: `transferMessage` (arbitrary move — 'transfer' passes the
api-pro verb whitelist), `importMessage(account, folder, uid, links, {triage})`
(fetch full → parse → create mail-message/attachments/links idempotently),
`getUnseenCounts(account)` (STATUS poll for the cron).

## IMAP identity subtleties (the ones that bite)

- A `uid` is stable only within `(folder, uidvalidity)`. Every listing returns
  `uidvalidity`; clients treat a change as "refetch everything".
- Message-ID can be absent or duplicated — import falls back to `dedupe_hash`.
- Sequence-window paging shifts under concurrent expunge — tolerate short
  reads; never treat `total` as exact across requests.
- Always use imapflow's decoded folder `path`; never build paths by string
  concatenation with an assumed delimiter.
