'use strict';

// Postiz relay adapter — https://docs.postiz.com/public-api
//
// Works against Postiz cloud OR a self-hosted instance (set api_url to the
// self-hosted backend origin; /public/v1 is appended when absent).
//
// API surface used (Authorization: <api key> — no Bearer prefix):
//   Channels  GET    /integrations            → [{ id, name, identifier }]
//   Upload    POST   /upload  (multipart)     → { id, path }
//   Publish   POST   /posts
//               { type: 'now', date, posts: [{ integration: { id },
//                 value: [{ content, image: [{ id, path }] }] }] }
//   Delete    DELETE /posts/{id}   (404 = already gone, safe)
//
// Postiz posts to INTEGRATIONS (its connected channels), so each requested
// rutba platform resolves to every matching integration by its identifier.

const base = require('./base');

const PROVIDER = 'postiz';
const CLOUD_API = 'https://api.postiz.com/public/v1';

// rutba platform key → Postiz integration identifier
const PLATFORM_MAP = {
  facebook: 'facebook',
  instagram: 'instagram',
  x: 'x',
  linkedin: 'linkedin',
  tiktok: 'tiktok',
  youtube: 'youtube',
};

function apiBase(relay) {
  const url = base.baseUrl(relay, CLOUD_API);
  return /\/public\/v1$/.test(url) ? url : `${url}/public/v1`;
}

function headers(relay) {
  return { Authorization: base.apiKey(relay, PROVIDER) };
}

/** identifier ('facebook', 'x', …) pulled from the various shapes Postiz uses. */
function integrationIdentifier(integration) {
  const raw = integration?.identifier ?? integration?.providerIdentifier ?? '';
  return String(raw).toLowerCase();
}

async function listIntegrations(relay) {
  const data = await base.httpRequest(`${apiBase(relay)}/integrations`, {
    headers: headers(relay), platform: PROVIDER,
  });
  return Array.isArray(data) ? data : (Array.isArray(data?.integrations) ? data.integrations : []);
}

module.exports = {
  key: PROVIDER,
  label: 'Postiz',
  docsUrl: 'https://docs.postiz.com/public-api',
  needsApiUrl: 'optional',
  targetLabel: null,
  capabilities: { publish: true, delete: true, validate: true, schedule: true },
  platforms: Object.keys(PLATFORM_MAP),
  help: {
    setup: 'Connect your channels in Postiz (cloud or your own self-hosted instance), then create an API key under Settings → Public API.',
    note: 'Self-hosted: set the API URL to your Postiz backend origin. Note that self-hosting still requires your own platform developer apps inside Postiz.',
  },

  mapPlatform(rutbaKey) {
    return PLATFORM_MAP[rutbaKey] || null;
  },

  async validate({ relay }) {
    const integrations = await listIntegrations(relay);
    const names = integrations.map((i) => integrationIdentifier(i)).filter(Boolean);
    return {
      ok: true,
      detail: names.length
        ? `Key OK — channels connected in Postiz: ${[...new Set(names)].join(', ')}`
        : 'Key OK — no channels connected in Postiz yet',
    };
  },

  async publishPost({ relay, post, media, platforms }) {
    const integrations = await listIntegrations(relay);
    const perPlatform = {};

    // Upload media once, reuse the refs for every integration. Videos are sent
    // like images — Postiz stores a media ref either way.
    const mediaRefs = [];
    const urls = [...(media.imageUrls || []), ...(media.videoUrls || [])];
    for (const url of urls) {
      const { blob, filename } = await base.fetchAsBlob(url, PROVIDER);
      const form = new FormData();
      form.append('file', blob, filename);
      const up = await base.httpRequest(`${apiBase(relay)}/upload`, {
        method: 'POST', headers: headers(relay), multipart: form, platform: PROVIDER,
      });
      if (up?.id) mediaRefs.push({ id: up.id, path: up.path || '' });
    }

    const content = base.composeText(post);
    const targets = [];
    for (const p of platforms) {
      const wanted = PLATFORM_MAP[p];
      const matches = integrations.filter((i) => integrationIdentifier(i) === wanted);
      if (!matches.length) {
        perPlatform[p] = {
          status: 'error', platformPostId: null, url: null,
          error: `No ${p} channel is connected in Postiz`,
        };
        continue;
      }
      for (const m of matches) targets.push({ platform: p, integration: m });
    }

    if (!targets.length) {
      return { relayPostId: null, url: null, perPlatform, raw: null };
    }

    const body = {
      type: 'now',
      date: new Date().toISOString(),
      shortLink: false,
      tags: [],
      posts: targets.map((t) => ({
        integration: { id: t.integration.id },
        value: [{ content, image: mediaRefs }],
        settings: { __type: integrationIdentifier(t.integration) },
      })),
    };

    const data = await base.httpRequest(`${apiBase(relay)}/posts`, {
      method: 'POST', headers: headers(relay), json: body, platform: PROVIDER,
    });

    // Response: [{ postId, integration }] per submitted post (queued async).
    const rows = Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : []);
    const relayPostId = rows.length ? rows[0].postId || rows[0].id || null : (data?.id || null);
    for (const t of targets) {
      // Postiz queues and publishes asynchronously — report 'pending' rather
      // than claiming a platform URL we don't have yet.
      if (!perPlatform[t.platform] || perPlatform[t.platform].status === 'error') {
        perPlatform[t.platform] = {
          status: 'pending', platformPostId: null, url: null, error: null,
          note: 'queued in Postiz',
        };
      }
    }
    return { relayPostId, url: null, perPlatform, raw: data };
  },

  async deletePost({ relay, relayPostId }) {
    try {
      await base.httpRequest(`${apiBase(relay)}/posts/${encodeURIComponent(relayPostId)}`, {
        method: 'DELETE', headers: headers(relay), platform: PROVIDER,
      });
    } catch (e) {
      if (e && e.status === 404) return; // already gone
      throw e;
    }
  },
};
