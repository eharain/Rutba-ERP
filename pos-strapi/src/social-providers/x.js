'use strict';

// X (Twitter) provider adapter — X API v2, OAuth2 Authorization Code + PKCE.
//
// Endpoints (verified against docs.x.com, late-2025/2026):
//   • OAuth consent : https://twitter.com/i/oauth2/authorize     (response_type=code, S256 PKCE)
//   • Token         : POST {API}/2/oauth2/token  (x-www-form-urlencoded; HTTP Basic for confidential client)
//   • Whoami        : GET  {API}/2/users/me
//   • Create post   : POST {API}/2/tweets   { text, media:{ media_ids }, reply:{ in_reply_to_tweet_id } }
//   • Delete post   : DELETE {API}/2/tweets/{id}
//   • Media upload  : POST {API}/2/media/upload   (chunked INIT / APPEND / FINALIZE; data.id = media_id)
//   • Replies       : GET  {API}/2/tweets/search/recent  (conversation_id filter; requires a paid access tier)
//
// X migrated the canonical host to api.x.com but api.twitter.com (and the
// twitter.com authorize host) still resolve; we keep the twitter.com hosts the
// rest of the ERP is configured against. Override per-account via extra_config
// (`api_base`, `authorize_url`) or globally via social.providers.x config.
//
// ── PKCE persistence caveat ──────────────────────────────────────────────────
// getAuthUrl is SYNCHRONOUS and cannot persist anything (no service handle, no
// await). PKCE requires the same code_verifier at getAuthUrl time and at
// exchangeCode time. We bridge that gap two ways, in priority order:
//   1. The callback may forward the real `codeVerifier` to exchangeCode — used if present.
//   2. A module-level Map caches state→verifier (best-effort; lost on restart / lb hop).
//   3. DETERMINISTIC FALLBACK: code_verifier = base64url(HMAC_SHA256(secret, state)),
//      so it is reproducible from `state` alone without any stored state.
// Because this interface does NOT pass `state` to exchangeCode, the deterministic
// recompute there relies on the service forwarding either `codeVerifier` or a
// `state` we can read from extra_config. We therefore ALSO stash the verifier on
// the in-memory cache and read it back by any state the service hands us. If all
// three miss, the token exchange will fail with a PKCE error — acceptable given
// the constraints of a sync getAuthUrl in this interface.

const base = require('./base');
const crypto = require('crypto');

const PLATFORM = 'x';
const DEFAULT_API_BASE = 'https://api.twitter.com';
const DEFAULT_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const DEFAULT_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];
const TWEET_MAX = 280;
// Chunk size for media APPEND. X allows up to ~5MB/segment; 1MB is comfortably safe.
const MEDIA_CHUNK_BYTES = 1024 * 1024;

// Best-effort in-memory bridge for the sync→async PKCE boundary. Single-process
// only; the deterministic fallback below covers restarts / multi-instance.
const verifierCache = new Map(); // state -> code_verifier

// ── small crypto/util helpers ────────────────────────────────────────────────

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Reproducible PKCE verifier derived from `state`, so it survives a sync→async hop. */
function deriveVerifier(state, clientSecret) {
  const key = `${clientSecret || ''}rutba`;
  return b64url(crypto.createHmac('sha256', key).update(String(state || '')).digest());
}

function challengeFor(verifier) {
  return b64url(crypto.createHash('sha256').update(verifier).digest());
}

/** OAuth2 client credentials: per-account override wins over global config. */
function clientCreds(strapi, account) {
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  const clientId = (account && account.api_key) || cfg.clientId;
  const clientSecret = (account && account.api_secret) || cfg.clientSecret;
  const scopes =
    (Array.isArray(cfg.scopes) && cfg.scopes.length ? cfg.scopes : null) || DEFAULT_SCOPES;
  return { clientId, clientSecret, scopes };
}

function apiBase(account) {
  return String(base.extra(account, 'api_base', DEFAULT_API_BASE)).replace(/\/+$/, '');
}

function authorizeUrl(account) {
  return base.extra(account, 'authorize_url', DEFAULT_AUTHORIZE_URL);
}

function basicAuthHeader(clientId, clientSecret) {
  return 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
}

/** Resolve the user OAuth2 bearer for an account; throw if absent. */
function tokenFor(account) {
  const t = account && account.access_token;
  if (!t) {
    throw new base.ProviderError('X account is not connected (missing access token)', {
      platform: PLATFORM,
      code: 'no_token',
    });
  }
  return t;
}

