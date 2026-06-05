'use strict';

module.exports = {
  routes: [
    {
      // Public read of every enabled menu, resolved into a clean nav tree
      // (label / href / children) so the storefront never deals with the
      // polymorphic link-target populate. Returns all positions at once.
      method: 'GET',
      path: '/cms-menus/public',
      handler: 'cms-menu.publicTree',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-menus/:id/publish',
      handler: 'cms-menu.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-menus/:id/unpublish',
      handler: 'cms-menu.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/cms-menus/:id/discard-draft',
      handler: 'cms-menu.discardDraft',
      config: { auth: false },
    },
  ],
};
