'use strict';

// Instagram provider adapter (Instagram Graph API).
//
// This targets an Instagram *Business/Creator* account that is linked to a
// Facebook Page — the only configuration the Graph API supports for content
// publishing + comment moderation. Authentication therefore runs through
// Facebook Login (not the Instagram-Login / graph.instagram.com flow):
//   1. user authorizes via the FB OAuth dialog,
//   2. we exchange the code for a long-lived user token,
//   3. we walk /me/accounts to find the Page that owns an
//      `instagram_business_account` and store that Page's (non-expiring) token
//      plus the IG user id.
//
// All Graph calls hit https://graph.facebook.com/{version}. The IG user id is
// stored in `platform_user_id` (falling back to `page_id`), and the long-lived
// Page token is stored in `access_token`.
//
// Endpoints used (Graph API):
//   POST /{ig-user-id}/media           — create image / REELS container
//   GET  /{container-id}?fields=status_code  — poll video processing
//   POST /{ig-user-id}/media_publish   — publish container -> media id
//   GET  /{media-id}?fields=permalink  — resolve public URL
//   GET  /{media-id}/comments          — list comments (+nested replies)
//   POST /{comment-id}/replies         — reply to a comment
//   POST /{media-id}/comments          — top-level comment
//   GET  /oauth/access_token           — code->token and long-lived exchange
//   GET  /me/accounts                  — resolve Page-linked IG account

const base = require('./base');

const PLATFORM = 'instagram';
const DEFAULT_VERSION = 'v21.0';

// Video container processing can take a while; poll with a hard cap so a stuck
// upload surfaces as an error instead of hanging the publish run.
const VIDEO_POLL_MAX_ATTEMPTS = 30;
const VIDEO_POLL_INTERVAL_MS = 4000;

// ── small helpers ────────────────────────────────────────────────────────────

/** Graph API version from provider config (e.g. 'v21.0'). */
function graphVersion(strapi) {
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  return cfg.graphVersion || DEFAULT_VERSION;
}

/** Base Graph URL for the configured version. */
function graphBase(strapi) {
  return `https://graph.facebook.com/${graphVersion(strapi)}`;
}

/**
 * OAuth client credentials. Prefer per-account overrides (api_key/api_secret)
 * when present, otherwise fall back to the shared provider config.
 */
function clientCreds(strapi, account) {
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  const clientId = (account && account.api_key) || cfg.clientId || null;
  const clientSecret = (account && account.api_secret) || cfg.clientSecret || null;
  return { clientId, clientSecret };
}

/** Resolve the IG Business account id; throw if we have nothing to act on. */
function igUserId(account) {
  const id = (account && (account.platform_user_id || account.page_id)) || null;
  if (!id) {
    throw new base.ProviderError('Instagram account is missing the IG Business account id (platform_user_id / page_id)', {
      platform: PLATFORM,
    });
  }
  return id;
}

