'use strict';

/**
 * app-access-permissions.js
 *
 * Single source of truth for every app-access entry — including metadata
 * and the Strapi content-API permissions each one requires.
 *
 * ENTRIES is an array consumed by:
 *   • database migrations – to seed/update app_accesses rows and sync permissions
 *   • bootstrap sync – to seed/update app_accesses rows and sync permissions
 *   • app-access-guard middleware – via derived maps to enforce fine-grained access
 *   • /me/permissions – to return effective app permissions to clients
 *
 * ─── Action Shorthand ───────────────────────────────────────────────
 *   READ        = ['find', 'findOne']
 *   WRITE       = ['find', 'findOne', 'create', 'update', 'delete']
 *   NO_DEL      = ['find', 'findOne', 'create', 'update']
 *   CASH_REG    = WRITE + ['open', 'close', 'active', 'expire']
 *   STOCK_INPUT = ['find', 'findOne', 'create', 'update', 'delete', 'bulk', 'process']
 *   CMS_WRITE   = ['find', 'findOne', 'create', 'update', 'delete', 'publish', 'unpublish']
 *   STOCK_ITEM_READ  = ['find', 'findOne', 'orphanGroups', 'orphanGroupItems']
 *   STOCK_ITEM_WRITE = ['find', 'findOne', 'create', 'update', 'delete', 'orphanGroups', 'orphanGroupItems']
 */

// ============================================================================
// ACTION SHORTHAND DEFINITIONS
// ============================================================================

const READ = ['find', 'findOne'];
const WRITE = ['find', 'findOne', 'create', 'update', 'delete'];
const NO_DEL = ['find', 'findOne', 'create', 'update'];
const CASH_REG = ['find', 'findOne', 'create', 'update', 'delete', 'open', 'close', 'active', 'expire'];
const STOCK_INPUT = ['find', 'findOne', 'create', 'update', 'delete', 'bulk', 'process'];
const CMS_WRITE = ['find', 'findOne', 'create', 'update', 'delete', 'publish', 'unpublish'];
const STOCK_ITEM_READ = ['find', 'findOne', 'orphanGroups', 'orphanGroupItems'];
const STOCK_ITEM_WRITE = ['find', 'findOne', 'create', 'update', 'delete', 'orphanGroups', 'orphanGroupItems'];

// ============================================================================
// DEFAULT SETTINGS
// ============================================================================

/**
 * Default time (in seconds) the session-expired dialog stays open
 * before auto-redirecting to the login page.
 * Override per-app with the `sessionTimeout` property on each entry below.
 */
const DEFAULT_SESSION_TIMEOUT = 60;

// ============================================================================
// PERMISSION GROUPS
// ============================================================================

/**
 * Permission groups for app-access users.
 * 
 * user  – base app user permissions (no elevation)
 * admin – additive app admin permissions + can elevate to admin mode
 */
const PERMISSION_GROUPS = {
    user: {
        key: 'user',
        label: 'User',
        roleType: 'rutba_app_user',
        canElevateToAdmin: false,
    },
    admin: {
        key: 'admin',
        label: 'Admin',
        roleType: 'rutba_app_user',
        canElevateToAdmin: true,
    },
};

// ============================================================================
// APP ENTRIES WITH PERMISSION GROUPS UNDER COMMON PERMISSIONS NODE
// ============================================================================

