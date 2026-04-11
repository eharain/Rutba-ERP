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
const CMS_WRITE  = ['find', 'findOne', 'create', 'update', 'delete', 'publish', 'unpublish'];
const STOCK_ITEM_READ = ['find', 'findOne', 'orphanGroups', 'orphanGroupItems'];
const STOCK_ITEM_WRITE = ['find', 'findOne', 'create', 'update', 'delete', 'orphanGroups', 'orphanGroupItems'];

/**
 * Default time (in seconds) the session-expired dialog stays open
 * before auto-redirecting to the login page.  Override per-app
 * with the `sessionTimeout` property on each entry below.
 */
const DEFAULT_SESSION_TIMEOUT = 60;

// ─── Entries ────────────────────────────────────────────────

const ENTRIES = [

  // ── Stock Management ──────────────────────────────────────
  {
    key: 'stock',
    name: 'Stock Management',
    description: 'Products, purchases, inventory, suppliers, brands & categories',
    sessionTimeout: 120,
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
      { uid: 'api::stock-item.stock-item',                         actions: STOCK_ITEM_WRITE },
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
    sessionTimeout: 300,
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
      { uid: 'api::stock-item.stock-item',                         actions: [...STOCK_ITEM_READ, 'update'] },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::currency.currency',                             actions: READ },
      { uid: 'api::employee.employee',                             actions: READ },
      { uid: 'api::term.term',                                     actions: READ },
      { uid: 'api::term-type.term-type',                           actions: READ },
      // CRM lead capture from sales
      { uid: 'api::crm-lead.crm-lead',                              actions: [...READ, 'create'] },
    ],
  },

  // ── Accounting (Full) ───────────────────────────────────────
  //    Chief accountant / accounting manager — full CRUD on all
  //    accounting entities, including system settings like CoA,
  //    account mappings, fiscal periods and tax rates.
  {
    key: 'accounts',
    name: 'Accounting',
    description: 'Full accounting access — chart of accounts, journal entries, invoices, bills, expenses, fiscal periods, mappings & reports',
    sessionTimeout: 120,
    permissions: [
      { uid: 'api::acc-account.acc-account',                       actions: WRITE },
      { uid: 'api::acc-journal-entry.acc-journal-entry',           actions: WRITE },
      { uid: 'api::acc-journal-line.acc-journal-line',             actions: WRITE },
      { uid: 'api::acc-invoice.acc-invoice',                       actions: WRITE },
      { uid: 'api::acc-expense.acc-expense',                       actions: WRITE },
      { uid: 'api::acc-bill.acc-bill',                             actions: WRITE },
      { uid: 'api::acc-fiscal-period.acc-fiscal-period',           actions: WRITE },
      { uid: 'api::acc-account-mapping.acc-account-mapping',       actions: WRITE },
      { uid: 'api::acc-tax-rate.acc-tax-rate',                     actions: WRITE },
      { uid: 'api::acc-bank-account.acc-bank-account',             actions: WRITE },
      // cross-app read-only
      { uid: 'api::sale.sale',                                     actions: READ },
      { uid: 'api::sale-item.sale-item',                           actions: READ },
      { uid: 'api::sale-return.sale-return',                       actions: READ },
      { uid: 'api::sale-return-item.sale-return-item',             actions: READ },
      { uid: 'api::payment.payment',                               actions: READ },
      { uid: 'api::cash-register.cash-register',                   actions: [...READ, 'active'] },
      { uid: 'api::cash-register-transaction.cash-register-transaction', actions: READ },
      { uid: 'api::customer.customer',                             actions: READ },
      { uid: 'api::supplier.supplier',                             actions: READ },
      { uid: 'api::purchase.purchase',                             actions: READ },
      { uid: 'api::purchase-item.purchase-item',                   actions: READ },
      { uid: 'api::purchase-return.purchase-return',               actions: READ },
      { uid: 'api::purchase-return-item.purchase-return-item',     actions: READ },
      { uid: 'api::product.product',                               actions: READ },
      { uid: 'api::stock-item.stock-item',                         actions: STOCK_ITEM_READ },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::currency.currency',                             actions: READ },
    ],
  },

  // ── Accounts Payable ──────────────────────────────────────
  //    AP clerk — manages supplier bills, expenses, and outgoing
  //    payments.  Can view (not modify) the chart of accounts,
  //    journal entries, invoices, and bank accounts for context.
  {
    key: 'accounts-ap',
    name: 'Accounts Payable',
    description: 'Supplier bills, expenses & outgoing payments',
    sessionTimeout: 120,
    permissions: [
      { uid: 'api::acc-bill.acc-bill',                             actions: WRITE },
      { uid: 'api::acc-expense.acc-expense',                       actions: WRITE },
      // read-only accounting context
      { uid: 'api::acc-account.acc-account',                       actions: READ },
      { uid: 'api::acc-journal-entry.acc-journal-entry',           actions: READ },
      { uid: 'api::acc-journal-line.acc-journal-line',             actions: READ },
      { uid: 'api::acc-invoice.acc-invoice',                       actions: READ },
      { uid: 'api::acc-bank-account.acc-bank-account',             actions: READ },
      { uid: 'api::acc-tax-rate.acc-tax-rate',                     actions: READ },
      { uid: 'api::acc-fiscal-period.acc-fiscal-period',           actions: READ },
      { uid: 'api::acc-account-mapping.acc-account-mapping',       actions: READ },
      // cross-app read-only
      { uid: 'api::supplier.supplier',                             actions: READ },
      { uid: 'api::purchase.purchase',                             actions: READ },
      { uid: 'api::purchase-item.purchase-item',                   actions: READ },
      { uid: 'api::purchase-return.purchase-return',               actions: READ },
      { uid: 'api::purchase-return-item.purchase-return-item',     actions: READ },
      { uid: 'api::payment.payment',                               actions: READ },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::currency.currency',                             actions: READ },
    ],
  },

  // ── Accounts Receivable ───────────────────────────────────
  //    AR clerk — manages customer invoices and incoming payments.
  //    Can view (not modify) the chart of accounts, journal
  //    entries, bills, and bank accounts for context.
  {
    key: 'accounts-ar',
    name: 'Accounts Receivable',
    description: 'Customer invoices, incoming payments & collections',
    sessionTimeout: 120,
    permissions: [
      { uid: 'api::acc-invoice.acc-invoice',                       actions: WRITE },
      // read-only accounting context
      { uid: 'api::acc-account.acc-account',                       actions: READ },
      { uid: 'api::acc-journal-entry.acc-journal-entry',           actions: READ },
      { uid: 'api::acc-journal-line.acc-journal-line',             actions: READ },
      { uid: 'api::acc-bill.acc-bill',                             actions: READ },
      { uid: 'api::acc-expense.acc-expense',                       actions: READ },
      { uid: 'api::acc-bank-account.acc-bank-account',             actions: READ },
      { uid: 'api::acc-tax-rate.acc-tax-rate',                     actions: READ },
      { uid: 'api::acc-fiscal-period.acc-fiscal-period',           actions: READ },
      { uid: 'api::acc-account-mapping.acc-account-mapping',       actions: READ },
      // cross-app read-only
      { uid: 'api::customer.customer',                             actions: READ },
      { uid: 'api::sale.sale',                                     actions: READ },
      { uid: 'api::sale-item.sale-item',                           actions: READ },
      { uid: 'api::sale-return.sale-return',                       actions: READ },
      { uid: 'api::sale-return-item.sale-return-item',             actions: READ },
      { uid: 'api::payment.payment',                               actions: READ },
      { uid: 'api::order.order',                                   actions: READ },
      // shared / read
      { uid: 'api::branch.branch',                                 actions: READ },
      { uid: 'api::currency.currency',                             actions: READ },
    ],
  },

  // ── Accounting Viewer ─────────────────────────────────────
  //    Read-only access for auditors, managers, and owners who
  //    need to review financial data without modifying anything.
  {
    key: 'accounts-viewer',
    name: 'Accounting Viewer',
    description: 'Read-only access to all accounting data for auditors & management',
    sessionTimeout: 120,
    permissions: [
      { uid: 'api::acc-account.acc-account',                       actions: READ },
      { uid: 'api::acc-journal-entry.acc-journal-entry',           actions: READ },
      { uid: 'api::acc-journal-line.acc-journal-line',             actions: READ },
      { uid: 'api::acc-invoice.acc-invoice',                       actions: READ },
      { uid: 'api::acc-expense.acc-expense',                       actions: READ },
      { uid: 'api::acc-bill.acc-bill',                             actions: READ },
      { uid: 'api::acc-fiscal-period.acc-fiscal-period',           actions: READ },
      { uid: 'api::acc-account-mapping.acc-account-mapping',       actions: READ },
      { uid: 'api::acc-tax-rate.acc-tax-rate',                     actions: READ },
      { uid: 'api::acc-bank-account.acc-bank-account',             actions: READ },
      // cross-app read-only (for context in reports)
      { uid: 'api::sale.sale',                                     actions: READ },
      { uid: 'api::sale-item.sale-item',                           actions: READ },
      { uid: 'api::sale-return.sale-return',                       actions: READ },
      { uid: 'api::payment.payment',                               actions: READ },
      { uid: 'api::customer.customer',                             actions: READ },
      { uid: 'api::supplier.supplier',                             actions: READ },
      { uid: 'api::purchase.purchase',                             actions: READ },
      { uid: 'api::purchase-item.purchase-item',                   actions: READ },
      { uid: 'api::purchase-return.purchase-return',               actions: READ },
      { uid: 'api::cash-register.cash-register',                   actions: READ },
      { uid: 'api::cash-register-transaction.cash-register-transaction', actions: READ },
      { uid: 'api::product.product',                               actions: READ },
      { uid: 'api::stock-item.stock-item',                         actions: STOCK_ITEM_READ },
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
    sessionTimeout: 120,
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
    sessionTimeout: 120,
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
    sessionTimeout: 120,
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
    sessionTimeout: 120,
    permissions: [
      { uid: 'api::cms-page.cms-page',                             actions: CMS_WRITE },
      { uid: 'api::product.product',                               actions: CMS_WRITE },
      { uid: 'api::product-group.product-group',                   actions: CMS_WRITE },
      { uid: 'api::brand-group.brand-group',                       actions: CMS_WRITE },
      { uid: 'api::category-group.category-group',                 actions: CMS_WRITE },
      { uid: 'api::cms-footer.cms-footer',                         actions: CMS_WRITE },
      { uid: 'api::category.category',                             actions: CMS_WRITE },
      { uid: 'api::brand.brand',                                   actions: CMS_WRITE },
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

// ─── Derived: key → app settings (sessionTimeout, etc.) ─────

const settingsByKey = {};
for (const entry of ENTRIES) {
  settingsByKey[entry.key] = {
    sessionTimeout: entry.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT,
  };
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
  // Media Library folder & file management
  'api::media-library.media-library.folderTree',
  'api::media-library.media-library.getFolders',
  'api::media-library.media-library.getFolder',
  'api::media-library.media-library.createFolder',
  'api::media-library.media-library.renameFolder',
  'api::media-library.media-library.deleteFolder',
  'api::media-library.media-library.getFiles',
  'api::media-library.media-library.getFile',
  'api::media-library.media-library.moveFiles',
  'api::media-library.media-library.updateFileInfo',
  'api::media-library.media-library.deleteFile',
  'api::media-library.media-library.uploadToFolder',
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
  // Media Library folder & file management
  'api::media-library.media-library.folderTree',
  'api::media-library.media-library.getFolders',
  'api::media-library.media-library.getFolder',
  'api::media-library.media-library.createFolder',
  'api::media-library.media-library.renameFolder',
  'api::media-library.media-library.deleteFolder',
  'api::media-library.media-library.getFiles',
  'api::media-library.media-library.getFile',
  'api::media-library.media-library.moveFiles',
  'api::media-library.media-library.updateFileInfo',
  'api::media-library.media-library.deleteFile',
  'api::media-library.media-library.uploadToFolder',
];

// ─── Web-user (rutba_web_user) plugin permissions ───────
//   Minimal set for web storefront authenticated users.
//   They only need auth, profile, and basic upload access.

const WEB_USER_PLUGIN_PERMISSIONS = [
  'plugin::users-permissions.auth.callback',
  'plugin::users-permissions.auth.connect',
  'plugin::users-permissions.auth.forgotPassword',
  'plugin::users-permissions.auth.resetPassword',
  'plugin::users-permissions.auth.changePassword',
  'plugin::users-permissions.auth.emailConfirmation',
  'plugin::users-permissions.user.me',
  'plugin::users-permissions.user.update',
];

// ─── Public (unauthenticated) content-API permissions
//   These are synced to Strapi's built-in "Public" role so
//   the web storefront can read products, brands, pages, etc.
//   without an auth token.

const PUBLIC_PERMISSIONS = [
  'api::product.product.find',
  'api::product.product.findOne',
  'api::product-group.product-group.find',
  'api::product-group.product-group.findOne',
  'api::category.category.find',
  'api::category.category.findOne',
  'api::brand.brand.find',
  'api::brand.brand.findOne',
  'api::brand-group.brand-group.find',
  'api::brand-group.brand-group.findOne',
  'api::category-group.category-group.find',
  'api::category-group.category-group.findOne',
  'api::cms-page.cms-page.find',
  'api::cms-page.cms-page.findOne',
  'api::cms-footer.cms-footer.find',
  'api::cms-footer.cms-footer.findOne',
  'api::order.order.find',
  'api::order.order.findOne',
  'api::order.order.create',
  'api::customer.customer.find',
  'api::customer.customer.findOne',
  'api::customer.customer.create',
  // Public lead capture from the web storefront
  'api::crm-lead.crm-lead.create',
];

module.exports = { ENTRIES, permissionsByKey, settingsByKey, DEFAULT_SESSION_TIMEOUT, PLUGIN_PERMISSIONS, CLIENT_PLUGIN_PERMISSIONS, WEB_USER_PLUGIN_PERMISSIONS, PUBLIC_PERMISSIONS };
