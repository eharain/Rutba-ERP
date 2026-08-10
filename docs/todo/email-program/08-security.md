# Email Program — Security

The mail module concentrates three kinds of dangerous material: **mailbox
credentials**, **foreign HTML**, and **private correspondence**. Rules below
are load-bearing; deviations get recorded here like the campaigns doc does.

## Credentials

- IMAP/SMTP passwords are encrypted **AES-256-GCM** via
  `src/utils/mail/crypto.js`; key = `MAIL_CRED_KEY` env (64 hex chars = 32
  bytes; generate with `openssl rand -hex 32`). Ciphertext
  `v1:<iv>:<tag>:<ct>` — the `v1` prefix is the rotation seam (a future `v2`
  key decrypts-old/encrypts-new during a sweep).
- Stored only in `private: true` columns (`imap_password_enc`,
  `smtp_password_enc`) — stripped from every serialized response. Server-side
  reads go through the service's raw `db.query` select (the
  cmp-sending-identity `tokenFor` discipline).
- **Missing/malformed `MAIL_CRED_KEY` throws** on first use. There is no
  plaintext fallback, ever. The campaigns "private but plaintext" deviation is
  explicitly NOT acceptable for mailbox passwords — they are full-mailbox keys.
- **Update rule:** a PUT without a password field (or with an empty one) must
  NOT touch the stored ciphertext. Password fields in the UI are write-only
  and never populated back.
- Rotation: re-enter the password in settings (re-encrypts), or the M5 mailcow
  reset flow. Key rotation = new `MAIL_CRED_KEY` + decrypt-reencrypt sweep
  script (write when needed; format supports it).

## Foreign HTML (the #1 attack surface)

Threat: a hostile email rendered inside an authenticated ERP origin — script
execution, credential-stealing forms, CSS exfiltration, tracking pixels.

- Server-side `sanitize-html` allowlist (see 02): no
  script/iframe/form/object/embed/svg, conservative attributes, style subset.
- Remote images stripped to `data-remote-src` — loaded only on explicit
  per-message click (kills tracking pixels and IP leaks by default).
- cid images become data URIs — no fetches from inside the rendered document.
- Client renders into `<iframe sandbox="" srcDoc>` — no scripts, no
  same-origin, no top navigation, even if sanitization missed something.
- Links open `target=_blank rel=noopener noreferrer`. The href text/target
  mismatch (phishing) is surfaced in M1 with a hover-status treatment.
- The same pipeline sanitizes at **import** time — stored `body_html` is
  already clean, and CRM-side viewers get the same iframe treatment anyway.

## Private correspondence

- Access = `ensureAccountAccess`: super-admin OR `mail_admin` OR caller ∈
  `owners` (M3 adds `access_roles`). Personal accounts have exactly one owner;
  managers cannot read them.
- `find` responses never include credential columns (private) and force an
  owners filter for non-admins **server-side** — the client filter is
  cosmetic.
- Imported attachments: files ride the upload provider but are referenced only
  via `mail-attachment` behind gated routes. **Known caveat:** the upload
  provider's storage itself (media file server) has no per-file ACL — a leaked
  direct URL bypasses the gate. Recorded as accepted risk for M2; a private
  storage bucket/prefix with signed URLs is the M3+ fix if imported-attachment
  sensitivity demands it.
- **Logging bans:** never log account settings objects, credentials (even
  encrypted), message bodies, subjects, or compose payloads. Log documentIds,
  folder names, uids, byte counts, error codes.

## Availability

- Every IMAP/SMTP/mailcow call is deadline-bounded (02 §pool) — the ERP's
  no-timeout HTTP clients make an unbounded gateway a whole-app hang.
- Pool caps (`MAIL_POOL_MAX`) bound concurrent connections so one tenant
  can't exhaust sockets.
- `validateConnection` is the only op that takes raw credentials from the
  request body; it is unpooled, bounded, and never persists anything.

## Campaign tracking endpoints (M6)

- `/api/cmp/t/o/:token` and `/api/cmp/t/c/:token/:link` are public by
  necessity (they are fetched by mail clients). The token — the recipient's
  documentId HMAC-signed with `CMP_TRACK_SECRET` (falls back to
  `APP_KEYS[0]`) — is the whole authentication. 80-bit signature prefix:
  non-guessable, and a wrong guess yields a pixel or a 404, never data.
- **No open redirect by construction**: the click endpoint never reads a URL
  from the request. Destinations are stored per run (`tracked_links`) and
  addressed by index; unknown index or bad signature → 404.
- The pixel answers 200 + GIF on EVERY request, valid or not — a tracking
  failure must never render as a broken image, and the uniform response
  keeps the endpoint useless as an oracle.
- Rotating the key only stops *recording* on already-sent mail (clicks 404,
  pixels blank-succeed); it can never break a delivered message's actual
  content, because destinations are only reachable through live links in
  NEW sends signed with the new key. Accepted trade, same class as
  password-reset links.
- Event floods are bounded by the deterministic dedup key
  (`trk:<recipient>:<kind>:<link>`): an image-proxy hammering the pixel
  inserts one row, total.

## Instruction-injection note

Email bodies are untrusted input *to humans and to any future AI features*.
Any later "summarize this inbox / draft a reply" assistant must treat message
content as data, never as instructions — same rule the platform applies to
web content.
