'use strict';

// The live-IMAP gateway: every mailbox operation the ERP performs.
//
// Architecture (docs/todo/email-program/02-imap-gateway.md): the ERP reads
// mail LIVE from the server — nothing here persists a message. Import-on-link
// (M2) builds on top of these same ops.
//
// Rules:
//   - All pooled work goes through pool.withAccount (mutex + deadline + evict).
//   - Every function throws MailError {status, code} — controllers map errors
//     without leaking stacks (the MtaError discipline from utils/mta-client.js).
//   - Folder names are always plain parameters, never URL path segments —
//     IMAP paths carry delimiters and UTF-7.

const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const nodemailer = require('nodemailer');
const MailComposer = require('nodemailer/lib/mail-composer');

const {
  MailError, withAccount, credsFor, evictAccount, deadline,
  imapConfig, connectTimeoutMs, opTimeoutMs, intEnv,
} = require('./pool');
const { sanitizeEmailHtml, sanitizeOutboundHtml } = require('./sanitize');

const attachMaxBytes = () => intEnv('MAIL_ATTACH_MAX_MB', 15) * 1024 * 1024;
const messageMaxBytes = () => intEnv('MAIL_MESSAGE_MAX_MB', 25) * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 45_000;
const SEND_TIMEOUT_MS = 60_000;

/* ----------------------------------------------------------- special folders */

const SPECIAL_USE_KEYS = {
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'junk',
  '\\Archive': 'archive',
};

const NAME_HINTS = {
  sent: /^sent( items| mail|-mail)?$/i,
  drafts: /^drafts?$/i,
  trash: /^(trash|deleted( items)?|bin)$/i,
  junk: /^(junk( e-?mail)?|spam)$/i,
  archive: /^archives?$/i,
};

/** SPECIAL-USE first, name heuristics as fallback. */
function detectSpecialFolders(folders) {
  const map = {};
  for (const f of folders) {
    const key = SPECIAL_USE_KEYS[f.specialUse];
    if (key && !map[key]) map[key] = f.path;
  }
  for (const [key, re] of Object.entries(NAME_HINTS)) {
    if (map[key]) continue;
    const hit = folders.find((f) => re.test(f.name));
    if (hit) map[key] = hit.path;
  }
  return map;
}

/* ------------------------------------------------------------------ helpers */

const addr = (a) => (a ? { address: a.address || '', name: a.name || '' } : null);
const addrList = (list) => (Array.isArray(list) ? list.map(addr).filter(Boolean) : []);

function structureHasAttachments(node) {
  if (!node) return false;
  if (node.disposition === 'attachment') return true;
  if (node.dispositionParameters?.filename || node.parameters?.name) return true;
  return Array.isArray(node.childNodes) && node.childNodes.some(structureHasAttachments);
}

/**
 * Walk BODYSTRUCTURE into the attachment list.
 *
 * The point of doing this from the structure rather than from the parsed
 * message is `part` — the IMAP part number — which lets getAttachment issue
 * ONE `BODY.PEEK[<part>]` fetch instead of re-downloading the entire RFC822
 * per attachment (three attachments used to cost three full message
 * downloads, on a connection every other agent is queued behind).
 */
function collectAttachmentParts(node, out = []) {
  if (!node) return out;

  const type = String(node.type || '').toLowerCase();
  const filename = node.dispositionParameters?.filename || node.parameters?.name || null;
  const disposition = String(node.disposition || '').toLowerCase();

  // An attached .eml is a leaf even though the server describes its innards.
  const isAttachedMessage = type === 'message/rfc822' && (disposition === 'attachment' || filename);
  if (Array.isArray(node.childNodes) && node.childNodes.length && !isAttachedMessage) {
    for (const child of node.childNodes) collectAttachmentParts(child, out);
    return out;
  }

  // Bare text/plain + text/html leaves are the body itself, never attachments.
  if (!disposition && !filename && (type === 'text/plain' || type === 'text/html')) return out;
  if (disposition !== 'attachment' && disposition !== 'inline' && !filename) return out;
  if (!node.part) return out; // the root node of a single-part message has no part number

  const encoded = Number(node.size) || 0;
  out.push({
    partId: out.length,
    part: String(node.part),
    filename: filename || `attachment-${out.length + 1}`,
    contentType: type || 'application/octet-stream',
    // BODYSTRUCTURE reports ENCODED octets; base64 inflates by 4/3.
    size: String(node.encoding || '').toLowerCase() === 'base64' ? Math.round(encoded * 0.75) : encoded,
    cid: node.id ? String(node.id).replace(/[<>]/g, '') : null,
    inline: disposition === 'inline' && Boolean(node.id),
  });
  return out;
}