const ENTRIES = [

    // ── Stock Management ──────────────────────────────────────────────────────
    {
        key: 'stock',
        name: 'Stock Management',
        description: 'Products, purchases, inventory, suppliers, brands & categories',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::product.product', actions: WRITE },
                    { uid: 'api::product-group.product-group', actions: WRITE },
                    { uid: 'api::category.category', actions: WRITE },
                    { uid: 'api::brand.brand', actions: WRITE },
                    { uid: 'api::supplier.supplier', actions: WRITE },
                    { uid: 'api::purchase.purchase', actions: WRITE },
                    { uid: 'api::purchase-item.purchase-item', actions: WRITE },
                    { uid: 'api::purchase-return.purchase-return', actions: WRITE },
                    { uid: 'api::purchase-return-item.purchase-return-item', actions: WRITE },
                    { uid: 'api::stock-item.stock-item', actions: STOCK_ITEM_WRITE },
                    { uid: 'api::stock-input.stock-input', actions: STOCK_INPUT },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::currency.currency', actions: READ },
                    { uid: 'api::employee.employee', actions: READ },
                    { uid: 'api::term.term', actions: READ },
                    { uid: 'api::term-type.term-type', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::stock-report.stock-report', actions: WRITE },
                    { uid: 'api::stock-adjustment.stock-adjustment', actions: WRITE },
                    { uid: 'api::stock-transfer.stock-transfer', actions: WRITE },
                ],
            },
        ],
    },

    // ── Order Management ──────────────────────────────────────────────────────
    {
        key: 'order-management',
        name: 'Order Management',
        description: 'Customer order operations, rider assignment, delivery offers, delivery methods/zones, and delivery notifications',
        sessionTimeout: 180,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::sale-order.sale-order', actions: NO_DEL },
                    { uid: 'api::customer.customer', actions: READ },
                    { uid: 'api::delivery-method.delivery-method', actions: READ },
                    { uid: 'api::delivery-zone.delivery-zone', actions: READ },
                    { uid: 'api::rider.rider', actions: READ },
                    { uid: 'api::delivery-offer.delivery-offer', actions: WRITE },
                    { uid: 'api::order-message.order-message', actions: WRITE },
                    { uid: 'api::notification-template.notification-template', actions: READ },
                    { uid: 'api::notification-log.notification-log', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::delivery-config.delivery-config', actions: WRITE },
                    { uid: 'api::rider-commission.rider-commission', actions: WRITE },
                    { uid: 'api::order-cancellation.order-cancellation', actions: WRITE },
                ],
            },
        ],
    },

    // ── Point of Sale ────────────────────────────────────────────────────────
    {
        key: 'sale',
        name: 'Point of Sale',
        description: 'Sales, cart, returns, cash register & reports',
        sessionTimeout: 300,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::sale.sale', actions: WRITE },
                    { uid: 'api::sale-item.sale-item', actions: WRITE },
                    { uid: 'api::sale-return.sale-return', actions: WRITE },
                    { uid: 'api::sale-return-item.sale-return-item', actions: WRITE },
                    { uid: 'api::payment.payment', actions: WRITE },
                    { uid: 'api::cash-register.cash-register', actions: CASH_REG },
                    { uid: 'api::cash-register-transaction.cash-register-transaction', actions: WRITE },
                    { uid: 'api::customer.customer', actions: WRITE },
                    { uid: 'api::sale-order.sale-order', actions: WRITE },
                    { uid: 'api::product.product', actions: READ },
                    { uid: 'api::category.category', actions: READ },
                    { uid: 'api::brand.brand', actions: READ },
                    { uid: 'api::stock-item.stock-item', actions: [...STOCK_ITEM_READ, 'update'] },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::currency.currency', actions: READ },
                    { uid: 'api::employee.employee', actions: READ },
                    { uid: 'api::term.term', actions: READ },
                    { uid: 'api::term-type.term-type', actions: READ },
                    { uid: 'api::crm-lead.crm-lead', actions: [...READ, 'create'] },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::sale-report.sale-report', actions: WRITE },
                    { uid: 'api::cash-register-audit.cash-register-audit', actions: WRITE },
                    { uid: 'api::discount-rule.discount-rule', actions: WRITE },
                    { uid: 'api::tax-rate.tax-rate', actions: WRITE },
                ],
            },
        ],
    },

    // ── Accounting (Full) ─────────────────────────────────────────────────────
    {
        key: 'accounts',
        name: 'Accounting',
        description: 'Full accounting access — chart of accounts, journal entries, invoices, bills, expenses, fiscal periods, mappings & reports',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::acc-account.acc-account', actions: WRITE },
                    { uid: 'api::acc-journal-entry.acc-journal-entry', actions: WRITE },
                    { uid: 'api::acc-journal-line.acc-journal-line', actions: WRITE },
                    { uid: 'api::acc-invoice.acc-invoice', actions: WRITE },
                    { uid: 'api::acc-expense.acc-expense', actions: WRITE },
                    { uid: 'api::acc-bill.acc-bill', actions: WRITE },
                    { uid: 'api::acc-fiscal-period.acc-fiscal-period', actions: WRITE },
                    { uid: 'api::acc-account-mapping.acc-account-mapping', actions: WRITE },
                    { uid: 'api::acc-tax-rate.acc-tax-rate', actions: WRITE },
                    { uid: 'api::acc-bank-account.acc-bank-account', actions: WRITE },
                    { uid: 'api::sale.sale', actions: READ },
                    { uid: 'api::sale-item.sale-item', actions: READ },
                    { uid: 'api::sale-return.sale-return', actions: READ },
                    { uid: 'api::sale-return-item.sale-return-item', actions: READ },
                    { uid: 'api::payment.payment', actions: READ },
                    { uid: 'api::cash-register.cash-register', actions: [...READ, 'active'] },
                    { uid: 'api::cash-register-transaction.cash-register-transaction', actions: READ },
                    { uid: 'api::customer.customer', actions: READ },
                    { uid: 'api::supplier.supplier', actions: READ },
                    { uid: 'api::purchase.purchase', actions: READ },
                    { uid: 'api::purchase-item.purchase-item', actions: READ },
                    { uid: 'api::purchase-return.purchase-return', actions: READ },
                    { uid: 'api::purchase-return-item.purchase-return-item', actions: READ },
                    { uid: 'api::product.product', actions: READ },
                    { uid: 'api::stock-item.stock-item', actions: STOCK_ITEM_READ },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::currency.currency', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::acc-settings.acc-settings', actions: WRITE },
                    { uid: 'api::acc-report.acc-report', actions: WRITE },
                    { uid: 'api::acc-reconciliation.acc-reconciliation', actions: WRITE },
                    { uid: 'api::acc-audit-log.acc-audit-log', actions: READ },
                ],
            },
        ],
    },

    // ── Accounts Payable ──────────────────────────────────────────────────────
    {
        key: 'accounts-ap',
        name: 'Accounts Payable',
        description: 'Supplier bills, expenses & outgoing payments',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::acc-bill.acc-bill', actions: WRITE },
                    { uid: 'api::acc-expense.acc-expense', actions: WRITE },
                    { uid: 'api::acc-account.acc-account', actions: READ },
                    { uid: 'api::acc-journal-entry.acc-journal-entry', actions: READ },
                    { uid: 'api::acc-journal-line.acc-journal-line', actions: READ },
                    { uid: 'api::acc-invoice.acc-invoice', actions: READ },
                    { uid: 'api::acc-bank-account.acc-bank-account', actions: READ },
                    { uid: 'api::acc-tax-rate.acc-tax-rate', actions: READ },
                    { uid: 'api::acc-fiscal-period.acc-fiscal-period', actions: READ },
                    { uid: 'api::acc-account-mapping.acc-account-mapping', actions: READ },
                    { uid: 'api::supplier.supplier', actions: READ },
                    { uid: 'api::purchase.purchase', actions: READ },
                    { uid: 'api::purchase-item.purchase-item', actions: READ },
                    { uid: 'api::purchase-return.purchase-return', actions: READ },
                    { uid: 'api::purchase-return-item.purchase-return-item', actions: READ },
                    { uid: 'api::payment.payment', actions: READ },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::currency.currency', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::acc-bill-approval.acc-bill-approval', actions: WRITE },
                    { uid: 'api::acc-payment-batch.acc-payment-batch', actions: WRITE },
                    { uid: 'api::acc-vendor-credit.acc-vendor-credit', actions: WRITE },
                ],
            },
        ],
    },

    // ── Accounts Receivable ───────────────────────────────────────────────────
    {
        key: 'accounts-ar',
        name: 'Accounts Receivable',
        description: 'Customer invoices, incoming payments & collections',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::acc-invoice.acc-invoice', actions: WRITE },
                    { uid: 'api::acc-account.acc-account', actions: READ },
                    { uid: 'api::acc-journal-entry.acc-journal-entry', actions: READ },
                    { uid: 'api::acc-journal-line.acc-journal-line', actions: READ },
                    { uid: 'api::acc-bill.acc-bill', actions: READ },
                    { uid: 'api::acc-expense.acc-expense', actions: READ },
                    { uid: 'api::acc-bank-account.acc-bank-account', actions: READ },
                    { uid: 'api::acc-tax-rate.acc-tax-rate', actions: READ },
                    { uid: 'api::acc-fiscal-period.acc-fiscal-period', actions: READ },
                    { uid: 'api::acc-account-mapping.acc-account-mapping', actions: READ },
                    { uid: 'api::customer.customer', actions: READ },
                    { uid: 'api::sale.sale', actions: READ },
                    { uid: 'api::sale-item.sale-item', actions: READ },
                    { uid: 'api::sale-return.sale-return', actions: READ },
                    { uid: 'api::sale-return-item.sale-return-item', actions: READ },
                    { uid: 'api::payment.payment', actions: READ },
                    { uid: 'api::sale-order.sale-order', actions: READ },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::currency.currency', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::acc-invoice-approval.acc-invoice-approval', actions: WRITE },
                    { uid: 'api::acc-collection.acc-collection', actions: WRITE },
                    { uid: 'api::acc-customer-credit.acc-customer-credit', actions: WRITE },
                    { uid: 'api::acc-aging-report.acc-aging-report', actions: READ },
                ],
            },
        ],
    },

    // ── Accounting Viewer ─────────────────────────────────────────────────────
    {
        key: 'accounts-viewer',
        name: 'Accounting Viewer',
        description: 'Read-only access to all accounting data for auditors & management',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::acc-account.acc-account', actions: READ },
                    { uid: 'api::acc-journal-entry.acc-journal-entry', actions: READ },
                    { uid: 'api::acc-journal-line.acc-journal-line', actions: READ },
                    { uid: 'api::acc-invoice.acc-invoice', actions: READ },
                    { uid: 'api::acc-expense.acc-expense', actions: READ },
                    { uid: 'api::acc-bill.acc-bill', actions: READ },
                    { uid: 'api::acc-fiscal-period.acc-fiscal-period', actions: READ },
                    { uid: 'api::acc-account-mapping.acc-account-mapping', actions: READ },
                    { uid: 'api::acc-tax-rate.acc-tax-rate', actions: READ },
                    { uid: 'api::acc-bank-account.acc-bank-account', actions: READ },
                    { uid: 'api::sale.sale', actions: READ },
                    { uid: 'api::sale-item.sale-item', actions: READ },
                    { uid: 'api::sale-return.sale-return', actions: READ },
                    { uid: 'api::payment.payment', actions: READ },
                    { uid: 'api::customer.customer', actions: READ },
                    { uid: 'api::supplier.supplier', actions: READ },
                    { uid: 'api::purchase.purchase', actions: READ },
                    { uid: 'api::purchase-item.purchase-item', actions: READ },
                    { uid: 'api::purchase-return.purchase-return', actions: READ },
                    { uid: 'api::cash-register.cash-register', actions: READ },
                    { uid: 'api::cash-register-transaction.cash-register-transaction', actions: READ },
                    { uid: 'api::product.product', actions: READ },
                    { uid: 'api::stock-item.stock-item', actions: STOCK_ITEM_READ },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::currency.currency', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    // Viewer has no admin permissions - read-only access only
                ],
            },
        ],
    },

    // ── Delivery ──────────────────────────────────────────────────────────────
    {
        key: 'delivery',
        name: 'Delivery',
        description: 'Legacy delivery operations access (delivery offers and rider assignment)',
        sessionTimeout: 180,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::sale-order.sale-order', actions: NO_DEL },
                    { uid: 'api::customer.customer', actions: READ },
                    { uid: 'api::delivery-method.delivery-method', actions: READ },
                    { uid: 'api::delivery-zone.delivery-zone', actions: READ },
                    { uid: 'api::rider.rider', actions: READ },
                    { uid: 'api::delivery-offer.delivery-offer', actions: WRITE },
                    { uid: 'api::order-message.order-message', actions: WRITE },
                    { uid: 'api::notification-template.notification-template', actions: READ },
                    { uid: 'api::notification-log.notification-log', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::delivery-settings.delivery-settings', actions: WRITE },
                    { uid: 'api::rider-document.rider-document', actions: WRITE },
                    { uid: 'api::delivery-analytics.delivery-analytics', actions: READ },
                ],
            },
        ],
    },

    // ── Rider App ─────────────────────────────────────────────────────────────
    {
        key: 'rider',
        name: 'Rider App',
        description: 'Rider profile, delivery offers, active deliveries, delivery history and delivery status updates',
        sessionTimeout: 180,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::rider.rider', actions: NO_DEL },
                    { uid: 'api::delivery-offer.delivery-offer', actions: NO_DEL },
                    { uid: 'api::sale-order.sale-order', actions: NO_DEL },
                    { uid: 'api::order-message.order-message', actions: WRITE },
                    { uid: 'api::delivery-method.delivery-method', actions: READ },
                    { uid: 'api::delivery-zone.delivery-zone', actions: READ },
                    { uid: 'api::customer.customer', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::rider-settings.rider-settings', actions: WRITE },
                    { uid: 'api::rider-payout.rider-payout', actions: WRITE },
                    { uid: 'api::rider-rating.rider-rating', actions: WRITE },
                ],
            },
        ],
    },

    // ── CRM ───────────────────────────────────────────────────────────────────
    {
        key: 'crm',
        name: 'Customer Relation Management',
        description: 'Customer Relation Management',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::crm-contact.crm-contact', actions: WRITE },
                    { uid: 'api::crm-lead.crm-lead', actions: WRITE },
                    { uid: 'api::crm-activity.crm-activity', actions: WRITE },
                    { uid: 'api::customer.customer', actions: WRITE },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::crm-segment.crm-segment', actions: WRITE },
                    { uid: 'api::crm-campaign.crm-campaign', actions: WRITE },
                    { uid: 'api::crm-automation.crm-automation', actions: WRITE },
                    { uid: 'api::crm-analytics.crm-analytics', actions: READ },
                ],
            },
        ],
    },

    // ── Auth / User Management ────────────────────────────────────────────────
    {
        key: 'auth',
        name: 'User Management',
        description: 'Manage users, roles and app access assignments',
        sessionTimeout: DEFAULT_SESSION_TIMEOUT,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::auth-admin.auth-admin', actions: WRITE },
                    { uid: 'api::app-access.app-access', actions: WRITE },
                    { uid: 'api::product.product', actions: WRITE },
                    { uid: 'api::category.category', actions: WRITE },
                    { uid: 'api::brand.brand', actions: WRITE },
                    { uid: 'api::sale.sale', actions: WRITE },
                    { uid: 'api::sale-item.sale-item', actions: WRITE },
                    { uid: 'api::cash-register.cash-register', actions: CASH_REG },
                    { uid: 'api::cash-register-transaction.cash-register-transaction', actions: WRITE },
                    { uid: 'api::hr-employee.hr-employee', actions: WRITE },
                    { uid: 'api::hr-department.hr-department', actions: WRITE },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::role-permission.role-permission', actions: WRITE },
                    { uid: 'api::system-audit-log.system-audit-log', actions: READ },
                    { uid: 'api::backup-config.backup-config', actions: WRITE },
                ],
            },
        ],
    },

    // ── Web Orders ────────────────────────────────────────────────────────────
    {
        key: 'web-user',
        name: 'Web Orders',
        description: 'Track customer web orders, view order details, and request returns',
        sessionTimeout: DEFAULT_SESSION_TIMEOUT,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::sale-order.sale-order', actions: NO_DEL },
                    { uid: 'api::product.product', actions: READ },
                    { uid: 'api::category.category', actions: READ },
                    { uid: 'api::brand.brand', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    // Web users don't have admin permissions
                ],
            },
        ],
    },

    // ── HR ────────────────────────────────────────────────────────────────────
    {
        key: 'hr',
        name: 'Human Resources',
        description: 'Employees, departments, attendance and leave management',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::hr-employee.hr-employee', actions: WRITE },
                    { uid: 'api::hr-department.hr-department', actions: WRITE },
                    { uid: 'api::hr-attendance.hr-attendance', actions: WRITE },
                    { uid: 'api::hr-leave-request.hr-leave-request', actions: WRITE },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::employee.employee', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::hr-policy.hr-policy', actions: WRITE },
                    { uid: 'api::hr-recruitment.hr-recruitment', actions: WRITE },
                    { uid: 'api::hr-training.hr-training', actions: WRITE },
                    { uid: 'api::hr-report.hr-report', actions: READ },
                ],
            },
        ],
    },

    // ── Payroll ───────────────────────────────────────────────────────────────
    {
        key: 'payroll',
        name: 'Payroll',
        description: 'Salary structures, payroll runs and payslips',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::pay-salary-structure.pay-salary-structure', actions: WRITE },
                    { uid: 'api::pay-payroll-run.pay-payroll-run', actions: WRITE },
                    { uid: 'api::pay-payslip.pay-payslip', actions: WRITE },
                    { uid: 'api::hr-employee.hr-employee', actions: READ },
                    { uid: 'api::hr-department.hr-department', actions: READ },
                    { uid: 'api::employee.employee', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::pay-settings.pay-settings', actions: WRITE },
                    { uid: 'api::pay-tax-config.pay-tax-config', actions: WRITE },
                    { uid: 'api::pay-bonus.pay-bonus', actions: WRITE },
                    { uid: 'api::pay-report.pay-report', actions: READ },
                ],
            },
        ],
    },

    // ── CMS ───────────────────────────────────────────────────────────────────
    {
        key: 'cms',
        name: 'Content Management',
        description: 'Manage website content — products, categories, brands, pages, banners, and sales offers',
        sessionTimeout: 120,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::cms-page.cms-page', actions: CMS_WRITE },
                    { uid: 'api::product.product', actions: CMS_WRITE },
                    { uid: 'api::product-group.product-group', actions: CMS_WRITE },
                    { uid: 'api::brand-group.brand-group', actions: CMS_WRITE },
                    { uid: 'api::category-group.category-group', actions: CMS_WRITE },
                    { uid: 'api::cms-footer.cms-footer', actions: CMS_WRITE },
                    { uid: 'api::sale-offer.sale-offer', actions: CMS_WRITE },
                    { uid: 'api::site-setting.site-setting', actions: CMS_WRITE },
                    { uid: 'api::category.category', actions: CMS_WRITE },
                    { uid: 'api::brand.brand', actions: CMS_WRITE },
                    { uid: 'api::delivery-method.delivery-method', actions: READ },
                    { uid: 'api::delivery-zone.delivery-zone', actions: READ },
                    { uid: 'api::rider.rider', actions: READ },
                    { uid: 'api::notification-template.notification-template', actions: READ },
                    { uid: 'api::notification-log.notification-log', actions: READ },
                    { uid: 'api::sale-order.sale-order', actions: READ },
                    { uid: 'api::customer.customer', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::cms-workflow.cms-workflow', actions: WRITE },
                    { uid: 'api::cms-seo.cms-seo', actions: WRITE },
                    { uid: 'api::cms-analytics.cms-analytics', actions: READ },
                    { uid: 'api::cms-template.cms-template', actions: WRITE },
                ],
            },
        ],
    },

    // ── Social Media ──────────────────────────────────────────────────────────
    {
        key: 'social',
        name: 'Social Media',
        description: 'Posts, replies, multi-platform publishing & social account management',
        sessionTimeout: 180,
        permissions: [
            {
                role: PERMISSION_GROUPS.user,
                grants: [
                    { uid: 'api::social-post.social-post', actions: CMS_WRITE },
                    { uid: 'api::social-reply.social-reply', actions: WRITE },
                    { uid: 'api::social-account.social-account', actions: WRITE },
                    { uid: 'api::branch.branch', actions: READ },
                    { uid: 'api::employee.employee', actions: READ },
                ],
            },
            {
                role: PERMISSION_GROUPS.admin,
                grants: [
                    { uid: 'api::social-analytics.social-analytics', actions: READ },
                    { uid: 'api::social-settings.social-settings', actions: WRITE },
                    { uid: 'api::social-automation.social-automation', actions: WRITE },
                ],
            },
        ],
    },
];

