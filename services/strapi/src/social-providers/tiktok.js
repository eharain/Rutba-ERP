'use strict';

// TikTok provider adapter — Content Posting API + Login Kit (OAuth 2.0 v2).
//
// Implements the common social-provider interface (see ./index.js). TikTok is a
// video-first platform: a post must carry a video; there is no text-only or
// image-only post via the Content Posting API.
//
// Endpoints used (all confirmed current as of late-2025 / 2026):
//   OAuth authorize : https://www.tiktok.com/v2/auth/authorize/           (browser redirect)
//   OAuth token     : POST https://open.tiktokapis.com/v2/oauth/token/    (code exchange + refresh; urlencoded)
//   User info       : GET  https://open.tiktokapis.com/v2/user/info/      (Display API; account_name)
//   Publish init    : POST https://open.tiktokapis.com/v2/post/publish/video/init/   (PULL_FROM_URL)
//   Publish status  : POST https://open.tiktokapis.com/v2/post/publish/status/fetch/ (poll publish_id)
//
// ── Caveats baked into this adapter ─────────────────────────────────────────
//  • PULL_FROM_URL requires the source domain / URL-prefix to be VERIFIED in the
//    TikTok developer portal (URL prefix property). An unverified host fails the
//    init call with `url_ownership_unverified`. media.videoUrls[0] must therefore
//    resolve to an absolute URL on a verified host (e.g. the public media origin).
//  • UNAUDITED apps can only publish to a PRIVATE account: all content is forced
//    to SELF_ONLY regardless of the requested privacy_level until the app passes
//    TikTok's audit. We request base.extra(account,'privacy_level') (default
//    PUBLIC_TO_EVERYONE) but TikTok silently downgrades it for unaudited clients.
//  • TikTok exposes NO public comment list/create/reply API for Content-Posting /
//    Login-Kit / Display-API app types (comment read access exists only under the
//    Research API, gated to approved academics). So capabilities.comments/reply
//    are false: fetchComments returns [] and postReply throws not-supported.
//  • TikTok provides NO delete-post API — deletePost always throws.

const base = require('./base');

const PLATFORM = 'tiktok';
const API_BASE = 'https://open.tiktokapis.com/v2';
const AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';

// Default Login-Kit scopes for publishing. Joined with commas per TikTok docs.
const DEFAULT_SCOPES = ['user.info.basic', 'video.publish', 'video.upload'];

// TikTok post_info.title (the caption) caps at ~150 chars in the editor preview.
const CAPTION_MAX = 150;

// Status polling for the async PULL_FROM_URL download/publish pipeline.
const STATUS_POLL_MAX_ATTEMPTS = 10;
const STATUS_POLL_INTERVAL_MS = 3000;

const TERMINAL_OK = 'PUBLISH_COMPLETE';
const TERMINAL_FAIL = 'FAILED';

// ── helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** client_key / client_secret: per-account override first, then provider config. */
function credentials(strapi, account) {
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  const clientKey = (account && account.api_key) || cfg.clientId || cfg.client_key || null;
  const clientSecret = (account && account.api_secret) || cfg.clientSecret || cfg.client_secret || null;
  return { clientKey, clientSecret, scopes: cfg.scopes };
}

/** Comma-joined scope string for the authorize URL. */
function scopeString(strapi, account) {
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  let scopes = cfg.scopes;
  const fromExtra = base.extra(account, 'scopes', null);
  if (fromExtra) scopes = fromExtra;
  if (Array.isArray(scopes)) return scopes.filter(Boolean).join(',');
  if (typeof scopes === 'string' && scopes.trim()) {
    // tolerate space- or comma-separated config
    return scopes.split(/[\s,]+/).filter(Boolean).join(',');
  }
  return DEFAULT_SCOPES.join(',');
}

