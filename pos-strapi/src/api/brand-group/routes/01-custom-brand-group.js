'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/brand-groups/:id/publish',
      handler: 'brand-group.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/brand-groups/:id/unpublish',
      handler: 'brand-group.unpublish',
      config: { auth: false },
    },
  ],
};
