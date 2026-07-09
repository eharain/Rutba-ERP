'use strict';

const { createCoreController } = require('@strapi/strapi').factories;
const crypto = require('crypto');
const { ensureUser } = require('../../../utils/ensure-user');
const { requireAppMember } = require('../../../utils/require-admin');

const POST_UID = 'api::social-post.social-post';

// Operations that act on the brand's live social presence (publish, delete,
// reply, sync) require a social app-role (admin/manager/staff) — this closes the
// "any logged-in user can publish" gap while still letting social staff operate.
// CMS draft ops + reads stay open to any authd user; webhooks are public.
const requireSocialMember = (ctx, strapi) => requireAppMember(ctx, strapi, 'social');

module.exports = createCoreController(POST_UID, ({ strapi }) => ({
  // ── CMS draft/publish (unchanged) ──────────────────────────────────────────
  async publish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents(POST_UID).publish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async unpublish(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents(POST_UID).unpublish({ documentId: ctx.params.id });
    return ctx.send(result);
  },
  async discardDraft(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const result = await strapi.documents(POST_UID).discardDraft({ documentId: ctx.params.id });
    return ctx.send(result);
  },

  // ── two-way provider integration ───────────────────────────────────────────

  /** Push the post to every selected, connected platform. */
  async publishSocial(ctx) {
    if (!await requireSocialMember(ctx, strapi)) return;
    try {
      const result = await strapi.service(POST_UID).publishToProviders(ctx.params.id);
      return ctx.send(result);
    } catch (e) {
      return ctx.badRequest(e.message || 'Publish failed');
    }
  },

  /** Best-effort delete from each platform + CMS unpublish. */
  async unpublishSocial(ctx) {
    if (!await requireSocialMember(ctx, strapi)) return;
    try {
      const result = await strapi.service(POST_UID).unpublishFromProviders(ctx.params.id);
      return ctx.send(result);
    } catch (e) {
      return ctx.badRequest(e.message || 'Unpublish failed');
    }
  },

  /** Pull fresh comments/replies from each platform into social-reply rows. */
  async syncReplies(ctx) {
    if (!await requireSocialMember(ctx, strapi)) return;
    try {
      const result = await strapi.service(POST_UID).syncRepliesForPost(ctx.params.id);
      return ctx.send(result);
    } catch (e) {
      return ctx.badRequest(e.message || 'Sync failed');
    }
  },

  /** Post an outbound reply to a platform comment thread. */
  async sendReply(ctx) {
    if (!await requireSocialMember(ctx, strapi)) return;
    const data = ctx.request.body?.data || ctx.request.body || {};
    try {
      const reply = await strapi.service(POST_UID).sendReply({
        postDocumentId: ctx.params.id,
        accountDocumentId: data.accountDocumentId || data.accountId,
        parentReplyDocumentId: data.parentReplyDocumentId || null,
        parentCommentId: data.parentCommentId || null,
        body: data.body,
      });
      return ctx.send({ data: reply });
    } catch (e) {
      return ctx.badRequest(e.message || 'Reply failed');
    }
  },

  /** Clone a post into a fresh draft, ready to re-publish (repost). */
  async duplicate(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    try {
      const post = await strapi.service(POST_UID).duplicatePost(ctx.params.id);
      return ctx.send({ data: post });
    } catch (e) {
      return ctx.badRequest(e.message || 'Duplicate failed');
    }
  },

  /** Return the post's replies (newest first). */
  async listReplies(ctx) {
    if (!await ensureUser(ctx, strapi)) return;
    const post = await strapi.documents(POST_UID).findOne({
      documentId: ctx.params.id,
      populate: { social_replies: { sort: ['replied_at:desc', 'createdAt:desc'] } },
    });
    return ctx.send({ data: post?.social_replies || [] });
  },

  // ── inbound webhooks (public; no ensureUser — hit by the platforms) ────────

  /** Subscription handshake (Facebook/Instagram hub.challenge). */
  async webhookVerify(ctx) {
    const cfg = strapi.config.get('social') || {};
    const mode = ctx.query['hub.mode'];
    const token = ctx.query['hub.verify_token'];
    const challenge = ctx.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === cfg.webhookVerifyToken) {
      ctx.body = challenge;
      return;
    }
    return ctx.forbidden('verify token mismatch');
  },

  /** Receive a change notification and sync the affected post(s). */
  async webhookReceive(ctx) {
    const platform = ctx.params.platform;
    try {
      if (!this._verifyWebhookSignature(ctx, platform)) {
        strapi.log.warn(`[social] webhook ${platform} bad signature`);
        return ctx.forbidden('bad signature');
      }
      const body = ctx.request.body || {};
      const postIds = this._extractWebhookPostIds(body);
      const affected = new Set();
      for (const pid of postIds) {
        const post = await this._findPostByPlatformPostId(pid);
        if (post && !affected.has(post.documentId)) {
          affected.add(post.documentId);
          // fire-and-forget so we ack the platform quickly
          strapi.service(POST_UID).syncRepliesForPost(post.documentId).catch((e) =>
            strapi.log.warn(`[social] webhook sync failed: ${e.message}`));
        }
      }
      ctx.body = { received: true, matched: affected.size };
    } catch (e) {
      strapi.log.warn(`[social] webhook ${platform} error: ${e.message}`);
      ctx.body = { received: true }; // always ack to avoid a retry storm
    }
  },

  _verifyWebhookSignature(ctx, platform) {
    // FB/IG sign the RAW request body with the app secret (X-Hub-Signature-256).
    // We verify against the exact bytes (config/middlewares.js includeUnparsed),
    // and fail CLOSED: no configured secret or no/invalid signature → reject, so
    // an unauthenticated caller can't drive provider sync work.
    const cfg = (strapi.config.get('social') || {}).providers || {};
    const secret = cfg[platform]?.clientSecret;
    if (!secret) {
      strapi.log.warn(`[social] webhook ${platform} rejected: no clientSecret configured`);
      return false;
    }
    const header = ctx.request.headers['x-hub-signature-256'];
    if (!header) return false;
    const raw = ctx.request.body?.[Symbol.for('unparsedBody')]
      ?? (ctx.request.body ? JSON.stringify(ctx.request.body) : '');
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw, 'utf8').digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
    } catch {
      return false;
    }
  },

  _extractWebhookPostIds(body) {
    const ids = new Set();
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      for (const ch of (entry.changes || [])) {
        const v = ch.value || {};
        if (v.post_id) ids.add(v.post_id);
        if (v.media?.id) ids.add(v.media.id);
        if (v.video_id) ids.add(v.video_id);
        if (v.parent_id) ids.add(v.parent_id);
      }
    }
    return [...ids];
  },

  async _findPostByPlatformPostId(platformPostId) {
    const posts = await strapi.db.query(POST_UID).findMany({
      where: { post_status: { $in: ['published', 'partially_published'] } },
      select: ['documentId', 'platform_results'],
      limit: 300,
    });
    return posts.find((p) =>
      Object.values(p.platform_results || {}).some(
        (v) => v && v.platform_post_id && String(v.platform_post_id) === String(platformPostId)
      )
    );
  },
}));
