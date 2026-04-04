'use strict';

module.exports = {
  routes: [
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
