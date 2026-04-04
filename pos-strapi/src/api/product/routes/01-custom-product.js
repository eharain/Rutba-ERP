'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/products/:id/publish',
      handler: 'product.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/products/:id/unpublish',
      handler: 'product.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/products/:id/discard-draft',
      handler: 'product.discardDraft',
      config: { auth: false },
    },
  ],
};