/** Truncate to 280 chars on a word boundary; hard-cap at 277 + ellipsis. */
function truncateTweet(text) {
  const s = String(text || '').trim();
  if (s.length <= TWEET_MAX) return s;
  const hard = s.slice(0, TWEET_MAX - 3);
  const lastSpace = hard.lastIndexOf(' ');
  const cut = lastSpace > 200 ? hard.slice(0, lastSpace) : hard; // prefer a word boundary if reasonable
  return cut.replace(/\s+$/, '') + '…';
}

// ── adapter ──────────────────────────────────────────────────────────────────

module.exports = {
  key: 'x',
  label: 'X',
  capabilities: { publish: true, delete: true, comments: true, reply: true, oauth: true },

  /**
   * Build the OAuth2 consent URL (sync). PKCE verifier is derived deterministically
   * from `state` (see file header) and also stashed in the in-memory cache so the
   * async exchangeCode can recover it without `state` being threaded through.
   */
  getAuthUrl({ strapi, account, state }) {
    const { clientId, clientSecret, scopes } = clientCreds(strapi, account);
    if (!clientId) {
      throw new base.ProviderError('X OAuth2 client id is not configured', {
        platform: PLATFORM,
        code: 'no_client_id',
      });
    }
    const verifier = deriveVerifier(state, clientSecret);
    verifierCache.set(String(state), verifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: base.redirectUri(strapi),
      scope: scopes.join(' '),
      state: String(state),
      code_challenge: challengeFor(verifier),
      code_challenge_method: 'S256',
    });
    return `${authorizeUrl(account)}?${params.toString()}`;
  },

  /**
   * Exchange the auth code for tokens. The code_verifier is resolved in priority
   * order: explicit `codeVerifier` arg → in-memory cache (by state in extra_config)
   * → deterministic recompute from a recoverable state. Also fetches /2/users/me
   * to persist our own user id + handle (needed for reply filtering later).
   */
  async exchangeCode({ strapi, account, code, codeVerifier }) {
    const { clientId, clientSecret } = clientCreds(strapi, account);
    if (!clientId) {
      throw new base.ProviderError('X OAuth2 client id is not configured', {
        platform: PLATFORM,
        code: 'no_client_id',
      });
    }

    // Recover the PKCE verifier. `state` is not in this signature; the service may
    // stash it on extra_config (`oauth_state`) — use it to hit the cache / recompute.
    const state = base.extra(account, 'oauth_state', null);
    let verifier = codeVerifier;
    if (!verifier && state != null) verifier = verifierCache.get(String(state));
    if (!verifier && state != null) verifier = deriveVerifier(state, clientSecret);
    if (!verifier) {
      throw new base.ProviderError(
        'Unable to recover PKCE code_verifier for X token exchange (no codeVerifier and no recoverable state)',
        { platform: PLATFORM, code: 'pkce_verifier_missing' }
      );
    }

    const headers = clientSecret ? { Authorization: basicAuthHeader(clientId, clientSecret) } : {};
    const data = await base.httpRequest(`${apiBase(account)}/2/oauth2/token`, {
      method: 'POST',
      platform: PLATFORM,
      headers,
      form: {
        grant_type: 'authorization_code',
        code,
        redirect_uri: base.redirectUri(strapi),
        client_id: clientId, // harmless for confidential clients; required for public ones
        code_verifier: verifier,
      },
    });

    if (state != null) verifierCache.delete(String(state));

    const patch = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || null,
      token_expires_at: base.expiryFromTtl(data.expires_in),
    };

    // Resolve our own identity for later reply filtering (`-from:<username>`).
    try {
      const me = await base.httpRequest(`${apiBase(account)}/2/users/me`, {
        method: 'GET',
        platform: PLATFORM,
        headers: { Authorization: `Bearer ${data.access_token}` },
        query: { 'user.fields': 'username,name' },
      });
      const u = me && me.data;
      if (u) {
        patch.platform_user_id = u.id;
        patch.account_name = u.username || u.name || account.account_name || null;
        patch.extra_config = { username: u.username || null, name: u.name || null };
      }
    } catch (_) {
      // Identity is best-effort; token still usable for publishing without it.
    }

    return patch;
  },

  /** Rotate the access token via the refresh_token grant. Null when nothing to do. */
  async refreshToken({ strapi, account }) {
    if (!account || !account.refresh_token) return null;
    const { clientId, clientSecret } = clientCreds(strapi, account);
    if (!clientId) return null;

    const headers = clientSecret ? { Authorization: basicAuthHeader(clientId, clientSecret) } : {};
    const data = await base.httpRequest(`${apiBase(account)}/2/oauth2/token`, {
      method: 'POST',
      platform: PLATFORM,
      headers,
      form: {
        grant_type: 'refresh_token',
        refresh_token: account.refresh_token,
        client_id: clientId,
      },
    });

    return {
      access_token: data.access_token,
      // X rotates the refresh token; keep the old one if the response omits it.
      refresh_token: data.refresh_token || account.refresh_token,
      token_expires_at: base.expiryFromTtl(data.expires_in),
    };
  },

  /**
   * Publish a tweet. Best-effort image upload from media.coverUrl (chunked v2
   * media upload); on any upload failure we fall back to a text-only tweet so a
   * transient media problem never blocks the post.
   */
  async publishPost({ strapi, account, post, media }) {
    const bearer = tokenFor(account);
    const text = truncateTweet(post && post.body);

    const mediaIds = [];
    const coverUrl = media && (media.coverUrl || base.absoluteMediaUrl(strapi, media.cover, { preferFormat: 'large' }));
    if (coverUrl) {
      try {
        const id = await uploadImage(account, bearer, coverUrl);
        if (id) mediaIds.push(id);
      } catch (e) {
        strapi &&
          strapi.log &&
          strapi.log.warn(`[social:x] media upload failed, posting text-only: ${e.message}`);
      }
    }

    if (!text && !mediaIds.length) {
      throw new base.ProviderError('Cannot publish an empty tweet (no text and no media)', {
        platform: PLATFORM,
        code: 'empty_post',
      });
    }

    const json = {};
    if (text) json.text = text;
    if (mediaIds.length) json.media = { media_ids: mediaIds };

    const data = await base.httpRequest(`${apiBase(account)}/2/tweets`, {
      method: 'POST',
      platform: PLATFORM,
      headers: { Authorization: `Bearer ${bearer}` },
      json,
    });

    const id = data && data.data && data.data.id;
    if (!id) {
      throw new base.ProviderError('X did not return a tweet id', { platform: PLATFORM, raw: data });
    }
    return {
      platformPostId: id,
      url: `https://twitter.com/i/web/status/${id}`,
      raw: data,
    };
  },

  /** Delete a tweet by id. */
  async deletePost({ strapi, account, platformPostId }) {
    const bearer = tokenFor(account);
    await base.httpRequest(`${apiBase(account)}/2/tweets/${encodeURIComponent(platformPostId)}`, {
      method: 'DELETE',
      platform: PLATFORM,
      headers: { Authorization: `Bearer ${bearer}` },
    });
  },

  /**
   * Fetch replies to a tweet via recent search on its conversation_id.
   * NOTE: /2/tweets/search/recent requires a sufficient (paid) API access tier.
   * On 403/forbidden we return [] rather than throwing so a free-tier account
   * degrades gracefully instead of failing the whole comment-sync run.
   */
  async fetchComments({ strapi, account, post, platformPostId, since }) {
    const bearer = tokenFor(account);
    const ourId = account.platform_user_id || null;
    const ourHandle = base.extra(account, 'username', null);

    let query = `conversation_id:${platformPostId}`;
    if (ourHandle) query += ` -from:${ourHandle}`; // exclude our own tweets in the thread

    const params = {
      query,
      'tweet.fields': 'created_at,author_id,in_reply_to_user_id,referenced_tweets,conversation_id',
      expansions: 'author_id',
      'user.fields': 'name,username,profile_image_url',
      max_results: 100,
    };
    if (since) params.start_time = new Date(since).toISOString();

    let data;
    try {
      data = await base.httpRequest(`${apiBase(account)}/2/tweets/search/recent`, {
        method: 'GET',
        platform: PLATFORM,
        headers: { Authorization: `Bearer ${bearer}` },
        query: params,
      });
    } catch (e) {
      if (e instanceof base.ProviderError && e.status === 403) {
        strapi &&
          strapi.log &&
          strapi.log.warn('[social:x] recent search forbidden (insufficient API tier); returning no comments');
        return [];
      }
      throw e;
    }

    const tweets = (data && data.data) || [];
    const usersById = {};
    const users = (data && data.includes && data.includes.users) || [];
    for (const u of users) usersById[u.id] = u;

    return tweets
      .filter((t) => t.id !== platformPostId) // drop the root tweet if it shows up
      .map((t) => {
        const author = usersById[t.author_id] || {};
        // parentCommentId = the tweet this reply replied_to (within the thread).
        let parentCommentId = platformPostId;
        if (Array.isArray(t.referenced_tweets)) {
          const replied = t.referenced_tweets.find((r) => r.type === 'replied_to');
          if (replied && replied.id) parentCommentId = replied.id;
        }
        return {
          platformCommentId: t.id,
          body: t.text || '',
          authorName: author.name || null,
          authorHandle: author.username ? `@${author.username}` : null,
          authorAvatarUrl: author.profile_image_url || null,
          repliedAt: t.created_at || null,
          parentCommentId,
          isOutbound: ourId ? t.author_id === ourId : false,
        };
      });
  },

  /**
   * Reply to the tweet or a comment within the thread by creating a new tweet
   * with reply.in_reply_to_tweet_id.
   */
  async postReply({ strapi, account, post, platformPostId, parentCommentId, body }) {
    const bearer = tokenFor(account);
    const text = truncateTweet(body);
    if (!text) {
      throw new base.ProviderError('Cannot post an empty reply', { platform: PLATFORM, code: 'empty_reply' });
    }

    const data = await base.httpRequest(`${apiBase(account)}/2/tweets`, {
      method: 'POST',
      platform: PLATFORM,
      headers: { Authorization: `Bearer ${bearer}` },
      json: {
        text,
        reply: { in_reply_to_tweet_id: parentCommentId || platformPostId },
      },
    });

    const id = data && data.data && data.data.id;
    if (!id) {
      throw new base.ProviderError('X did not return a reply tweet id', { platform: PLATFORM, raw: data });
    }
    return { platformCommentId: id, raw: data };
  },
};

