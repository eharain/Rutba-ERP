'use strict';

module.exports = {
  routes: [
    {
      // Public list filtered to brands that appear in at least one published
      // brand-group. This is the editorial gate the storefront uses so that
      // unpinned brands don't leak into the carousel.
      method: 'GET',
      path: '/brands/public/list',
      handler: 'brand.publicList',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/brands/:id/publish',
      handler: 'brand.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/brands/:id/unpublish',
      handler: 'brand.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/brands/:id/discard-draft',
      handler: 'brand.discardDraft',
      config: { auth: false },
    },
  ],
};
