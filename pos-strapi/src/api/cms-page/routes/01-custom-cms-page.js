'use strict';

module.exports = {
  routes: [
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
  ],
};