// ── media upload (chunked v2: INIT → APPEND → FINALIZE) ───────────────────────
//
// v1.1 media endpoints were deprecated 2025-06-09; v2 chunked upload is the
// supported path. Each step is multipart/form-data against POST /2/media/upload;
// the media_id is returned as data.id. Only still images are handled here —
// video/GIF need processing-status polling which the publish flow doesn't model.

async function uploadImage(account, bearer, imageUrl) {
  const { bytes, contentType } = await fetchImageBytes(imageUrl);
  const mediaType = contentType || 'image/jpeg';
  const url = `${apiBase(account)}/2/media/upload`;
  const authHeaders = { Authorization: `Bearer ${bearer}` };

  // INIT
  const initForm = new FormData();
  initForm.set('command', 'INIT');
  initForm.set('total_bytes', String(bytes.length));
  initForm.set('media_type', mediaType);
  initForm.set('media_category', 'tweet_image');
  const init = await base.httpRequest(url, {
    method: 'POST',
    platform: PLATFORM,
    headers: authHeaders,
    multipart: initForm,
  });
  const mediaId = init && init.data && init.data.id;
  if (!mediaId) {
    throw new base.ProviderError('X media INIT returned no media id', { platform: PLATFORM, raw: init });
  }

  // APPEND (one or more segments)
  let segment = 0;
  for (let offset = 0; offset < bytes.length; offset += MEDIA_CHUNK_BYTES) {
    const chunk = bytes.subarray(offset, Math.min(offset + MEDIA_CHUNK_BYTES, bytes.length));
    const appendForm = new FormData();
    appendForm.set('command', 'APPEND');
    appendForm.set('media_id', mediaId);
    appendForm.set('segment_index', String(segment));
    appendForm.set('media', new Blob([chunk], { type: mediaType }));
    await base.httpRequest(url, {
      method: 'POST',
      platform: PLATFORM,
      headers: authHeaders,
      multipart: appendForm,
      expect: 'raw', // APPEND returns 2xx with empty/204 body
    });
    segment += 1;
  }

  // FINALIZE
  const finalForm = new FormData();
  finalForm.set('command', 'FINALIZE');
  finalForm.set('media_id', mediaId);
  const fin = await base.httpRequest(url, {
    method: 'POST',
    platform: PLATFORM,
    headers: authHeaders,
    multipart: finalForm,
  });
  // Images finalize synchronously (no processing_info). Return the id either way.
  return (fin && fin.data && fin.data.id) || mediaId;
}

async function fetchImageBytes(imageUrl) {
  let res;
  try {
    res = await fetch(imageUrl);
  } catch (e) {
    throw new base.ProviderError(`Failed to fetch media for X upload: ${e.message}`, {
      platform: PLATFORM,
      raw: String(e),
    });
  }
  if (!res.ok) {
    throw new base.ProviderError(`Failed to fetch media for X upload: HTTP ${res.status}`, {
      platform: PLATFORM,
      status: res.status,
    });
  }
  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim() || null;
  const ab = await res.arrayBuffer();
  return { bytes: Buffer.from(ab), contentType };
}
