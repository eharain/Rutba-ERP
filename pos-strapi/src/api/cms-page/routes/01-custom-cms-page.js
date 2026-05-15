'use strict';

module.exports = {
  routes: [
    {
      // Public read of a CMS page with the full populate tree built on the
      // server. Replaces the giant ?populate[...] querystrings the storefront
      // used to send. Optional ?draft=true requires auth and returns the
      // draft document instead of the published one.
      method: 'GET',
      path: '/cms-pages/public/by-slug/:slug',
      handler: 'cms-page.publicBySlug',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-pages/:id/publish',
      handler: 'cms-page.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-pages/:id/unpublish',
      handler: 'cms-page.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-pages/:id/discard-draft',
      handler: 'cms-page.discardDraft',
      config: { auth: false },
    },
  ],
};
