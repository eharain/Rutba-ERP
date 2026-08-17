'use strict';

module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/product-groups/by-slug/:slug',
      handler: 'product-group.findBySlug',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/product-groups/:id/publish',
      handler: 'product-group.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/product-groups/:id/unpublish',
      handler: 'product-group.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/product-groups/:id/discard-draft',
      handler: 'product-group.discardDraft',
      config: { auth: false },
    },
  ],
};
