// @ts-nocheck
/**
 * Endpoint access metadata and gap placeholders.
 *
 * This file is the migration source of truth used to represent app-access
 * ownership and grants at endpoint level, including disabled placeholders
 * for config items that do not yet have runtime endpoint implementations.
 */

const READ = ['find', 'findOne'];
const WRITE = ['find', 'findOne', 'create', 'update', 'delete'];
const NO_DEL = ['find', 'findOne', 'create', 'update'];
const CASH_REG = ['find', 'findOne', 'create', 'update', 'delete', 'open', 'close', 'active', 'expire'];
const STOCK_INPUT = ['find', 'findOne', 'create', 'update', 'delete', 'bulk', 'process'];
const CMS_WRITE = ['find', 'findOne', 'create', 'update', 'delete', 'publish', 'unpublish'];
const STOCK_ITEM_READ = ['find', 'findOne', 'orphanGroups', 'orphanGroupItems'];
const STOCK_ITEM_WRITE = ['find', 'findOne', 'create', 'update', 'delete', 'orphanGroups', 'orphanGroupItems'];

const PERMISSION_GROUPS = {
    staff: {
        key: 'staff',
        label: 'Staff',
        roleType: 'rutba_app_user',
        canElevateToAdmin: false,
    },
    manager: {
        key: 'manager',
        label: 'Manager',
        roleType: 'rutba_app_user',
        canElevateToAdmin: false,
    },
    user: {
        key: 'user',
        label: 'User',
        roleType: 'rutba_app_user',
        canElevateToAdmin: false,
        aliasOf: 'staff',
    },
    admin: {
        key: 'admin',
        label: 'Admin',
        roleType: 'rutba_app_user',
        canElevateToAdmin: true,
    },
};

const PERMISSION_GROUP_ALIASES = {
    user: 'staff',
};

const DEFAULT_APP_GROUP_FLAGS = {
    staff: true,
    manager: false,
    admin: true,
};

const APP_ACCESS_ALIASES = {
    rider: ['delivery'],
    'order-management': ['delivery', 'cms'],
    'web-orders': ['web-user'],
};

const APP_DEPARTMENT_SEED_MAP = {
    stock: 'Stock & Procurement',
    'order-management': 'Order Operations',
    sale: 'Sales (POS)',
    accounts: 'Accounts',
    'accounts-ap': 'Accounts Payable',
    'accounts-ar': 'Accounts Receivable',
    'accounts-viewer': 'Accounts Viewer',
    delivery: 'Delivery Operations',
    rider: 'Rider Operations',
    crm: 'CRM & Social',
    auth: 'IT / User Management',
    'web-user': 'Web Orders',
    hr: 'Human Resources',
    payroll: 'Payroll',
    cms: 'CMS & Content',
    social: 'Social Media',
};

const APP_ENTRIES = [
    {
        key: 'stock',
        name: 'Stock Management',
        description: 'Products, purchases, inventory, suppliers, brands & categories',
        sessionTimeout: 120,
    },
    {
        key: 'order-management',
        name: 'Order Management',
        description: 'Customer order operations, rider assignment, delivery offers, delivery methods/zones, and delivery notifications',
        sessionTimeout: 180,
    },
    {
        key: 'sale',
        name: 'Point of Sale',
        description: 'Sales, cart, returns, cash register & reports',
        sessionTimeout: 300,
    },
    {
        key: 'accounts',
        name: 'Accounting',
        description: 'Full accounting access — chart of accounts, journal entries, invoices, bills, expenses, fiscal periods, mappings & reports',
        sessionTimeout: 120,
    },
    {
        key: 'accounts-ap',
        name: 'Accounts Payable',
        description: 'Supplier bills, expenses & outgoing payments',
        sessionTimeout: 120,
    },
    {
        key: 'accounts-ar',
        name: 'Accounts Receivable',
        description: 'Customer invoices, incoming payments & collections',
        sessionTimeout: 120,
    },
    {
        key: 'accounts-viewer',
        name: 'Accounting Viewer',
        description: 'Read-only access to all accounting data for auditors & management',
        sessionTimeout: 120,
    },
    {
        key: 'delivery',
        name: 'Delivery',
        description: 'Legacy delivery operations access (delivery offers and rider assignment)',
        sessionTimeout: 180,
    },
    {
        key: 'rider',
        name: 'Rider App',
        description: 'Rider profile, delivery offers, active deliveries, delivery history and delivery status updates',
        sessionTimeout: 180,
    },
    {
        key: 'crm',
        name: 'Customer Relation Management',
        description: 'Customer Relation Management',
        sessionTimeout: 120,
    },
    {
        key: 'auth',
        name: 'User Management',
        description: 'Manage users, roles and app access assignments',
        sessionTimeout: 60,
    },
    {
        key: 'web-user',
        name: 'Web Orders',
        description: 'Track customer web orders, view order details, and request returns',
        sessionTimeout: 60,
    },
    {
        key: 'hr',
        name: 'Human Resources',
        description: 'Employees, departments, attendance and leave management',
        sessionTimeout: 120,
        enabledGroups: {
            staff: true,
            manager: true,
            admin: true,
        },
    },
    {
        key: 'payroll',
        name: 'Payroll',
        description: 'Salary structures, payroll runs and payslips',
        sessionTimeout: 120,
    },
    {
        key: 'cms',
        name: 'Content Management',
        description: 'Manage website content — products, categories, brands, pages, banners, and sales offers',
        sessionTimeout: 120,
    },
    {
        key: 'social',
        name: 'Social Media',
        description: 'Posts, replies, multi-platform publishing & social account management',
        sessionTimeout: 180,
    },
];