// ============================================================================
// DERIVED PERMISSION MAPS
// ============================================================================

// Group permissions by app key and permission group (user/admin)
const permissionGroupsByKey = Object.fromEntries(
    ENTRIES.map((entry) => [
        entry.key,
        {
            user: entry.permissions?.find(p => p.role.key === 'user')?.grants || [],
            admin: entry.permissions?.find(p => p.role.key === 'admin')?.grants || [],
        },
    ])
);

// User-only permissions by app key
const userPermissionsByKey = Object.fromEntries(
    Object.entries(permissionGroupsByKey).map(([appKey, groups]) => [appKey, groups.user || []])
);

// Admin-only permissions by app key
const adminPermissionsByKey = Object.fromEntries(
    Object.entries(permissionGroupsByKey).map(([appKey, groups]) => [appKey, groups.admin || []])
);

// All permissions (user + admin) by app key
const permissionsByKey = Object.fromEntries(
    Object.entries(permissionGroupsByKey).map(([appKey, groups]) => [
        appKey,
        [...(groups.user || []), ...(groups.admin || [])],
    ])
);

// Flat array of all permissions with metadata
const FLAT_PERMISSIONS = Object.entries(permissionGroupsByKey).flatMap(([appKey, groups]) => [
    ...(groups.user || []).map((grant) => ({
        appKey,
        group: 'user',
        uid: grant.uid,
        actions: [...(grant.actions || [])],
    })),
    ...(groups.admin || []).map((grant) => ({
        appKey,
        group: 'admin',
        uid: grant.uid,
        actions: [...(grant.actions || [])],
    })),
]);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get permissions for specific app and permission groups
 * @param {string} appKey - The app key
 * @param {string[]} groupKeys - Array of permission group keys (e.g., ['user', 'admin'])
 * @returns {Array} Array of grant objects
 */
