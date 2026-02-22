'use strict';

/**
 * app-access-permissions.js
 *
 * Single source of truth for every app-access entry — metadata AND
 * the Strapi content-API permissions each one requires.
 *
 * ENTRIES is an array consumed by:
 *   • database migrations  – to seed / update app_accesses rows and
 *     sync permissions to the "Rutba App User" role.
 *   • app-access-guard middleware – via the derived `permissionsByKey`
 *     map to enforce fine-grained access at request time.
 *
 * ─── Action shorthand ───────────────────────────────────────────
 *   READ     = ['find', 'findOne']
 *   WRITE    = ['find', 'findOne', 'create', 'update', 'delete']
 *   NO_DEL   = ['find', 'findOne', 'create', 'update']
 *   CASH_REG = WRITE + ['open', 'close', 'active', 'expire']
 */

const READ     = ['find', 'findOne'];
const WRITE    = ['find', 'findOne', 'create', 'update', 'delete'];
const NO_DEL   = ['find', 'findOne', 'create', 'update'];
const CASH_REG = ['find', 'findOne', 'create', 'update', 'delete', 'open', 'close', 'active', 'expire'];
const STOCK_INPUT = ['find', 'findOne', 'create', 'update', 'delete', 'bulk', 'process'];

// ─── Entries ────────────────────────────────────────────────

const ENTRIES = [

  // ── Stock Management ──────────────────────────────────────
  {
    key: 'stock',
    name: 'Stock Management',
    description: 'Products, purchases, inventory, suppliers, brands & categories',
    permissions: [
      { uid: 'api::product.product',                               actions: WRITE },
      { uid: 'api::product-group.product-group',                   actions: WRITE },
      { uid: 'api::category.category',                             actions: WRITE },
      { uid: 'api::brand.brand',                                   actions: WRITE },
      { uid: 'api::supplier.supplier',                             actions: WRITE },
      { uid: 'api::purchase.purchase',                             actions: WRITE },
      { uid: 'api::purchase-item.purchase-item',                   actions: WRITE },
      { uid: 'api::purchase-return.purchase-return',               actions: WRITE },
      { uid: 'api::purchase-return-item.purchase-return-item',     actions: WRITE },
      { uid: 'api::stock-item.stock-item',                         actions: WRITE },
      { uid: 'api::stock-input.stock-input',                       actions: STOCK_INPUT },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::currency.currency',                             actions: READ },
      { uid: 'api::employee.employee',                             actions: READ },
      { uid: 'api::term.term',                                     actions: READ },
      { uid: 'api::term-type.term-type',                           actions: READ },
    ],
  },

  // ── Point of Sale ─────────────────────────────────────────
  {
    key: 'sale',
    name: 'Point of Sale',
    description: 'Sales, cart, returns, cash register & reports',
    permissions: [
      { uid: 'api::sale.sale',                                     actions: WRITE },
      { uid: 'api::sale-item.sale-item',                           actions: WRITE },
      { uid: 'api::sale-return.sale-return',                       actions: WRITE },
      { uid: 'api::sale-return-item.sale-return-item',             actions: WRITE },
      { uid: 'api::payment.payment',                               actions: WRITE },
      { uid: 'api::cash-register.cash-register',                   actions: CASH_REG },
      { uid: 'api::cash-register-transaction.cash-register-transaction', actions: WRITE },
      { uid: 'api::customer.customer',                             actions: WRITE },
      { uid: 'api::order.order',                                   actions: WRITE },
      // cross-app read-only
      { uid: 'api::product.product',                               actions: READ },
      { uid: 'api::category.category',                             actions: READ },
      { uid: 'api::brand.brand',                                   actions: READ },
      { uid: 'api::stock-item.stock-item',                         actions: [...READ, 'update'] },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::currency.currency',                             actions: READ },
      { uid: 'api::employee.employee',                             actions: READ },
      { uid: 'api::term.term',                                     actions: READ },
      { uid: 'api::term-type.term-type',                           actions: READ },
    ],
  },

  // ── Accounting ────────────────────────────────────────────
  {
    key: 'accounts',
    name: 'Accounting',
    description: 'Manage accounts and reports',
    permissions: [
      { uid: 'api::acc-account.acc-account',                       actions: WRITE },
      { uid: 'api::acc-journal-entry.acc-journal-entry',           actions: WRITE },
      { uid: 'api::acc-invoice.acc-invoice',                       actions: WRITE },
      { uid: 'api::acc-expense.acc-expense',                       actions: WRITE },
      // cross-app read-only
      { uid: 'api::sale.sale',                                     actions: READ },
      { uid: 'api::sale-item.sale-item',                           actions: READ },
      { uid: 'api::payment.payment',                               actions: READ },
      { uid: 'api::cash-register.cash-register',                   actions: [...READ, 'active'] },
      { uid: 'api::cash-register-transaction.cash-register-transaction', actions: READ },
      { uid: 'api::customer.customer',                             actions: READ },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::currency.currency',                             actions: READ },
    ],
  },

  // ── Delivery
  {
    key: 'delivery',
    name: 'Delivery',
    description: 'Delivery Management',
    permissions: [
      { uid: 'api::order.order',                                   actions: NO_DEL },
      { uid: 'api::customer.customer',                             actions: READ },
    ],
  },

  // ── CRM ───────────────────────────────────────────────────
  {
    key: 'crm',
    name: 'Customer Relation Management',
    description: 'Customer Relation Management',
    permissions: [
      { uid: 'api::crm-contact.crm-contact',                      actions: WRITE },
      { uid: 'api::crm-lead.crm-lead',                            actions: WRITE },
      { uid: 'api::crm-activity.crm-activity',                    actions: WRITE },
      { uid: 'api::customer.customer',                             actions: WRITE },
    ],
  },

  // ── Auth / User Management ────────────────────────────────
  // The 'auth' key is special: it grants global admin bypass in
  // the middleware.  The permissions listed here ensure the role
  // has the API permissions needed for user/access admin pages.
  {
    key: 'auth',
    name: 'User Management',
    description: 'Manage users, roles and app access assignments',
    permissions: [
      { uid: 'api::app-access.app-access',                         actions: WRITE },
      { uid: 'api::product.product',                               actions: WRITE },
      { uid: 'api::category.category',                             actions: WRITE },
      { uid: 'api::brand.brand',                                   actions: WRITE },
      { uid: 'api::sale.sale',                                     actions: WRITE },
      { uid: 'api::sale-item.sale-item',                           actions: WRITE },
      { uid: 'api::cash-register.cash-register',                   actions: CASH_REG },
      { uid: 'api::cash-register-transaction.cash-register-transaction', actions: WRITE },
      { uid: 'api::hr-employee.hr-employee',                       actions: WRITE },
      { uid: 'api::hr-department.hr-department',                   actions: WRITE },
    ],
  },

  // ── My Orders (web-user) ──────────────────────────────────
  {
    key: 'web-user',
    name: 'My Orders',
    description: 'Track web orders, manage orders and request returns',
    permissions: [
      { uid: 'api::order.order',                                   actions: NO_DEL },
      { uid: 'api::product.product',                               actions: READ },
      { uid: 'api::category.category',                             actions: READ },
      { uid: 'api::brand.brand',                                   actions: READ },
    ],
  },

  // ── HR ────────────────────────────────────────────────────
  {
    key: 'hr',
    name: 'Human Resources',
    description: 'Employees, departments, attendance and leave management',
    permissions: [
      { uid: 'api::hr-employee.hr-employee',                       actions: WRITE },
      { uid: 'api::hr-department.hr-department',                   actions: WRITE },
      { uid: 'api::hr-attendance.hr-attendance',                   actions: WRITE },
      { uid: 'api::hr-leave-request.hr-leave-request',             actions: WRITE },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::employee.employee',                             actions: READ },
    ],
  },

  // ── Payroll ───────────────────────────────────────────────
  {
    key: 'payroll',
    name: 'Payroll',
    description: 'Salary structures, payroll runs and payslips',
    permissions: [
      { uid: 'api::pay-salary-structure.pay-salary-structure',     actions: WRITE },
      { uid: 'api::pay-payroll-run.pay-payroll-run',               actions: WRITE },
      { uid: 'api::pay-payslip.pay-payslip',                       actions: WRITE },
      // cross-app read-only
      { uid: 'api::hr-employee.hr-employee',                       actions: READ },
      { uid: 'api::hr-department.hr-department',                   actions: READ },
      // shared / read
      { uid: 'api::employee.employee',                             actions: READ },
    ],
  },

  // ── CMS (Content Management) ──────────────────────────────
  {
    key: 'cms',
    name: 'Content Management',
    description: 'Manage website content — products, categories, brands, pages & banners',
    permissions: [
      { uid: 'api::cms-page.cms-page',                             actions: WRITE },
      { uid: 'api::product.product',                               actions: WRITE },
      { uid: 'api::product-group.product-group',                   actions: WRITE },
      { uid: 'api::category.category',                             actions: WRITE },
      { uid: 'api::brand.brand',                                   actions: WRITE },
      // cross-app read-only
      { uid: 'api::order.order',                                   actions: READ },
      { uid: 'api::customer.customer',                             actions: READ },
    ],
  },
];