// Tags are IMAP custom keywords with this prefix — stored ON the mail
// server, so they survive without import and show in any client. The slug
// charset keeps them valid IMAP atoms.
const TAG_KEYWORD_RE = /^rt_[a-z0-9_]{1,40}$/;

function mapEnvelope(msg) {
  const flags = msg.flags || new Set();
  return {
    uid: msg.uid,
    messageId: msg.envelope?.messageId || null,
    inReplyTo: msg.envelope?.inReplyTo || null,
    from: addr(msg.envelope?.from?.[0]),
    to: addrList(msg.envelope?.to),
    subject: msg.envelope?.subject || '',
    date: msg.envelope?.date || null,
    seen: flags.has('\\Seen'),
    flagged: flags.has('\\Flagged'),
    answered: flags.has('\\Answered'),
    tags: [...flags].filter((f) => TAG_KEYWORD_RE.test(f)),
    hasAttachments: structureHasAttachments(msg.bodyStructure),
    size: msg.size || null,
  };
}

/**
 * Build the imapflow SEARCH object from the structured filter set. All
 * criteria AND together; the free-text term keeps its subject/from/to OR.
 * Returns null when nothing is filtered (callers then use the cheap
 * sequence-window path).
 */
function buildSearch({ search, unread, flagged, from, to, subject, since, before, tag } = {}) {
  const q = {};
  const term = typeof search === 'string' ? search.trim() : '';
  if (term) q.or = [{ subject: term }, { from: term }, { to: term }];
  if (unread) q.seen = false;
  if (flagged) q.flagged = true;
  if (typeof from === 'string' && from.trim()) q.from = from.trim();
  if (typeof to === 'string' && to.trim()) q.to = to.trim();
  if (typeof subject === 'string' && subject.trim()) q.subject = subject.trim();
  const sinceD = since ? new Date(since) : null;
  if (sinceD && !Number.isNaN(sinceD.getTime())) q.since = sinceD;
  const beforeD = before ? new Date(before) : null;
  if (beforeD && !Number.isNaN(beforeD.getTime())) q.before = beforeD;
  if (typeof tag === 'string' && TAG_KEYWORD_RE.test(tag)) q.keyword = tag;
  return Object.keys(q).length ? q : null;
}

function readStream(stream, maxBytes, label) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        stream.destroy();
        reject(new MailError(`${label} exceeds the ${Math.round(maxBytes / 1024 / 1024)}MB limit.`, {
          status: 413,
          code: 'mail_too_large',
        }));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', (e) => reject(e));
  });
}

/**
 * Download the full message for one uid and parse it. Caller must hold the
 * mailbox lock.
 *
 * imapflow issues this as `BODY.PEEK[]<start.len>` (lib/commands/fetch.js —
 * every body item it builds is a PEEK), so reading a message does NOT set
 * \Seen. That is deliberate here: \Seen is applied by an explicit
 * messageFlagsAdd in getMessage when the caller asks for it, so "mark as
 * read" is a decision and preview-without-marking-read is possible.
 */
async function downloadParsed(client, uid) {
  const dl = await client.download(String(uid), undefined, { uid: true });
  if (!dl?.content) {
    throw new MailError('Message not found in this folder (it may have moved).', {
      status: 404,
      code: 'mail_message_not_found',
    });
  }
  const raw = await readStream(dl.content, messageMaxBytes(), 'This message');
  return simpleParser(raw);
}

