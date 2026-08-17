'use strict';

/**
 * stock-level service.
 *
 * The stock-level rows are a denormalised cache; the recompute logic that keeps
 * them in sync lives on the stock-item service (co-located with the
 * product.stock_quantity invariant it parallels — see
 * api::stock-item.stock-item service). This core service exists for CRUD reads.
 */

const { createCoreService } = require('@strapi/strapi').factories;

module.exports = createCoreService('api::stock-level.stock-level');