function getPermissionsForAppGroups(appKey, groupKeys = []) {
    const appGroups = permissionGroupsByKey[appKey] || {};
    return (groupKeys || []).flatMap((key) => appGroups[key] || []);
}

/**
 * Check if a permission group can elevate to admin
 * @param {string} groupKey - The permission group key
 * @returns {boolean} Whether the group can elevate to admin
 */
function canGroupElevateToAdmin(groupKey) {
    return !!PERMISSION_GROUPS[groupKey]?.canElevateToAdmin;
}

/**
 * Get the grants for a specific app and role
 * @param {string} appKey - The app key
 * @param {string} roleKey - The role key ('user' or 'admin')
 * @returns {Array} Array of grant objects
 */
function getGrantsForAppRole(appKey, roleKey) {
    const entry = ENTRIES.find(e => e.key === appKey);
    if (!entry) return [];
    const rolePermission = entry.permissions?.find(p => p.role.key === roleKey);
    return rolePermission?.grants || [];
}

// ============================================================================
// APP SETTINGS
// ============================================================================

const settingsByKey = Object.fromEntries(
    ENTRIES.map((entry) => [
        entry.key,
        {
            name: entry.name,
            description: entry.description,
            sessionTimeout: entry.sessionTimeout ?? DEFAULT_SESSION_TIMEOUT,
        },
    ])
);

