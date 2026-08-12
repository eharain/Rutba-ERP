'use strict';

const { createCoreService } = require('@strapi/strapi').factories;
const crypto = require('crypto');
const providers = require('../../../social-providers');
const base = require('../../../social-providers/base');
const relays = require('../../../social-relays');

const POST_UID = 'api::social-post.social-post';
const ACCOUNT_UID = 'api::social-account.social-account';
const REPLY_UID = 'api::social-reply.social-reply';
const RELAY_UID = 'api::social-relay-provider.social-relay-provider';

// platform_results key: stable per (platform, account) so re-publishing overwrites
// the previous attempt's row instead of appending duplicates.
const resultKey = (platform, accountDocumentId) => `${platform}#${accountDocumentId}`;

// Relay rows share the map under a namespaced pseudo-account id, so a relay
// push and a direct-account push to the same platform never clobber each other.
const relayAccountId = (relayDocumentId) => `relay:${relayDocumentId}`;
const isRelayRow = (val) => !!val && String(val.account_id || '').startsWith('relay:');

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
      populate: ['cover', 'video', 'media', 'social_accounts'],
    });
  },

  /**
   * Flatten the post's media into what adapters consume. The `media` gallery
   * (images + videos) is merged on top of the dedicated `cover` (single image)
   * and `video` (videos) fields:
   *   - images   = cover first, then gallery images (deduped) → carousels/albums
   *   - videos   = video field, then gallery videos (deduped)
   * coverUrl/videoUrls stay for adapters that only take a single item.
   */
  _prepareMedia(post) {
    const cover = post.cover || null;
    const videoField = Array.isArray(post.video) ? post.video : (post.video ? [post.video] : []);
    const gallery = Array.isArray(post.media) ? post.media : (post.media ? [post.media] : []);

    const dedupe = (files) => {
      const out = [];
      const seen = new Set();
      for (const f of files) {
        if (!f) continue;
        const k = f.id != null ? `id:${f.id}` : `url:${f.url || ''}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(f);
      }
      return out;
    };

    const images = dedupe([cover, ...gallery.filter((f) => base.isImageFile(f))]);
    const videos = dedupe([...videoField, ...gallery.filter((f) => base.isVideoFile(f))]);

    return {
      cover,
      coverUrl: base.absoluteMediaUrl(strapi, cover, { preferFormat: 'large' }),
      images,
      imageUrls: images.map((f) => base.absoluteMediaUrl(strapi, f, { preferFormat: 'large' })).filter(Boolean),
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
      targets.push({
        documentId: acc.documentId,
        platform: acc.platform,
        account_name: acc.account_name,
        // No adapter for this platform means it can ONLY be browser-posted,
        // whatever connection_type says — a row created in the admin panel
        // defaults to 'api' and would otherwise hit getAdapter() and throw.
        browser: acc.connection_type === 'browser' || !providers.hasAdapter(acc.platform),
      });
      covered.add(acc.platform);
    }
    const missing = platforms.filter((p) => !covered.has(p));
    return { targets, missing };
  },

  // ── publish ────────────────────────────────────────────────────────────────

  async publishToProviders(documentId) {
    // What goes out is the PUBLISHED version, never the draft. Publish first
    // (draft → published) so the CMS-live copy and the content the adapters
    // push are the same bytes — then every reader of this post (the adapters
    // now, the desktop poster later) sees one version.
    try {
      await strapi.documents(POST_UID).publish({ documentId });
    } catch (e) {
      throw new Error(`Post not found or could not be published: ${this._msg(e)}`);
    }
    const post = await this._loadPost(documentId, 'published');
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
    let browserPending = 0;
    for (const t of targets) {
      const key = resultKey(t.platform, t.documentId);
      // Browser-connected accounts (WhatsApp, LinkedIn, …) are posted by the
      // Rutba Social Poster desktop app, not an API adapter — hand them off as
      // 'pending' (never downgrade an attempt the poster already confirmed).
      if (t.browser) {
        if (results[key]?.status !== 'success') {
          results[key] = {
            status: 'pending',
            platform: t.platform,
            account_id: t.documentId,
            account_name: t.account_name,
            platform_post_id: null,
            url: null,
            error: null,
            note: 'queued for the Rutba Social Poster desktop app',
            at: new Date().toISOString(),
          };
          browserPending += 1;
        } else {
          successes += 1; // already posted by the poster — counts as done
        }
        continue;
      }
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
    const failures = Object.values(results).filter((v) => v && v.status === 'error').length;
    // Browser handoffs aren't failures — the desktop poster finishes them and
    // recordBrowserResult upgrades the rollup when it does. `failures` is
    // returned separately so a caller can warn about API targets that DID fail;
    // the rollup alone can't express "some failed, some still in progress".
    const post_status = successes === attempted ? 'published'
      : successes > 0 ? 'partially_published'
      : browserPending > 0 ? 'publishing'
      : 'failed';

    const published_at_social = successes > 0 ? new Date().toISOString() : post.published_at_social || null;
    const outcome = { platform_results: results, post_status, published_at_social };

    await strapi.documents(POST_UID).update({ documentId, data: outcome });

    // Mirror the outcome onto the published row directly — no publish() here:
    // the entry was published BEFORE the push, and a second publish would leak
    // any draft edits made while the adapters ran. Row-level, like
    // recordBrowserResult, so the desktop poster sees the pending handoffs and
    // results on the copy it reads.
    try {
      const pubRow = await strapi.db.query(POST_UID).findOne({
        where: { documentId, publishedAt: { $notNull: true } },
        select: ['id'],
      });
      if (pubRow) await strapi.db.query(POST_UID).update({ where: { id: pubRow.id }, data: outcome });
    } catch (e) {
      strapi.log.warn(`[social] result mirror to published row failed: ${e.message}`);
    }

    return { post_status, successes, attempted, failures, browser_pending: browserPending, platform_results: results };
  },

  // ── relay publish (aggregator APIs — Ayrshare, Postiz, …) ──────────────────

  /**
   * Push the post through one or more relay providers. Each relay fans out to
   * its configured platforms (intersected with the post's platform selection
   * when the post has one) and every platform outcome lands in
   * platform_results keyed `${platform}#relay:${relayDocId}` — same shape as
   * direct-account rows, so the existing badges/rollups just work.
   */
  async publishToRelays(documentId, { relayIds = null, platforms: platformsOverride = null } = {}) {
    // Same invariant as publishToProviders: what goes out is the PUBLISHED
    // version, so publish the CMS copy first.
    try {
      await strapi.documents(POST_UID).publish({ documentId });
    } catch (e) {
      throw new Error(`Post not found or could not be published: ${this._msg(e)}`);
    }
    const post = await this._loadPost(documentId, 'published');
    if (!post) throw new Error('Post not found');

    let targets;
    if (Array.isArray(relayIds) && relayIds.length) {
      targets = (await Promise.all(relayIds.map((id) =>
        strapi.documents(RELAY_UID).findOne({ documentId: id })))).filter(Boolean);
    } else {
      targets = await strapi.documents(RELAY_UID).findMany({
        filters: { is_active: true }, sort: ['createdAt:asc'],
      });
    }
    targets = (targets || []).filter((r) => r.is_active !== false);
    if (!targets.length) {
      throw new Error('No active relay provider configured. Add one under Relays first.');
    }

    const media = this._prepareMedia(post);
    const results = { ...(post.platform_results || {}) };
    const postPlatforms = Array.isArray(post.platforms) ? post.platforms : [];
    const skipped = [];
    let successes = 0, failures = 0, pending = 0, attempted = 0;

    await strapi.documents(POST_UID).update({ documentId, data: { post_status: 'publishing' } });

    for (const relay of targets) {
      const label = relay.name || relay.provider;
      let adapter;
      try {
        adapter = relays.getRelayAdapter(relay.provider);
      } catch (e) {
        skipped.push({ relay: label, reason: this._msg(e) });
        continue;
      }

      // The relay's configured platform set drives the fan-out; the post's own
      // platform selection narrows it when present. An explicit override
      // (the per-push platform picker) wins over both.
      const configured = Array.isArray(relay.platforms) ? relay.platforms : [];
      let requested = Array.isArray(platformsOverride) && platformsOverride.length
        ? platformsOverride.filter((p) => configured.includes(p))
        : (postPlatforms.length ? configured.filter((p) => postPlatforms.includes(p)) : configured);
      if (!requested.length) {
        skipped.push({
          relay: label,
          reason: configured.length
            ? 'none of this relay\'s platforms are selected on the post'
            : 'no platforms configured on this relay',
        });
        continue;
      }

      // Platforms this provider can't post to get their own error rows.
      const unsupported = requested.filter((p) => !adapter.mapPlatform(p));
      requested = requested.filter((p) => adapter.mapPlatform(p));
      for (const p of unsupported) {
        results[resultKey(p, relayAccountId(relay.documentId))] = {
          status: 'error', platform: p,
          account_id: relayAccountId(relay.documentId), account_name: label,
          platform_post_id: null, url: null,
          error: `${adapter.label} does not support ${p}`,
          via: `relay:${relay.provider}`, relay_id: relay.documentId,
          at: new Date().toISOString(),
        };
        failures += 1; attempted += 1;
      }
      if (!requested.length) continue;

      attempted += requested.length;
      try {
        const out = await adapter.publishPost({ strapi, relay, post, media, platforms: requested });
        for (const p of requested) {
          const r = (out.perPlatform && out.perPlatform[p]) || { status: 'pending' };
          results[resultKey(p, relayAccountId(relay.documentId))] = {
            status: r.status || 'pending',
            platform: p,
            account_id: relayAccountId(relay.documentId),
            account_name: label,
            platform_post_id: r.platformPostId || null,
            url: r.url || null,
            error: r.error || null,
            ...(r.note ? { note: r.note } : {}),
            via: `relay:${relay.provider}`,
            relay_id: relay.documentId,
            relay_post_id: out.relayPostId || null,
            at: new Date().toISOString(),
          };
          if (r.status === 'success') successes += 1;
          else if (r.status === 'error') failures += 1;
          else pending += 1;
        }
      } catch (e) {
        for (const p of requested) {
          results[resultKey(p, relayAccountId(relay.documentId))] = {
            status: 'error', platform: p,
            account_id: relayAccountId(relay.documentId), account_name: label,
            platform_post_id: null, url: null,
            error: this._msg(e),
            via: `relay:${relay.provider}`, relay_id: relay.documentId,
            at: new Date().toISOString(),
          };
          failures += 1;
        }
        strapi.log.warn(`[social] relay publish ${relay.provider}/${label} failed: ${this._msg(e)}`);
      }
    }

    // Rollup over the FULL merged map (direct + relay rows) — a failed relay
    // run must not downgrade a post already live via direct accounts.
    const vals = Object.values(results).filter(Boolean);
    const anySuccess = vals.some((v) => v.status === 'success');
    const anyError = vals.some((v) => v.status === 'error');
    const anyPending = vals.some((v) => v.status === 'pending');
    const post_status = anySuccess && !anyError && !anyPending ? 'published'
      : anySuccess ? 'partially_published'
      : anyPending ? 'publishing'
      : anyError ? 'failed'
      : post.post_status;
    const published_at_social = anySuccess
      ? post.published_at_social || new Date().toISOString()
      : post.published_at_social || null;
    const outcome = { platform_results: results, post_status, published_at_social };

    await strapi.documents(POST_UID).update({ documentId, data: outcome });
    // Row-level mirror onto the published copy (no publish() — that would leak
    // draft edits made while the relays ran).
    try {
      const pubRow = await strapi.db.query(POST_UID).findOne({
        where: { documentId, publishedAt: { $notNull: true } },
        select: ['id'],
      });
      if (pubRow) await strapi.db.query(POST_UID).update({ where: { id: pubRow.id }, data: outcome });
    } catch (e) {
      strapi.log.warn(`[social] relay result mirror to published row failed: ${e.message}`);
    }

    return { post_status, successes, failures, pending, attempted, skipped, platform_results: results };
  },

  // ── unpublish (best-effort delete from each platform) ──────────────────────

  async unpublishFromProviders(documentId) {
    const post = await this._loadPost(documentId, 'draft');
    if (!post) throw new Error('Post not found');
    const results = { ...(post.platform_results || {}) };

    // Relay rows first: one delete per (relay, relay_post_id) — a single relay
    // post covers several platform rows, and the platform adapters below must
    // never see the relay's pseudo account_id.
    const deletedRelayPosts = new Set();
    for (const [key, val] of Object.entries(results)) {
      if (!isRelayRow(val)) continue;
      if (!['success', 'pending'].includes(val.status)) continue;
      if (!val.relay_post_id || !val.relay_id) continue;
      const dedupeKey = `${val.relay_id}#${val.relay_post_id}`;
      try {
        const relay = await strapi.documents(RELAY_UID).findOne({ documentId: val.relay_id });
        if (!relay) throw new Error('Relay provider no longer exists');
        const adapter = relays.getRelayAdapter(relay.provider);
        if (!adapter.capabilities?.delete) {
          results[key] = { ...val, status: 'removed', note: `${adapter.label} keeps the post (no delete API)` };
          continue;
        }
        if (!deletedRelayPosts.has(dedupeKey)) {
          await adapter.deletePost({ strapi, relay, relayPostId: val.relay_post_id });
          deletedRelayPosts.add(dedupeKey);
        }
        results[key] = { ...val, status: 'removed', error: null, at: new Date().toISOString() };
      } catch (e) {
        results[key] = { ...val, status: 'error', error: this._msg(e) };
        strapi.log.warn(`[social] relay unpublish ${val.via || ''} failed: ${this._msg(e)}`);
      }
    }

    for (const [key, val] of Object.entries(results)) {
      if (isRelayRow(val)) continue; // handled above
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

  // ── browser-poster result recording ────────────────────────────────────────

  /**
   * Record one browser-driven posting attempt (the desktop Social Poster) into
   * platform_results. Server-side merge so concurrent writers can't clobber
   * each other, and the published copy is mirrored row-level — the core PUT
   * only writes the draft, which silently diverges from what list readers see.
   * Records failures and unverified attempts too, so the backend can tell
   * "attempted and failed" from "not attempted yet".
   */
  async recordBrowserResult(documentId, { platform, account_id, status, error, note, via }) {
    if (!platform || typeof platform !== 'string') throw new Error('platform is required');
    const STATUSES = ['success', 'failed', 'unverified'];
    if (!STATUSES.includes(status)) throw new Error(`status must be one of: ${STATUSES.join(', ')}`);

    const post = await this._loadPost(documentId); // draft copy holds the canonical results
    if (!post) throw new Error('Post not found');

    const results = { ...(post.platform_results || {}) };
    const key = account_id ? resultKey(platform, account_id) : platform;
    const prev = results[key] || {};
    // A confirmed success is final. A later failed/unverified report for the
    // same destination (a retry, or a flush from the poster's offline queue)
    // must not un-publish something that is live — it only bumps the counter.
    const keepSuccess = prev.status === 'success' && status !== 'success';
    results[key] = {
      ...prev, // keep platform_post_id / url / account_name so delete + reply sync still work
      status: keepSuccess ? 'success' : status,
      platform,
      account_id: account_id || null,
      error: keepSuccess || status === 'success' ? null : error || null,
      note: keepSuccess ? `later attempt reported ${status}: ${error || 'no detail'}` : note || null,
      via: via || 'desktop-poster',
      attempts: (Number(prev.attempts) || 0) + 1,
      at: new Date().toISOString(),
    };

    // Completion is per (platform, ACCOUNT), not per platform: with two accounts
    // on one platform, one success used to mark the whole platform done and left
    // the second account silently unposted.
    const linked = Array.isArray(post.social_accounts) ? post.social_accounts : [];
    const targetPlatforms = Array.isArray(post.platforms) && post.platforms.length ? post.platforms : [platform];
    const expected = linked
      .filter((a) => a && a.is_active !== false && targetPlatforms.includes(a.platform))
      .map((a) => resultKey(a.platform, a.documentId));
    // fall back to the key we just wrote when the post has no linked accounts
    const wanted = expected.length ? expected : [key];
    const done = wanted.filter((k) => results[k] && results[k].status === 'success');
    const covered = new Set(Object.entries(results)
      .filter(([, v]) => v && v.status === 'success')
      .map(([k]) => String(k).split('#')[0]));
    let post_status = post.post_status;
    if (done.length === wanted.length) post_status = 'published';
    else if (done.length > 0 || covered.size > 0) post_status = 'partially_published';
    else if (status === 'failed') post_status = 'failed';

    const published_at_social = covered.size > 0
      ? post.published_at_social || new Date().toISOString()
      : post.published_at_social || null;

    await strapi.documents(POST_UID).update({
      documentId, data: { platform_results: results, post_status, published_at_social },
    });
    // Mirror onto the published row directly (no publish() — that would push
    // unrelated pending draft edits live as a side effect).
    const pubRow = await strapi.db.query(POST_UID).findOne({
      where: { documentId, publishedAt: { $notNull: true } },
      select: ['id'],
    });
    if (pubRow) {
      await strapi.db.query(POST_UID).update({
        where: { id: pubRow.id },
        data: { platform_results: results, post_status, published_at_social },
      });
    }

    return { ok: true, post_status, done: done.length, total: wanted.length, key };
  },

  // ── repost: clone a post into a fresh draft (re-publishable) ───────────────

  async duplicatePost(documentId) {
    const src = await this._loadPost(documentId, 'draft');
    if (!src) throw new Error('Post not found');
    const created = await strapi.documents(POST_UID).create({
      data: {
        title: `${src.title || 'Post'} (repost)`,
        body: src.body,
        platforms: Array.isArray(src.platforms) ? src.platforms : [],
        tags: Array.isArray(src.tags) ? src.tags : [],
        // fresh publish state — this is a brand-new post on the platforms
        post_status: 'draft',
        platform_results: {},
        published_at_social: null,
        replies_synced_at: null,
        scheduled_at: null,
        cover: src.cover?.id || null,
        video: Array.isArray(src.video) ? src.video.map((v) => v.id).filter(Boolean) : [],
        social_accounts: Array.isArray(src.social_accounts) ? src.social_accounts.map((a) => a.id).filter(Boolean) : [],
        products: { set: Array.isArray(src.products) ? src.products.map((p) => p.documentId).filter(Boolean) : [] },
      },
    });
    return created;
  },

  // ── inbound: fetch comments/replies from each platform ─────────────────────

  async syncRepliesForPost(documentId) {
    const post = await this._loadPost(documentId, 'draft');
    if (!post) throw new Error('Post not found');
    const results = post.platform_results || {};
    let imported = 0;

    for (const val of Object.values(results)) {
      // Allow-list, not deny-list: only a CONFIRMED success has comments worth
      // polling. A deny-list silently opts every future status in (pending,
      // failed, unverified all passed before).
      if (!val || val.status !== 'success' || !val.platform_post_id || !val.account_id) continue;
      // Relay rows carry a pseudo account id — there is no direct-platform
      // token to read comments with, so they are not pollable from here.
      if (isRelayRow(val)) continue;
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

    // platform_post_id for this account on this post (match platform too, so a
    // future multi-platform account can't resolve to the wrong post id)
    const results = post.platform_results || {};
    const row = Object.values(results).find(
      (v) => v && v.account_id === accountDocumentId && v.platform === account.platform && v.platform_post_id
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
    // Require a stored, matching nonce — a missing/blank one must NOT pass (else
    // a forged `${accountId}.anything` state would be accepted).
    const storedNonce = base.extra(account, 'oauth_nonce');
    if (!storedNonce || !nonce || storedNonce !== nonce) {
      throw new Error('OAuth state is invalid or has already been used');
    }
    const adapter = providers.getAdapter(account.platform);
    // exchangeCode reads account.extra_config.oauth_state (X PKCE) — keep it
    // intact for this call, then clear the one-time nonce/state below.
    const patch = await adapter.exchangeCode({ strapi, account, code, state });
    const updated = await this._applyAccountPatch(account, {
      ...patch,
      // null out the one-time OAuth state/nonce so a captured callback URL can't
      // be replayed.
      extra_config: {
        ...(patch?.extra_config || {}),
        connected_at: new Date().toISOString(),
        oauth_state: null,
        oauth_nonce: null,
      },
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
    // db.query sees draft AND published rows — the same document can match
    // twice, and pushing it twice would double-post on every API platform.
    const seen = new Set();
    for (const p of due) {
      if (seen.has(p.documentId)) continue;
      seen.add(p.documentId);
      try {
        strapi.log.info(`[social] cron publishing scheduled post ${p.documentId}`);
        await this.publishToProviders(p.documentId);
      } catch (e) {
        strapi.log.warn(`[social] cron publish ${p.documentId} failed: ${this._msg(e)}`);
      }
    }
    return { published: seen.size };
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
