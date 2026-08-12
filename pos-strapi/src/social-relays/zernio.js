'use strict';

// Zernio relay adapter (formerly Late / getlate.dev) — https://docs.zernio.com
//
// API surface used (Authorization: Bearer sk_…):
//   Accounts  GET  https://zernio.com/api/v1/accounts   → [{ _id, platform }]
//   Publish   POST https://zernio.com/api/v1/posts
//               { content, publishNow: true,
//                 platforms: [{ platform, accountId }],
//                 mediaItems: [{ type: 'image'|'video', url }] }
//   Delete    DELETE https://zernio.com/api/v1/posts/{id}
//
// Zernio addresses its connected accounts by id, so each requested rutba
// platform resolves to every matching connected account.

const base = require('./base');

const PROVIDER = 'zernio';
const API = 'https://zernio.com/api/v1';

// rutba platform key → Zernio platform name
const PLATFORM_MAP = {
  facebook: 'facebook',
  instagram: 'instagram',
  x: 'twitter',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

function headers(relay) {
  return { Authorization: `Bearer ${base.apiKey(relay, PROVIDER)}` };
}

function apiBase(relay) {
  return base.baseUrl(relay, API);
}

async function listAccounts(relay) {
  const data = await base.httpRequest(`${apiBase(relay)}/accounts`, {
    headers: headers(relay), platform: PROVIDER,
  });
  return Array.isArray(data) ? data : (Array.isArray(data?.accounts) ? data.accounts : []);
}

module.exports = {
  key: PROVIDER,
  label: 'Zernio (formerly Late)',
  docsUrl: 'https://docs.zernio.com',
  needsApiUrl: 'no',
  targetLabel: null,
  capabilities: { publish: true, delete: true, validate: true, schedule: true },
  platforms: Object.keys(PLATFORM_MAP),
  help: {
    setup: 'Connect your social accounts on the Zernio dashboard, then create an API key (sk_…) under Settings → API.',
    note: 'getlate.dev rebranded to Zernio — existing Late keys and accounts carry over.',
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
        ? `Key OK — connected on Zernio: ${names.join(', ')}`
        : 'Key OK — no social accounts connected on Zernio yet',
    };
  },

  async publishPost({ relay, post, media, platforms }) {
    const accounts = await listAccounts(relay);
    const perPlatform = {};
    const targets = [];

    for (const p of platforms) {
      const wanted = PLATFORM_MAP[p];
      const matches = accounts.filter((a) => String(a.platform || '').toLowerCase() === wanted);
      if (!matches.length) {
        perPlatform[p] = {
          status: 'error', platformPostId: null, url: null,
          error: `No ${p} account is connected on Zernio`,
        };
        continue;
      }
      for (const a of matches) {
        targets.push({ platform: p, entry: { platform: wanted, accountId: a._id || a.id } });
      }
    }

    if (!targets.length) return { relayPostId: null, url: null, perPlatform, raw: null };

    const mediaItems = [
      ...(media.imageUrls || []).map((url) => ({ type: 'image', url })),
      ...(media.videoUrls || []).map((url) => ({ type: 'video', url })),
    ];
    const body = {
      content: base.composeText(post),
      publishNow: true,
      platforms: targets.map((t) => t.entry),
    };
    if (mediaItems.length) body.mediaItems = mediaItems;

    const data = await base.httpRequest(`${apiBase(relay)}/posts`, {
      method: 'POST', headers: headers(relay), json: body, platform: PROVIDER,
    });

    // Zernio publishes asynchronously (scheduled → publishing → published) —
    // the create response has the post _id; per-platform URLs appear later.
    const relayPostId = data?._id || data?.id || data?.post?._id || null;
    for (const t of targets) {
      if (!perPlatform[t.platform] || perPlatform[t.platform].status === 'error') {
        perPlatform[t.platform] = {
          status: 'pending', platformPostId: null, url: null, error: null,
          note: 'queued on Zernio',
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