// ============================================================================
// PLUGIN PERMISSIONS
// ============================================================================

/**
 * Permission groups for non-app-content permissions.
 *
 * These groups follow the same clarity-first shape used in ENTRIES:
 * role/group metadata + explicit permission grants.
 */
const SYSTEM_PERMISSION_GROUPS = {
    rutbaAppUser: {
        key: 'rutba-app-user-plugin',
        label: 'Rutba App User Plugin Permissions',
        roleType: 'rutba_app_user',
    },
    rutbaWebUser: {
        key: 'rutba-web-user-plugin',
        label: 'Rutba Web User Plugin Permissions',
        roleType: 'rutba_web_user',
    },
    public: {
        key: 'public-content-api',
        label: 'Public Content API Permissions',
        roleType: 'public',
    },
};

const PLUGIN_PERMISSION_ENTRIES = [
    {
        role: SYSTEM_PERMISSION_GROUPS.rutbaAppUser,
        permissions: [
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
        ],
        clientPermissions: [
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
        ],
    },
    {
        role: SYSTEM_PERMISSION_GROUPS.rutbaWebUser,
        permissions: [
            'plugin::users-permissions.auth.callback',
            'plugin::users-permissions.auth.connect',
            'plugin::users-permissions.auth.forgotPassword',
            'plugin::users-permissions.auth.resetPassword',
            'plugin::users-permissions.auth.changePassword',
            'plugin::users-permissions.auth.emailConfirmation',
            'plugin::users-permissions.user.me',
            'plugin::users-permissions.user.update',
        ],
    },
];

