'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/cms-menu-items/:id/publish',
      handler: 'cms-menu-item.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-menu-items/:id/unpublish',
      handler: 'cms-menu-item.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-menu-items/:id/discard-draft',
      handler: 'cms-menu-item.discardDraft',
      config: { auth: false },
    },
  ],
};