// ─── Derived: key → permissions[] map for the middleware ─────

const permissionsByKey = {};
for (const entry of ENTRIES) {
  permissionsByKey[entry.key] = entry.permissions;
}

// ─── Plugin permissions ─────────────────────────────────────
//   PLUGIN_PERMISSIONS     — full list seeded to every Strapi
//                            role so the endpoints are reachable.
//   CLIENT_PLUGIN_PERMISSIONS — subset returned to the front-end
//                            via /me/permissions (no server-only
//                            actions like forgotPassword).

const PLUGIN_PERMISSIONS = [
  'plugin::users-permissions.auth.callback',
  'plugin::users-permissions.auth.connect',
  'plugin::users-permissions.auth.forgotPassword',
  'plugin::users-permissions.auth.resetPassword',
  'plugin::users-permissions.auth.changePassword',
  'plugin::users-permissions.auth.emailConfirmation',
  'plugin::users-permissions.user.me',
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.me.mePermissions',
  'plugin::users-permissions.me.stockItemsSearch',
  'plugin::upload.content-api.find',
  'plugin::upload.content-api.findOne',
  'plugin::upload.content-api.upload',
  'plugin::upload.content-api.destroy',
];

const CLIENT_PLUGIN_PERMISSIONS = [
  'plugin::users-permissions.auth.callback',
  'plugin::users-permissions.auth.connect',
  'plugin::users-permissions.auth.changePassword',
  'plugin::users-permissions.user.me',
  'plugin::users-permissions.user.update',
  'plugin::users-permissions.me.mePermissions',
  'plugin::users-permissions.me.stockItemsSearch',
  'plugin::upload.content-api.find',
  'plugin::upload.content-api.findOne',
  'plugin::upload.content-api.upload',
  'plugin::upload.content-api.destroy',
];

module.exports = { ENTRIES, permissionsByKey, PLUGIN_PERMISSIONS, CLIENT_PLUGIN_PERMISSIONS };