const ROUTE_OWNERS_BY_UID_ALL = {
    'api::product.product': { find: ['stock', 'sale', 'cms'], create: ['stock', 'cms'], update: ['stock', 'cms'], delete: ['stock', 'auth'] },
    'api::product-group.product-group': { find: ['stock', 'cms'], create: ['stock', 'cms'], update: ['stock', 'cms'], delete: ['stock', 'cms', 'auth'] },
    'api::category.category': { find: ['stock', 'sale', 'cms'], create: ['stock', 'cms'], update: ['stock', 'cms'], delete: ['stock', 'auth'] },
    'api::brand.brand': { find: ['stock', 'sale', 'cms'], create: ['stock', 'cms'], update: ['stock', 'cms'], delete: ['stock', 'auth'] },
    'api::supplier.supplier': ['stock'],
    'api::purchase.purchase': ['stock'],
    'api::purchase-item.purchase-item': ['stock'],
    'api::purchase-return.purchase-return': ['stock'],
    'api::purchase-return-item.purchase-return-item': ['stock'],
    'api::stock-item.stock-item': { find: ['stock', 'sale'], create: ['stock'], update: ['stock', 'sale'], delete: ['stock'] },
    'api::stock-input.stock-input': ['stock'],
    'api::sale.sale': { find: ['sale', 'stock', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
    'api::sale-item.sale-item': { find: ['sale', 'stock', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
    'api::sale-return.sale-return': ['sale'],
    'api::sale-return-item.sale-return-item': ['sale'],
    'api::payment.payment': { find: ['sale', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
    'api::cash-register.cash-register': { find: ['sale', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
    'api::cash-register-transaction.cash-register-transaction': { find: ['sale', 'accounts'], create: ['sale'], update: ['sale'], delete: ['sale', 'auth'] },
    'api::customer.customer': ['sale', 'crm', 'accounts', 'order-management', 'delivery', 'rider', 'web-user'],
    'api::sale-order.sale-order': ['sale', 'web-user', 'cms', 'order-management', 'delivery', 'rider'],
    'api::crm-contact.crm-contact': ['crm'],
    'api::crm-lead.crm-lead': { find: ['crm', 'sale'], findOne: ['crm', 'sale'], create: ['crm', 'sale'], update: ['crm'], delete: ['crm', 'auth'] },
    'api::crm-activity.crm-activity': ['crm'],
    'api::hr-employee.hr-employee': { find: ['hr', 'payroll'], create: ['hr'], update: ['hr'], delete: ['hr', 'auth'] },
    'api::hr-department.hr-department': { find: ['hr', 'payroll'], create: ['hr'], update: ['hr'], delete: ['hr', 'auth'] },
    'api::hr-attendance.hr-attendance': ['hr'],
    'api::hr-leave-request.hr-leave-request': ['hr'],
    'api::acc-account.acc-account': ['accounts'],
    'api::acc-journal-entry.acc-journal-entry': ['accounts'],
    'api::acc-invoice.acc-invoice': ['accounts'],
    'api::acc-expense.acc-expense': ['accounts'],
    'api::pay-salary-structure.pay-salary-structure': ['payroll'],
    'api::pay-payroll-run.pay-payroll-run': ['payroll'],
    'api::pay-payslip.pay-payslip': ['payroll'],
    'api::cms-page.cms-page': ['cms'],
    'api::brand-group.brand-group': ['cms'],
    'api::category-group.category-group': ['cms'],
    'api::cms-footer.cms-footer': ['cms'],
    'api::sale-offer.sale-offer': ['cms'],
    'api::delivery-offer.delivery-offer': ['order-management', 'delivery', 'rider'],
    'api::delivery-method.delivery-method': ['order-management', 'delivery', 'rider', 'cms'],
    'api::delivery-zone.delivery-zone': ['order-management', 'delivery', 'rider', 'cms'],
    'api::rider.rider': ['order-management', 'delivery', 'rider', 'cms'],
    'api::order-message.order-message': ['order-management', 'delivery', 'rider'],
    'api::notification-template.notification-template': ['order-management', 'delivery', 'cms'],
    'api::notification-log.notification-log': ['order-management', 'delivery', 'cms'],
    'api::branch.branch': ['stock', 'sale', 'hr', 'accounts'],
    'api::currency.currency': ['stock', 'sale', 'accounts'],
    'api::employee.employee': ['stock', 'sale', 'hr', 'payroll'],
    'api::term.term': ['stock', 'sale'],
    'api::term-type.term-type': ['stock', 'sale'],
    'api::app-access.app-access': ['auth'],
};

const APP_PERMISSION_DEFS_ALL = {
    stock: [
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
        { uid: 'api::stock-report.stock-report', actions: WRITE, group: 'admin' },
        { uid: 'api::stock-adjustment.stock-adjustment', actions: WRITE, group: 'admin' },
        { uid: 'api::stock-transfer.stock-transfer', actions: WRITE, group: 'admin' },
    ],
    'order-management': [
        { uid: 'api::sale-order.sale-order', actions: NO_DEL },
        { uid: 'api::customer.customer', actions: READ },
        { uid: 'api::delivery-method.delivery-method', actions: CMS_WRITE },
        { uid: 'api::delivery-zone.delivery-zone', actions: READ },
        { uid: 'api::rider.rider', actions: READ },
        { uid: 'api::delivery-offer.delivery-offer', actions: WRITE },
        { uid: 'api::order-message.order-message', actions: WRITE },
        { uid: 'api::notification-template.notification-template', actions: READ },
        { uid: 'api::notification-log.notification-log', actions: READ },
        { uid: 'api::delivery-config.delivery-config', actions: WRITE, group: 'admin' },
        { uid: 'api::rider-commission.rider-commission', actions: WRITE, group: 'admin' },
        { uid: 'api::order-cancellation.order-cancellation', actions: WRITE, group: 'admin' },
    ],
    sale: [
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
        { uid: 'api::sale-report.sale-report', actions: WRITE, group: 'admin' },
        { uid: 'api::cash-register-audit.cash-register-audit', actions: WRITE, group: 'admin' },
        { uid: 'api::discount-rule.discount-rule', actions: WRITE, group: 'admin' },
        { uid: 'api::tax-rate.tax-rate', actions: WRITE, group: 'admin' },
    ],
    accounts: [
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
        { uid: 'api::acc-settings.acc-settings', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-report.acc-report', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-reconciliation.acc-reconciliation', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-audit-log.acc-audit-log', actions: READ, group: 'admin' },
    ],
    'accounts-ap': [
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
        { uid: 'api::acc-bill-approval.acc-bill-approval', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-payment-batch.acc-payment-batch', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-vendor-credit.acc-vendor-credit', actions: WRITE, group: 'admin' },
    ],
    'accounts-ar': [
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
        { uid: 'api::acc-invoice-approval.acc-invoice-approval', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-collection.acc-collection', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-customer-credit.acc-customer-credit', actions: WRITE, group: 'admin' },
        { uid: 'api::acc-aging-report.acc-aging-report', actions: READ, group: 'admin' },
    ],
    'accounts-viewer': [
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
    delivery: [
        { uid: 'api::sale-order.sale-order', actions: NO_DEL },
        { uid: 'api::customer.customer', actions: READ },
        { uid: 'api::delivery-method.delivery-method', actions: READ },
        { uid: 'api::delivery-zone.delivery-zone', actions: READ },
        { uid: 'api::rider.rider', actions: READ },
        { uid: 'api::delivery-offer.delivery-offer', actions: WRITE },
        { uid: 'api::order-message.order-message', actions: WRITE },
        { uid: 'api::notification-template.notification-template', actions: READ },
        { uid: 'api::notification-log.notification-log', actions: READ },
        { uid: 'api::delivery-settings.delivery-settings', actions: WRITE, group: 'admin' },
        { uid: 'api::rider-document.rider-document', actions: WRITE, group: 'admin' },
        { uid: 'api::delivery-analytics.delivery-analytics', actions: READ, group: 'admin' },
    ],
    rider: [
        { uid: 'api::rider.rider', actions: NO_DEL },
        { uid: 'api::delivery-offer.delivery-offer', actions: NO_DEL },
        { uid: 'api::sale-order.sale-order', actions: NO_DEL },
        { uid: 'api::order-message.order-message', actions: WRITE },
        { uid: 'api::delivery-method.delivery-method', actions: READ },
        { uid: 'api::delivery-zone.delivery-zone', actions: READ },
        { uid: 'api::customer.customer', actions: READ },
        { uid: 'api::rider-settings.rider-settings', actions: WRITE, group: 'admin' },
        { uid: 'api::rider-payout.rider-payout', actions: WRITE, group: 'admin' },
        { uid: 'api::rider-rating.rider-rating', actions: WRITE, group: 'admin' },
    ],
    crm: [
        { uid: 'api::crm-contact.crm-contact', actions: WRITE },
        { uid: 'api::crm-lead.crm-lead', actions: WRITE },
        { uid: 'api::crm-activity.crm-activity', actions: WRITE },
        { uid: 'api::customer.customer', actions: WRITE },
        { uid: 'api::crm-segment.crm-segment', actions: WRITE, group: 'admin' },
        { uid: 'api::crm-campaign.crm-campaign', actions: WRITE, group: 'admin' },
        { uid: 'api::crm-automation.crm-automation', actions: WRITE, group: 'admin' },
        { uid: 'api::crm-analytics.crm-analytics', actions: READ, group: 'admin' },
    ],
    auth: [
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
        { uid: 'api::role-permission.role-permission', actions: WRITE, group: 'admin' },
        { uid: 'api::system-audit-log.system-audit-log', actions: READ, group: 'admin' },
        { uid: 'api::backup-config.backup-config', actions: WRITE, group: 'admin' },
    ],
    'web-user': [
        { uid: 'api::sale-order.sale-order', actions: NO_DEL },
        { uid: 'api::product.product', actions: READ },
        { uid: 'api::category.category', actions: READ },
        { uid: 'api::brand.brand', actions: READ },
    ],
    hr: [
        { uid: 'api::hr-employee.hr-employee', actions: WRITE },
        { uid: 'api::hr-department.hr-department', actions: WRITE },
        { uid: 'api::hr-team.hr-team', actions: WRITE },
        { uid: 'api::hr-attendance.hr-attendance', actions: WRITE },
        { uid: 'api::hr-leave-request.hr-leave-request', actions: [...WRITE, 'myRequests', 'submit'] },
        { uid: 'api::branch.branch', actions: READ },
        { uid: 'api::employee.employee', actions: READ },
        { uid: 'api::hr-leave-request.hr-leave-request', actions: ['find', 'findOne', 'update', 'teamQueue', 'approve', 'reject'], group: 'manager' },
        { uid: 'api::hr-employee.hr-employee', actions: READ, group: 'manager' },
        { uid: 'api::hr-department.hr-department', actions: READ, group: 'manager' },
        { uid: 'api::hr-team.hr-team', actions: READ, group: 'manager' },
        { uid: 'api::hr-policy.hr-policy', actions: WRITE, group: 'admin' },
        { uid: 'api::hr-recruitment.hr-recruitment', actions: WRITE, group: 'admin' },
        { uid: 'api::hr-training.hr-training', actions: WRITE, group: 'admin' },
        { uid: 'api::hr-report.hr-report', actions: READ, group: 'admin' },
    ],
    payroll: [
        { uid: 'api::pay-salary-structure.pay-salary-structure', actions: WRITE },
        { uid: 'api::pay-payroll-run.pay-payroll-run', actions: WRITE },
        { uid: 'api::pay-payslip.pay-payslip', actions: WRITE },
        { uid: 'api::hr-employee.hr-employee', actions: READ },
        { uid: 'api::hr-department.hr-department', actions: READ },
        { uid: 'api::employee.employee', actions: READ },
        { uid: 'api::pay-settings.pay-settings', actions: WRITE, group: 'admin' },
        { uid: 'api::pay-tax-config.pay-tax-config', actions: WRITE, group: 'admin' },
        { uid: 'api::pay-bonus.pay-bonus', actions: WRITE, group: 'admin' },
        { uid: 'api::pay-report.pay-report', actions: READ, group: 'admin' },
    ],
    cms: [
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
        { uid: 'api::cms-workflow.cms-workflow', actions: WRITE, group: 'admin' },
        { uid: 'api::cms-seo.cms-seo', actions: WRITE, group: 'admin' },
        { uid: 'api::cms-analytics.cms-analytics', actions: READ, group: 'admin' },
        { uid: 'api::cms-template.cms-template', actions: WRITE, group: 'admin' },
    ],
    social: [
        { uid: 'api::social-post.social-post', actions: CMS_WRITE },
        { uid: 'api::social-reply.social-reply', actions: WRITE },
        { uid: 'api::social-account.social-account', actions: WRITE },
        { uid: 'api::branch.branch', actions: READ },
        { uid: 'api::employee.employee', actions: READ },
        { uid: 'api::social-analytics.social-analytics', actions: READ, group: 'admin' },
        { uid: 'api::social-settings.social-settings', actions: WRITE, group: 'admin' },
        { uid: 'api::social-automation.social-automation', actions: WRITE, group: 'admin' },
    ],
};

const ENDPOINT_COVERAGE = {
    'api::branch.branch': ['find', 'findOne', 'update'],
    'api::brand.brand': ['find', 'findOne', 'create', 'update', 'delete', 'publish', 'unpublish'],
    'api::cash-register-transaction.cash-register-transaction': ['find', 'findOne', 'create'],
    'api::cash-register.cash-register': ['find', 'findOne', 'create', 'open', 'close', 'active'],
    'api::category.category': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::cms-page.cms-page': ['find', 'findOne', 'create', 'update', 'publish', 'unpublish'],
    'api::crm-lead.crm-lead': ['create', 'update'],
    'api::customer.customer': ['find', 'findOne', 'create', 'update'],
    'api::notification-log.notification-log': ['find', 'findOne'],
    'api::notification-template.notification-template': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::payment.payment': ['find', 'findOne', 'create', 'update'],
    'api::product.product': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::purchase-item.purchase-item': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::purchase.purchase': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::sale-item.sale-item': ['create', 'update'],
    'api::sale-return-item.sale-return-item': ['create', 'update'],
    'api::sale-return.sale-return': ['find', 'findOne', 'create', 'update', 'publish', 'unpublish'],
    'api::sale.sale': ['find', 'findOne', 'create', 'update'],
    'api::stock-input.stock-input': ['find', 'findOne', 'create', 'update', 'delete', 'process'],
    'api::stock-item.stock-item': ['find', 'findOne', 'create', 'update', 'orphanGroups', 'orphanGroupItems'],
    'api::supplier.supplier': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::term-type.term-type': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::term.term': ['find', 'findOne', 'create', 'update', 'delete'],
};

const USED_ENDPOINT_UIDS = new Set(Object.keys(ENDPOINT_COVERAGE));

const APP_PERMISSION_DEFS = Object.fromEntries(
    Object.entries(APP_PERMISSION_DEFS_ALL).map(([appKey, defs]) => {
        const filteredDefs = (defs || [])
            .filter((def) => USED_ENDPOINT_UIDS.has(def.uid))
            .map((def) => {
                const coveredActions = new Set(ENDPOINT_COVERAGE[def.uid] || []);
                const actions = [...new Set((def.actions || []).filter((action) => coveredActions.has(action)))];
                if (actions.length === 0) return null;
                return {
                    uid: def.uid,
                    actions,
                    ...(def.group ? { group: def.group } : {}),
                };
            })
            .filter(Boolean);

        return [appKey, filteredDefs];
    })
);

const COVERED_ACTIONS_BY_UID = Object.fromEntries(
    Object.entries(ENDPOINT_COVERAGE).map(([uid, actions]) => [uid, new Set(actions || [])])
);

function getCoveredActionsForUid(uid) {
    return COVERED_ACTIONS_BY_UID[uid] || null;
}

function filterActionsByEndpointCoverage(uid, actions = []) {
    const covered = getCoveredActionsForUid(uid);
    if (!covered) return [];
    return [...new Set((actions || []).filter((action) => covered.has(action)))];
}

const DISABLED_METHOD_STATUS = {
    NOT_IMPLEMENTED: 'not-implemented',
    DISABLED: 'disabled',
};

const DISABLED_METHOD_REASONS = {
    MISSING_RUNTIME_ENDPOINT_METHOD: 'missing runtime endpoint method',
    MISSING_ENDPOINT_MODULE: 'missing endpoint module',
};

function normalizePermissionGroupKey(groupKey) {
    if (!groupKey) return null;
    const normalized = String(groupKey).trim().toLowerCase();
    return PERMISSION_GROUP_ALIASES[normalized] || normalized;
}

function getEnabledGroupKeysForEntry(entry) {
    const mergedFlags = {
        ...DEFAULT_APP_GROUP_FLAGS,
        ...(entry?.enabledGroups || {}),
    };

    return Object.entries(mergedFlags)
        .filter(([, enabled]) => !!enabled)
        .map(([groupKey]) => normalizePermissionGroupKey(groupKey))
        .filter((key, idx, arr) => !!key && arr.indexOf(key) === idx);
}

function getConfigUidActions() {
    const uidActions = new Map();

    Object.entries(APP_PERMISSION_DEFS).forEach(([, defs]) => {
        (defs || []).forEach((def) => {
            const allowedActions = filterActionsByEndpointCoverage(def.uid, def.actions || []);
            if (allowedActions.length === 0) return;
            const current = uidActions.get(def.uid) || new Set();
            allowedActions.forEach((a) => current.add(a));
            uidActions.set(def.uid, current);
        });
    });

    return uidActions;
}

function buildParityMatrix() {
    const configUidActions = getConfigUidActions();
    const rows = [];

    for (const [uid, actionSet] of configUidActions.entries()) {
        const requiredActions = [...actionSet].sort();
        const coveredActions = [...(ENDPOINT_COVERAGE[uid] || [])].sort();
        const missingActions = requiredActions.filter((a) => !coveredActions.includes(a));
        const endpointMissing = coveredActions.length === 0;
        rows.push({
            uid,
            requiredActions,
            coveredActions,
            missingActions,
            endpointMissing,
        });
    }

    rows.sort((a, b) => a.uid.localeCompare(b.uid));
    return rows;
}

const PARITY_MATRIX = buildParityMatrix();

const DISABLED_PLACEHOLDERS = PARITY_MATRIX
    .filter((row) => row.endpointMissing || row.missingActions.length > 0)
    .map((row) => ({
        uid: row.uid,
        endpointMissing: row.endpointMissing,
        placeholders: row.missingActions.map((action) => ({
            action,
            enabled: false,
            status: DISABLED_METHOD_STATUS.NOT_IMPLEMENTED,
            reason: row.endpointMissing
                ? DISABLED_METHOD_REASONS.MISSING_ENDPOINT_MODULE
                : DISABLED_METHOD_REASONS.MISSING_RUNTIME_ENDPOINT_METHOD,
            introducedForParity: true,
            missingFromRuntime: true,
        })),
    }));

const ALL_UIDS = [...new Set([
    ...Object.keys(ENDPOINT_COVERAGE),
    ...PARITY_MATRIX.map((r) => r.uid),
])].sort();

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
            'plugin::users-permissions.auth.local',
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

function getPermissionGroup(groupKey) {
    const key = normalizePermissionGroupKey(groupKey);
    return key ? (PERMISSION_GROUPS[key] || null) : null;
}

function canGroupElevateToAdmin(groupKey) {
    return !!getPermissionGroup(groupKey)?.canElevateToAdmin;
}

function getEnabledPermissionGroups(appKey) {
    const entry = APP_ENTRIES.find((e) => e.key === appKey);
    if (!entry) return [];
    return getEnabledGroupKeysForEntry(entry);
}

const permissionGroupsByKey = Object.fromEntries(
    APP_ENTRIES.map((entry) => {
        const enabledKeys = getEnabledGroupKeysForEntry(entry);
        const groups = Object.fromEntries(enabledKeys.map((k) => [k, []]));

        const defs = APP_PERMISSION_DEFS[entry.key] || [];
        for (const def of defs) {
            const groupKey = normalizePermissionGroupKey(def.group || 'staff');
            if (!groupKey || !enabledKeys.includes(groupKey)) continue;
            const allowedActions = filterActionsByEndpointCoverage(def.uid, def.actions || []);
            if (allowedActions.length === 0) continue;
            groups[groupKey] = [...(groups[groupKey] || []), { uid: def.uid, actions: allowedActions }];
        }

        return [entry.key, groups];
    })
);

function getPermissionsForAppGroups(appKey, groupKeys = []) {
    const appGroups = permissionGroupsByKey[appKey] || {};
    const normalizedKeys = [...new Set((groupKeys || []).map(normalizePermissionGroupKey).filter(Boolean))];
    return normalizedKeys.flatMap((key) => appGroups[key] || []);
}

function getEffectiveAppAccessFromUser(fullUser) {
    const appAccess = (fullUser?.app_accesses || []).map((a) => a.key);
    const adminAppAccess = (fullUser?.admin_app_accesses || []).map((a) => a.key);
    const permissionRoles = fullUser?.permission_roles || [];

    const roleDerivedAppAccess = permissionRoles
        .map((r) => r?.domain?.key)
        .filter(Boolean);

    const roleDerivedAdminAccess = permissionRoles
        .filter((r) => r.level === 'admin')
        .map((r) => r?.domain?.key)
        .filter(Boolean);

    return {
        appKeys: [...new Set([...appAccess, ...roleDerivedAppAccess])],
        adminKeys: [...new Set([...adminAppAccess, ...roleDerivedAdminAccess])],
    };
}

function getAccessibleAppKeysForRequest(appName, appKeys = [], adminKeys = []) {
    const candidateKeys = [appName, ...(APP_ACCESS_ALIASES[appName] || [])]
        .filter(Boolean)
        .filter((k, i, a) => a.indexOf(k) === i);

    return candidateKeys.filter((k) => appKeys.includes(k) || adminKeys.includes(k));
}

function getPermissionDefsForAccessibleApps(accessibleAppKeys = [], appKeys = [], adminKeys = []) {
    return (accessibleAppKeys || []).flatMap((appKey) => {
        const enabledGroups = getEnabledPermissionGroups(appKey);
        const groups = [];

        if (appKeys.includes(appKey) && enabledGroups.includes('staff')) {
            groups.push('staff');
            if (enabledGroups.includes('manager') && adminKeys.includes(appKey)) {
                groups.push('manager');
            }
        }

        if (adminKeys.includes(appKey) && enabledGroups.includes('admin')) {
            groups.push('admin');
        }

        return getPermissionsForAppGroups(appKey, groups);
    });
}

function permissionDefsToActions(permissionDefs = []) {
    return (permissionDefs || []).flatMap((def) =>
        (def.actions || []).map((action) => `${def.uid}.${action}`)
    );
}

const userPermissionsByKey = Object.fromEntries(
    Object.entries(permissionGroupsByKey).map(([appKey, groups]) => [appKey, groups.staff || []])
);

const adminPermissionsByKey = Object.fromEntries(
    Object.entries(permissionGroupsByKey).map(([appKey, groups]) => [appKey, groups.admin || []])
);

const permissionsByKey = Object.fromEntries(
    Object.entries(permissionGroupsByKey).map(([appKey, groups]) => [
        appKey,
        Object.values(groups).flatMap((groupGrants) => groupGrants || []),
    ])
);

const FLAT_PERMISSIONS = Object.entries(permissionGroupsByKey).flatMap(([appKey, groups]) =>
    Object.entries(groups).flatMap(([groupKey, grants]) =>
        (grants || []).map((grant) => ({
            appKey,
            group: groupKey,
            uid: grant.uid,
            actions: [...(grant.actions || [])],
        }))
    )
);

const DEFAULT_SESSION_TIMEOUT = 60;

const ENTRIES = APP_ENTRIES.map((entry) => ({
    key: entry.key,
    name: entry.name,
    description: entry.description,
    sessionTimeout: entry.sessionTimeout,
    enabledGroups: entry.enabledGroups,
    permissions: [
        {
            role: PERMISSION_GROUPS.staff,
            grants: permissionGroupsByKey[entry.key]?.staff || [],
        },
        {
            role: PERMISSION_GROUPS.manager,
            grants: permissionGroupsByKey[entry.key]?.manager || [],
        },
        {
            role: PERMISSION_GROUPS.admin,
            grants: permissionGroupsByKey[entry.key]?.admin || [],
        },
    ].filter((row) => Array.isArray(row.grants) && row.grants.length > 0),
}));

const settingsByKey = Object.fromEntries(
    APP_ENTRIES.map((entry) => [
        entry.key,
        {
            name: entry.name,
            description: entry.description,
            sessionTimeout: entry.sessionTimeout ?? 60,
        },
    ])
);

function getAppRoleOptions() {
    return APP_ENTRIES.map((entry) => ({
        appKey: entry.key,
        teamSlug: `team-${entry.key}`,
        appName: entry.name,
        departmentName: APP_DEPARTMENT_SEED_MAP[entry.key] || entry.name,
        enabledGroups: getEnabledGroupKeysForEntry(entry),
    }));
}

function sanitizeAppRolesForTeam(appRoles) {
    const options = getAppRoleOptions();
    const optionMap = new Map(options.map((o) => [o.appKey, new Set(o.enabledGroups || [])]));
    const source = appRoles && typeof appRoles === 'object' ? appRoles : {};

    const sanitized = {};
    for (const [appKey, roles] of Object.entries(source)) {
        const allowed = optionMap.get(appKey);
        if (!allowed) continue;
        const normalized = Array.isArray(roles) ? roles : [];
        const validRoles = [...new Set(normalized.filter((r) => allowed.has(String(r))))];
        sanitized[appKey] = validRoles;
    }

    return sanitized;
}

function deriveTeamSlugFromData(data) {
    const explicit = String(data?.team_slug || '').trim();
    if (explicit) return explicit.toLowerCase();
    const byDepartment = String(data?.department?.name || data?.departmentName || '').trim();
    if (byDepartment) {
        return byDepartment.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    const byName = String(data?.name || '').trim();
    return byName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function getGrantsForAppRole(appKey, roleKey) {
    return getPermissionsForAppGroups(appKey, [roleKey]);
}

const PLUGIN_PERMISSIONS =
    PLUGIN_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'rutba_app_user')?.permissions || [];

const CLIENT_PLUGIN_PERMISSIONS =
    PLUGIN_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'rutba_app_user')?.clientPermissions || [];

const WEB_USER_PLUGIN_PERMISSIONS =
    PLUGIN_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'rutba_web_user')?.permissions || [];

const PUBLIC_PERMISSIONS =
    PUBLIC_PERMISSION_ENTRIES.find((entry) => entry.role.roleType === 'public')?.permissions || [];

export {
    ENTRIES,
    APP_ENTRIES,
    PERMISSION_GROUPS,
    DISABLED_PLACEHOLDERS,
    SYSTEM_PERMISSION_GROUPS,
    settingsByKey,
    DEFAULT_SESSION_TIMEOUT,
    permissionsByKey,
    PLUGIN_PERMISSIONS,
    CLIENT_PLUGIN_PERMISSIONS,
    PUBLIC_PERMISSIONS,
    canGroupElevateToAdmin,
    APP_ACCESS_ALIASES,
    getPermissionsForAppGroups,
    getEnabledPermissionGroups,
    getAppRoleOptions,
    getEffectiveAppAccessFromUser,
    getAccessibleAppKeysForRequest,
    getPermissionDefsForAccessibleApps,
    permissionDefsToActions,
    sanitizeAppRolesForTeam,
    deriveTeamSlugFromData,
};

