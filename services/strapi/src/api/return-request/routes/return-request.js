'use strict';

/**
 * return-request core router — provides find/findOne/create/update/delete.
 * Custom workflow routes live in 01-custom-return-request.js so koa-router
 * registers literal-prefix paths before the parametric core CRUD ones, per
 * feedback_koa_router_literal_prefix_order.
 */

const { createCoreRouter } = require('@strapi/strapi').factories;

module.exports = createCoreRouter('api::return-request.return-request');
