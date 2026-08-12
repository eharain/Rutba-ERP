'use strict';

// Ayrshare relay adapter — https://www.ayrshare.com/docs
//
// API surface used:
//   Publish   POST   https://api.ayrshare.com/api/post
//               { post, platforms[], mediaUrls[], scheduleDate? }
//               → { status, id, postIds: [{ status, platform, id, postUrl }] }
//   Delete    DELETE https://api.ayrshare.com/api/post   { id }
//   Validate  GET    https://api.ayrshare.com/api/user   → profile + linked accounts
// Auth: `Authorization: Bearer <API key>`. Multi-profile (Business plan) selects
// the tenant profile with a `Profile-Key` header — stored in target_id.
// Media is ingested by public URL (PUBLIC_URL must be reachable).

const base = require('./base');

const PROVIDER = 'ayrshare';
const API = 'https://api.ayrshare.com/api';

// rutba platform key → Ayrshare platform name
const PLATFORM_MAP = {
  facebook: 'facebook',
  instagram: 'instagram',
  x: 'twitter',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

function headers(relay) {
  const h = { Authorization: `Bearer ${base.apiKey(relay, PROVIDER)}` };
  if (relay.target_id) h['Profile-Key'] = relay.target_id;
  return h;
}

module.exports = {
  key: PROVIDER,
  label: 'Ayrshare',
  docsUrl: 'https://www.ayrshare.com/docs',
  needsApiUrl: 'no',
  targetLabel: 'Profile Key (Business plan, optional)',
  capabilities: { publish: true, delete: true, validate: true, schedule: true },
  platforms: Object.keys(PLATFORM_MAP),
  help: {
    setup: 'Create an Ayrshare account, link your social accounts on the Ayrshare dashboard, then paste the API key from Settings → API Key.',
    note: 'No Meta/TikTok developer apps needed — Ayrshare owns the platform approvals. On the multi-profile Business plan, set the tenant\'s Profile Key too.',
  },

  mapPlatform(rutbaKey) {
    return PLATFORM_MAP[rutbaKey] || null;
  },

  async validate({ relay }) {
    const data = await base.httpRequest(`${API}/user`, {
      headers: headers(relay), platform: PROVIDER,
    });
    const linked = Array.isArray(data?.activeSocialAccounts) ? data.activeSocialAccounts : [];
    return {
      ok: true,
      detail: linked.length
        ? `Key OK — linked on Ayrshare: ${linked.join(', ')}`
        : 'Key OK — no social accounts linked on the Ayrshare dashboard yet',
    };
  },

  async publishPost({ relay, post, media, platforms }) {
    const mapped = platforms.map((p) => PLATFORM_MAP[p]);
    const body = {
      post: base.composeText(post) || (post.title || ''),
      platforms: mapped,
    };
    const mediaUrls = [...(media.imageUrls || []), ...(media.videoUrls || [])];
    if (mediaUrls.length) body.mediaUrls = mediaUrls;

    const data = await base.httpRequest(`${API}/post`, {
      method: 'POST', headers: headers(relay), json: body, platform: PROVIDER,
    });

    // postIds: [{ status, platform, id, postUrl }] — platform in Ayrshare names.
    const byProvider = {};
    for (const r of data?.postIds || []) {
      if (r && r.platform) byProvider[String(r.platform).toLowerCase()] = r;
    }
    const perPlatform = {};
    for (const p of platforms) {
      const r = byProvider[PLATFORM_MAP[p]];
      if (r) {
        perPlatform[p] = {
          status: r.status === 'success' ? 'success' : 'error',
          platformPostId: r.id || null,
          url: r.postUrl || null,
          error: r.status === 'success' ? null : (base.extractError(r) || `Ayrshare reported status "${r.status}"`),
        };
      } else {
        // No per-platform row — fall back to the envelope status.
        const ok = data?.status === 'success' || data?.status === 'scheduled';
        perPlatform[p] = {
          status: ok ? 'success' : 'error',
          platformPostId: null, url: null,
          error: ok ? null : (base.extractError(data) || 'No result returned for this platform'),
        };
      }
    }
    return { relayPostId: data?.id || null, url: null, perPlatform, raw: data };
  },

  async deletePost({ relay, relayPostId }) {
    await base.httpRequest(`${API}/post`, {
      method: 'DELETE', headers: headers(relay), json: { id: relayPostId }, platform: PROVIDER,
    });
  },
};
