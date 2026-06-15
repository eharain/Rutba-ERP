'use strict';

const { createCoreService } = require('@strapi/strapi').factories;
const crypto = require('crypto');
const providers = require('../../../social-providers');
const base = require('../../../social-providers/base');

const POST_UID = 'api::social-post.social-post';
const ACCOUNT_UID = 'api::social-account.social-account';
const REPLY_UID = 'api::social-reply.social-reply';

// platform_results key: stable per (platform, account) so re-publishing overwrites
// the previous attempt's row instead of appending duplicates.
const resultKey = (platform, accountDocumentId) => `${platform}#${accountDocumentId}`;

module.exports = createCoreService(POST_UID, ({ strapi }) => ({
  // ── account helpers ────────────────────────────────────────────────────────

  /** Full account row incl. private token fields (service reads aren't sanitized). */
  async _accountFull(documentId) {
    if (!documentId) return null;
    return strapi.documents(ACCOUNT_UID).findOne({ documentId });
  },

  /** Persist an adapter's accountPatch; extra_config is shallow-merged. */
  async _applyAccountPatch(account, patch) {
    if (!patch || typeof patch !== 'object') return account;
    const data = {};
    for (const k of [
      'access_token', 'refresh_token', 'token_expires_at',
      'platform_user_id', 'account_name', 'page_id', 'api_key', 'api_secret',
    ]) {
      if (patch[k] !== undefined) data[k] = patch[k];
    }
    if (patch.extra_config && typeof patch.extra_config === 'object') {
      data.extra_config = { ...(account.extra_config || {}), ...patch.extra_config };
    }
    if (Object.keys(data).length === 0) return account;
    return strapi.documents(ACCOUNT_UID).update({ documentId: account.documentId, data });
  },

  /** Refresh the access token if it is near expiry and the adapter supports it. */
  async _ensureFreshToken(account) {
    try {
      if (!base.tokenExpired(account, 300)) return account;
      const adapter = providers.getAdapter(account.platform);
      if (!adapter.capabilities?.oauth || typeof adapter.refreshToken !== 'function') return account;
      const patch = await adapter.refreshToken({ strapi, account });
      if (!patch) return account;
      strapi.log.info(`[social] refreshed ${account.platform} token for account ${account.documentId}`);
      return this._applyAccountPatch(account, patch);
    } catch (e) {
      strapi.log.warn(`[social] token refresh failed for ${account?.platform} ${account?.documentId}: ${e.message}`);
      return account;
    }
  },

  // ── post / media helpers ───────────────────────────────────────────────────

  async _loadPost(documentId, status = 'draft') {
    return strapi.documents(POST_UID).findOne({
      documentId,
      status,
      populate: ['cover', 'video', 'social_accounts'],
    });
  },

  _prepareMedia(post) {
    const cover = post.cover || null;
    const videos = Array.isArray(post.video) ? post.video : (post.video ? [post.video] : []);
    return {
      cover,
      coverUrl: base.absoluteMediaUrl(strapi, cover, { preferFormat: 'large' }),
      videos,
      videoUrls: videos.map((v) => base.absoluteMediaUrl(strapi, v)).filter(Boolean),
    };
  },

  /**
   * Accounts to publish to: linked social_accounts whose platform is selected on
   * the post and that are active. Also reports platforms the user picked but has
   * no active linked account for (recorded as errors so the UI explains the gap).
   */
  _resolveTargets(post) {
    const platforms = Array.isArray(post.platforms) ? post.platforms : [];
    const linked = Array.isArray(post.social_accounts) ? post.social_accounts : [];
    const targets = [];
    const covered = new Set();
    for (const acc of linked) {
      if (!platforms.includes(acc.platform)) continue;
      if (acc.is_active === false) continue;
      targets.push({ documentId: acc.documentId, platform: acc.platform, account_name: acc.account_name });
      covered.add(acc.platform);
    }
    const missing = platforms.filter((p) => !covered.has(p));
    return { targets, missing };
  },

  // ── publish ────────────────────────────────────────────────────────────────

  async publishToProviders(documentId) {
    const post = await this._loadPost(documentId, 'draft');
    if (!post) throw new Error('Post not found');

    const { targets, missing } = this._resolveTargets(post);
    const media = this._prepareMedia(post);
    const results = { ...(post.platform_results || {}) };

    if (targets.length === 0 && missing.length === 0) {
      throw new Error('Select at least one platform with a linked, active account before publishing.');
    }

    // mark publishing
    await strapi.documents(POST_UID).update({
      documentId, data: { post_status: 'publishing' },
    });

    let successes = 0;
    for (const t of targets) {
      const key = resultKey(t.platform, t.documentId);
      try {
        let account = await this._accountFull(t.documentId);
        account = await this._ensureFreshToken(account);
        const adapter = providers.getAdapter(t.platform);
        if (!adapter.capabilities?.publish) {
          throw new base.ProviderError(`${adapter.label} does not support publishing via API`, { platform: t.platform });
        }
        const out = await adapter.publishPost({ strapi, account, post, media });
        results[key] = {
          status: 'success',
          platform: t.platform,
          account_id: t.documentId,
          account_name: t.account_name,
          platform_post_id: out?.platformPostId || null,
          url: out?.url || null,
          error: null,
          at: new Date().toISOString(),
        };
        successes += 1;
      } catch (e) {
        results[key] = {
          status: 'error',
          platform: t.platform,
          account_id: t.documentId,
          account_name: t.account_name,
          platform_post_id: null,
          url: null,
          error: this._msg(e),
          at: new Date().toISOString(),
        };
        strapi.log.warn(`[social] publish ${t.platform}/${t.account_name} failed: ${this._msg(e)}`);
      }
    }

    for (const platform of missing) {
      results[resultKey(platform, 'none')] = {
        status: 'error', platform, account_id: null, account_name: null,
        platform_post_id: null, url: null,
        error: 'No active connected account for this platform', at: new Date().toISOString(),
      };
    }

    const attempted = targets.length + missing.length;
    const post_status = successes === 0 ? 'failed'
      : successes === attempted ? 'published'
      : 'partially_published';

    await strapi.documents(POST_UID).update({
      documentId,
      data: {
        platform_results: results,
        post_status,
        published_at_social: successes > 0 ? new Date().toISOString() : post.published_at_social || null,
      },
    });

    // Mirror to the published entry so the post is "live" in CMS too.
    if (successes > 0) {
      try { await strapi.documents(POST_UID).publish({ documentId }); }
      catch (e) { strapi.log.warn(`[social] CMS publish after social publish failed: ${e.message}`); }
    }

    return { post_status, successes, attempted, platform_results: results };
  },

  // ── unpublish (best-effort delete from each platform) ──────────────────────

  async unpublishFromProviders(documentId) {
    const post = await this._loadPost(documentId, 'draft');
    if (!post) throw new Error('Post not found');
    const results = { ...(post.platform_results || {}) };

    for (const [key, val] of Object.entries(results)) {
      if (!val || val.status !== 'success' || !val.platform_post_id || !val.account_id) continue;
      try {
        const adapter = providers.getAdapter(val.platform);
        if (!adapter.capabilities?.delete) {
          results[key] = { ...val, status: 'removed', note: `${adapter.label} keeps the post (no delete API)` };
          continue;
        }
        let account = await this._accountFull(val.account_id);
        account = await this._ensureFreshToken(account);
        await adapter.deletePost({ strapi, account, platformPostId: val.platform_post_id });
        results[key] = { ...val, status: 'removed', error: null, at: new Date().toISOString() };
      } catch (e) {
        results[key] = { ...val, status: 'error', error: this._msg(e) };
        strapi.log.warn(`[social] unpublish ${val.platform} failed: ${this._msg(e)}`);
      }
    }

    await strapi.documents(POST_UID).update({
      documentId, data: { platform_results: results, post_status: 'draft', published_at_social: null },
    });
    try { await strapi.documents(POST_UID).unpublish({ documentId }); }
    catch (e) { strapi.log.warn(`[social] CMS unpublish failed: ${e.message}`); }

    return { platform_results: results };
  },

  // ── inbound: fetch comments/replies from each platform ─────────────────────

  async syncRepliesForPost(documentId) {
    const post = await this._loadPost(documentId, 'draft');
    if (!post) throw new Error('Post not found');
    const results = post.platform_results || {};
    let imported = 0;

    for (const val of Object.values(results)) {
      if (!val || val.status === 'error' || !val.platform_post_id || !val.account_id) continue;
      try {
        const adapter = providers.getAdapter(val.platform);
        if (!adapter.capabilities?.comments) continue;
        let account = await this._accountFull(val.account_id);
        account = await this._ensureFreshToken(account);
        const since = post.replies_synced_at ? new Date(post.replies_synced_at) : null;
        const comments = await adapter.fetchComments({
          strapi, account, post, platformPostId: val.platform_post_id, since,
        });
        for (const c of comments || []) {
          if (!c || !c.platformCommentId) continue;
          const created = await this._upsertReply(post, val.platform, c);
          if (created) imported += 1;
        }
      } catch (e) {
        strapi.log.warn(`[social] sync replies ${val.platform} failed: ${this._msg(e)}`);
      }
    }

    await strapi.documents(POST_UID).update({
      documentId, data: { replies_synced_at: new Date().toISOString() },
    });
    return { imported };
  },

  /** Create a social-reply row if its platform_comment_id is new. Returns true if created. */
  async _upsertReply(post, platform, c) {
    const existing = await strapi.db.query(REPLY_UID).findOne({
      where: { platform_comment_id: String(c.platformCommentId) },
      select: ['id'],
    });
    if (existing) return false;
    await strapi.documents(REPLY_UID).create({
      data: {
        body: c.body || '',
        platform,
        platform_comment_id: String(c.platformCommentId),
        parent_comment_id: c.parentCommentId ? String(c.parentCommentId) : null,
        author_name: c.authorName || null,
        author_handle: c.authorHandle || null,
        author_avatar_url: c.authorAvatarUrl || null,
        is_outbound: !!c.isOutbound,
        replied_at: c.repliedAt || new Date().toISOString(),
        social_post: post.documentId,
      },
    });
    return true;
  },

  // ── outbound: post a reply to a platform comment thread ────────────────────

  async sendReply({ postDocumentId, accountDocumentId, parentReplyDocumentId, parentCommentId, body }) {
    if (!body || !body.trim()) throw new Error('Reply body is required');
    const post = await this._loadPost(postDocumentId, 'draft');
    if (!post) throw new Error('Post not found');

    let account = await this._accountFull(accountDocumentId);
    if (!account) throw new Error('Account not found');

    // platform_post_id for this account on this post
    const results = post.platform_results || {};
    const row = Object.values(results).find(
      (v) => v && v.account_id === accountDocumentId && v.platform_post_id
    );
    if (!row) throw new Error('This post has not been published to the selected account yet.');

    // resolve the parent comment id from a stored reply when not passed explicitly
    let parentId = parentCommentId || null;
    if (!parentId && parentReplyDocumentId) {
      const parent = await strapi.documents(REPLY_UID).findOne({ documentId: parentReplyDocumentId });
      parentId = parent?.platform_comment_id || null;
    }

    account = await this._ensureFreshToken(account);
    const adapter = providers.getAdapter(account.platform);
    if (!adapter.capabilities?.reply) {
      throw new Error(`${adapter.label} does not support replying via API`);
    }
    const out = await adapter.postReply({
      strapi, account, post, platformPostId: row.platform_post_id, parentCommentId: parentId, body: body.trim(),
    });

    const reply = await strapi.documents(REPLY_UID).create({
      data: {
        body: body.trim(),
        platform: account.platform,
        platform_comment_id: out?.platformCommentId ? String(out.platformCommentId) : null,
        parent_comment_id: parentId ? String(parentId) : null,
        author_name: account.account_name || null,
        is_outbound: true,
        replied_at: new Date().toISOString(),
        social_post: post.documentId,
        ...(parentReplyDocumentId ? { parent_reply: parentReplyDocumentId } : {}),
      },
    });
    return reply;
  },

  // ── OAuth connect ──────────────────────────────────────────────────────────

  async buildConnectUrl(accountDocumentId) {
    const account = await this._accountFull(accountDocumentId);
    if (!account) throw new Error('Account not found');
    const adapter = providers.getAdapter(account.platform);
    if (!adapter.capabilities?.oauth) throw new Error(`${adapter.label} OAuth is not supported`);

    // state binds the callback to this account and carries a nonce we verify.
    const nonce = crypto.randomBytes(16).toString('hex');
    const state = `${account.documentId}.${nonce}`;
    // X (PKCE) recomputes its code_verifier from extra_config.oauth_state — keep them equal.
    await this._applyAccountPatch(account, { extra_config: { oauth_state: state, oauth_nonce: nonce } });

    const url = adapter.getAuthUrl({ strapi, account, state });
    return { url };
  },

  async handleOAuthCallback({ state, code, error, error_description }) {
    if (error) throw new Error(error_description || error);
    if (!state || !code) throw new Error('Missing state or code');
    const [accountDocumentId, nonce] = String(state).split('.');
    const account = await this._accountFull(accountDocumentId);
    if (!account) throw new Error('Unknown account in OAuth state');
    if (base.extra(account, 'oauth_nonce') && base.extra(account, 'oauth_nonce') !== nonce) {
      throw new Error('OAuth state mismatch');
    }
    const adapter = providers.getAdapter(account.platform);
    const patch = await adapter.exchangeCode({ strapi, account, code, state });
    const updated = await this._applyAccountPatch(account, {
      ...patch,
      extra_config: { ...(patch?.extra_config || {}), connected_at: new Date().toISOString() },
    });
    // activate + stamp connection on successful connect
    await strapi.documents(ACCOUNT_UID).update({
      documentId: account.documentId,
      data: { is_active: true, last_connected_at: new Date().toISOString() },
    });
    return { platform: account.platform, account_name: updated.account_name || account.account_name };
  },

  /** Lightweight "is this account usable" probe used by the Test button + cron. */
  async validateConnection(accountDocumentId) {
    let account = await this._accountFull(accountDocumentId);
    if (!account) throw new Error('Account not found');
    if (!account.access_token) return { ok: false, reason: 'No access token — connect the account first.' };
    account = await this._ensureFreshToken(account);
    return { ok: true, platform: account.platform, account_name: account.account_name, token_expires_at: account.token_expires_at || null };
  },

  async refreshAccountToken(accountDocumentId) {
    const account = await this._accountFull(accountDocumentId);
    if (!account) throw new Error('Account not found');
    const adapter = providers.getAdapter(account.platform);
    if (typeof adapter.refreshToken !== 'function') return { refreshed: false };
    const patch = await adapter.refreshToken({ strapi, account });
    if (!patch) return { refreshed: false };
    await this._applyAccountPatch(account, patch);
    return { refreshed: true };
  },

  // ── cron drivers ───────────────────────────────────────────────────────────

  async publishDueScheduled() {
    const now = new Date().toISOString();
    const due = await strapi.db.query(POST_UID).findMany({
      where: { post_status: 'scheduled', scheduled_at: { $lte: now } },
      select: ['documentId', 'id'],
      limit: 25,
    });
    for (const p of due) {
      try {
        strapi.log.info(`[social] cron publishing scheduled post ${p.documentId}`);
        await this.publishToProviders(p.documentId);
      } catch (e) {
        strapi.log.warn(`[social] cron publish ${p.documentId} failed: ${this._msg(e)}`);
      }
    }
    return { published: due.length };
  },

  async syncRepliesForAllPublished() {
    const posts = await strapi.db.query(POST_UID).findMany({
      where: { post_status: { $in: ['published', 'partially_published'] } },
      select: ['documentId'],
      orderBy: { updatedAt: 'desc' },
      limit: 50,
    });
    let total = 0;
    for (const p of posts) {
      try {
        const r = await this.syncRepliesForPost(p.documentId);
        total += r.imported || 0;
      } catch (e) {
        strapi.log.warn(`[social] cron sync ${p.documentId} failed: ${this._msg(e)}`);
      }
    }
    return { posts: posts.length, imported: total };
  },

  async refreshExpiringTokens() {
    const accounts = await strapi.db.query(ACCOUNT_UID).findMany({
      where: { is_active: true, token_expires_at: { $notNull: true } },
      select: ['documentId', 'platform', 'token_expires_at'],
    });
    let refreshed = 0;
    for (const a of accounts) {
      if (!base.tokenExpired(a, 3600)) continue;
      const full = await this._accountFull(a.documentId);
      const after = await this._ensureFreshToken(full);
      if (after !== full) refreshed += 1;
    }
    return { refreshed };
  },

  _msg(e) {
    if (!e) return 'Unknown error';
    if (e instanceof base.ProviderError && e.status) return `${e.message} (HTTP ${e.status})`;
    return e.message || String(e);
  },
}));