const PUBLIC_PERMISSION_ENTRIES = [
    {
        role: SYSTEM_PERMISSION_GROUPS.public,
        permissions: [
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
            'api::sale-offer.sale-offer.find',
            'api::sale-offer.sale-offer.findOne',
            'api::site-setting.site-setting.find',
            'api::sale-order.sale-order.find',
            'api::sale-order.sale-order.findOne',
            'api::sale-order.sale-order.create',
            'api::customer.customer.find',
            'api::customer.customer.findOne',
            'api::customer.customer.create',
            'api::crm-lead.crm-lead.create',
        ],
    },
];

const PLUGIN_PERMISSIONS =
    PLUGIN_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'rutba_app_user')?.permissions || [];

const CLIENT_PLUGIN_PERMISSIONS =
    PLUGIN_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'rutba_app_user')?.clientPermissions || [];

const WEB_USER_PLUGIN_PERMISSIONS =
    PLUGIN_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'rutba_web_user')?.permissions || [];

const PUBLIC_PERMISSIONS =
    PUBLIC_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'public')?.permissions || [];

// ============================================================================
// MODULE EXPORTS
// ============================================================================

const __exports = {
    ENTRIES,
    PERMISSION_GROUPS,
    userPermissionsByKey,
    adminPermissionsByKey,
    permissionGroupsByKey,
    FLAT_PERMISSIONS,
    permissionsByKey,
    getPermissionsForAppGroups,
    canGroupElevateToAdmin,
    getGrantsForAppRole,
    SYSTEM_PERMISSION_GROUPS,
    PLUGIN_PERMISSION_ENTRIES,
    PUBLIC_PERMISSION_ENTRIES,
    settingsByKey,
    DEFAULT_SESSION_TIMEOUT,
    PLUGIN_PERMISSIONS,
    CLIENT_PLUGIN_PERMISSIONS,
    WEB_USER_PLUGIN_PERMISSIONS,
    PUBLIC_PERMISSIONS,
};


module.exports = Object.freeze(__exports);