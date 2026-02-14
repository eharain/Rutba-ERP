'use strict';

/**
 * app-access-routes.js
 *
 * Maps every API content-type to the app-access key(s) that own it.
 *
 *  • string   → that key for ALL actions (find, findOne, create, update, delete)
 *  • object   → per-action arrays for fine-grained control
 *  • array    → shortcut: all listed keys for ALL actions
 *
 * Content-types NOT listed here are left unguarded (the built-in
 * Strapi role/permission system still applies to them).
 *
 * The special key 'auth' means "user-management admin" — users
 * whose app_accesses include 'auth' can manage other users,
 * roles and app-access assignments.
 */

module.exports = {

  // ── Stock Management ──────────────────────────────────────
  'api::product.product':                    { find: ['stock', 'sale'], create: ['stock'], update: ['stock'], delete: ['stock', 'auth'] },
  'api::product-group.product-group':        'stock',
  'api::category.category':                  { find: ['stock', 'sale'], create: ['stock'], update: ['stock'], delete: ['stock', 'auth'] },
  'api::brand.brand':                        { find: ['stock', 'sale'], create: ['stock'], update: ['stock'], delete: ['stock', 'auth'] },
  'api::supplier.supplier':                  'stock',
  'api::purchase.purchase':                  'stock',
  'api::purchase-item.purchase-item':        'stock',
  'api::purchase-return.purchase-return':    'stock',
  'api::purchase-return-item.purchase-return-item': 'stock',
  'api::stock-item.stock-item':              { find: ['stock', 'sale'], create: ['stock'], update: ['stock'], delete: ['stock'] },
  'api::stock-input.stock-input':            'stock',

  // ── Point of Sale ─────────────────────────────────────────
  'api::sale.sale':                          { find: ['sale', 'stock', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
  'api::sale-item.sale-item':                { find: ['sale', 'stock', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
  'api::sale-return.sale-return':            'sale',
  'api::sale-return-item.sale-return-item':  'sale',
  'api::payment.payment':                    { find: ['sale', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
  'api::cash-register.cash-register':        'sale',
  'api::customer.customer':                  ['sale', 'crm', 'accounts'],
  'api::order.order':                        ['sale', 'web-user'],

  // ── CRM ───────────────────────────────────────────────────
  'api::crm-contact.crm-contact':            'crm',
  'api::crm-lead.crm-lead':                  'crm',
  'api::crm-activity.crm-activity':          'crm',

  // ── HR ────────────────────────────────────────────────────
  'api::hr-employee.hr-employee':            { find: ['hr', 'payroll'], create: ['hr'], update: ['hr'], delete: ['hr', 'auth'] },
  'api::hr-department.hr-department':        { find: ['hr', 'payroll'], create: ['hr'], update: ['hr'], delete: ['hr', 'auth'] },
  'api::hr-attendance.hr-attendance':         'hr',
  'api::hr-leave-request.hr-leave-request':   'hr',

  // ── Accounting ────────────────────────────────────────────
  'api::acc-account.acc-account':             'accounts',
  'api::acc-journal-entry.acc-journal-entry': 'accounts',
  'api::acc-invoice.acc-invoice':             'accounts',
  'api::acc-expense.acc-expense':             'accounts',

  // ── Payroll ───────────────────────────────────────────────
  'api::pay-salary-structure.pay-salary-structure': 'payroll',
  'api::pay-payroll-run.pay-payroll-run':           'payroll',
  'api::pay-payslip.pay-payslip':                   'payroll',

  // ── Shared / system ───────────────────────────────────────
  'api::branch.branch':                      ['stock', 'sale', 'hr', 'accounts'],
  'api::currency.currency':                  ['stock', 'sale', 'accounts'],
  'api::employee.employee':                  ['stock', 'sale', 'hr', 'payroll'],
  'api::term.term':                          ['stock', 'sale'],
  'api::term-type.term-type':                ['stock', 'sale'],

  // ── Auth / admin ──────────────────────────────────────────
  'api::app-access.app-access':              'auth',
};
