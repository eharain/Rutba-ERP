'use strict';

/** @type {import('@strapi/strapi').Core.RouterConfig} */
module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/me/addresses',
      handler: 'api::customer-address.customer-address.list',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/me/addresses',
      handler: 'api::customer-address.customer-address.createForMe',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/me/addresses/:documentId',
      handler: 'api::customer-address.customer-address.updateForMe',
      config: { auth: false },
    },
    {
      method: 'DELETE',
      path: '/me/addresses/:documentId',
      handler: 'api::customer-address.customer-address.deleteForMe',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/me/addresses/:documentId/make-default',
      handler: 'api::customer-address.customer-address.makeDefault',
      config: { auth: false },
    },
  ],
};
