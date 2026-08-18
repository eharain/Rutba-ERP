'use strict';

// Custom webhook relay adapter.
//
// For any aggregator we don't have a first-class adapter for (BulkPublish, an
// n8n/Make flow, a self-built bridge): POSTs a normalized JSON payload to the
// configured api_url with the api_key as a Bearer token. The receiver does the
// actual platform fan-out and may respond with per-platform results.
//
//   POST {api_url}
//     Authorization: Bearer {api_key}      (omitted when no key is set)
//     { source: 'apps/content/social', event: 'publish',
//       post: { id, title, body, tags },
//       platforms: ['facebook', …],
//       media: { imageUrls, videoUrls } }
//
// Expected (all optional) response fields:
//   { id, url, perPlatform: { facebook: { status, postId, url, error }, … } }
// Anything else → every requested platform is marked from the HTTP outcome.

const base = require('./base');

const PROVIDER = 'custom';

const ALL_PLATFORMS = ['facebook', 'instagram', 'x', 'linkedin', 'tiktok', 'youtube', 'whatsapp'];

function headers(relay) {
  const h = { 'X-Rutba-Source': 'apps/content/social' };
  if (relay.api_key) h.Authorization = `Bearer ${relay.api_key}`;
  return h;
}

function endpoint(relay) {
  const url = base.baseUrl(relay, '');
  if (!url) {
    throw new base.ProviderError('Custom relay needs an API URL (the webhook to POST posts to)', {
      platform: PROVIDER,
    });
  }
  return url;
}

module.exports = {
  key: PROVIDER,
  label: 'Custom webhook',
  websiteUrl: null,
  docsUrl: null,
  apiBase: null,
  needsApiUrl: 'required',
  targetLabel: null,
  capabilities: { publish: true, delete: false, validate: true, schedule: false },
  platforms: ALL_PLATFORMS,
  help: {
    signup: 'No provider account — bring any endpoint that can receive a JSON POST (an n8n/Make flow, your own bridge, another aggregator).',
    connect: 'Set the API URL below to that endpoint. Each push POSTs { source, event, post: { title, body, tags }, platforms, media: { imageUrls, videoUrls } }.',
    key: 'Optional: set an API key and the receiver gets it as a Bearer token to authenticate the calls.',
    note: 'The receiver can reply with per-platform results ({ perPlatform: { facebook: { status, postId, url } } }) to light up the result badges.',
  },

  mapPlatform(rutbaKey) {
    return ALL_PLATFORMS.includes(rutbaKey) ? rutbaKey : null;
  },

  async validate({ relay }) {
    // A webhook has no standard probe — an OPTIONS/HEAD-friendly GET with a
    // ?ping=1 marker lets receivers implement a cheap health check if they want.
    try {
      await base.httpRequest(endpoint(relay), {
        headers: headers(relay), query: { ping: 1 }, platform: PROVIDER, expect: 'raw',
      });
      return { ok: true, detail: 'Endpoint reachable' };
    } catch (e) {
      // 4xx from a POST-only receiver still proves reachability.
      if (e && e.status && e.status < 500) {
        return { ok: true, detail: `Endpoint reachable (GET returned HTTP ${e.status} — fine for a POST-only webhook)` };
      }
      throw e;
    }
  },

  async publishPost({ relay, post, media, platforms }) {
    const payload = {
      source: 'apps/content/social',
      event: 'publish',
      post: {
        id: post.documentId,
        title: post.title || '',
        body: base.composeText(post),
        tags: Array.isArray(post.tags) ? post.tags : [],
      },
      platforms,
      media: {
        imageUrls: media.imageUrls || [],
        videoUrls: media.videoUrls || [],
      },
    };

    const data = await base.httpRequest(endpoint(relay), {
      method: 'POST', headers: headers(relay), json: payload, platform: PROVIDER,
    });

    const perPlatform = {};
    const reported = data && typeof data === 'object' ? data.perPlatform : null;
    for (const p of platforms) {
      const r = reported && reported[p];
      if (r && typeof r === 'object') {
        perPlatform[p] = {
          status: ['success', 'error', 'pending'].includes(r.status) ? r.status : 'pending',
          platformPostId: r.postId || r.platformPostId || null,
          url: r.url || null,
          error: r.error || null,
        };
      } else {
        // 2xx with no detail = accepted by the receiver.
        perPlatform[p] = {
          status: 'pending', platformPostId: null, url: null, error: null,
          note: 'accepted by the custom webhook',
        };
      }
    }
    return { relayPostId: (data && (data.id || data.postId)) || null, url: (data && data.url) || null, perPlatform, raw: data };
  },

  async deletePost() {
    throw new base.ProviderError('Custom webhook relays do not support delete', { platform: PROVIDER });
  },
};
