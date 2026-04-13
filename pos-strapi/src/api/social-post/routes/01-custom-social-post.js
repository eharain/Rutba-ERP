'use strict';

module.exports = {
  routes: [
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
  ],
};
