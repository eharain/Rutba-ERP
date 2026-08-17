'use strict';

// Social provider adapter registry.
//
// Each adapter implements the interface below. The orchestration service
// (api::social-post service) is the only caller; it stays provider-agnostic and
// records every adapter's result/error uniformly into post.platform_results.
//
// ── Adapter interface ───────────────────────────────────────────────────────
// Every method is async unless noted. All receive `{ strapi, account, ... }`.
// `account` is the full social-account row (private token fields included —
// server-side reads are not sanitized). Throw base.ProviderError on failure.
//
//   key:        string platform key ('instagram' | 'facebook' | 'x' | 'tiktok' | 'youtube')
//   label:      display label
//   capabilities: { publish, delete, comments, reply, oauth } booleans
//
//   getAuthUrl({ strapi, account, state }) → string            // sync; OAuth consent URL
//   exchangeCode({ strapi, account, code, codeVerifier }) → accountPatch
//   refreshToken({ strapi, account }) → accountPatch | null    // null = nothing to do
//
//   publishPost({ strapi, account, post, media }) → { platformPostId, url, raw }
//   deletePost({ strapi, account, platformPostId }) → void
//
//   fetchComments({ strapi, account, post, platformPostId, since }) → NormalizedComment[]
//   postReply({ strapi, account, post, platformPostId, parentCommentId, body }) → { platformCommentId, raw }
//
// `media` (prepared by the service):
//   { coverUrl: string|null, cover: file|null, videoUrls: string[], videos: file[] }
//
// `accountPatch` — a partial social-account update the service persists:
//   { access_token?, refresh_token?, token_expires_at?, platform_user_id?,
//     account_name?, page_id?, extra_config? }
//   (extra_config is shallow-merged onto the existing value by the service.)
//
// NormalizedComment:
//   { platformCommentId: string, body: string, authorName?, authorHandle?,
//     authorAvatarUrl?, repliedAt?: ISO, parentCommentId?: string, isOutbound?: boolean }

const instagram = require('./instagram');
const facebook = require('./facebook');
const x = require('./x');
const tiktok = require('./tiktok');
const youtube = require('./youtube');

const ADAPTERS = { instagram, facebook, x, tiktok, youtube };

function getAdapter(platform) {
  const adapter = ADAPTERS[platform];
  if (!adapter) {
    const base = require('./base');
    throw new base.ProviderError(`Unsupported social platform: ${platform}`, { platform });
  }
  return adapter;
}

function hasAdapter(platform) {
  return Object.prototype.hasOwnProperty.call(ADAPTERS, platform);
}

function listPlatforms() {
  return Object.keys(ADAPTERS);
}

module.exports = { getAdapter, hasAdapter, listPlatforms, ADAPTERS };
