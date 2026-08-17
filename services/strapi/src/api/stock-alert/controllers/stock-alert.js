'use strict';

/**
 * stock-alert controller (core) — find / findOne only. Alerts are system-managed
 * (created / resolved by the sync engine), so no create/update/del descriptors
 * are exposed; state changes go through the custom acknowledge / dismiss routes.
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::stock-alert.stock-alert');
