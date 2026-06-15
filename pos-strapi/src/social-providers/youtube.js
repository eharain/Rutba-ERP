'use strict';

// YouTube provider adapter (YouTube Data API v3 + Google OAuth2).
//
// Publishes a *video* to the authenticated channel via a resumable upload, then
// supports delete + comment read/reply. Authentication is Google OAuth2 (web
// server / authorization-code flow with offline access), so account.access_token
// is a short-lived Google access token and account.refresh_token is the
// long-lived refresh token used to mint new access tokens.
//
// All API calls send `Authorization: Bearer <access_token>`. The channel id is
// stored in `platform_user_id` and the channel title in `account_name`.
//
// API surface used (YouTube Data API v3, https://www.googleapis.com):
//   Publish video  POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
//                    → 2-step resumable: init (read Location header) then PUT bytes
//   Delete video   DELETE /youtube/v3/videos?id={id}
//   Read comments  GET  /youtube/v3/commentThreads?part=snippet,replies&videoId={id}
//   Reply          POST /youtube/v3/comments?part=snippet            (reply to a comment)
//   Top-level      POST /youtube/v3/commentThreads?part=snippet      (comment on a video)
//   Channel lookup GET  /youtube/v3/channels?part=snippet&mine=true
// OAuth2 (Google):
//   Consent        https://accounts.google.com/o/oauth2/v2/auth
//   Code → token   POST https://oauth2.googleapis.com/token (grant_type=authorization_code)
//   Refresh        POST https://oauth2.googleapis.com/token (grant_type=refresh_token)
//
// Quota note: uploads are expensive — videos.insert costs ~1600 quota units and
// the default project quota is 10,000 units/day (≈6 uploads/day). comments.insert
// and commentThreads.insert cost 50 units each. Plan publish volume accordingly.

const base = require('./base');

const PLATFORM = 'youtube';

const API_BASE = 'https://www.googleapis.com/youtube/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/youtube/v3';
const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Default scopes if the provider config doesn't specify any. `youtube.upload`
// covers publish; `youtube.force-ssl` covers delete + comment read/write;
// `youtube.readonly` covers the channel lookup during OAuth.
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/youtube.readonly',
];

// Soft cap on comment paging so a misbehaving nextPageToken can't spin forever.
const COMMENT_PAGE_CAP = 200;

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * OAuth client credentials. Per-account overrides (api_key/api_secret) win over
 * the shared provider config so a single Strapi can serve multiple Google apps.
 */
function clientCreds(strapi, account) {
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  const clientId = (account && account.api_key) || cfg.clientId || null;
  const clientSecret = (account && account.api_secret) || cfg.clientSecret || null;
  return { clientId, clientSecret };
}

/** Space-delimited OAuth scope string (Google uses spaces, not commas). */
function scopeString(strapi) {
  const cfg = base.getProviderConfig(strapi, PLATFORM) || {};
  const scopes = cfg.scopes || DEFAULT_SCOPES;
  return Array.isArray(scopes) ? scopes.join(' ') : String(scopes);
}

/** Resolve the Google OAuth2 access token; throw if absent. */
function tokenFor(account) {
  const token = account && account.access_token;
  if (!token) {
    throw new base.ProviderError('YouTube account is missing a Google OAuth access token', {
      platform: PLATFORM,
    });
  }
  return token;
}

/** Standard bearer auth header for the YouTube Data API. */
function authHeaders(account) {
  return { Authorization: `Bearer ${tokenFor(account)}` };
}

/** Pick a video snippet title — required by YouTube; fall back to the body. */
function resolveTitle(post) {
  const title = post && typeof post.title === 'string' ? post.title.trim() : '';
  if (title) return title.slice(0, 100); // YouTube caps titles at 100 chars
  const body = post && typeof post.body === 'string' ? post.body.trim() : '';
  if (body) return body.slice(0, 90);
  return 'Untitled';
}

/** Map a raw YouTube comment-resource snippet onto a NormalizedComment. */
function normalizeComment(id, snippet, parentCommentId) {
  if (!id || !snippet) return null;
  const out = {
    platformCommentId: String(id),
    body: snippet.textOriginal || snippet.textDisplay || '',
  };
  if (snippet.authorDisplayName) out.authorName = snippet.authorDisplayName;
  const handle = snippet.authorChannelId && snippet.authorChannelId.value;
  if (handle) out.authorHandle = String(handle);
  if (snippet.authorProfileImageUrl) out.authorAvatarUrl = snippet.authorProfileImageUrl;
  if (snippet.publishedAt) out.repliedAt = new Date(snippet.publishedAt).toISOString();
  if (parentCommentId) out.parentCommentId = String(parentCommentId);
  return out;
}

