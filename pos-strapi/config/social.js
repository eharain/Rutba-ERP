'use strict';

// Social-media provider configuration.
//
// OAuth client credentials live in env (operator sets them with the
// `POS_STRAPI__SOCIAL_*` prefix in the repo-root .env — see scripts/js/load-env.js,
// which strips the prefix so `env('SOCIAL_INSTAGRAM_CLIENT_ID')` resolves).
//
// Two ways to connect an account:
//   1. OAuth  — set the per-platform client id/secret here; the user clicks
//      "Connect" in rutba-social and we obtain + refresh tokens automatically.
//   2. Manual — paste a long-lived access_token (+ page_id) straight into the
//      account form. No client id/secret needed; the adapter just uses the token.
//
// Both paths feed the same adapters; the client id/secret are only consulted for
// the OAuth handshake and for refreshing tokens that carry an expiry.

module.exports = ({ env }) => ({
  // Public origin the providers redirect back to / fetch media from. Falls back
  // to server.url (config/server.js) when unset. MUST be https + publicly
  // reachable for OAuth callbacks and for IG/FB/TikTok media ingestion to work.
  publicUrl: env('SOCIAL_PUBLIC_URL', env('PUBLIC_URL', '')),

  // Shared verify token for inbound webhook subscription handshakes
  // (Facebook/Instagram hub.verify_token, etc.).
  webhookVerifyToken: env('SOCIAL_WEBHOOK_VERIFY_TOKEN', 'rutba-social-webhook'),

  // Background jobs. Disable in envs where a separate worker owns them, or to
  // avoid double-publishing across multiple app instances.
  cron: {
    enabled: env.bool('SOCIAL_CRON_ENABLED', true),
    publishScheduledRule: env('SOCIAL_CRON_PUBLISH_RULE', '* * * * *'),
    syncRepliesRule: env('SOCIAL_CRON_SYNC_RULE', '*/10 * * * *'),
    refreshTokensRule: env('SOCIAL_CRON_REFRESH_RULE', '0 */6 * * *'),
  },

  providers: {
    instagram: {
      // Instagram Graph API (via a connected Facebook Page / IG Business account)
      clientId: env('SOCIAL_INSTAGRAM_CLIENT_ID', env('SOCIAL_FACEBOOK_CLIENT_ID', '')),
      clientSecret: env('SOCIAL_INSTAGRAM_CLIENT_SECRET', env('SOCIAL_FACEBOOK_CLIENT_SECRET', '')),
      graphVersion: env('SOCIAL_GRAPH_VERSION', 'v21.0'),
      scopes: env(
        'SOCIAL_INSTAGRAM_SCOPES',
        'instagram_basic,instagram_content_publish,instagram_manage_comments,pages_show_list,pages_read_engagement,business_management'
      ),
    },
    facebook: {
      clientId: env('SOCIAL_FACEBOOK_CLIENT_ID', ''),
      clientSecret: env('SOCIAL_FACEBOOK_CLIENT_SECRET', ''),
      graphVersion: env('SOCIAL_GRAPH_VERSION', 'v21.0'),
      scopes: env(
        'SOCIAL_FACEBOOK_SCOPES',
        'pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement,pages_read_user_content,business_management'
      ),
    },
    x: {
      // X / Twitter API v2 (OAuth2 Authorization Code + PKCE)
      clientId: env('SOCIAL_X_CLIENT_ID', ''),
      clientSecret: env('SOCIAL_X_CLIENT_SECRET', ''),
      scopes: env('SOCIAL_X_SCOPES', 'tweet.read tweet.write users.read offline.access'),
    },
    tiktok: {
      // TikTok Content Posting API (OAuth2)
      clientId: env('SOCIAL_TIKTOK_CLIENT_KEY', ''),
      clientSecret: env('SOCIAL_TIKTOK_CLIENT_SECRET', ''),
      scopes: env('SOCIAL_TIKTOK_SCOPES', 'user.info.basic,video.publish,video.upload,comment.list,comment.create'),
    },
    youtube: {
      // YouTube Data API v3 (Google OAuth2)
      clientId: env('SOCIAL_YOUTUBE_CLIENT_ID', env('SOCIAL_GOOGLE_CLIENT_ID', '')),
      clientSecret: env('SOCIAL_YOUTUBE_CLIENT_SECRET', env('SOCIAL_GOOGLE_CLIENT_SECRET', '')),
      scopes: env(
        'SOCIAL_YOUTUBE_SCOPES',
        'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl'
      ),
    },
  },
});