/** Bearer user token; throws if the account is not connected. */
function tokenFor(account) {
  const token = account && account.access_token;
  if (!token) {
    throw new base.ProviderError('TikTok account is not connected (missing access token)', {
      platform: PLATFORM,
    });
  }
  return token;
}

function authHeaders(account) {
  return {
    Authorization: `Bearer ${tokenFor(account)}`,
    'Content-Type': 'application/json; charset=UTF-8',
  };
}

/** Caption from the post body (preferred) or title, trimmed to TikTok's cap. */
function captionFor(post) {
  const raw = (post && (post.body || post.title)) || '';
  const text = String(raw).trim();
  return text.length > CAPTION_MAX ? text.slice(0, CAPTION_MAX) : text;
}

/** Map TikTok's OAuth token envelope to an accountPatch the service persists. */
function tokenPatch(data) {
  const patch = {};
  if (data.access_token) patch.access_token = data.access_token;
  if (data.refresh_token) patch.refresh_token = data.refresh_token;
  if (data.open_id) patch.platform_user_id = data.open_id;
  const ttl = data.expires_in;
  const exp = base.expiryFromTtl(ttl);
  if (exp) patch.token_expires_at = exp;
  // Stash refresh-token expiry + granted scope for observability; service shallow-merges.
  const extraConfig = {};
  if (data.refresh_expires_in) {
    const refreshExp = base.expiryFromTtl(data.refresh_expires_in);
    if (refreshExp) extraConfig.refresh_token_expires_at = refreshExp;
  }
  if (data.scope) extraConfig.scope = data.scope;
  if (Object.keys(extraConfig).length) patch.extra_config = extraConfig;
  return patch;
}

// ── adapter ─────────────────────────────────────────────────────────────────

