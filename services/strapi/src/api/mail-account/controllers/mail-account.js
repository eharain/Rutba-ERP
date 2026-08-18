'use strict';

// mail-account controller — account CRUD plus the live-IMAP surface.
//
// Handler names are constrained twice (the campaigns lesson): the api-provider
// descriptor `action` must equal the handler name, AND the api-pro seeder only
// walks verb-whitelisted method names (validate*/list*/get*/set*/remove*/send*
// pass; move*/import*/test* do not).
//
// Access model: requireAppRole gates the `mail` domain, then ensureAccess
// checks the account itself — super-admin OR mail_admin OR caller ∈ owners.
// Personal accounts have exactly one owner.

const { createCoreController } = require('@strapi/strapi').factories;
const { requireAppRole, hasAppRole } = require('../../../utils/require-admin');
const gateway = require('../../../utils/mail/gateway');
const { encrypt } = require('../../../utils/mail/crypto');
const { sanitizeSignature } = require('../../../utils/mail/sanitize');

const UID = 'api::mail-account.mail-account';
const ALL_LEVELS = ['admin', 'manager', 'staff'];
const MANAGE_LEVELS = ['admin', 'manager'];

const gate = (ctx, strapi, levels) => requireAppRole(ctx, strapi, { domains: ['mail'], levels });

/** Query flags arrive as strings ('1'/'true') — one reading for every route. */
const truthy = (v) => v === '1' || v === 'true' || v === true;

// Core routes bind the document id as `:id` (the VALUE is a documentId, the
// param name is not); our custom routes declare `:documentId`. Accept either.
const docIdParam = (ctx) => ctx.params?.documentId ?? ctx.params?.id;

function fail(ctx, e) {
  const status = e?.status || 502;
  return ctx.send({ error: e?.code || 'error', message: e?.message || 'Request failed.' }, status);
}

/**
 * Move plaintext password fields into encrypted columns, in place.
 * A missing/empty password leaves the stored ciphertext untouched (deleting
 * the `_enc` keys here is what makes a password-less PUT safe), and clients
 * can never write ciphertext directly.
 */
function applyCredentialFields(data) {
  for (const src of ['imap_password', 'smtp_password']) {
    const enc = `${src}_enc`;
    const value = data[src];
    delete data[src];
    delete data[enc];
    if (typeof value === 'string' && value.trim()) data[enc] = encrypt(value);
  }
}

// `owners` targets plugin::users-permissions.user, which the content-API input
// validator rejects ("Invalid key") unless the role can read UP users — a
// grant we deliberately never make. The crm-lead assigned_to discipline: strip
// it from the body before core validation, apply server-side via the query
// layer. Returns undefined when the request didn't mention owners at all.
function popOwners(ctx) {
  const data = ctx.request?.body?.data;
  if (!data || !Object.prototype.hasOwnProperty.call(data, 'owners')) return undefined;
  const value = data.owners;
  delete data.owners;
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? v.id ?? v.documentId : v))
    .filter((v) => v !== null && v !== undefined && v !== '');
}

/**
 * Normalized access_roles keys that do NOT exist as active app-roles.
 * Returns null when the input isn't an array; [] when every key is valid.
 * One validator shared by create/update, setAccess, and createProvision so a
 * typo'd role key is a 400 everywhere instead of silently granting nobody.
 */
async function unknownAccessRoleKeys(strapi, value) {
  if (!Array.isArray(value)) return null;
  const keys = value.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean);
  if (!keys.length) return [];
  const found = await strapi.db.query('plugin::api-pro.app-role').findMany({
    where: { key: { $in: keys }, isActive: true },
    select: ['key'],
  });
  const known = new Set(found.map((r) => r.key));
  return keys.filter((k) => !known.has(k));
}

