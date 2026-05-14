'use strict';

/**
 * sale-audit-log controller
 *
 * The audit log is append-only and visibility is role-gated by api-pro
 * (find/findOne → admin+manager, create → admin+manager+staff so the
 * teller's own page can write its own trail). We deliberately do NOT
 * override update/delete here — letting the core controller handle them
 * means the api-pro descriptor's omission of update/delete approles
 * (combined with denyByDefault) naturally locks both down to nobody.
 */

const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('api::sale-audit-log.sale-audit-log');
