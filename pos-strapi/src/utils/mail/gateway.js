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
const { sanitizeEmailHtml } = require('./sanitize');

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

function mapEnvelope(msg) {
  const flags = msg.flags || new Set();
  return {
    uid: msg.uid,
    messageId: msg.envelope?.messageId || null,
    from: addr(msg.envelope?.from?.[0]),
    to: addrList(msg.envelope?.to),
    subject: msg.envelope?.subject || '',
    date: msg.envelope?.date || null,
    seen: flags.has('\\Seen'),
    flagged: flags.has('\\Flagged'),
    answered: flags.has('\\Answered'),
    hasAttachments: structureHasAttachments(msg.bodyStructure),
    size: msg.size || null,
  };
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

/** Download BODY[] for one uid and parse it. Caller must hold the mailbox lock. */
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
 * Page a folder newest-first, envelope-only (no bodies). `search` runs
 * server-side (IMAP SEARCH over subject/from/to) and pages over the uid set.
 */
async function listMessages(strapi, account, folder, { page = 1, pageSize = 50, search } = {}) {
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

      const term = typeof search === 'string' ? search.trim() : '';
      if (term) {
        let uids = await client.search({ or: [{ subject: term }, { from: term }, { to: term }] }, { uid: true });
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
 * Full read of one message: download BODY[] (marks \Seen), parse, sanitize.
 * Attachments are returned as metadata only; `partId` is the index into the
 * parsed attachment list, fetched individually via getAttachment.
 */
async function getMessage(strapi, account, folder, uid) {
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
      const attachments = (parsed.attachments || []).map((a, i) => ({
        partId: i,
        filename: a.filename || `attachment-${i + 1}`,
        contentType: a.contentType || 'application/octet-stream',
        size: a.size || a.content?.length || 0,
        cid: a.cid || null,
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
      const { html: bodyHtml, hasRemoteImages } = sanitizeEmailHtml(sourceHtml, { cidResolver });

      const flags = meta.flags || new Set();
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
          replyTo: addrList(meta.envelope?.replyTo),
          subject: meta.envelope?.subject || parsed.subject || '',
          date: meta.envelope?.date || parsed.date || null,
        },
        flags: {
          seen: true, // BODY[] download just set \Seen
          flagged: flags.has('\\Flagged'),
          answered: flags.has('\\Answered'),
        },
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

/** One attachment by parse-index, base64-bounded. */
async function getAttachment(strapi, account, folder, uid, partId) {
  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
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

/** Move a message to an arbitrary folder (M1 — 'transfer' passes the api-pro verb whitelist). */
async function transferMessage(strapi, account, folder, uid, toFolder) {
  if (!toFolder || String(toFolder).toLowerCase() === String(folder).toLowerCase()) {
    throw new MailError('A different destination folder is required.', { status: 400, code: 'mail_bad_folder' });
  }
  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      await client.messageMove(String(uid), toFolder, { uid: true });
      return { moved: toFolder };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP move message' });
}

/** APPEND a draft to the Drafts folder (M1). Recipients may be empty. */
async function saveDraft(strapi, account, { to, cc, bcc, subject, html, text } = {}) {
  const composer = new MailComposer({
    from: account.from_name ? { name: account.from_name, address: account.email } : account.email,
    ...(normalizeAddressInput(to).length ? { to: normalizeAddressInput(to) } : {}),
    ...(normalizeAddressInput(cc).length ? { cc: normalizeAddressInput(cc) } : {}),
    ...(normalizeAddressInput(bcc).length ? { bcc: normalizeAddressInput(bcc) } : {}),
    subject: subject || '',
    ...(html ? { html } : {}),
    text: text || ' ',
  });
  const raw = await new Promise((resolve, reject) => {
    composer.compile().build((err, message) => (err ? reject(err) : resolve(message)));
  });
  return withAccount(strapi, account, async (client) => {
    let drafts = account.special_folders?.drafts || null;
    if (!drafts) {
      const folders = await client.list();
      drafts = detectSpecialFolders(folders).drafts || 'Drafts';
    }
    const res = await client.append(drafts, raw, ['\\Draft', '\\Seen']);
    return { savedTo: drafts, uid: res?.uid ?? null };
  }, { label: 'APPEND draft' });
}

/** STATUS (UNSEEN) per folder — the cron badge poll (M1). */
async function getUnseenCounts(strapi, account, folders = ['INBOX']) {
  return withAccount(strapi, account, async (client) => {
    const out = {};
    for (const f of folders) {
      try {
        const st = await client.status(f, { unseen: true });
        out[f] = st?.unseen ?? 0;
      } catch {
        // Folder may not exist on this server — skip, never fail the sweep.
      }
    }
    return out;
  }, { label: 'IMAP STATUS' });
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

  return withAccount(strapi, account, async (client) => {
    const lock = await client.getMailboxLock(folder);
    try {
      if (addFlags.length) await client.messageFlagsAdd(String(uid), addFlags, { uid: true });
      if (removeFlags.length) await client.messageFlagsRemove(String(uid), removeFlags, { uid: true });
      return { ok: true, added: addFlags, removed: removeFlags };
    } finally {
      lock.release();
    }
  }, { label: 'IMAP set flags' });
}

/** Move to Trash; already in Trash (or no Trash exists) → expunge. */
async function removeMessage(strapi, account, folder, uid) {
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
        await client.messageDelete(String(uid), { uid: true });
        return { deleted: true };
      }
      await client.messageMove(String(uid), trash, { uid: true });
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

  // Raw RFC822 built once, WITHOUT a Bcc header, then reused for SMTP (with an
  // explicit envelope that includes bcc) and for the Sent APPEND.
  const composer = new MailComposer({
    from: account.from_name ? { name: account.from_name, address: account.email } : account.email,
    to: toList,
    ...(ccList.length ? { cc: ccList } : {}),
    subject: subject || '',
    ...(html ? { html } : {}),
    text: text || ' ',
    ...(account.reply_to ? { replyTo: account.reply_to } : {}),
    ...(inReplyTo ? { inReplyTo } : {}),
    ...(references ? { references } : {}),
    attachments: files,
  });
  const raw = await new Promise((resolve, reject) => {
    composer.compile().build((err, message) => (err ? reject(err) : resolve(message)));
  });
  const messageId = raw.toString('utf8', 0, Math.min(raw.length, 16_384)).match(/^Message-ID:\s*(<[^>]+>)/im)?.[1] || null;

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
  removeMessage,
  sendMessage,
  transferMessage,
  saveDraft,
  getUnseenCounts,
  fetchFullMessage,
};