const normalizeAddressInput = (v) =>
  (Array.isArray(v) ? v : String(v || '').split(/[,;]/))
    .map((s) => String(s || '').trim())
    .filter(Boolean);

/* --------------------------------------------------------------- operations */

/**
 * Probe raw settings — UNPOOLED, never persists anything. The only op that
 * takes plaintext credentials from a request body.
 *
 * @returns {{ok, imap:{ok,error}, smtp:{ok,error}, specialFolders}}
 */
async function testConnection(settings = {}) {
  const out = { ok: false, imap: { ok: false, error: null }, smtp: { ok: false, error: null }, specialFolders: null };

  const imapPassword = settings.imap_password || '';
  if (!settings.imap_host || !imapPassword) {
    out.imap.error = 'IMAP host and password are required.';
  } else {
    const client = new ImapFlow(imapConfig(settings, imapPassword));
    client.on('error', () => {});
    try {
      await deadline(client.connect(), connectTimeoutMs() + 2_000, 'IMAP connect');
      const folders = await deadline(client.list(), opTimeoutMs(), 'IMAP LIST');
      out.imap.ok = true;
      out.specialFolders = detectSpecialFolders(folders);
    } catch (e) {
      out.imap.error = e?.authenticationFailed
        ? 'IMAP login failed — check the username and password.'
        : e?.message || 'IMAP connection failed.';
    } finally {
      try { client.logout().catch(() => {}); client.close(); } catch { /* gone */ }
    }
  }

  const smtpPassword = settings.smtp_password || imapPassword;
  if (!settings.smtp_host || !smtpPassword) {
    out.smtp.error = 'SMTP host and password are required.';
  } else {
    const transport = nodemailer.createTransport({
      host: settings.smtp_host,
      port: Number(settings.smtp_port) || 465,
      secure: settings.smtp_secure !== false,
      auth: {
        user: settings.smtp_username || settings.imap_username || settings.email,
        pass: smtpPassword,
      },
      connectionTimeout: connectTimeoutMs(),
      greetingTimeout: connectTimeoutMs(),
      socketTimeout: connectTimeoutMs(),
    });
    try {
      await deadline(transport.verify(), connectTimeoutMs() + 2_000, 'SMTP verify');
      out.smtp.ok = true;
    } catch (e) {
      out.smtp.error = e?.message || 'SMTP connection failed.';
    } finally {
      transport.close();
    }
  }

  out.ok = out.imap.ok && out.smtp.ok;
  return out;
}

/** LIST (SPECIAL-USE) → folder tree source + detected special map. */
async function listFolders(strapi, account) {
  return withAccount(strapi, account, async (client) => {
    const folders = await client.list();
    return {
      folders: folders.map((f) => ({
        path: f.path,
        name: f.name,
        delimiter: f.delimiter || '/',
        specialUse: f.specialUse || null,
        subscribed: f.subscribed !== false,
      })),
      specialFolders: detectSpecialFolders(folders),
    };
  }, { label: 'IMAP LIST' });
}

/**
 * Page a folder newest-first, envelope-only (no bodies). Any filter —
 * free-text `search`, unread/flagged, from/to/subject, since/before, tag —
 * runs as ONE server-side IMAP SEARCH and pages over the matched uid set.
 */
async function listMessages(strapi, account, folder, { page = 1, pageSize = 50, ...filters } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 50));
  const FETCH = { uid: true, envelope: true, flags: true, bodyStructure: true, size: true };

  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const box = client.mailbox;
      const uidvalidity = String(box.uidValidity ?? '');
      const messages = [];
      let total;

      const query = buildSearch(filters);
      if (query) {
        let uids = await client.search(query, { uid: true });
        uids = (uids || []).sort((a, b) => b - a);
        total = uids.length;
        const slice = uids.slice((p - 1) * ps, p * ps);
        if (slice.length) {
          for await (const msg of client.fetch(slice.join(','), FETCH, { uid: true })) {
            messages.push(mapEnvelope(msg));
          }
        }
      } else {
        total = box.exists;
        // Newest-first sequence window. Sequence numbers shift under
        // concurrent expunge — tolerate short reads, never assume exact.
        const end = total - (p - 1) * ps;
        const start = Math.max(1, end - ps + 1);
        if (end >= 1) {
          for await (const msg of client.fetch(`${start}:${end}`, FETCH)) {
            messages.push(mapEnvelope(msg));
          }
        }
      }

      messages.sort((a, b) => b.uid - a.uid);
      return { total, page: p, pageSize: ps, uidvalidity, messages };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP list messages' });
}

