'use strict';

module.exports = {
  routes: [
    {
      // Public read of a single page-group with its member pages + images,
      // built on the server. Powers the standalone /page-group/:slug route.
      method: 'GET',
      path: '/cms-page-groups/public/by-slug/:slug',
      handler: 'cms-page-group.publicBySlug',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-page-groups/:id/publish',
      handler: 'cms-page-group.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-page-groups/:id/unpublish',
      handler: 'cms-page-group.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-page-groups/:id/discard-draft',
      handler: 'cms-page-group.discardDraft',
      config: { auth: false },
    },
  ],
};
