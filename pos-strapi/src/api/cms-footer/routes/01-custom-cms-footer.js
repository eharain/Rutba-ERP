'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/cms-footers/:id/publish',
      handler: 'cms-footer.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-footers/:id/unpublish',
      handler: 'cms-footer.unpublish',
      config: { auth: false },
    },
  ],
};