// ── adapter ──────────────────────────────────────────────────────────────────

module.exports = {
  key: 'youtube',
  label: 'YouTube',
  capabilities: { publish: true, delete: true, comments: true, reply: true, oauth: true },

  /** Sync: build the Google OAuth2 consent URL. Platform travels in `state`. */
  getAuthUrl({ strapi, account, state }) {
    const { clientId } = clientCreds(strapi, account);
    if (!clientId) {
      throw new base.ProviderError('YouTube OAuth is not configured (missing clientId)', {
        platform: PLATFORM,
      });
    }
    const u = new URL(OAUTH_AUTH_URL);
    u.searchParams.set('client_id', String(clientId));
    u.searchParams.set('redirect_uri', base.redirectUri(strapi));
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('scope', scopeString(strapi));
    // offline + consent guarantees Google returns a refresh_token on first grant.
    u.searchParams.set('access_type', 'offline');
    u.searchParams.set('prompt', 'consent');
    u.searchParams.set('include_granted_scopes', 'true');
    if (state) u.searchParams.set('state', String(state));
    return u.toString();
  },

  /**
   * Exchange the authorization code for tokens, then look up the channel so we
   * can store its id (platform_user_id) and title (account_name).
   */
  async exchangeCode({ strapi, account, code /*, codeVerifier */ }) {
    if (!code) {
      throw new base.ProviderError('Missing OAuth code for YouTube', { platform: PLATFORM });
    }
    const { clientId, clientSecret } = clientCreds(strapi, account);
    if (!clientId || !clientSecret) {
      throw new base.ProviderError('YouTube OAuth is not configured (missing client credentials)', {
        platform: PLATFORM,
      });
    }

    // 1) code → access_token (+ refresh_token, valid only with offline access).
    const tok = await base.httpRequest(OAUTH_TOKEN_URL, {
      method: 'POST',
      platform: PLATFORM,
      form: {
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: base.redirectUri(strapi),
        grant_type: 'authorization_code',
      },
    });
    const accessToken = tok && tok.access_token;
    if (!accessToken) {
      throw new base.ProviderError('Google did not return an access token', {
        platform: PLATFORM,
        raw: tok,
      });
    }

    const patch = {
      access_token: accessToken,
      token_expires_at: tok.expires_in ? base.expiryFromTtl(tok.expires_in) : null,
    };
    // Google only returns refresh_token on the first consent (offline access).
    // Preserve any existing one if this exchange omits it.
    if (tok.refresh_token) patch.refresh_token = tok.refresh_token;

    // 2) Resolve the channel for bookkeeping (id + title). Best-effort: a missing
    //    channel shouldn't block persisting the tokens.
    try {
      const channels = await base.httpRequest(`${API_BASE}/channels`, {
        method: 'GET',
        platform: PLATFORM,
        headers: { Authorization: `Bearer ${accessToken}` },
        query: { part: 'snippet', mine: 'true' },
      });
      const channel = channels && Array.isArray(channels.items) && channels.items[0];
      if (channel && channel.id) {
        patch.platform_user_id = String(channel.id);
        const title = channel.snippet && channel.snippet.title;
        if (title) patch.account_name = title;
      }
    } catch (e) {
      strapi?.log?.warn?.(`[social:youtube] channel lookup failed: ${e.message}`);
    }

    return patch;
  },

  /**
   * Mint a fresh access token from the stored refresh token. Google does NOT
   * return a new refresh_token here, so we keep the existing one. Returns null
   * when there's nothing to refresh with.
   */
  async refreshToken({ strapi, account }) {
    const refresh = account && account.refresh_token;
    if (!refresh) return null; // no basis to refresh; caller must re-run OAuth

    const { clientId, clientSecret } = clientCreds(strapi, account);
    if (!clientId || !clientSecret) return null;

    const tok = await base.httpRequest(OAUTH_TOKEN_URL, {
      method: 'POST',
      platform: PLATFORM,
      form: {
        refresh_token: refresh,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'refresh_token',
      },
    });
    const accessToken = tok && tok.access_token;
    if (!accessToken) return null;

    const patch = { access_token: accessToken };
    if (tok.expires_in) patch.token_expires_at = base.expiryFromTtl(tok.expires_in);
    // refresh_token intentionally not touched — Google reuses the existing one.
    return patch;
  },

  /**
   * Publish a video via a 2-step resumable upload.
   *   1) POST the metadata to initiate; read the `Location` header = upload URL.
   *   2) Fetch the source bytes and PUT them to the upload URL → video resource.
   *
   * CAVEAT: the entire video is buffered into memory (arrayBuffer) before the
   * PUT. That's acceptable for typical social clips (tens of MB) but would be a
   * problem for very large uploads — there's no chunked/streaming path here.
   * Two calls use global `fetch` directly (not base.httpRequest) because we need
   * to read a response header (Location) and send a raw binary body; both still
   * raise base.ProviderError on a non-2xx response.
   */
  async publishPost({ strapi, account, post, media }) {
    const token = tokenFor(account);

    const videoUrl = (media && Array.isArray(media.videoUrls) && media.videoUrls[0]) || null;
    if (!videoUrl) {
      throw new base.ProviderError('YouTube requires a video to publish', { platform: PLATFORM });
    }

    const snippet = {
      title: resolveTitle(post),
      description: (post && post.body) || '',
    };
    const tags = post && post.tags;
    if (Array.isArray(tags) && tags.length) snippet.tags = tags;

    const metadata = {
      snippet,
      status: { privacyStatus: base.extra(account, 'privacy_status', 'private') },
    };

    // ── Step 1: initiate the resumable session ────────────────────────────────
    const initUrl =
      `${UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`;
    let initRes;
    try {
      initRes = await fetch(initUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/*',
        },
        body: JSON.stringify(metadata),
      });
    } catch (e) {
      throw new base.ProviderError(`Network error initiating YouTube upload: ${e.message}`, {
        platform: PLATFORM,
        raw: String(e),
      });
    }
    if (!initRes.ok) {
      const text = await initRes.text().catch(() => '');
      let parsed = null;
      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }
      const msg = base.extractError(parsed) || `HTTP ${initRes.status} ${initRes.statusText}`;
      throw new base.ProviderError(msg, { platform: PLATFORM, status: initRes.status, raw: parsed });
    }
    const uploadUrl = initRes.headers.get('location') || initRes.headers.get('Location');
    if (!uploadUrl) {
      throw new base.ProviderError('YouTube did not return a resumable upload URL (Location header)', {
        platform: PLATFORM,
      });
    }

    // ── Step 2: fetch source bytes and PUT them to the session URL ─────────────
    let bytes;
    let contentType = 'video/*';
    try {
      const src = await fetch(videoUrl);
      if (!src.ok) {
        throw new Error(`HTTP ${src.status} ${src.statusText}`);
      }
      contentType = src.headers.get('content-type') || contentType;
      bytes = Buffer.from(await src.arrayBuffer());
    } catch (e) {
      throw new base.ProviderError(`Failed to download source video for YouTube upload: ${e.message}`, {
        platform: PLATFORM,
        raw: String(e),
      });
    }

    let putRes;
    try {
      putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': contentType,
          'Content-Length': String(bytes.length),
        },
        body: bytes,
      });
    } catch (e) {
      throw new base.ProviderError(`Network error uploading video to YouTube: ${e.message}`, {
        platform: PLATFORM,
        raw: String(e),
      });
    }

    const putText = await putRes.text().catch(() => '');
    let video = null;
    if (putText) {
      try {
        video = JSON.parse(putText);
      } catch {
        video = putText;
      }
    }
    if (!putRes.ok) {
      const msg = base.extractError(video) || `HTTP ${putRes.status} ${putRes.statusText}`;
      throw new base.ProviderError(msg, { platform: PLATFORM, status: putRes.status, raw: video });
    }

    const videoId = video && video.id;
    if (!videoId) {
      throw new base.ProviderError('YouTube did not return a video id after upload', {
        platform: PLATFORM,
        raw: video,
      });
    }

    return {
      platformPostId: String(videoId),
      url: `https://www.youtube.com/watch?v=${videoId}`,
      raw: video,
    };
  },

  /** Delete a video by id. */
  async deletePost({ strapi, account, platformPostId }) {
    if (!platformPostId) return;
    await base.httpRequest(`${API_BASE}/videos`, {
      method: 'DELETE',
      platform: PLATFORM,
      headers: authHeaders(account),
      query: { id: platformPostId },
    });
  },

  /**
   * Read comment threads on a video (top-level + nested replies), newest first,
   * paging via nextPageToken up to a soft cap. Returns [] when comments are
   * disabled (YouTube responds 403 commentsDisabled) so a closed thread doesn't
   * abort the caller.
   */
  async fetchComments({ strapi, account, post, platformPostId, since }) {
    const videoId = platformPostId || (post && post.platformPostId) || null;
    if (!videoId) return [];
    tokenFor(account); // validate early

    const out = [];
    const sinceMs = since ? new Date(since).getTime() : null;
    const beforeSince = (ts) => {
      // Top-level threads come newest-first; once we cross `since` we can stop.
      if (!sinceMs || Number.isNaN(sinceMs)) return false;
      const t = ts ? new Date(ts).getTime() : NaN;
      return !Number.isNaN(t) && t <= sinceMs;
    };

    let pageToken = null;
    for (let page = 0; out.length < COMMENT_PAGE_CAP; page += 1) {
      let res;
      try {
        res = await base.httpRequest(`${API_BASE}/commentThreads`, {
          method: 'GET',
          platform: PLATFORM,
          headers: authHeaders(account),
          query: {
            part: 'snippet,replies',
            videoId,
            maxResults: 100,
            order: 'time',
            pageToken: pageToken || undefined,
          },
        });
      } catch (e) {
        // Comments disabled / not found → return what we have (likely nothing).
        if (e && (e.status === 403 || e.status === 404)) return out;
        // Otherwise tolerate a mid-paging failure if we already collected some.
        if (out.length) break;
        throw e;
      }

      const items = (res && Array.isArray(res.items) && res.items) || [];
      for (const thread of items) {
        const top = thread && thread.snippet && thread.snippet.topLevelComment;
        const topId = top && top.id;
        const topSnippet = top && top.snippet;
        if (topId && topSnippet) {
          if (beforeSince(topSnippet.publishedAt)) return out;
          const normalized = normalizeComment(topId, topSnippet, null);
          if (normalized) out.push(normalized);
        }

        // Nested replies (the API returns up to ~5 inline; deeper threads would
        // need comments.list, which we don't page here).
        const replies =
          (thread && thread.replies && Array.isArray(thread.replies.comments) && thread.replies.comments) || [];
        for (const reply of replies) {
          const normalized = normalizeComment(reply && reply.id, reply && reply.snippet, topId);
          if (normalized) out.push(normalized);
          if (out.length >= COMMENT_PAGE_CAP) break;
        }
        if (out.length >= COMMENT_PAGE_CAP) break;
      }

      pageToken = (res && res.nextPageToken) || null;
      if (!pageToken) break;
    }

    return out;
  },

  /**
   * Reply to a comment, or post a top-level comment on the video.
   *   parentCommentId → POST /comments        { snippet: { parentId, textOriginal } }
   *   otherwise       → POST /commentThreads  { snippet: { videoId, topLevelComment } }
   */
  async postReply({ strapi, account, post, platformPostId, parentCommentId, body }) {
    const text = body || '';
    const headers = authHeaders(account);

    if (parentCommentId) {
      const raw = await base.httpRequest(`${API_BASE}/comments`, {
        method: 'POST',
        platform: PLATFORM,
        headers,
        query: { part: 'snippet' },
        json: { snippet: { parentId: String(parentCommentId), textOriginal: text } },
      });
      const id = raw && raw.id;
      if (!id) {
        throw new base.ProviderError('YouTube did not return a comment id for the reply', {
          platform: PLATFORM,
          raw,
        });
      }
      return { platformCommentId: String(id), raw };
    }

    // Top-level comment on the video.
    const videoId = platformPostId || (post && post.platformPostId) || null;
    if (!videoId) {
      throw new base.ProviderError('YouTube reply requires a parent comment id or a video id', {
        platform: PLATFORM,
      });
    }
    const raw = await base.httpRequest(`${API_BASE}/commentThreads`, {
      method: 'POST',
      platform: PLATFORM,
      headers,
      query: { part: 'snippet' },
      json: {
        snippet: {
          videoId: String(videoId),
          topLevelComment: { snippet: { textOriginal: text } },
        },
      },
    });
    // commentThreads.insert returns the thread; the comment id is the
    // topLevelComment id (fall back to the thread id).
    const topId = raw && raw.snippet && raw.snippet.topLevelComment && raw.snippet.topLevelComment.id;
    const id = topId || (raw && raw.id);
    if (!id) {
      throw new base.ProviderError('YouTube did not return a comment id for the top-level comment', {
        platform: PLATFORM,
        raw,
      });
    }
    return { platformCommentId: String(id), raw };
  },
};