/** Resolve owner refs (numeric ids or documentIds) and link them. */
async function applyOwners(strapi, documentId, refs) {
  const ids = [];
  for (const ref of refs) {
    const where = /^\d+$/.test(String(ref)) ? { id: Number(ref) } : { documentId: String(ref) };
    const found = await strapi.db.query('plugin::users-permissions.user').findOne({ where, select: ['id'] });
    if (found) ids.push(found.id);
  }
  try {
    await strapi.db.query(UID).update({ where: { documentId }, data: { owners: ids } });
  } catch (e) {
    // services/core's compat query layer rejects relation writes ("scalar cache
    // columns only") — its documents() handles them. services/strapi never lands
    // here, so the proven db.query path stays primary.
    await strapi.documents(UID).update({ documentId, data: { owners: ids } });
  }
  return ids;
}

module.exports = createCoreController(UID, ({ strapi }) => {

  const isMailAdmin = (userId) => hasAppRole(strapi, userId, { domains: ['mail'], levels: ['admin'] });

  /** Load + authorize one account. Sends the error response itself on failure. */
  async function ensureAccess(ctx, user, documentId) {
    const account = await strapi.service(UID).loadWithOwners(documentId);
    if (!account) {
      ctx.send({ error: 'not_found', message: 'Mail account not found.' }, 404);
      return null;
    }
    if (await strapi.service(UID).canAccess(user.id, account)) return account;
    ctx.forbidden('You do not have access to this mail account.');
    return null;
  }

  return {

    /* ------------------------------------------------------------- CRUD */

    async find(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      if (!(await isMailAdmin(user.id))) {
        // The content-API filter sanitizer silently DROPS filters on UP-user
        // relations — an `owners` filter in ctx.query would vanish and show
        // staff every account. Resolve the allowed set through the trusted
        // query layer instead (owners + access_roles), then constrain by
        // documentId (plain attribute, survives sanitization). Client filters
        // still apply on top.
        const mine = (await strapi.service(UID).accessibleAccountIds(user.id)).map((documentId) => ({ documentId }));
        if (mine.length === 0) {
          return ctx.send({ data: [], meta: { pagination: { page: 1, pageSize: 25, pageCount: 0, total: 0 } } });
        }
        const q = ctx.query || {};
        ctx.query = {
          ...q,
          filters: {
            $and: [
              ...(q.filters ? [q.filters] : []),
              { documentId: { $in: mine.map((r) => r.documentId) } },
            ],
          },
        };
      }
      return super.find(ctx);
    },

    async findOne(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      if (!(await ensureAccess(ctx, user, docIdParam(ctx)))) return;
      return super.findOne(ctx);
    },

    async create(ctx) {
      const user = await gate(ctx, strapi, MANAGE_LEVELS);
      if (!user) return;
      const data = { ...(ctx.request.body?.data || {}) };
      ctx.request.body = { ...(ctx.request.body || {}), data };
      const requestedOwners = popOwners(ctx);
      try {
        applyCredentialFields(data);
      } catch (e) {
        return fail(ctx, e);
      }
      if (!data.imap_password_enc) {
        return ctx.send({ error: 'mail_no_password', message: 'An IMAP password is required.' }, 400);
      }
      if (typeof data.signature_html === 'string') data.signature_html = sanitizeSignature(data.signature_html);
      if (data.access_roles !== undefined) {
        const bad = await unknownAccessRoleKeys(strapi, data.access_roles);
        if (bad === null) return ctx.send({ error: 'mail_bad_request', message: 'access_roles must be an array of role keys.' }, 400);
        if (bad.length) return ctx.send({ error: 'mail_bad_roles', message: `Unknown or inactive role keys: ${bad.join(', ')}` }, 400);
      }

      const response = await super.create(ctx);
      const documentId = response?.data?.documentId;
      if (documentId) {
        let owners = requestedOwners !== undefined && requestedOwners.length ? requestedOwners : [user.id];
        if (data.kind !== 'shared') owners = owners.slice(0, 1);
        await applyOwners(strapi, documentId, owners);
      }
      return response;
    },

    async update(ctx) {
      const user = await gate(ctx, strapi, MANAGE_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, docIdParam(ctx));
      if (!account) return;
      const data = { ...(ctx.request.body?.data || {}) };
      ctx.request.body = { ...(ctx.request.body || {}), data };
      const requestedOwners = popOwners(ctx);
      try {
        applyCredentialFields(data);
      } catch (e) {
        return fail(ctx, e);
      }
      if (typeof data.signature_html === 'string') data.signature_html = sanitizeSignature(data.signature_html);
      if (data.access_roles !== undefined) {
        const bad = await unknownAccessRoleKeys(strapi, data.access_roles);
        if (bad === null) return ctx.send({ error: 'mail_bad_request', message: 'access_roles must be an array of role keys.' }, 400);
        if (bad.length) return ctx.send({ error: 'mail_bad_roles', message: `Unknown or inactive role keys: ${bad.join(', ')}` }, 400);
      }

      // Connection settings may have changed — drop any pooled client.
      gateway.evictAccount(docIdParam(ctx));
      const response = await super.update(ctx);
      if (requestedOwners !== undefined && response?.data?.documentId) {
        const nextKind = data.kind || account.kind;
        let owners = requestedOwners.length ? requestedOwners : [user.id];
        if (nextKind !== 'shared') owners = owners.slice(0, 1);
        await applyOwners(strapi, response.data.documentId, owners);
      }
      return response;
    },

    async delete(ctx) {
      const user = await gate(ctx, strapi, ['admin']);
      if (!user) return;
      gateway.evictAccount(docIdParam(ctx));
      return super.delete(ctx);
    },

    /* ------------------------------------------------- live IMAP surface */

    /**
     * POST /mail-accounts/validate-connection
     * Body: settings (+ optional documentId to reuse stored passwords/settings).
     * Unpooled probe; on success against a saved account, caches the detected
     * special folders.
     */
    async validateConnection(ctx) {
      const user = await gate(ctx, strapi, MANAGE_LEVELS);
      if (!user) return;
      const body = ctx.request.body || {};
      const settings = { ...(body.settings || body) };
      const documentId = body.documentId || null;
      delete settings.documentId;

      try {
        let account = null;
        if (documentId) {
          account = await ensureAccess(ctx, user, documentId);
          if (!account) return;
          for (const k of ['email', 'imap_host', 'imap_port', 'imap_secure', 'imap_username',
            'smtp_host', 'smtp_port', 'smtp_secure', 'smtp_username']) {
            if (settings[k] === undefined || settings[k] === '' || settings[k] === null) settings[k] = account[k];
          }
          if (!String(settings.imap_password || '').trim()) {
            try {
              const creds = await strapi.service(UID).credsFor(documentId);
              settings.imap_password = creds.imapPassword;
              if (!String(settings.smtp_password || '').trim()) settings.smtp_password = creds.smtpPassword;
            } catch {
              // No stored password — testConnection will report it cleanly.
            }
          }
        }

        const result = await gateway.testConnection(settings);

        if (account) {
          await strapi.documents(UID).update({
            documentId: account.documentId,
            data: {
              ...(result.imap.ok
                ? { special_folders: result.specialFolders, last_checked_at: new Date() }
                : {}),
              last_error: result.ok ? null : result.imap.error || result.smtp.error,
            },
          });
        }
        return ctx.send(result);
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** GET /mail-accounts/:documentId/folders */
    async listFolders(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      try {
        const result = await gateway.listFolders(strapi, account);
        const cached = JSON.stringify(account.special_folders || {});
        if (JSON.stringify(result.specialFolders) !== cached) {
          await strapi.documents(UID).update({
            documentId: account.documentId,
            data: { special_folders: result.specialFolders, last_checked_at: new Date(), last_error: null },
          });
        }
        return ctx.send(result);
      } catch (e) {
        strapi.documents(UID)
          .update({ documentId: account.documentId, data: { last_error: e?.message || 'IMAP error' } })
          .catch(() => {});
        return fail(ctx, e);
      }
    },

    /**
     * GET /mail-accounts/:documentId/messages
     * ?folder=&page=&pageSize=&search=  plus the advanced filters:
     * &unread=1&flagged=1&from=&to=&subject=&since=&before=&tag=rt_x —
     * all AND-combined into one server-side IMAP SEARCH.
     */
    async listMessages(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const {
        folder = 'INBOX', page, pageSize, search,
        unread, flagged, from, to, subject, since, before, tag,
      } = ctx.query || {};
      try {
        return ctx.send(await gateway.listMessages(strapi, account, folder, {
          page, pageSize, search,
          unread: truthy(unread), flagged: truthy(flagged),
          from, to, subject, since, before, tag,
        }));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * GET /mail-accounts/:documentId/messages/:uid?folder=&markSeen=1&forEdit=1
     *
     * Reading is a peek: \Seen is set only when markSeen says so, which is
     * what makes "mark as read" a decision the client owns rather than a side
     * effect of opening the pane. forEdit returns the body ready to go back
     * into the composer (draft resume).
     */
    async getMessage(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', markSeen, forEdit } = ctx.query || {};
      try {
        return ctx.send(await gateway.getMessage(strapi, account, folder, ctx.params.uid, {
          markSeen: truthy(markSeen),
          forEdit: truthy(forEdit),
        }));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * GET /mail-accounts/:documentId/messages/:uid/attachment?folder=&part=&mimePart=
     * `part` is the index within the message's attachment list; `mimePart` is
     * the IMAP part number, which turns this into a single-part fetch instead
     * of another full download of the message.
     */
    async getAttachment(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', part, mimePart } = ctx.query || {};
      if (part === undefined) {
        return ctx.send({ error: 'mail_bad_request', message: 'The `part` query parameter is required.' }, 400);
      }
      // Part numbers are dotted digits and nothing else — never let a client
      // hand an arbitrary string to the FETCH builder.
      if (mimePart !== undefined && mimePart !== '' && !/^\d+(\.\d+)*$/.test(String(mimePart))) {
        return ctx.send({ error: 'mail_bad_request', message: 'Invalid `mimePart`.' }, 400);
      }
      try {
        return ctx.send(await gateway.getAttachment(strapi, account, folder, ctx.params.uid, part, {
          mimePart: mimePart || null,
        }));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * GET /mail-accounts/:documentId/unseen?folders=INBOX,Archive
     * One pooled STATUS sweep over the folders the client is actually showing,
     * so badges refresh (and decrement) while the page is open instead of
     * waiting on the 2-minute cron.
     *
     * The written map doubles as the cron's folder set: whatever the client
     * last asked about is what the background sweep keeps warm afterwards.
     */
    async listUnseen(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const folders = String(ctx.query?.folders || 'INBOX')
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean);
      try {
        const counts = await gateway.getUnseenCounts(strapi, account, folders);
        const checked_at = new Date().toISOString();
        await strapi.documents(UID).update({
          documentId: account.documentId,
          data: { unseen_counts: { ...counts, checked_at }, last_checked_at: new Date() },
        }).catch(() => { /* the live counts are the answer; caching them is best-effort */ });
        return ctx.send({ counts, checked_at });
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-accounts/:documentId/messages/:uid/flags  Body: {folder, add, remove} */
    async setFlags(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', add = [], remove = [] } = ctx.request.body || {};
      try {
        return ctx.send(await gateway.setFlags(strapi, account, folder, ctx.params.uid, { add, remove }));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-accounts/:documentId/messages/:uid/remove  Body: {folder} */
    async removeMessage(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX' } = ctx.request.body || {};
      try {
        return ctx.send(await gateway.removeMessage(strapi, account, folder, ctx.params.uid));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /* -------------------------------------------- bulk ops + tags (P0) */

    /** POST /mail-accounts/:documentId/messages/bulk-flags  Body: {folder, uids, add, remove} */
    async setBulkFlags(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', uids, add = [], remove = [] } = ctx.request.body || {};
      try {
        return ctx.send(await gateway.setFlags(strapi, account, folder, uids, { add, remove }));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-accounts/:documentId/messages/bulk-remove  Body: {folder, uids} */
    async removeBulkMessages(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', uids } = ctx.request.body || {};
      try {
        return ctx.send(await gateway.removeMessage(strapi, account, folder, uids));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-accounts/:documentId/messages/bulk-transfer  Body: {folder, uids, targetFolder} */
    async transferBulkMessages(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', uids, targetFolder } = ctx.request.body || {};
      try {
        return ctx.send(await gateway.transferMessage(strapi, account, folder, uids, targetFolder));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * POST /mail-accounts/:documentId/messages/tags
     * Body: {folder, uids, add: [slug], remove: [slug]} — slugs must exist in
     * the mail-tag registry; the keyword then lives on the mail server.
     */
    async setTags(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', uids, add = [], remove = [] } = ctx.request.body || {};
      const wanted = [...add, ...remove].map((s) => String(s || '').trim()).filter(Boolean);
      if (wanted.length) {
        const known = await strapi.db.query('api::mail-tag.mail-tag').findMany({
          where: { slug: { $in: wanted } },
          select: ['slug'],
        });
        const have = new Set(known.map((r) => r.slug));
        const missing = wanted.filter((s) => !have.has(s));
        if (missing.length) {
          return ctx.send({ error: 'mail_bad_tag', message: `Unknown tags: ${missing.join(', ')}` }, 400);
        }
      }
      try {
        return ctx.send(await gateway.setTags(strapi, account, folder, uids, { add, remove }));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * POST /mail-accounts/:documentId/mailbox-password — regenerate the
     * mailbox password on its mail server (the 06 custody rule: shown ONCE
     * for webmail/phone use, stored only as ciphertext for the gateway).
     * Owners and mail admins only — provisioned (mailcow) accounts only,
     * resolved through the registry like every provisioning call.
     */
    async setMailboxPassword(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const documentId = docIdParam(ctx);
      const account = await strapi.service(UID).loadWithOwners(documentId);
      if (!account) return ctx.send({ error: 'not_found', message: 'Mail account not found.' }, 404);
      const owner = (account.owners || []).some((o) => o.id === user.id);
      if (!owner && !(await isMailAdmin(user.id))) {
        return ctx.forbidden('Only the mailbox owner or a mail admin can reset its password.');
      }
      if (account.provisioning_source !== 'mailcow') {
        return ctx.send({
          error: 'mail_not_provisioned',
          message: 'This mailbox is connected, not provisioned — reset its password with the provider, then update the connection here.',
        }, 400);
      }
      const mailcow = require('../../../utils/mailcow-client');
      const domain = String(account.email || '').split('@')[1] || '';
      const serverConfig = await strapi.service('api::mail-server.mail-server').resolveForEmailDomain(domain);
      const cfg = serverConfig ? { baseUrl: serverConfig.baseUrl, apiKey: serverConfig.apiKey } : undefined;
      try {
        const password = require('crypto').randomBytes(18).toString('base64url');
        await mailcow.request('POST', '/api/v1/edit/mailbox', {
          items: [account.email],
          attr: { password, password2: password },
        }, cfg);
        await strapi.db.query(UID).update({
          where: { documentId },
          data: { imap_password_enc: encrypt(password), smtp_password_enc: null },
        });
        gateway.evictAccount(documentId);
        // The ONE place a mailbox password is ever shown — to its owner, once.
        return ctx.send({ ok: true, email: account.email, password });
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-accounts/:documentId/send  Body: compose payload */
    async sendMessage(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      try {
        return ctx.send(await gateway.sendMessage(strapi, account, ctx.request.body || {}));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-accounts/:documentId/messages/:uid/transfer  Body: {folder, toFolder} */
    async transferMessage(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', toFolder } = ctx.request.body || {};
      try {
        return ctx.send(await gateway.transferMessage(strapi, account, folder, ctx.params.uid, toFolder));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /** POST /mail-accounts/:documentId/drafts  Body: compose payload (recipients optional) */
    async createDraft(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      try {
        return ctx.send(await gateway.saveDraft(strapi, account, ctx.request.body || {}));
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * POST /mail-accounts/:documentId/messages/:uid/import
     * Body: { folder, links: [{entityUid, targetDocumentId, kind}], triage: {status, assignTo} }
     * Idempotent — the import-on-link entry point (M2/M3).
     */
    async createImport(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const account = await ensureAccess(ctx, user, ctx.params.documentId);
      if (!account) return;
      const { folder = 'INBOX', links = [], triage = null } = ctx.request.body || {};
      try {
        const result = await strapi.service('api::mail-message.mail-message').importMessage({
          account, folder, uid: ctx.params.uid, links, triage, user,
        });
        return ctx.send(result);
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * POST /mail-accounts/provision — create a mailbox ON the company mailcow
     * server and connect it in one step (M5). mail_admin only: this creates
     * real infrastructure. The generated password exists only as ciphertext on
     * the new account row; users who want phone/webmail access reset it via
     * the mailcow flows (password custody rules in 06-mailcow-provisioning.md).
     */
    async createProvision(ctx) {
      const user = await gate(ctx, strapi, ['admin']);
      if (!user) return;
      const body = ctx.request.body?.data || ctx.request.body || {};
      const localPart = String(body.localPart || '').trim().toLowerCase();
      const domain = String(body.domain || '').trim().toLowerCase();
      const { name, kind = 'shared', quotaMb, serverId } = body;
      if (!localPart || !domain) {
        return ctx.send({ error: 'mail_bad_request', message: 'localPart and domain are required.' }, 400);
      }
      try {
        // Same resolution order as user-admin createMailbox: explicit server,
        // else the registry entry hosting this domain, else the MAILCOW_* env
        // server (provisionAccount's fallback) — ONE provisioning path.
        const serverSvc = strapi.service('api::mail-server.mail-server');
        let serverConfig = null;
        if (serverId) {
          serverConfig = await serverSvc.configFor(String(serverId));
          if (!serverConfig) return ctx.send({ error: 'not_found', message: 'Mail server not found.' }, 404);
          if (!serverConfig.isActive) return ctx.send({ error: 'mail_bad_request', message: 'Mail server is disabled.' }, 400);
        } else {
          serverConfig = await serverSvc.resolveForEmailDomain(domain);
        }

        const accessRoles = Array.isArray(body.access_roles) ? body.access_roles : undefined;
        if (accessRoles) {
          const bad = await unknownAccessRoleKeys(strapi, accessRoles);
          if (bad === null) return ctx.send({ error: 'mail_bad_request', message: 'access_roles must be an array of role keys.' }, 400);
          if (bad.length) return ctx.send({ error: 'mail_bad_roles', message: `Unknown or inactive role keys: ${bad.join(', ')}` }, 400);
        }

        const account = await strapi.service(UID).provisionAccount({
          localPart,
          domain,
          name,
          kind: kind === 'personal' ? 'personal' : 'shared',
          quotaMb,
          ownerUserIds: [user.id],
          accessRoles,
          serverConfig,
        });
        return ctx.send({ ok: true, account });
      } catch (e) {
        return fail(ctx, e);
      }
    },

    /**
     * GET /mail-accounts/server-defaults?domain=rutba.pk — connection
     * defaults for the Connect Mailbox form, from the mail-server registry.
     * Connection facts only (hosts/ports), never the admin API key; any mail
     * role may ask — knowing the IMAP host is not a privilege.
     */
    async getServerDefaults(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const domain = String(ctx.query.domain || '').trim().toLowerCase();
      if (!domain) {
        return ctx.send({ error: 'mail_bad_request', message: 'domain is required.' }, 400);
      }
      const cfg = await strapi.service('api::mail-server.mail-server').resolveForEmailDomain(domain);
      if (!cfg) return ctx.send({ found: false });
      return ctx.send({
        found: true,
        server: { name: cfg.name, kind: cfg.kind },
        settings: {
          imap_host: cfg.imapHost,
          imap_port: 993,
          imap_secure: true,
          smtp_host: cfg.smtpHost,
          smtp_port: 465,
          smtp_secure: true,
        },
      });
    },

    /**
     * GET /mail-accounts/access-map — the whole estate's access picture
     * (owners + access_roles per account) for the central apps/admin/console app.
     * Passwords/hosts stay out; this is a mapping view, not account admin.
     */
    async listAccess(ctx) {
      const user = await requireAppRole(ctx, strapi, { domains: ['mail', 'admin', 'users', 'auth'], levels: MANAGE_LEVELS });
      if (!user) return;
      const accounts = await strapi.db.query(UID).findMany({
        where: {},
        select: ['id', 'documentId', 'name', 'email', 'kind', 'is_active', 'provisioning_source', 'access_roles'],
        populate: { owners: { select: ['id', 'documentId', 'username', 'email', 'displayName'] } },
        orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      });
      return ctx.send({
        data: accounts.map((a) => ({
          id: a.id,
          documentId: a.documentId,
          name: a.name,
          email: a.email,
          kind: a.kind,
          is_active: a.is_active,
          provisioning_source: a.provisioning_source,
          access_roles: Array.isArray(a.access_roles) ? a.access_roles : [],
          owners: (a.owners || []).map((o) => ({
            id: o.id,
            documentId: o.documentId,
            username: o.username,
            email: o.email,
            displayName: o.displayName,
          })),
        })),
      });
    },

    /**
     * POST /mail-accounts/:documentId/access — replace an account's owners
     * and/or shared access_roles from the central apps/admin/console app. Personal
     * accounts keep exactly one owner; every access_roles key must exist as
     * an active app-role (closing the raw-json validation gap).
     */
    async setAccess(ctx) {
      const user = await requireAppRole(ctx, strapi, { domains: ['mail', 'admin', 'users', 'auth'], levels: ['admin'] });
      if (!user) return;
      const documentId = docIdParam(ctx);
      const account = await strapi.service(UID).loadWithOwners(documentId);
      if (!account) {
        return ctx.send({ error: 'not_found', message: 'Mail account not found.' }, 404);
      }
      const body = ctx.request.body?.data || ctx.request.body || {};

      let ownerIds;
      if (Object.prototype.hasOwnProperty.call(body, 'owners')) {
        const refs = (Array.isArray(body.owners) ? body.owners : [])
          .map((v) => (v && typeof v === 'object' ? v.id ?? v.documentId : v))
          .filter((v) => v !== null && v !== undefined && v !== '');
        ownerIds = account.kind === 'shared' ? refs : refs.slice(0, 1);
      }

      let roleKeys;
      if (Object.prototype.hasOwnProperty.call(body, 'access_roles')) {
        roleKeys = (Array.isArray(body.access_roles) ? body.access_roles : [])
          .map((k) => String(k || '').trim().toLowerCase())
          .filter(Boolean);
        if (roleKeys.length) {
          const unknown = await unknownAccessRoleKeys(strapi, roleKeys);
          if (unknown.length) {
            return ctx.send({
              error: 'mail_bad_roles',
              message: `Unknown or inactive role keys: ${unknown.join(', ')}`,
            }, 400);
          }
        }
        if (roleKeys.length && account.kind !== 'shared') {
          return ctx.send({
            error: 'mail_bad_request',
            message: 'access_roles apply to shared accounts only.',
          }, 400);
        }
      }

      if (ownerIds === undefined && roleKeys === undefined) {
        return ctx.send({ error: 'mail_bad_request', message: 'owners or access_roles is required.' }, 400);
      }

      if (roleKeys !== undefined) {
        await strapi.documents(UID).update({ documentId, data: { access_roles: roleKeys } });
      }
      if (ownerIds !== undefined) {
        await applyOwners(strapi, documentId, ownerIds);
      }

      const updated = await strapi.service(UID).loadWithOwners(documentId);
      return ctx.send({
        ok: true,
        account: {
          documentId: updated.documentId,
          kind: updated.kind,
          owners: (updated.owners || []).map((o) => ({ id: o.id, username: o.username })),
          access_roles: Array.isArray(updated.access_roles) ? updated.access_roles : [],
        },
      });
    },

    /** GET /mail-accounts/assignees — mail-domain role holders, for triage pickers. */
    async listAssignees(ctx) {
      const user = await gate(ctx, strapi, ALL_LEVELS);
      if (!user) return;
      const users = await strapi.db.query('plugin::users-permissions.user').findMany({
        where: { blocked: false, app_roles: { isActive: true, appDomains: { key: 'mail' } } },
        select: ['id', 'documentId', 'username', 'email'],
        orderBy: { username: 'asc' },
      });
      return ctx.send({
        data: users.map((u) => ({ id: u.id, documentId: u.documentId, username: u.username, email: u.email })),
      });
    },
  };
});
