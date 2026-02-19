'use strict';

module.exports = {
  /**
   * An asynchronous register function that runs before
   * your application is initialized.
   *
   * This gives you an opportunity to extend code.
   */
  register(/*{ strapi }*/) {},

  /**
   * An asynchronous bootstrap function that runs before
   * your application gets started.
   *
   * Standard app-access entries (stock, sale) are seeded via a
   * database migration in database/migrations/.
   * Add new app-access entries there when creating new apps.
   */
  bootstrap(/*{ strapi }*/) {},
};
