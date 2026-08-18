# Email Program — The `apps/content/mail` App (:4021)

Next.js pages app, skeleton copied from `apps/content/campaigns`/`apps/inventory/control`.
Port **4021** (next free after `services/core` :4020 — verified in
`scripts/rutba_apps.sh`). Domain key **`mail`**, roles
`mail_admin` / `mail_manager` / `mail_staff`.

## Screens

| Page | Contents |
|---|---|
| `index` | The mail client: account switcher (personal + shared the caller can access), three panes — FolderTree \| MessageList \| MessageView — plus Compose |
| `settings` | Accounts list; add/edit dialog with **Validate Connection**; signature editor; deactivate/delete. `mail_admin`/`mail_manager` manage; staff read their own |
| (M2) `search` | Cross-folder server-side IMAP SEARCH |
| (M3) `shared/[documentId]` | Triage queue for one shared inbox: status columns, assignee, comments |

## Components

| Component | Notes |
|---|---|
| `Layout` / `Navigation` / `Sidebar` | standard app chrome (inventory/campaigns skeleton) |
| `FolderTree` | PrimeReact Tree; SPECIAL-USE icons (inbox/sent/drafts/trash/junk/archive); unread badges once M1 counts land |
| `MessageList` | PrimeReact DataTable, server-paged (`page`/`pageSize`), unseen = bold, flagged = star; row click loads the message |
| `MessageView` | `<iframe sandbox srcDoc>` render; "load remote images" bar (`data-remote-src` swap); attachment chips → base64 → Blob download; Reply / Reply-all / Forward; flag toggle; delete |
| `ComposeDialog` | to/cc/bcc chips, subject, body textarea (rich editor later), signature insert, attachments (base64, bounded), reply prefill sets `inReplyTo`/`references` + quoted body |
| `AccountDialog` | BYO IMAP/SMTP form; `kind` via pos-shared `EnumSelect` (never hardcode); Validate before save; **password fields are write-only** — never populated back from the API |
| (M2) `LinkPicker` | person/contact/order/ticket search + attach |

## UX rules

- Everything the user reads is **live** — a refresh button re-hits IMAP; there
  is no "sync status" because there is no sync.
- Foreign HTML renders only inside the sandboxed iframe; remote images load
  only on explicit click (per message).
- Reply quotes plain text; original HTML is not re-sent (M1 revisits).
- Deleting moves to Trash (server-detected special folder); a second delete
  inside Trash expunges.
- Errors from the gateway surface as toast + inline state with the `MailError`
  message — never a spinner that hangs (every backend op is deadline-bounded).

## Registration checklist (all seven points — miss one and it silently fails)

1. `packages/shared/lib/roles.js` — `APP_URLS.mail` (:4021),
   `VALID_APP_KEYS` + `'mail'`, `APP_META.mail`.
2. `apps/content/mail/pages/auth/callback.js` re-exporting
   `@rutba/shared` AuthCallback.
3. `packages/api-provider/config/domains.json` — `mail` domain +
   `mail_admin/manager/staff`; same keys in `config/roles.json`.
4. `scripts/rutba_apps.sh` — `RUTBA_SERVICES` + `RUTBA_SVC_CMD` +
   `RUTBA_SVC_DESC` + `RUTBA_SVC_PORT[rutba_mail]=4021`.
5. Root `package.json` (workspace + `dev:mail`/`start:mail`/`build:mail`),
   `.env.*` (`MAIL__PORT=4021`, `NEXT_PUBLIC_MAIL_URL`, `MAIL_CRED_KEY`,
   `MAIL_*` knobs), `scripts/js/env-config.js` GLOBAL_VARS, `Dockerfile` +
   `docker-compose.yml`, `dev-start.bat`.
6. **Full Strapi restart** after adding the URL — CORS origins are baked at
   boot; hot reload leaves the origin blocked and surfaces as a bogus
   "Invalid token".
7. `PrimeReactProvider` in `_app.js`; enum fields via `EnumSelect`.
