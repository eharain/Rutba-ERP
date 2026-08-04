'use strict';

///NOTE: Strapi binds a migration to its filename and only runs it once.
///      To re-run, rename the file or create a new one.

/**
 * Move notification-engine templates off the sale-order triggers they borrowed.
 *
 * Seven rows in src/seed/data/notification-template.json are driven by
 * notification/services/notification-engine.js (which keys off `event_name`) but
 * were given real sale-order `trigger_event` values as filler, because the field
 * is required and had no neutral option. sale-order/services/notification-service
 * selects purely on `trigger_event`, so it picked them up: most visibly, every
 * storefront checkout mailed the buyer "We received your message" from the
 * support-ticket template alongside their order confirmation.
 *
 * This points those rows at the new `trigger_event: 'none'` and gives the
 * internal alerts the `send_to` their names claim. See
 * src/seed/seeders/notification-template-routing.js for the full reasoning.
 *
 * Per project_data_seeding_strategy_migrations_not_seed_json — the JSON seed is
 * fixed too, but `notification-templates` is essential:false so the deploy path
 * never runs it; live rows only get repaired here. Idempotent and narrowly
 * scoped: it updates a row only while that row still holds the exact wrong value.
 */

const { applyNotificationTemplateRouting } = require('../../src/seed/seeders/notification-template-routing');

async function up(knex) {
    await applyNotificationTemplateRouting(knex);
}

async function down() {
    // No-op: restoring the wrong triggers would resume mailing buyers the
    // support-ticket template on every order.
}

module.exports = { up, down };
