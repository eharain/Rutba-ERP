'use strict';

module.exports = {
  routes: [
    {
      // Public read of a product detail with the full populate tree built on
      // the server. Replaces the giant ?populate[...] querystrings the
      // storefront used to send for /products/:documentId.
      method: 'GET',
      path: '/products/public/by-id/:documentId',
      handler: 'product.publicDetail',
      config: { auth: false },
    },
    {
      // Public list with the same server-built populate tree. Accepts
      // collection/brand/category/minPrice/maxPrice/sort/page/pageSize as
      // flat query params.
      method: 'GET',
      path: '/products/public/list',
      handler: 'product.publicList',
      config: { auth: false },
    },
    {
      // Bulk lookup by numeric id — used by the cart/wishlist to rehydrate
      // stored ids into full product records.
      method: 'GET',
      path: '/products/public/by-ids',
      handler: 'product.publicByIds',
      config: { auth: false },
    },
    {
      // Search box / typeahead. q is matched case-insensitively against name.
      method: 'GET',
      path: '/products/public/search',
      handler: 'product.publicSearch',
      config: { auth: false },
    },
    {
      // Used by the price-range filter to size the slider's max value.
      method: 'GET',
      path: '/products/public/highest-price',
      handler: 'product.publicHighestPrice',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/products/:id/publish',
      handler: 'product.publish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/products/:id/unpublish',
      handler: 'product.unpublish',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/products/:id/discard-draft',
      handler: 'product.discardDraft',
      config: { auth: false },
    },
  ],
};
