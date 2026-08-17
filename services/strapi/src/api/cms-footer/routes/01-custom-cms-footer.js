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
    {
      method: 'POST',
      path: '/cms-footers/:id/discard-draft',
      handler: 'cms-footer.discardDraft',
      config: { auth: false },
    },
  ],
};
