'use strict';

// Facebook Pages provider adapter.
//
// Publishes to a Facebook Page via the Graph API. Reads/writes go through a
// PAGE access token (account.access_token), which is derived from a long-lived
// user token during OAuth. Page tokens issued off a long-lived user token are
// effectively non-expiring, so refreshToken usually no-ops.
//
// Graph API surface used (version from provider config, e.g. v25.0):
//   Publish text     POST /{page-id}/feed     { message }                  → { id }
//   Publish photo    POST /{page-id}/photos   { url, caption }             → { id, post_id }
//   Publish video    POST /{page-id}/videos   { file_url, description }    → { id }
//   Delete           DELETE /{post-id}
//   Read comments    GET  /{post-id}/comments?fields=...&filter=stream
//   Reply            POST /{post-id|comment-id}/comments { message }       → { id }
// OAuth:
//   Consent          https://www.facebook.com/{ver}/dialog/oauth
//   Code → token     GET /oauth/access_token (code grant)
//   Long-lived       GET /oauth/access_token (grant_type=fb_exchange_token)
//   Page token       GET /me/accounts?fields=name,access_token,id

const base = require('./base');

const PLATFORM = 'facebook';

// ── helpers ──────────────────────────────────────────────────────────────────

function graphVersion(strapi) {
  const cfg = base.getProviderConfig(strapi, PLATFORM);
  return cfg.graphVersion || 'v25.0';
}

function graphBase(strapi) {
  return `https://graph.facebook.com/${graphVersion(strapi)}`;
}

/** OAuth client credentials: account-level overrides win over provider config. */
function clientCreds(strapi, account) {
  const cfg = base.getProviderConfig(strapi, PLATFORM);
  const clientId = (account && account.api_key) || cfg.clientId;
  const clientSecret = (account && account.api_secret) || cfg.clientSecret;
  return { clientId, clientSecret };
}

/** The Page access token used for all publish/read/reply calls. */
function tokenFor(account) {
  const token = account && account.access_token;
  if (!token) {
    throw new base.ProviderError('Facebook account is missing a page access token', {
      platform: PLATFORM,
    });
  }
  return token;
}

/** The Facebook Page id we publish to. */
function pageId(account) {
  const id = account && account.page_id;
  if (!id) {
    throw new base.ProviderError('Facebook account is missing a page_id', { platform: PLATFORM });
  }
  return id;
}

// ── adapter ──────────────────────────────────────────────────────────────────