/**
 * Full read of one message: peek the body, parse, sanitize.
 *
 * Reading never changes flags on its own. Pass `markSeen` to set \Seen — one
 * extra command, and only when the message was actually unread.
 *
 * Attachments carry both `part` (IMAP part number, from BODYSTRUCTURE — the
 * cheap fetch path) and `partId` (its index, the fallback for servers whose
 * structure we could not walk).
 *
 * `forEdit` returns the body under the OUTBOUND sanitizer instead of the
 * reader one, so a draft can be loaded straight back into the composer
 * without the reader's remote-image defusing being baked into what gets sent.
 */
async function getMessage(strapi, account, folder, uid, { markSeen = false, forEdit = false } = {}) {
  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const meta = await client.fetchOne(
        String(uid),
        { uid: true, flags: true, envelope: true, bodyStructure: true },
        { uid: true },
      );
      if (!meta) {
        throw new MailError('Message not found in this folder (it may have moved).', {
          status: 404,
          code: 'mail_message_not_found',
        });
      }

      const parsed = await downloadParsed(client, uid);
      const structured = collectAttachmentParts(meta.bodyStructure);
      // Fall back to the parsed list only when the structure walk found
      // nothing — mixing the two would make `partId` mean different things in
      // the same response.
      const attachments = structured.length || !(parsed.attachments || []).length
        ? structured
        : (parsed.attachments || []).map((a, i) => ({
          partId: i,
          part: null,
          filename: a.filename || `attachment-${i + 1}`,
          contentType: a.contentType || 'application/octet-stream',
          size: a.size || a.content?.length || 0,
          cid: a.cid ? String(a.cid).replace(/[<>]/g, '') : null,
          inline: Boolean(a.cid) && a.contentDisposition !== 'attachment',
        }));

      // Inline cid images become data URIs within a fixed budget; anything
      // over budget stays a listed attachment.
      let cidBudget = 2 * 1024 * 1024;
      const cidResolver = (cid) => {
        const part = (parsed.attachments || []).find(
          (a) => a.cid && a.cid.replace(/[<>]/g, '') === cid && a.content,
        );
        if (!part || part.content.length > cidBudget) return null;
        cidBudget -= part.content.length;
        return `data:${part.contentType || 'image/png'};base64,${part.content.toString('base64')}`;
      };

      const sourceHtml = typeof parsed.html === 'string' && parsed.html
        ? parsed.html
        : parsed.textAsHtml || '';
      const { html: bodyHtml, hasRemoteImages } = forEdit
        ? { html: sanitizeOutboundHtml(sourceHtml), hasRemoteImages: false }
        : sanitizeEmailHtml(sourceHtml, { cidResolver });

      const flags = meta.flags || new Set();
      let seen = flags.has('\\Seen');
      if (markSeen && !seen) {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
        seen = true;
      }
      const pickHeader = (name) => {
        const v = parsed.headers?.get?.(name);
        if (v == null) return undefined;
        return typeof v === 'string' ? v : v.text || (Array.isArray(v) ? v.join(' ') : String(v));
      };

      return {
        uid: Number(uid),
        messageId: parsed.messageId || meta.envelope?.messageId || null,
        envelope: {
          from: addr(meta.envelope?.from?.[0]),
          to: addrList(meta.envelope?.to),
          cc: addrList(meta.envelope?.cc),
          // Bcc survives only on a message we wrote ourselves (drafts, Sent),
          // which is exactly where draft resume needs it.
          bcc: addrList(meta.envelope?.bcc || parsed.bcc?.value),
          replyTo: addrList(meta.envelope?.replyTo),
          subject: meta.envelope?.subject || parsed.subject || '',
          date: meta.envelope?.date || parsed.date || null,
        },
        flags: {
          seen,
          flagged: flags.has('\\Flagged'),
          answered: flags.has('\\Answered'),
          draft: flags.has('\\Draft'),
        },
        tags: [...flags].filter((f) => TAG_KEYWORD_RE.test(f)),
        bodyHtml,
        bodyText: parsed.text || '',
        hasRemoteImages,
        attachments,
        headers: {
          references: pickHeader('references'),
          inReplyTo: pickHeader('in-reply-to'),
          listId: pickHeader('list-id'),
          listUnsubscribe: pickHeader('list-unsubscribe'),
          returnPath: pickHeader('return-path'),
        },
      };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP fetch message', timeoutMs: DOWNLOAD_TIMEOUT_MS });
}