/** Resolve the access token; throw if absent. */
function tokenFor(account) {
  const token = account && account.access_token;
  if (!token) {
    throw new base.ProviderError('Instagram account has no access token', { platform: PLATFORM });
  }
  return token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── publishing internals ─────────────────────────────────────────────────────

/**
 * Create an image media container.
 * POST /{ig-user-id}/media  { image_url, caption } -> { id }
 */
async function createImageContainer(strapi, account, { imageUrl, caption, isCarouselItem }) {
  const form = {
    image_url: imageUrl,
    caption: caption || '',
    access_token: tokenFor(account),
  };
  if (isCarouselItem) form.is_carousel_item = 'true';
  const res = await base.httpRequest(`${graphBase(strapi)}/${igUserId(account)}/media`, {
    method: 'POST',
    platform: PLATFORM,
    form,
  });
  if (!res || !res.id) {
    throw new base.ProviderError('Instagram did not return an image container id', { platform: PLATFORM, raw: res });
  }
  return res.id;
}

/**
 * Create a REELS (video) container and wait for server-side processing.
 * POST /{ig-user-id}/media  { media_type: REELS, video_url, caption } -> { id }
 * then GET /{id}?fields=status_code until FINISHED.
 */
async function createVideoContainer(strapi, account, { videoUrl, caption }) {
  const res = await base.httpRequest(`${graphBase(strapi)}/${igUserId(account)}/media`, {
    method: 'POST',
    platform: PLATFORM,
    form: {
      media_type: 'REELS',
      video_url: videoUrl,
      caption: caption || '',
      access_token: tokenFor(account),
    },
  });
  if (!res || !res.id) {
    throw new base.ProviderError('Instagram did not return a video container id', { platform: PLATFORM, raw: res });
  }
  const containerId = res.id;

  for (let attempt = 0; attempt < VIDEO_POLL_MAX_ATTEMPTS; attempt += 1) {
    await sleep(VIDEO_POLL_INTERVAL_MS);
    const status = await base.httpRequest(`${graphBase(strapi)}/${containerId}`, {
      method: 'GET',
      platform: PLATFORM,
      query: { fields: 'status_code', access_token: tokenFor(account) },
    });
    const code = status && status.status_code;
    if (code === 'FINISHED') return containerId;
    if (code === 'ERROR' || code === 'EXPIRED') {
      throw new base.ProviderError(`Instagram video container processing failed (status_code=${code})`, {
        platform: PLATFORM,
        raw: status,
      });
    }
    // IN_PROGRESS / PUBLISHED-not-yet / unknown → keep polling
  }
  throw new base.ProviderError('Instagram video container did not finish processing in time', { platform: PLATFORM });
}

/**
 * Publish a finished container.
 * POST /{ig-user-id}/media_publish { creation_id } -> { id }
 */
async function publishContainer(strapi, account, creationId) {
  const res = await base.httpRequest(`${graphBase(strapi)}/${igUserId(account)}/media_publish`, {
    method: 'POST',
    platform: PLATFORM,
    form: {
      creation_id: creationId,
      access_token: tokenFor(account),
    },
  });
  if (!res || !res.id) {
    throw new base.ProviderError('Instagram media_publish did not return a media id', { platform: PLATFORM, raw: res });
  }
  return res.id;
}

/** Best-effort permalink lookup; returns null on any failure. */
async function fetchPermalink(strapi, account, mediaId) {
  try {
    const res = await base.httpRequest(`${graphBase(strapi)}/${mediaId}`, {
      method: 'GET',
      platform: PLATFORM,
      query: { fields: 'permalink', access_token: tokenFor(account) },
    });
    return (res && res.permalink) || null;
  } catch {
    return null;
  }
}

// ── comment normalization ────────────────────────────────────────────────────

/** Map a raw IG comment/reply node onto a NormalizedComment. */
function normalizeComment(node, parentCommentId) {
  const username = node && node.username;
  const out = {
    platformCommentId: String(node && node.id),
    body: (node && node.text) || '',
  };
  if (username) {
    out.authorName = username;
    out.authorHandle = username;
  }
  if (node && node.timestamp) out.repliedAt = node.timestamp;
  if (parentCommentId) out.parentCommentId = String(parentCommentId);
  return out;
}

// ── OAuth ────────────────────────────────────────────────────────────────────

function getAuthUrl({ strapi, account, state }) {
  const { clientId } = clientCreds(strapi, account);
  if (!clientId) {
    throw new base.ProviderError('Instagram OAuth is not configured (missing clientId)', { platform: PLATFORM });
  }
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  // Scopes needed for Page-linked IG publishing + comment moderation.
  const scope =
    cfg.scopes ||
    'instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list,pages_read_engagement,business_management';
  const u = new URL(`https://www.facebook.com/${graphVersion(strapi)}/dialog/oauth`);
  u.searchParams.set('client_id', clientId);
  u.searchParams.set('redirect_uri', base.redirectUri(strapi));
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', scope);
  if (state) u.searchParams.set('state', state);
  return u.toString();
}

async function exchangeCode({ strapi, account, code /* codeVerifier unused (FB has no PKCE here) */ }) {
  const { clientId, clientSecret } = clientCreds(strapi, account);
  if (!clientId || !clientSecret) {
    throw new base.ProviderError('Instagram OAuth is not configured (missing clientId/clientSecret)', {
      platform: PLATFORM,
    });
  }

  // 1) code -> short-lived user access token
  const tokenRes = await base.httpRequest(`${graphBase(strapi)}/oauth/access_token`, {
    method: 'GET',
    platform: PLATFORM,
    query: {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: base.redirectUri(strapi),
      code,
    },
  });
  const shortToken = tokenRes && tokenRes.access_token;
  if (!shortToken) {
    throw new base.ProviderError('Instagram OAuth did not return a user access token', {
      platform: PLATFORM,
      raw: tokenRes,
    });
  }

  // 2) short-lived -> long-lived user token
  const longRes = await base.httpRequest(`${graphBase(strapi)}/oauth/access_token`, {
    method: 'GET',
    platform: PLATFORM,
    query: {
      grant_type: 'fb_exchange_token',
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: shortToken,
    },
  });
  const userToken = (longRes && longRes.access_token) || shortToken;
  const userTokenExpiresIn = longRes && longRes.expires_in;

  // 3) resolve the Page that owns an instagram_business_account.
  //    Page access tokens derived from a long-lived user token are themselves
  //    long-lived / non-expiring, so we prefer the Page token + IG id.
  const accounts = await base.httpRequest(`${graphBase(strapi)}/me/accounts`, {
    method: 'GET',
    platform: PLATFORM,
    query: {
      fields: 'name,access_token,instagram_business_account',
      access_token: userToken,
    },
  });
  const pages = (accounts && Array.isArray(accounts.data) && accounts.data) || [];
  const linked = pages.find((p) => p && p.instagram_business_account && p.instagram_business_account.id);

  const patch = {};
  if (linked) {
    patch.access_token = linked.access_token || userToken;
    patch.platform_user_id = linked.instagram_business_account.id;
    patch.page_id = linked.id || null;
    if (linked.name) patch.account_name = linked.name;
    // Page tokens generally don't expire → leave token_expires_at unset.
  } else {
    // No linked IG account found — fall back to the user token so the caller
    // can still persist something, but flag it via extra_config.
    patch.access_token = userToken;
    if (userTokenExpiresIn) patch.token_expires_at = base.expiryFromTtl(userTokenExpiresIn);
    patch.extra_config = {
      oauth_warning: 'No Facebook Page with a linked Instagram Business account was found for this user.',
    };
  }
  return patch;
}

async function refreshToken({ strapi, account }) {
  // Long-lived Page tokens don't expire, so there is normally nothing to do.
  if (!base.tokenExpired(account)) return null;

  const { clientId, clientSecret } = clientCreds(strapi, account);
  if (!clientId || !clientSecret) return null;
  const current = account && account.access_token;
  if (!current) return null;

  // Re-exchange the current token for a fresh long-lived one.
  const res = await base.httpRequest(`${graphBase(strapi)}/oauth/access_token`, {
    method: 'GET',
    platform: PLATFORM,
    query: {
      grant_type: 'fb_exchange_token',
      client_id: clientId,
      client_secret: clientSecret,
      fb_exchange_token: current,
    },
  });
  const token = res && res.access_token;
  if (!token) return null;
  const patch = { access_token: token };
  if (res.expires_in) patch.token_expires_at = base.expiryFromTtl(res.expires_in);
  return patch;
}

// ── publish / delete ─────────────────────────────────────────────────────────

async function publishPost({ strapi, account, post, media }) {
  igUserId(account); // validate early
  tokenFor(account);

  const caption = (post && post.body) || '';
  const videoUrl = (media && Array.isArray(media.videoUrls) && media.videoUrls[0]) || null;
  const imageUrl = (media && media.coverUrl) || null;

  let creationId;
  if (videoUrl) {
    creationId = await createVideoContainer(strapi, account, { videoUrl, caption });
  } else if (imageUrl) {
    creationId = await createImageContainer(strapi, account, { imageUrl, caption });
  } else {
    throw new base.ProviderError('Instagram requires an image or video to publish a post', { platform: PLATFORM });
  }

  const mediaId = await publishContainer(strapi, account, creationId);
  const permalink = await fetchPermalink(strapi, account, mediaId);

  return {
    platformPostId: mediaId,
    url: permalink || null,
    raw: { creationId, mediaId, permalink },
  };
}

async function deletePost(/* { strapi, account, platformPostId } */) {
  // The Instagram Graph API does not expose a media-delete endpoint.
  throw new base.ProviderError('Instagram does not support deleting posts via the Graph API', { platform: PLATFORM });
}

// ── comments ─────────────────────────────────────────────────────────────────

async function fetchComments({ strapi, account, post, platformPostId, since }) {
  const mediaId = platformPostId || (post && post.platformPostId) || null;
  if (!mediaId) return [];
  const token = tokenFor(account);

  const out = [];
  let url = `${graphBase(strapi)}/${mediaId}/comments`;
  let query = {
    fields: 'id,text,username,timestamp,replies{id,text,username,timestamp}',
    limit: 50,
    access_token: token,
  };

  // `since` is best-effort client-side filtering on the comment timestamp.
  const sinceMs = since ? new Date(since).getTime() : null;
  const afterSince = (ts) => {
    if (!sinceMs || Number.isNaN(sinceMs)) return true;
    const t = ts ? new Date(ts).getTime() : NaN;
    return Number.isNaN(t) ? true : t >= sinceMs;
  };

  // Page through the comments edge until there is no `next` cursor.
  // Guard the loop count so a misbehaving cursor can't spin forever.
  for (let page = 0; page < 100 && url; page += 1) {
    let res;
    try {
      res = await base.httpRequest(url, { method: 'GET', platform: PLATFORM, query });
    } catch (e) {
      // Don't let a transient comments read abort the caller; surface nothing.
      if (out.length) break;
      throw e;
    }

    const items = (res && Array.isArray(res.data) && res.data) || [];
    for (const c of items) {
      if (!c || !c.id) continue;
      if (afterSince(c.timestamp)) out.push(normalizeComment(c, null));
      const replies = (c.replies && Array.isArray(c.replies.data) && c.replies.data) || [];
      for (const r of replies) {
        if (!r || !r.id) continue;
        if (afterSince(r.timestamp)) out.push(normalizeComment(r, c.id));
      }
    }

    const next = res && res.paging && res.paging.next;
    if (next) {
      url = next; // the cursor URL already carries fields/limit/token
      query = undefined;
    } else {
      url = null;
    }
  }

  return out;
}

async function postReply({ strapi, account, platformPostId, parentCommentId, body }) {
  const message = body || '';
  let targetUrl;
  if (parentCommentId) {
    // Reply to an existing comment thread.
    targetUrl = `${graphBase(strapi)}/${parentCommentId}/replies`;
  } else {
    // Top-level comment on the media.
    const mediaId = platformPostId;
    if (!mediaId) {
      throw new base.ProviderError('Instagram reply requires a parent comment id or a media id', { platform: PLATFORM });
    }
    targetUrl = `${graphBase(strapi)}/${mediaId}/comments`;
  }

  const res = await base.httpRequest(targetUrl, {
    method: 'POST',
    platform: PLATFORM,
    form: { message, access_token: tokenFor(account) },
  });
  if (!res || !res.id) {
    throw new base.ProviderError('Instagram did not return an id for the posted reply', { platform: PLATFORM, raw: res });
  }
  return { platformCommentId: String(res.id), raw: res };
}

module.exports = {
  key: 'instagram',
  label: 'Instagram',
  capabilities: { publish: true, delete: true, comments: true, reply: true, oauth: true },
  getAuthUrl,
  exchangeCode,
  refreshToken,
  publishPost,
  deletePost,
  fetchComments,
  postReply,
};