module.exports = {
  key: PLATFORM,
  label: 'TikTok',

  // No public comment API and no delete API for this app type — see file header.
  // oauth:true is required for buildConnectUrl / token refresh to engage.
  capabilities: { publish: true, delete: false, comments: false, reply: false, oauth: true },

  /**
   * Build the TikTok Login-Kit consent URL. Sync. The platform is carried back
   * to our single callback via `state`.
   */
  getAuthUrl({ strapi, account, state }) {
    const { clientKey } = credentials(strapi, account);
    if (!clientKey) {
      throw new base.ProviderError('TikTok client_key is not configured', { platform: PLATFORM });
    }
    const params = new URLSearchParams({
      client_key: clientKey,
      scope: scopeString(strapi, account),
      response_type: 'code',
      redirect_uri: base.redirectUri(strapi),
    });
    if (state) params.set('state', String(state));
    return `${AUTHORIZE_URL}?${params.toString()}`;
  },

  /**
   * Exchange an authorization code for tokens.
   * POST /oauth/token/ (urlencoded). `codeVerifier` is only needed for the
   * mobile/desktop PKCE flow; forwarded when the service supplies one.
   */
  async exchangeCode({ strapi, account, code, codeVerifier }) {
    if (!code) {
      throw new base.ProviderError('TikTok OAuth code is missing', { platform: PLATFORM });
    }
    const { clientKey, clientSecret } = credentials(strapi, account);
    if (!clientKey || !clientSecret) {
      throw new base.ProviderError('TikTok client_key/client_secret are not configured', {
        platform: PLATFORM,
      });
    }

    const form = {
      client_key: clientKey,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: base.redirectUri(strapi),
    };
    if (codeVerifier) form.code_verifier = codeVerifier;

    const data = await base.httpRequest(`${API_BASE}/oauth/token/`, {
      method: 'POST',
      form,
      platform: PLATFORM,
    });

    // TikTok may return a 200 with an embedded error envelope on bad params.
    if (data && data.error && data.error !== 'ok' && !data.access_token) {
      const msg = data.error_description || data.error || 'TikTok token exchange failed';
      throw new base.ProviderError(String(msg), { platform: PLATFORM, raw: data });
    }

    const patch = tokenPatch(data || {});
    if (!patch.access_token) {
      throw new base.ProviderError('TikTok token exchange returned no access_token', {
        platform: PLATFORM,
        raw: data,
      });
    }

    // Best-effort: enrich with the display name for account_name. Non-fatal.
    try {
      const info = await base.httpRequest(`${API_BASE}/user/info/`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${patch.access_token}` },
        query: { fields: 'open_id,display_name,avatar_url' },
        platform: PLATFORM,
      });
      const user = info && info.data && info.data.user;
      if (user) {
        if (user.display_name) patch.account_name = user.display_name;
        if (user.open_id && !patch.platform_user_id) patch.platform_user_id = user.open_id;
        if (user.avatar_url) {
          patch.extra_config = { ...(patch.extra_config || {}), avatar_url: user.avatar_url };
        }
      }
    } catch (e) {
      strapi?.log?.warn?.(`[tiktok] user/info lookup failed: ${e.message}`);
    }

    return patch;
  },

  /**
   * Refresh the access token via grant_type=refresh_token.
   * Returns null when there is nothing to refresh (no refresh_token on file).
   */
  async refreshToken({ strapi, account }) {
    const refresh = account && account.refresh_token;
    if (!refresh) return null;

    const { clientKey, clientSecret } = credentials(strapi, account);
    if (!clientKey || !clientSecret) {
      throw new base.ProviderError('TikTok client_key/client_secret are not configured', {
        platform: PLATFORM,
      });
    }

    const data = await base.httpRequest(`${API_BASE}/oauth/token/`, {
      method: 'POST',
      form: {
        client_key: clientKey,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refresh,
      },
      platform: PLATFORM,
    });

    if (data && data.error && data.error !== 'ok' && !data.access_token) {
      const msg = data.error_description || data.error || 'TikTok token refresh failed';
      throw new base.ProviderError(String(msg), { platform: PLATFORM, raw: data });
    }

    const patch = tokenPatch(data || {});
    return patch.access_token ? patch : null;
  },

  /**
   * Publish a video via the PULL_FROM_URL flow:
   *   1. POST /post/publish/video/init/  → publish_id
   *   2. poll POST /post/publish/status/fetch/ until PUBLISH_COMPLETE / FAILED
   *
   * Returns { platformPostId, url, raw }. `url` is null: TikTok does not return a
   * canonical web URL at publish time (a numeric post id only appears in
   * `publicaly_available_post_id` once published publicly AND moderation-approved,
   * which never happens for unaudited/private posts).
   */
  async publishPost({ strapi, account, post, media }) {
    tokenFor(account); // fail fast if disconnected

    const videoUrl = media && Array.isArray(media.videoUrls) && media.videoUrls[0];
    if (!videoUrl) {
      throw new base.ProviderError('TikTok requires a video to publish', { platform: PLATFORM });
    }
    if (!/^https:\/\//i.test(String(videoUrl))) {
      // PULL_FROM_URL needs a publicly reachable https URL on a verified domain.
      throw new base.ProviderError(
        'TikTok video_url must be an absolute https URL on a TikTok-verified domain',
        { platform: PLATFORM }
      );
    }

    const privacyLevel = base.extra(account, 'privacy_level', 'PUBLIC_TO_EVERYONE');

    const postInfo = {
      title: captionFor(post),
      privacy_level: privacyLevel,
      // Conservative interaction defaults; overridable via extra_config.
      disable_comment: base.extra(account, 'disable_comment', false),
      disable_duet: base.extra(account, 'disable_duet', false),
      disable_stitch: base.extra(account, 'disable_stitch', false),
    };

    // 1) Initialize the publish task.
    const initRaw = await base.httpRequest(`${API_BASE}/post/publish/video/init/`, {
      method: 'POST',
      headers: authHeaders(account),
      json: {
        post_info: postInfo,
        source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
      },
      platform: PLATFORM,
    });

    if (initRaw && initRaw.error && initRaw.error.code && initRaw.error.code !== 'ok') {
      const msg = initRaw.error.message || `TikTok publish init failed (${initRaw.error.code})`;
      throw new base.ProviderError(String(msg), {
        platform: PLATFORM,
        code: initRaw.error.code,
        raw: initRaw,
      });
    }

    const publishId = initRaw && initRaw.data && initRaw.data.publish_id;
    if (!publishId) {
      throw new base.ProviderError('TikTok publish init returned no publish_id', {
        platform: PLATFORM,
        raw: initRaw,
      });
    }

    // 2) Poll for completion. The download (PULL_FROM_URL) runs server-side, so
    //    a brief publish/processing window is expected; cap the wait.
    let lastStatus = null;
    let statusRaw = initRaw;
    let publicPostId = null;

    for (let attempt = 0; attempt < STATUS_POLL_MAX_ATTEMPTS; attempt += 1) {
      await sleep(STATUS_POLL_INTERVAL_MS);

      let fetched;
      try {
        fetched = await base.httpRequest(`${API_BASE}/post/publish/status/fetch/`, {
          method: 'POST',
          headers: authHeaders(account),
          json: { publish_id: publishId },
          platform: PLATFORM,
        });
      } catch (e) {
        // Transient status-fetch error: keep the publish_id, surface as pending.
        strapi?.log?.warn?.(`[tiktok] status fetch attempt ${attempt + 1} failed: ${e.message}`);
        continue;
      }

      statusRaw = fetched;

      if (fetched && fetched.error && fetched.error.code && fetched.error.code !== 'ok') {
        const msg = fetched.error.message || `TikTok status fetch failed (${fetched.error.code})`;
        throw new base.ProviderError(String(msg), {
          platform: PLATFORM,
          code: fetched.error.code,
          raw: fetched,
        });
      }

      const d = (fetched && fetched.data) || {};
      lastStatus = d.status || null;

      // Field name is intentionally the TikTok-documented (mis)spelling; accept
      // both in case TikTok ever corrects it.
      const ids = d.publicaly_available_post_id || d.publicly_available_post_id;
      if (Array.isArray(ids) && ids.length) publicPostId = ids[0];

      if (lastStatus === TERMINAL_OK) break;
      if (lastStatus === TERMINAL_FAIL) {
        const reason = d.fail_reason || 'unknown';
        throw new base.ProviderError(`TikTok publish failed: ${reason}`, {
          platform: PLATFORM,
          code: d.fail_reason || null,
          raw: fetched,
        });
      }
      // else PROCESSING_DOWNLOAD / PROCESSING_UPLOAD / SEND_TO_USER_INBOX → keep polling
    }

    // We always return the publish_id (the durable handle). If the task hasn't
    // reached PUBLISH_COMPLETE within the poll window it is still in progress on
    // TikTok's side, not failed — the caller can re-check via the publish_id.
    return {
      platformPostId: publicPostId ? String(publicPostId) : String(publishId),
      url: null,
      raw: { publish_id: publishId, status: lastStatus, ...wrapRaw(statusRaw) },
    };
  },

  /** TikTok exposes no delete-post API. */
  async deletePost(/* { strapi, account, platformPostId } */) {
    throw new base.ProviderError('TikTok does not support deleting posts via API', {
      platform: PLATFORM,
    });
  },

  /**
   * No public comment-read API exists for this app type (see header). Return an
   * empty list so the orchestration service treats it as "no new comments"
   * rather than an error.
   */
  async fetchComments(/* { strapi, account, post, platformPostId, since } */) {
    return [];
  },

  /** No public comment-create/reply API exists for this app type. */
  async postReply(/* { strapi, account, post, platformPostId, parentCommentId, body } */) {
    throw new base.ProviderError('TikTok comment API is not available', { platform: PLATFORM });
  },
};

/** Defensively coerce the status response into a plain object for `raw`. */
function wrapRaw(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  return { response: value };
}
