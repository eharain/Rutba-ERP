'use strict';

module.exports = ({ strapi }) => {
  const appRole = strapi.plugin('api-pro').contentType('app-role');
  if (appRole?.extendUserRelation) {
    appRole.extendUserRelation(strapi);
  }
  strapi.log.info('[api-pro] register');
};