/**
 * One attachment, base64-bounded.
 *
 * With `mimePart` (the BODYSTRUCTURE part number getMessage handed out) this
 * is a single `BODY.PEEK[<part>]` fetch of that part alone. Without it — a
 * message whose structure we could not walk — it falls back to the old
 * download-and-parse, which costs the whole RFC822.
 */
async function getAttachment(strapi, account, folder, uid, partId, { mimePart = null } = {}) {
  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      if (mimePart) {
        const dl = await client.download(String(uid), String(mimePart), { uid: true });
        if (dl?.content) {
          const content = await readStream(dl.content, attachMaxBytes(), 'This attachment');
          return {
            filename: dl.meta?.filename || `attachment-${Number(partId) + 1 || 1}`,
            contentType: dl.meta?.contentType || 'application/octet-stream',
            size: content.length,
            base64: content.toString('base64'),
          };
        }
        // The server declined the part fetch — fall through rather than fail.
      }
      const parsed = await downloadParsed(client, uid);
      const part = (parsed.attachments || [])[Number(partId)];
      if (!part?.content) {
        throw new MailError('Attachment not found on this message.', { status: 404, code: 'mail_attachment_not_found' });
      }
      if (part.content.length > attachMaxBytes()) {
        throw new MailError(
          `Attachment is over the ${Math.round(attachMaxBytes() / 1024 / 1024)}MB download limit.`,
          { status: 413, code: 'mail_too_large' },
        );
      }
      return {
        filename: part.filename || 'attachment',
        contentType: part.contentType || 'application/octet-stream',
        size: part.content.length,
        base64: part.content.toString('base64'),
      };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP fetch attachment', timeoutMs: DOWNLOAD_TIMEOUT_MS });
}

/** Move one message or a uid set to an arbitrary folder (M1 — 'transfer' passes the api-pro verb whitelist). */
async function transferMessage(strapi, account, folder, uid, toFolder) {
  if (!toFolder || String(toFolder).toLowerCase() === String(folder).toLowerCase()) {
    throw new MailError('A different destination folder is required.', { status: 400, code: 'mail_bad_folder' });
  }
  const set = uidSet(uid);
  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove(set, toFolder, { uid: true });
      return { moved: toFolder };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP move message' });
}

/** Message-ID as it was written into a freshly built RFC822 buffer. */
const messageIdOf = (raw) =>
  raw.toString('utf8', 0, Math.min(raw.length, 16_384)).match(/^Message-ID:\s*(<[^>]+>)/im)?.[1] || null;

/**
 * APPEND a draft to the Drafts folder (M1). Recipients may be empty.
 *
 * `replaceUid` makes editing a draft an actual edit: the new copy is appended
 * FIRST, and only then is the old uid expunged — an APPEND that fails must
 * never cost the user the draft they already had. That ordering is also what
 * makes periodic auto-save safe to leave running.
 *
 * Unlike sendMessage, the Bcc header is KEPT here: a draft that forgets who
 * it was going to be blind-copied to is a lost draft. It is stripped again
 * when the draft is actually sent.
 */
