'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/categories/:id/publish',
      handler: 'category.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/categories/:id/unpublish',
      handler: 'category.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/categories/:id/discard-draft',
      handler: 'category.discardDraft',
      config: { auth: false },
    },
  ],
};
