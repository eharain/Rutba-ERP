'use strict';

/** @type {import('@strapi/strapi').Core.RouterConfig} */
module.exports = {
  type: 'content-api',
  routes: [
    {
      method: 'GET',
      path: '/me/addresses',
      handler: 'api::address.address.list',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/me/addresses',
      handler: 'api::address.address.createForMe',
      config: { auth: false },
    },
    {
      method: 'PUT',
      path: '/me/addresses/:documentId',
      handler: 'api::address.address.updateForMe',
      config: { auth: false },
    },
    {
      method: 'DELETE',
      path: '/me/addresses/:documentId',
      handler: 'api::address.address.deleteForMe',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/me/addresses/:documentId/make-default',
      handler: 'api::address.address.makeDefault',
      config: { auth: false },
    },
  ],
};
