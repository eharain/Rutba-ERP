// @ts-nocheck
'use strict';

/**
 * endpoint-rules-cjs.js
 *
 * CommonJS bridge for ESM endpoint rules in pos-shared.
 * Imports each *EndpointRules and *EndpointsMeta object individually
 * so the seeder (which runs in Strapi's CJS environment) can consume them.
 *
 * Strapi resolves pos-shared from the monorepo via package.json exports.
 * Each endpoint file uses `export const` so we require individual files
 * rather than the ESM registry.
 */

const salesModule = require('../../../packages/pos-shared/lib/endpoints/sales.js');
const saleItemsModule = require('../../../packages/pos-shared/lib/endpoints/sale-items.js');
const saleReturnsModule = require('../../../packages/pos-shared/lib/endpoints/sale-returns.js');
const saleReturnItemsModule = require('../../../packages/pos-shared/lib/endpoints/sale-return-items.js');
const purchasesModule = require('../../../packages/pos-shared/lib/endpoints/purchases.js');
const purchaseItemsModule = require('../../../packages/pos-shared/lib/endpoints/purchase-items.js');
const paymentsModule = require('../../../packages/pos-shared/lib/endpoints/payments.js');
const cashRegistersModule = require('../../../packages/pos-shared/lib/endpoints/cash-registers.js');
const cashRegisterTxModule = require('../../../packages/pos-shared/lib/endpoints/cash-register-transactions.js');
const stockItemsModule = require('../../../packages/pos-shared/lib/endpoints/stock-items.js');
const stockInputsModule = require('../../../packages/pos-shared/lib/endpoints/stock-inputs.js');
const productsModule = require('../../../packages/pos-shared/lib/endpoints/products.js');
const customersModule = require('../../../packages/pos-shared/lib/endpoints/customers.js');
const branchesModule = require('../../../packages/pos-shared/lib/endpoints/branches.js');
const brandsModule = require('../../../packages/pos-shared/lib/endpoints/brands.js');
const categoriesModule = require('../../../packages/pos-shared/lib/endpoints/categories.js');
const suppliersModule = require('../../../packages/pos-shared/lib/endpoints/suppliers.js');
const cmsPagesModule = require('../../../packages/pos-shared/lib/endpoints/cms-pages.js');
const enumsModule = require('../../../packages/pos-shared/lib/endpoints/enums.js');
const termTypesModule = require('../../../packages/pos-shared/lib/endpoints/term-types.js');
const crmLeadsModule = require('../../../packages/pos-shared/lib/endpoints/crm-leads.js');
const notificationTemplatesModule = require('../../../packages/pos-shared/lib/endpoints/notification-templates.js');

/**
 * ENDPOINT_RULES_REGISTRY (CJS)
 *
 * Maps basePath → EndpointRules for all registered endpoints.
 * Passed to the seeder so every resource record gets its requestRules.
 */
const ENDPOINT_RULES_REGISTRY = {
    '/sales': salesModule.SalesEndpointRules || {},
    '/sale-items': saleItemsModule.SaleItemsEndpointRules || {},
    '/sale-returns': saleReturnsModule.SaleReturnsEndpointRules || {},
    '/sale-return-items': saleReturnItemsModule.SaleReturnItemsEndpointRules || {},
    '/purchases': purchasesModule.PurchasesEndpointRules || {},
    '/purchase-items': purchaseItemsModule.PurchaseItemsEndpointRules || {},
    '/payments': paymentsModule.PaymentsEndpointRules || {},
    '/cash-registers': cashRegistersModule.CashRegistersEndpointRules || {},
    '/cash-register-transactions': cashRegisterTxModule.CashRegisterTransactionEndpointRules || {},
    '/stock-items': stockItemsModule.StockItemsEndpointRules || {},
    '/stock-inputs': stockInputsModule.StockInputsEndpointRules || {},
    '/products': productsModule.ProductsEndpointRules || {},
    '/customers': customersModule.CustomersEndpointRules || {},
    '/branches': branchesModule.BranchesEndpointRules || {},
    '/brands': brandsModule.BrandsEndpointRules || {},
    '/categories': categoriesModule.CategoriesEndpointRules || {},
    '/suppliers': suppliersModule.SuppliersEndpointRules || {},
    '/cms-pages': cmsPagesModule.CmsPagesEndpointRules || {},
    '/enums': enumsModule.EnumsEndpointRules || {},
    '/term-types': termTypesModule.TermTypesEndpointRules || {},
    '/terms': termTypesModule.TermsEndpointRules || {},
    '/crm-leads': crmLeadsModule.CrmLeadsEndpointRules || {},
    '/notification-templates': notificationTemplatesModule.NotificationTemplatesEndpointRules || {},
};

module.exports = { ENDPOINT_RULES_REGISTRY };