module.exports = {
  key: PLATFORM,
  label: 'Facebook',
  capabilities: { publish: true, delete: true, comments: true, reply: true, oauth: true },

  /** Sync: build the Facebook OAuth consent URL. Platform travels in `state`. */
  getAuthUrl({ strapi, account, state }) {
    const cfg = base.getProviderConfig(strapi, PLATFORM);
    const { clientId } = clientCreds(strapi, account);
    if (!clientId) {
      throw new base.ProviderError('Facebook OAuth is not configured (missing clientId)', {
        platform: PLATFORM,
      });
    }
    const u = new URL(`https://www.facebook.com/${graphVersion(strapi)}/dialog/oauth`);
    u.searchParams.set('client_id', String(clientId));
    u.searchParams.set('redirect_uri', base.redirectUri(strapi));
    u.searchParams.set('response_type', 'code');
    if (state) u.searchParams.set('state', String(state));
    if (cfg.scopes) {
      u.searchParams.set('scope', Array.isArray(cfg.scopes) ? cfg.scopes.join(',') : String(cfg.scopes));
    }
    return u.toString();
  },

  /**
   * Exchange the OAuth code for a page access token:
   *   code → short-lived user token → long-lived user token →
   *   /me/accounts → pick the page → store its (non-expiring) page token.
   */
  async exchangeCode({ strapi, account, code /*, codeVerifier */ }) {
    if (!code) {
      throw new base.ProviderError('Missing OAuth code for Facebook', { platform: PLATFORM });
    }
    const { clientId, clientSecret } = clientCreds(strapi, account);
    if (!clientId || !clientSecret) {
      throw new base.ProviderError('Facebook OAuth is not configured (missing client credentials)', {
        platform: PLATFORM,
      });
    }
    const api = graphBase(strapi);

    // 1) Authorization code → short-lived user access token.
    const short = await base.httpRequest(`${api}/oauth/access_token`, {
      method: 'GET',
      platform: PLATFORM,
      query: {
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: base.redirectUri(strapi),
        code,
      },
    });
    const shortToken = short && short.access_token;
    if (!shortToken) {
      throw new base.ProviderError('Facebook did not return a user access token', {
        platform: PLATFORM,
        raw: short,
      });
    }

    // 2) Short-lived → long-lived user token (≈60 days; page tokens derived
    //    from it are effectively non-expiring).
    let userToken = shortToken;
    let userTokenTtl = null;
    try {
      const long = await base.httpRequest(`${api}/oauth/access_token`, {
        method: 'GET',
        platform: PLATFORM,
        query: {
          grant_type: 'fb_exchange_token',
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: shortToken,
        },
      });
      if (long && long.access_token) {
        userToken = long.access_token;
        userTokenTtl = long.expires_in || null;
      }
    } catch (e) {
      // Fall back to the short-lived token if the exchange is unavailable.
      strapi?.log?.warn?.(`[social:facebook] long-lived token exchange failed: ${e.message}`);
    }

    // 3) Identify the user (app-scoped id) for bookkeeping.
    let platformUserId = null;
    try {
      const me = await base.httpRequest(`${api}/me`, {
        method: 'GET',
        platform: PLATFORM,
        query: { fields: 'id', access_token: userToken },
      });
      platformUserId = (me && me.id) || null;
    } catch (e) {
      strapi?.log?.warn?.(`[social:facebook] /me lookup failed: ${e.message}`);
    }

    // 4) List managed pages and select the target page.
    const accounts = await base.httpRequest(`${api}/me/accounts`, {
      method: 'GET',
      platform: PLATFORM,
      query: { fields: 'name,access_token,id', access_token: userToken },
    });
    const pages = (accounts && Array.isArray(accounts.data) && accounts.data) || [];
    if (!pages.length) {
      throw new base.ProviderError(
        'No Facebook Pages available for this user — grant a page during the login flow',
        { platform: PLATFORM, raw: accounts },
      );
    }
    const wanted = account && account.page_id;
    const page = (wanted && pages.find((p) => p && String(p.id) === String(wanted))) || pages[0];
    if (!page || !page.access_token) {
      throw new base.ProviderError('Could not resolve a Facebook Page access token', {
        platform: PLATFORM,
        raw: accounts,
      });
    }

    const patch = {
      access_token: page.access_token, // page token = effectively non-expiring
      page_id: page.id,
      account_name: page.name || (account && account.account_name) || null,
      platform_user_id: platformUserId,
      // Page tokens normally omit expires_in; only set when the user token
      // carried one (the page token's lifetime tracks the user token).
      token_expires_at: userTokenTtl ? base.expiryFromTtl(userTokenTtl) : null,
      // Stash the long-lived user token so refreshToken can re-derive later.
      extra_config: { user_access_token: userToken },
    };
    return patch;
  },

  /**
   * Page tokens generally do not expire. If an expiry is tracked and near, try
   * to re-derive the page token from the stored long-lived user token. Returns
   * null when there is nothing to do.
   */
  async refreshToken({ strapi, account }) {
    if (!base.tokenExpired(account)) return null;

    const userToken = base.extra(account, 'user_access_token', null);
    if (!userToken) return null; // no basis to refresh; leave as-is

    const api = graphBase(strapi);
    let accounts;
    try {
      accounts = await base.httpRequest(`${api}/me/accounts`, {
        method: 'GET',
        platform: PLATFORM,
        query: { fields: 'name,access_token,id', access_token: userToken },
      });
    } catch (e) {
      // User token itself has likely expired — caller must re-run OAuth.
      return null;
    }
    const pages = (accounts && Array.isArray(accounts.data) && accounts.data) || [];
    const wanted = account && account.page_id;
    const page = (wanted && pages.find((p) => p && String(p.id) === String(wanted))) || pages[0];
    if (!page || !page.access_token) return null;

    return {
      access_token: page.access_token,
      page_id: page.id,
      account_name: page.name || (account && account.account_name) || null,
      token_expires_at: null, // re-derived page token: non-expiring again
    };
  },

  /**
   * Publish a post. Preference order: video → photo → text.
   *   video: POST /{page-id}/videos { file_url, description }
   *   photo: POST /{page-id}/photos { url, caption }   (returns id + post_id)
   *   text:  POST /{page-id}/feed   { message }
   */
  async publishPost({ strapi, account, post, media }) {
    const token = tokenFor(account);
    const id = pageId(account);
    const api = graphBase(strapi);
    const message = (post && post.body) || '';

    const videoUrl = media && Array.isArray(media.videoUrls) && media.videoUrls[0];
    const imageUrls = (media && Array.isArray(media.imageUrls) && media.imageUrls.length)
      ? media.imageUrls
      : (media && media.coverUrl ? [media.coverUrl] : []);

    let raw;
    if (videoUrl) {
      raw = await base.httpRequest(`${api}/${encodeURIComponent(id)}/videos`, {
        method: 'POST',
        platform: PLATFORM,
        form: { file_url: videoUrl, description: message, access_token: token },
      });
    } else if (imageUrls.length > 1) {
      // Multi-photo: upload each image unpublished, then attach them all to one
      // feed story (Facebook's native album/multi-photo post).
      const attached = [];
      for (const url of imageUrls.slice(0, 10)) {
        try {
          const photo = await base.httpRequest(`${api}/${encodeURIComponent(id)}/photos`, {
            method: 'POST',
            platform: PLATFORM,
            form: { url, published: 'false', access_token: token },
          });
          if (photo && photo.id) attached.push({ media_fbid: photo.id });
        } catch (e) {
          strapi && strapi.log && strapi.log.warn(`[social:facebook] album photo upload failed for one image, skipping it: ${e.message}`);
        }
      }
      if (attached.length === 0) {
        throw new base.ProviderError('Facebook rejected every album photo', { platform: PLATFORM });
      }
      raw = await base.httpRequest(`${api}/${encodeURIComponent(id)}/feed`, {
        method: 'POST',
        platform: PLATFORM,
        form: { message, access_token: token, attached_media: JSON.stringify(attached) },
      });
    } else if (imageUrls.length === 1) {
      raw = await base.httpRequest(`${api}/${encodeURIComponent(id)}/photos`, {
        method: 'POST',
        platform: PLATFORM,
        form: { url: imageUrls[0], caption: message, access_token: token },
      });
    } else {
      raw = await base.httpRequest(`${api}/${encodeURIComponent(id)}/feed`, {
        method: 'POST',
        platform: PLATFORM,
        form: { message, access_token: token },
      });
    }

    // Photos return both `id` (photo) and `post_id` (the feed story). Prefer the
    // story id so deletes/comments target the post. The public URL is built from
    // whichever id we have.
    const platformPostId = (raw && (raw.post_id || raw.id)) || null;
    const urlId = (raw && (raw.post_id || raw.id)) || '';
    if (!platformPostId) {
      throw new base.ProviderError('Facebook did not return a post id', {
        platform: PLATFORM,
        raw,
      });
    }

    return {
      platformPostId,
      url: `https://www.facebook.com/${urlId}`,
      raw,
    };
  },

  /** Delete a post/photo/video by id using the page token. */
  async deletePost({ strapi, account, platformPostId }) {
    const token = tokenFor(account);
    if (!platformPostId) return;
    const api = graphBase(strapi);
    await base.httpRequest(`${api}/${encodeURIComponent(platformPostId)}`, {
      method: 'DELETE',
      platform: PLATFORM,
      query: { access_token: token },
    });
  },

  /**
   * Read comments on a post (all levels, newest first), following paging.next
   * up to a soft cap. `from` may be absent without elevated permissions — every
   * author field is read defensively.
   */
  async fetchComments({ strapi, account, post, platformPostId, since }) {
    const token = tokenFor(account);
    if (!platformPostId) return [];
    const api = graphBase(strapi);

    const out = [];
    const seen = new Set();
    const CAP = 200;

    let url = `${api}/${encodeURIComponent(platformPostId)}/comments`;
    let query = {
      fields: 'id,message,from{name,id,picture},created_time,parent,comment_count',
      filter: 'stream',
      order: 'reverse_chronological',
      limit: 100,
      access_token: token,
    };

    while (url && out.length < CAP) {
      let page;
      try {
        page = await base.httpRequest(url, { method: 'GET', platform: PLATFORM, query });
      } catch (e) {
        // Surface hard failures; an empty/last page just stops the loop.
        throw e;
      }

      const rows = (page && Array.isArray(page.data) && page.data) || [];
      for (const c of rows) {
        if (!c || !c.id || seen.has(c.id)) continue;
        seen.add(c.id);

        const repliedAt = c.created_time ? new Date(c.created_time).toISOString() : undefined;
        // Stop early once we cross the `since` watermark (newest-first order).
        if (since && repliedAt && new Date(repliedAt).getTime() <= new Date(since).getTime()) {
          return out;
        }

        const from = c.from || null;
        out.push({
          platformCommentId: c.id,
          body: c.message || '',
          authorName: from?.name || undefined,
          authorHandle: from?.id || undefined,
          authorAvatarUrl: from?.picture?.data?.url || undefined,
          repliedAt,
          parentCommentId: c.parent?.id || undefined,
        });
        if (out.length >= CAP) break;
      }

      // Cursor-style paging: paging.next is a full URL with its own params.
      const next = page?.paging?.next || null;
      url = next || null;
      query = undefined; // next already carries access_token + cursor
    }

    return out;
  },

  /**
   * Reply to a post or to a specific comment.
   *   parentCommentId → POST /{comment-id}/comments
   *   otherwise       → POST /{post-id}/comments
   */
  async postReply({ strapi, account, post, platformPostId, parentCommentId, body }) {
    const token = tokenFor(account);
    const api = graphBase(strapi);
    const targetId = parentCommentId || platformPostId;
    if (!targetId) {
      throw new base.ProviderError('postReply requires a parent comment id or post id', {
        platform: PLATFORM,
      });
    }

    const raw = await base.httpRequest(`${api}/${encodeURIComponent(targetId)}/comments`, {
      method: 'POST',
      platform: PLATFORM,
      form: { message: body || '', access_token: token },
    });

    const platformCommentId = (raw && raw.id) || null;
    if (!platformCommentId) {
      throw new base.ProviderError('Facebook did not return a comment id', {
        platform: PLATFORM,
        raw,
      });
    }
    return { platformCommentId, raw };
  },
};
