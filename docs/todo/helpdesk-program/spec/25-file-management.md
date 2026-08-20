# 25 — File Management

[← 24 Internal Collaboration](24-internal-collaboration.md) · [Index](00-index.md) · Next: [26 Search & Filtering](26-search-and-filtering.md)

---

## 25.1 Purpose

Let people attach the evidence — a photo of the damaged item, an invoice, a screenshot of the
error — safely, and let agents find it again.

## 25.2 Platform

Core already has an upload platform: `src/platform/upload.js`, `src/http/uploads.js` and
multipart handling, backed by **Rutba-Media-FileServer** (v2.0, hosting `images.rutba.pk`)
through the Strapi upload-provider seam.

Helpdesk **uses it as-is**. It does not build a second storage path.

> Two known traps from the core upload work apply here: `created_by_id` maps to `admin_users`,
> and the provider must not litter the working directory or accept a bare array where an object
> is expected. Both are fixed in the platform; helpdesk must not reintroduce them by writing its
> own upload path.

## 25.3 Where files attach

| Attachment point | Notes |
|---|---|
| Ticket message | The primary path — evidence arrives with the words explaining it |
| Ticket (direct) | Documents added later, not tied to a message |
| KB article | Diagrams, PDFs |
| Catalog submission | A `file` field on a catalog form |
| Resolution | Proof of resolution (receipt, replacement dispatch note) |

Every file inherits the **visibility of its parent**. A file on an internal note is internal;
a file on a public reply is visible to the requester. There is no separate ACL to keep in sync,
because a second permission surface on files is a leak waiting to happen.

## 25.4 Accepted types and limits

| Category | Types | Max size |
|---|---|---|
| Images | jpg, jpeg, png, gif, webp, heic | 10 MB |
| Documents | pdf, doc(x), xls(x), csv, txt | 25 MB |
| Archives | zip | 50 MB |
| Video | mp4, mov, webm | 100 MB |
| Audio | mp3, wav, m4a | 25 MB |

Limits are configurable per tenant, per desk and per requester kind (anonymous submitters get
the tightest). Max 10 files per message, 100 per ticket.

**Blocked outright:** executables and scripts (`exe`, `bat`, `cmd`, `sh`, `ps1`, `msi`, `dll`,
`jar`, `app`, `scr`, `com`, `vbs`, `js`), and anything whose extension disagrees with its
detected content type.

## 25.5 Security

The requester-upload path is the module's largest untrusted-input surface. Controls:

1. **Type validation by content, not extension** — magic-byte sniffing; a `.jpg` that is really
   a PHP script is rejected.
2. **Virus scanning** on upload (ClamAV or the provider's equivalent). Infected files are
   quarantined, never stored in the served path, and the uploader is told.
3. **Never served from the application origin.** Files come from the media host with its own
   domain, so a stored HTML/SVG file cannot execute against an application session.
4. `Content-Disposition: attachment` and a strict `Content-Security-Policy` on the media host;
   SVG is sanitised or converted on upload — an SVG is a script container, not just an image.
5. **Signed, expiring URLs** for private files; permission checked at signing time, and the
   signature bound to the file and a short TTL.
6. **No public bucket listing**; filenames are opaque identifiers, never user-supplied paths.
7. **Filename sanitisation** — path traversal, control characters and overlong names stripped;
   the original name is retained as display metadata only.
8. **Rate limits** per requester and per IP on the anonymous upload path.
9. **EXIF stripping** on images by default — customer photos routinely carry GPS coordinates,
   and a support ticket is not a reason to collect someone's home location.

## 25.6 Access control

Access = access to the parent ticket **and** the parent's visibility tier. Anonymous access is
possible only through a signed expiring link the system itself generated (e.g. in an email to
the requester). Every download of a file on a `restricted` desk is audited.

## 25.7 Storage and lifecycle

Deduplication by content hash within a tenant. Thumbnails generated for images and PDF first
pages. Retention follows the ticket's retention policy — files are purged with their ticket, and
a purge is audited and irreversible. Orphaned uploads (started, never attached) are swept after
24 hours.

## 25.8 Agent experience

Drag-and-drop, paste from clipboard (screenshots — the commonest agent attachment), and
multi-select. Inline preview for images and PDFs without download. An **Attachments** panel
listing every file on the ticket with its source message, uploader and date, so an agent does
not have to scroll the thread to find the photo.

## 25.9 Requester experience

Camera capture on mobile (§39) — a warehouse employee photographing a broken scanner is the
canonical case. Clear progress and an explicit failure message with the reason (too large,
wrong type, infected) rather than a silent drop. Upload continues while they keep typing.

## 25.10 API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/helpdesk/uploads` | Upload → returns a file id for attaching |
| POST | `/api/helpdesk/tickets/:id/attachments` | Attach to a ticket |
| GET | `/api/helpdesk/tickets/:id/attachments` | List with metadata |
| GET | `/api/helpdesk/attachments/:id/url` | Signed, expiring URL |
| DELETE | `/api/helpdesk/attachments/:id` | Remove (audited; agents and admins only) |

## 25.11 Events

`helpdesk.attachment.uploaded` · `.rejected` (with reason) · `.quarantined` · `.deleted` ·
`.downloaded` (restricted desks only).

## 25.12 KPIs

Attachments per ticket by desk · rejection rate by reason (a high wrong-type rate means the UI
is unclear) · quarantine count · storage per tenant · median upload time · mobile-capture share.

---

## Acceptance criteria for this section

- [ ] Content-type validated by magic bytes; mismatched extension rejected.
- [ ] Virus scanning active; infected files quarantined and never served.
- [ ] Files served only from the media host, never the app origin.
- [ ] SVG sanitised; stored HTML cannot execute against an app session.
- [ ] Signed URLs expire and are permission-checked at signing.
- [ ] File visibility always equals its parent's — no separate ACL.
- [ ] EXIF stripped by default.
- [ ] Anonymous upload path rate-limited.
- [ ] Purge with ticket retention verified and audited.
