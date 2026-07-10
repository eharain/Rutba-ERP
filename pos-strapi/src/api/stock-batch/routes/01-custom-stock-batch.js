'use strict';

/**
 * Custom stock-batch routes.
 *
 * `recompute-product-bulk` is auth:false (like stock-items/recompute-product-stock)
 * so Strapi doesn't reject the custom action name; auth + admin gating are enforced
 * in the controller.
 */
module.exports = {
  routes: [
    {
      method: 'POST',
      path: '/stock-batches/recompute-product-bulk',
      handler: 'recompute-product-bulk.run',
      config: {
        auth: false,
      },
    },
  ],
};