async function saveDraft(strapi, account, { to, cc, bcc, subject, html, text, replaceUid } = {}) {
  const safeHtml = html ? sanitizeOutboundHtml(html) : '';
  const composer = new MailComposer({
    from: account.from_name ? { name: account.from_name, address: account.email } : account.email,
    ...(normalizeAddressInput(to).length ? { to: normalizeAddressInput(to) } : {}),
    ...(normalizeAddressInput(cc).length ? { cc: normalizeAddressInput(cc) } : {}),
    ...(normalizeAddressInput(bcc).length ? { bcc: normalizeAddressInput(bcc) } : {}),
    subject: subject || '',
    ...(safeHtml ? { html: safeHtml } : {}),
    text: text || ' ',
  });
  const node = composer.compile();
  node.keepBcc = true;
  const raw = await new Promise((resolve, reject) => {
    node.build((err, message) => (err ? reject(err) : resolve(message)));
  });
  const messageId = messageIdOf(raw);

  return withAccount(strapi, account, async (client) => {
    let drafts = account.special_folders?.drafts || null;
    if (!drafts) {
      const folders = await client.list();
      drafts = detectSpecialFolders(folders).drafts || 'Drafts';
    }
    const res = await client.append(drafts, raw, ['\\Draft', '\\Seen']);

    let uid = res?.uid ?? null;
    let replaced = false;
    // The old copy and the new uid both need the Drafts mailbox selected;
    // one lock covers both so nothing interleaves between them.
    if (replaceUid || (!uid && messageId)) {
      const lock = await client.getMailboxLock(drafts);
      try {
        // No UIDPLUS → APPEND returns no uid. Find it by Message-ID so the
        // NEXT auto-save can still replace this copy instead of stacking one
        // draft per tick.
        if (!uid && messageId) {
          const found = await client.search({ header: { 'message-id': messageId } }, { uid: true });
          uid = found?.length ? Math.max(...found) : null;
        }
        if (replaceUid) {
          await client.messageDelete(uidSet(replaceUid), { uid: true });
          replaced = true;
        }
      } catch {
        // A stale extra draft beats a lost one — never fail the save here.
      } finally {
        lock.release();
      }
    }
    return { savedTo: drafts, uid, messageId, replaced };
  }, { label: 'APPEND draft', timeoutMs: 30_000 });
}

// STATUS is cheap, but it is still one command per folder on a connection
// every other request for this account queues behind. Cap the sweep so a
// mailbox with fifty folders can't monopolise it.
const UNSEEN_POLL_MAX_FOLDERS = 12;

/**
 * STATUS (UNSEEN) per folder — the badge poll, used by both the cron sweep
 * and the client's own refresh while the page is open. One pooled trip,
 * however many folders are asked for.
 */
async function getUnseenCounts(strapi, account, folders = ['INBOX']) {
  const wanted = [...new Set(
    (Array.isArray(folders) ? folders : [folders])
      .map((f) => String(f || '').trim())
      .filter(Boolean),
  )].slice(0, UNSEEN_POLL_MAX_FOLDERS);
  if (!wanted.length) wanted.push('INBOX');

  return withAccount(strapi, account, async (client) => {
    const out = {};
    for (const f of wanted) {
      try {
        const st = await client.status(f, { unseen: true });
        out[f] = st?.unseen ?? 0;
      } catch {
        // Folder may not exist on this server — skip, never fail the sweep.
      }
    }
    return out;
  }, { label: 'IMAP STATUS', timeoutMs: Math.max(opTimeoutMs(), 3_000 * wanted.length) });
}

/**
 * Full download + parse for import-on-link (M2). Returns the raw parse plus
 * the folder identity needed for idempotency; persistence belongs to the
 * mail-message service, not here.
 */
async function fetchFullMessage(strapi, account, folder, uid) {
  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      const meta = await client.fetchOne(String(uid), { uid: true, flags: true, envelope: true }, { uid: true });
      if (!meta) {
        throw new MailError('Message not found in this folder (it may have moved).', {
          status: 404,
          code: 'mail_message_not_found',
        });
      }
      const parsed = await downloadParsed(client, uid);
      return {
        parsed,
        envelope: meta.envelope || null,
        uidvalidity: String(client.mailbox?.uidValidity ?? ''),
      };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP fetch full message', timeoutMs: DOWNLOAD_TIMEOUT_MS });
}

