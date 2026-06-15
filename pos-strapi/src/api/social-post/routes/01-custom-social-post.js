'use strict';

// Custom social-post routes. All use `auth: false` to bypass Strapi's
// scope-based permission check for non-standard action names; the authd handlers
// restore the user via ensureUser(). Webhook routes are genuinely public (hit by
// the platforms) and skip ensureUser.
//
// Literal-prefix routes (/webhook/:platform) are declared BEFORE the /:id routes
// so the first-match koa-router can't shadow them with the :id param segment.

module.exports = {
  routes: [
    // ── public inbound webhooks ──
    {
      method: 'GET',
      path: '/social-posts/webhook/:platform',
      handler: 'social-post.webhookVerify',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-posts/webhook/:platform',
      handler: 'social-post.webhookReceive',
      config: { auth: false },
    },

    // ── CMS draft/publish ──
    {
      method: 'POST',
      path: '/social-posts/:id/publish',
      handler: 'social-post.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-posts/:id/unpublish',
      handler: 'social-post.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-posts/:id/discard-draft',
      handler: 'social-post.discardDraft',
      config: { auth: false },
    },

    // ── two-way provider integration ──
    {
      method: 'POST',
      path: '/social-posts/:id/publish-social',
      handler: 'social-post.publishSocial',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-posts/:id/unpublish-social',
      handler: 'social-post.unpublishSocial',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-posts/:id/sync-replies',
      handler: 'social-post.syncReplies',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/social-posts/:id/reply',
      handler: 'social-post.sendReply',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/social-posts/:id/replies',
      handler: 'social-post.listReplies',
      config: { auth: false },
    },
  ],
};
