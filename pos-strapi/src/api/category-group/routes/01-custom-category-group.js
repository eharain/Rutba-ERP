'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/category-groups/:id/publish',
      handler: 'category-group.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/category-groups/:id/unpublish',
      handler: 'category-group.unpublish',
      config: { auth: false },
    },
  ],
};