const FLAG_MAP = { seen: '\\Seen', flagged: '\\Flagged', answered: '\\Answered' };

// One message or many: every flag/move/delete op takes a uid or an array and
// issues ONE IMAP command over the uid set — bulk actions cost one round-trip.
function uidSet(uidOrUids) {
  const list = (Array.isArray(uidOrUids) ? uidOrUids : [uidOrUids])
    .map((u) => Number(u))
    .filter((u) => Number.isInteger(u) && u > 0);
  if (!list.length || list.length > 500) {
    throw new MailError('Between 1 and 500 message uids are required.', {
      status: 400,
      code: 'mail_bad_uids',
    });
  }
  return [...new Set(list)].join(',');
}

/** Whitelist flag ops — \Seen / \Flagged / \Answered only. */
async function setFlags(strapi, account, folder, uid, { add = [], remove = [] } = {}) {
  const toImap = (names) => names.map((n) => {
    const flag = FLAG_MAP[String(n || '').replace(/^\\/, '').toLowerCase()];
    if (!flag) {
      throw new MailError(`Flag '${n}' is not allowed (seen, flagged, answered).`, {
        status: 400,
        code: 'mail_bad_flag',
      });
    }
    return flag;
  });
  const addFlags = toImap(add);
  const removeFlags = toImap(remove);
  const set = uidSet(uid);

  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      if (addFlags.length) await client.messageFlagsAdd(set, addFlags, { uid: true });
      if (removeFlags.length) await client.messageFlagsRemove(set, removeFlags, { uid: true });
      return { ok: true, added: addFlags, removed: removeFlags };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP set flags' });
}

/**
 * Tag ops — IMAP custom keywords (`rt_<slug>`), validated against the
 * mail-tag registry by the controller. Keywords live on the mail server, so
 * tags survive without import and appear in other IMAP clients.
 */
async function setTags(strapi, account, folder, uid, { add = [], remove = [] } = {}) {
  const check = (slugs) => slugs.map((s) => {
    const slug = String(s || '').trim();
    if (!TAG_KEYWORD_RE.test(slug)) {
      throw new MailError(`'${s}' is not a valid tag keyword.`, { status: 400, code: 'mail_bad_tag' });
    }
    return slug;
  });
  const addTags = check(add);
  const removeTags = check(remove);
  const set = uidSet(uid);

  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      if (addTags.length) await client.messageFlagsAdd(set, addTags, { uid: true });
      if (removeTags.length) await client.messageFlagsRemove(set, removeTags, { uid: true });
      return { ok: true, added: addTags, removed: removeTags };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP set tags' });
}

