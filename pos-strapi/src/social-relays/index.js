'use strict';

// Relay-provider adapter registry.
//
// A RELAY is a third-party aggregator API (Ayrshare, Postiz, Zernio, …) that
// posts to several platforms through one key — the platform OAuth apps, app
// review and token refresh live on the provider's side, not ours. One relay row
// (api::social-relay-provider) = one configured provider with a chosen set of
// target platforms.
//
// The orchestration service (api::social-post publishToRelays) is the only
// caller; it records results per RUTBA platform into post.platform_results so
// the existing per-platform UI badges light up the same way direct accounts do.
//
// ── Adapter interface ───────────────────────────────────────────────────────
// Every method is async. All receive `{ strapi, relay, ... }` where `relay` is
// the full social-relay-provider row (private api_key/extra_config included —
// server-side reads are not sanitized). Throw base.ProviderError on failure.
//
//   key:          provider key ('ayrshare' | 'postiz' | 'zernio' | 'post_bridge' | 'bundle_social' | 'custom')
//   label:        display label
//   docsUrl:      provider docs for the settings UI help panel
//   needsApiUrl:  'no' | 'optional' | 'required' — whether api_url must be set
//   targetLabel:  what target_id means for this provider (null = unused)
//   capabilities: { publish, delete, validate, schedule } booleans
//   platforms:    rutba platform keys this provider can post to
//
//   mapPlatform(rutbaKey) → providerKey | null   // sync; null = unsupported
//
//   validate({ strapi, relay }) → { ok, detail }
//     Cheap "is this key usable" probe for the Test button + save-time check.
//
//   publishPost({ strapi, relay, post, media, platforms }) → {
//     relayPostId,                    // provider-side id (used for delete)
//     url,                           // provider dashboard/permalink when known
//     perPlatform: {                 // keyed by RUTBA platform key
//       [platform]: { status: 'success'|'error'|'pending',
//                     platformPostId?, url?, error? } },
//     raw }
//     `platforms` is the pre-filtered rutba platform list to fan out to.
//     Providers that only report per-post (not per-platform) success return the
//     same status for every requested platform, status 'pending' when the
//     provider queues asynchronously.
//
//   deletePost({ strapi, relay, relayPostId }) → void
//
// `media` is the service-prepared bundle (same shape the platform adapters
// get): { cover, coverUrl, images, imageUrls, videos, videoUrls }.

const ayrshare = require('./ayrshare');
const postiz = require('./postiz');
const zernio = require('./zernio');
const postBridge = require('./post-bridge');
const bundleSocial = require('./bundle-social');
const custom = require('./custom');

const ADAPTERS = {
  ayrshare,
  postiz,
  zernio,
  post_bridge: postBridge,
  bundle_social: bundleSocial,
  custom,
};

function getRelayAdapter(provider) {
  const adapter = ADAPTERS[provider];
  if (!adapter) {
    const base = require('../social-providers/base');
    throw new base.ProviderError(`Unsupported relay provider: ${provider}`, { platform: provider });
  }
  return adapter;
}

function hasRelayAdapter(provider) {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, provider);
}

/** Provider catalogue for the settings UI (no secrets — safe to serialize). */
function listRelayProviders() {
  return Object.values(ADAPTERS).map((a) => ({
    key: a.key,
    label: a.label,
    docsUrl: a.docsUrl || null,
    needsApiUrl: a.needsApiUrl || 'no',
    targetLabel: a.targetLabel || null,
    capabilities: a.capabilities || {},
    platforms: a.platforms || [],
    help: a.help || null,
  }));
}

module.exports = { getRelayAdapter, hasRelayAdapter, listRelayProviders, ADAPTERS };
