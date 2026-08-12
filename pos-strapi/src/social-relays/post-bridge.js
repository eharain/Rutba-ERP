'use strict';

// Post Bridge relay adapter — https://api.post-bridge.com/reference
//
// API surface used (Authorization: Bearer pb_live_…):
//   Accounts  GET  https://api.post-bridge.com/v1/social-accounts
//   Upload    POST https://api.post-bridge.com/v1/media/create-upload-url
//               { name, mime_type, size_bytes } → { media_id, upload_url }
//             then PUT the bytes to upload_url
//   Publish   POST https://api.post-bridge.com/v1/posts
//               { caption, social_accounts: [ids], media: [media_ids] }
//   Delete    DELETE https://api.post-bridge.com/v1/posts/{id}
//
// NOTE: Post Bridge's REST reference is a rendered app that can't be scraped,
// so these shapes follow their published CLI/skill semantics (accounts by id,
// media uploaded first and referenced by id). Any drift shows up as a clean
// per-platform error via ProviderError — the Test button is the quick probe.

const base = require('./base');

const PROVIDER = 'post_bridge';
const API = 'https://api.post-bridge.com/v1';

// rutba platform key → Post Bridge platform name (matched loosely on accounts)
const PLATFORM_MAP = {
  facebook: 'facebook',
  instagram: 'instagram',
  x: 'x',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

// Post Bridge has called X both 'x' and 'twitter' across surfaces — accept either.
const PLATFORM_ALIASES = { x: ['x', 'twitter'] };

function headers(relay) {
  return { Authorization: `Bearer ${base.apiKey(relay, PROVIDER)}` };
}

function apiBase(relay) {
  return base.baseUrl(relay, API);
}

function matchesPlatform(rutbaKey, accountPlatform) {
  const got = String(accountPlatform || '').toLowerCase();
  const accepted = PLATFORM_ALIASES[rutbaKey] || [PLATFORM_MAP[rutbaKey]];
  return accepted.includes(got);
}

async function listAccounts(relay) {
  const data = await base.httpRequest(`${apiBase(relay)}/social-accounts`, {
    headers: headers(relay), platform: PROVIDER,
  });
  return Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
}

module.exports = {
  key: PROVIDER,
  label: 'Post Bridge',
  docsUrl: 'https://api.post-bridge.com/reference',
  needsApiUrl: 'no',
  targetLabel: null,
  capabilities: { publish: true, delete: true, validate: true, schedule: true },
  platforms: Object.keys(PLATFORM_MAP),
  help: {
    setup: 'Connect your accounts on the Post Bridge dashboard, enable the API add-on, then paste the pb_live_… key here.',
    note: 'The API is a paid add-on on top of the base plan.',
  },

  mapPlatform(rutbaKey) {
    return PLATFORM_MAP[rutbaKey] || null;
  },

  async validate({ relay }) {
    const accounts = await listAccounts(relay);
    const names = [...new Set(accounts.map((a) => String(a.platform || '').toLowerCase()).filter(Boolean))];
    return {
      ok: true,
      detail: names.length
        ? `Key OK — connected on Post Bridge: ${names.join(', ')}`
        : 'Key OK — no social accounts connected on Post Bridge yet',
    };
  },

  async publishPost({ relay, post, media, platforms }) {
    const accounts = await listAccounts(relay);
    const perPlatform = {};
    const accountIds = [];

    for (const p of platforms) {
      const matches = accounts.filter((a) => matchesPlatform(p, a.platform));
      if (!matches.length) {
        perPlatform[p] = {
          status: 'error', platformPostId: null, url: null,
          error: `No ${p} account is connected on Post Bridge`,
        };
        continue;
      }
      for (const a of matches) accountIds.push(a.id);
    }

    if (!accountIds.length) return { relayPostId: null, url: null, perPlatform, raw: null };

    // Upload media first, reference by id.
    const mediaIds = [];
    const urls = [...(media.imageUrls || []), ...(media.videoUrls || [])];
    for (const url of urls) {
      const { blob, filename, contentType } = await base.fetchAsBlob(url, PROVIDER);
      const created = await base.httpRequest(`${apiBase(relay)}/media/create-upload-url`, {
        method: 'POST', headers: headers(relay), platform: PROVIDER,
        json: { name: filename, mime_type: contentType, size_bytes: blob.size },
      });
      const uploadUrl = created?.upload_url || created?.uploadUrl;
      const mediaId = created?.media_id || created?.mediaId || created?.id;
      if (!uploadUrl || !mediaId) {
        throw new base.ProviderError('Post Bridge did not return an upload URL', { platform: PROVIDER, raw: created });
      }
      await base.httpRequest(uploadUrl, {
        method: 'PUT', headers: { 'Content-Type': contentType }, body: Buffer.from(await blob.arrayBuffer()),
        platform: PROVIDER, expect: 'raw',
      });
      mediaIds.push(mediaId);
    }

    const body = {
      caption: base.composeText(post),
      social_accounts: [...new Set(accountIds)],
    };
    if (mediaIds.length) body.media = mediaIds;

    const data = await base.httpRequest(`${apiBase(relay)}/posts`, {
      method: 'POST', headers: headers(relay), json: body, platform: PROVIDER,
    });

    const relayPostId = data?.id || data?.data?.id || null;
    for (const p of platforms) {
      if (!perPlatform[p]) {
        perPlatform[p] = {
          status: 'pending', platformPostId: null, url: null, error: null,
          note: 'queued on Post Bridge',
        };
      }
    }
    return { relayPostId, url: null, perPlatform, raw: data };
  },

  async deletePost({ relay, relayPostId }) {
    await base.httpRequest(`${apiBase(relay)}/posts/${encodeURIComponent(relayPostId)}`, {
      method: 'DELETE', headers: headers(relay), platform: PROVIDER,
    });
  },
};