/** Move to Trash; already in Trash (or no Trash exists) → expunge. */
async function removeMessage(strapi, account, folder, uid) {
  const set = uidSet(uid);
  return withAccount(strapi, account, async (client) => {
    let trash = account.special_folders?.trash || null;
    if (!trash) {
      const folders = await client.list();
      trash = detectSpecialFolders(folders).trash || null;
    }

    const lock = await client.getMailboxLock(folder);
    try {
      const inTrash = trash && trash.toLowerCase() === String(folder).toLowerCase();
      if (!trash || inTrash) {
        await client.messageDelete(set, { uid: true });
        return { deleted: true };
      }
      await client.messageMove(set, trash, { uid: true });
      return { moved: trash };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP delete message' });
}

/**
 * SMTP send through the account's own server, then APPEND the same RFC822 to
 * the Sent folder. Bcc goes in the SMTP envelope only — never in headers, so
 * neither recipients nor the Sent copy expose it.
 *
 * Send and append are separate failure domains: once SMTP accepted the
 * message, an append failure is reported (`appendError`) but never thrown —
 * the mail IS sent.
 *
 * The body is sanitized here rather than in the controller so that send and
 * saveDraft — the only two ways authored html leaves the ERP — cannot diverge.
 */
async function sendMessage(strapi, account, {
  to, cc, bcc, subject, html, text, attachments = [], inReplyTo, references,
} = {}) {
  const toList = normalizeAddressInput(to);
  const ccList = normalizeAddressInput(cc);
  const bccList = normalizeAddressInput(bcc);
  if (!toList.length && !ccList.length && !bccList.length) {
    throw new MailError('At least one recipient is required.', { status: 400, code: 'mail_no_recipient' });
  }

  const files = (Array.isArray(attachments) ? attachments : []).map((a, i) => ({
    filename: a?.filename || `attachment-${i + 1}`,
    content: Buffer.from(String(a?.base64 || ''), 'base64'),
    ...(a?.contentType ? { contentType: a.contentType } : {}),
  }));
  const totalBytes = files.reduce((n, f) => n + f.content.length, 0);
  if (totalBytes > attachMaxBytes()) {
    throw new MailError(
      `Attachments exceed the ${Math.round(attachMaxBytes() / 1024 / 1024)}MB limit.`,
      { status: 413, code: 'mail_too_large' },
    );
  }

  const { smtpPassword } = await credsFor(strapi, account);
  const safeHtml = html ? sanitizeOutboundHtml(html) : '';

  // Raw RFC822 built once, WITHOUT a Bcc header, then reused for SMTP (with an
  // explicit envelope that includes bcc) and for the Sent APPEND.
  const composer = new MailComposer({
    from: account.from_name ? { name: account.from_name, address: account.email } : account.email,
    to: toList,
    ...(ccList.length ? { cc: ccList } : {}),
    subject: subject || '',
    ...(safeHtml ? { html: safeHtml } : {}),
    text: text || ' ',
    ...(account.reply_to ? { replyTo: account.reply_to } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {}),
    attachments: files,
  });
  const raw = await new Promise((resolve, reject) => {
    composer.compile().build((err, message) => (err ? reject(err) : resolve(message)));
  });
  const messageId = messageIdOf(raw);

  const transport = nodemailer.createTransport({
    host: account.smtp_host,
    port: Number(account.smtp_port) || 465,
    secure: account.smtp_secure !== false,
    auth: {
      user: account.smtp_username || account.imap_username || account.email,
      pass: smtpPassword,
    },
    connectionTimeout: connectTimeoutMs(),
    greetingTimeout: connectTimeoutMs(),
    socketTimeout: SEND_TIMEOUT_MS,
  });

  try {
    await deadline(
      transport.sendMail({
        envelope: { from: account.email, to: [...toList, ...ccList, ...bccList] },
        raw,
      }),
      SEND_TIMEOUT_MS,
      'SMTP send',
    );
  } catch (e) {
    if (e instanceof MailError) throw e;
    throw new MailError(`Send failed: ${e?.message || 'SMTP error'}`, { status: 502, code: 'mail_send_failed' });
  } finally {
    transport.close();
  }

  let appendedTo = null;
  let appendError = null;
  try {
    await withAccount(strapi, account, async (client) => {
      let sent = account.special_folders?.sent || null;
      if (!sent) {
        const folders = await client.list();
        sent = detectSpecialFolders(folders).sent || 'Sent';
      }
      await client.append(sent, raw, ['\\Seen']);
      appendedTo = sent;
    }, { label: 'APPEND to Sent', timeoutMs: 30_000 });
  } catch (e) {
    appendError = e?.message || 'Could not append to the Sent folder.';
  }

  return { ok: true, messageId, appendedTo, ...(appendError ? { appendError } : {}) };
}

module.exports = {
  MailError,
  evictAccount,
  detectSpecialFolders,
  testConnection,
  listFolders,
  listMessages,
  getMessage,
  getAttachment,
  setFlags,
  setTags,
  removeMessage,
  sendMessage,
  transferMessage,
  saveDraft,
  getUnseenCounts,
  fetchFullMessage,
  TAG_KEYWORD_RE,
  UNSEEN_POLL_MAX_FOLDERS,
  // exported for direct verification — pure, no IMAP needed
  buildSearch,
  uidSet,
  collectAttachmentParts,
};
