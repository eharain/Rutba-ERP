'use strict';

module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/sale-offers/:id/publish',
      handler: "sale-offer.publish",
    },
    {
      method: 'POST',
      path: '/sale-offers/:id/unpublish',
      handler: "sale-offer.unpublish",
    },
    {
      method: 'POST',
      path: '/offers/:id/publish',
      handler: "sale-offer.publish",
    },
    {
      method: 'POST',
      path: '/offers/:id/unpublish',
      handler: "sale-offer.unpublish",
    },
  ],
};
