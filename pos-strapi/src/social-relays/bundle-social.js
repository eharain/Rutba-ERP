'use strict';

// bundle.social relay adapter — https://info.bundle.social/api-reference
//
// API surface used (x-api-key: pk_live_…; teamId required — stored in target_id):
//   Teams     GET  https://api.bundle.social/api/v1/team/
//   Upload    POST https://api.bundle.social/api/v1/upload/   (multipart, teamId)
//   Publish   POST https://api.bundle.social/api/v1/post/
//               { teamId, title, postDate, status: 'SCHEDULED',
//                 socialAccountTypes: ['FACEBOOK', …],
//                 data: { FACEBOOK: { text, uploadIds }, … } }
//   Delete    DELETE https://api.bundle.social/api/v1/post/{id}
//
// The response reports per-platform errors in `errors`/`errorsVerbose`, so a
// partially failed fan-out maps cleanly onto platform_results.

const base = require('./base');

const PROVIDER = 'bundle_social';
const API = 'https://api.bundle.social/api/v1';

// rutba platform key → bundle.social socialAccountType
const PLATFORM_MAP = {
  facebook: 'FACEBOOK',
  instagram: 'INSTAGRAM',
  x: 'TWITTER',
  linkedin: 'LINKEDIN',
  tiktok: 'TIKTOK',
  youtube: 'YOUTUBE',
};

function headers(relay) {
  return { 'x-api-key': base.apiKey(relay, PROVIDER) };
}

function apiBase(relay) {
  return base.baseUrl(relay, API);
}

function teamId(relay) {
  if (!relay.target_id) {
    throw new base.ProviderError('bundle.social needs a Team ID (set it on the relay provider)', {
      platform: PROVIDER,
    });
  }
  return relay.target_id;
}

module.exports = {
  key: PROVIDER,
  label: 'bundle.social',
  websiteUrl: 'https://bundle.social',
  docsUrl: 'https://info.bundle.social/api-reference/introduction',
  apiBase: API,
  needsApiUrl: 'no',
  targetLabel: 'Team ID (required)',
  capabilities: { publish: true, delete: true, validate: true, schedule: true },
  platforms: Object.keys(PLATFORM_MAP),
  help: {
    signup: 'Create an account at bundle.social — it gives you an organization containing one or more teams.',
    connect: 'Connect the team\'s social accounts on the bundle.social dashboard, and copy that team\'s Team ID into the field below (the Test button lists your team ids).',
    key: 'Create a pk_live_… API key in the organization settings and paste it below.',
    note: 'Every paid plan has unlimited connected accounts — cost scales with post volume, which fits multi-tenant use.',
  },

  mapPlatform(rutbaKey) {
    return PLATFORM_MAP[rutbaKey] || null;
  },

  async validate({ relay }) {
    const data = await base.httpRequest(`${apiBase(relay)}/team/`, {
      headers: headers(relay), platform: PROVIDER,
    });
    const teams = Array.isArray(data) ? data : (Array.isArray(data?.items) ? data.items : []);
    const ids = teams.map((t) => t.id).filter(Boolean);
    const configured = relay.target_id;
    if (configured && ids.length && !ids.includes(configured)) {
      return { ok: false, detail: `Key OK, but Team ID ${configured} is not in this organization (teams: ${ids.join(', ')})` };
    }
    return {
      ok: true,
      detail: ids.length
        ? `Key OK — teams: ${ids.join(', ')}${configured ? '' : ' (set one as the Team ID)'}`
        : 'Key OK — create a team on bundle.social and set its Team ID',
    };
  },

  async publishPost({ relay, post, media, platforms }) {
    const tid = teamId(relay);
    const perPlatform = {};
    const types = platforms.map((p) => PLATFORM_MAP[p]);

    // Upload media once; every platform entry references the same uploadIds.
    const uploadIds = [];
    const urls = [...(media.imageUrls || []), ...(media.videoUrls || [])];
    for (const url of urls) {
      const { blob, filename } = await base.fetchAsBlob(url, PROVIDER);
      const form = new FormData();
      form.append('teamId', tid);
      form.append('file', blob, filename);
      const up = await base.httpRequest(`${apiBase(relay)}/upload/`, {
        method: 'POST', headers: headers(relay), multipart: form, platform: PROVIDER,
      });
      if (up?.id) uploadIds.push(up.id);
    }

    const text = base.composeText(post);
    const data = {};
    for (const p of platforms) {
      data[PLATFORM_MAP[p]] = { text, ...(uploadIds.length ? { uploadIds } : {}) };
    }

    const body = {
      teamId: tid,
      title: post.title || 'Rutba post',
      postDate: new Date().toISOString(),
      status: 'SCHEDULED',
      socialAccountTypes: types,
      data,
    };

    const res = await base.httpRequest(`${apiBase(relay)}/post/`, {
      method: 'POST', headers: headers(relay), json: body, platform: PROVIDER,
    });

    // Per-platform errors come back in `errors` keyed by socialAccountType.
    const errors = res?.errors || {};
    for (const p of platforms) {
      const err = errors[PLATFORM_MAP[p]];
      perPlatform[p] = err
        ? { status: 'error', platformPostId: null, url: null, error: String(err) }
        : {
            status: res?.status === 'POSTED' ? 'success' : 'pending',
            platformPostId: null, url: null, error: null,
            ...(res?.status === 'POSTED' ? {} : { note: 'queued on bundle.social' }),
          };
    }
    return { relayPostId: res?.id || null, url: null, perPlatform, raw: res };
  },

  async deletePost({ relay, relayPostId }) {
    await base.httpRequest(`${apiBase(relay)}/post/${encodeURIComponent(relayPostId)}`, {
      method: 'DELETE', headers: headers(relay), platform: PROVIDER,
    });
  },
};
