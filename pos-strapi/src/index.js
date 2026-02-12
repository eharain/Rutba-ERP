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
   * This gives you an opportunity to set up your data model,
   * run jobs, or perform some special logic.
   */
  async bootstrap({ strapi }) {
    // Seed custom roles for the multi-app POS system.
    // These are users-permissions plugin roles (not admin roles).
    const roleService = strapi.plugin('users-permissions').service('role');

    const customRoles = [
      {
        name: 'Stock Manager',
        description: 'Access to Stock Management app (products, purchases, inventory)',
        type: 'stock_manager',
      },
      {
        name: 'Sales Clerk',
        description: 'Access to Point of Sale app (sales, cart, returns, cash register)',
        type: 'sales_clerk',
      },
    ];

    for (const roleDef of customRoles) {
      const existing = await strapi
        .query('plugin::users-permissions.role')
        .findOne({ where: { type: roleDef.type } });

      if (!existing) {
        await roleService.createRole({
          name: roleDef.name,
          description: roleDef.description,
          type: roleDef.type,
          permissions: {},
        });
        strapi.log.info(`[bootstrap] Created role: ${roleDef.name}`);
      }
    }
  },
};
