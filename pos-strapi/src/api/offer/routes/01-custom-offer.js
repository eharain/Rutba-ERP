'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/offers/:id/publish',
      handler: 'offer.publish',
    },
    {
      method: 'POST',
      path: '/offers/:id/unpublish',
      handler: 'offer.unpublish',
    },
  ],
};
