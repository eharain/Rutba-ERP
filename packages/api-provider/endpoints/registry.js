import { SalesEndpointRules } from './sales.js';
import { SaleItemsEndpointRules } from './sale-items.js';
import { SaleReturnsEndpointRules } from './sale-returns.js';
import { SaleReturnItemsEndpointRules } from './sale-return-items.js';
import { PurchasesEndpointRules } from './purchases.js';
import { PurchaseItemsEndpointRules } from './purchase-items.js';
import { PaymentsEndpointRules } from './payments.js';
import { CashRegisterTransactionEndpointRules } from './cash-register-transactions.js';
import { CashRegistersEndpointRules } from './cash-registers.js';
import { StockItemsEndpointRules } from './stock-items.js';
import { ProductsEndpointRules } from './products.js';
import { CustomersEndpointRules } from './customers.js';
import { BranchesEndpointRules } from './branches.js';
import { BrandsEndpointRules } from './brands.js';
import { CategoriesEndpointRules } from './categories.js';
import { SuppliersEndpointRules } from './suppliers.js';
import { CmsPagesEndpointRules } from './cms-pages.js';
import { EnumsEndpointRules } from './enums.js';
import { TermTypesEndpointRules } from './term-types.js';
import { TermsEndpointRules } from './terms.js';
import { CrmLeadsEndpointRules } from './crm-leads.js';
import { StockInputsEndpointRules } from './stock-inputs.js';
import { NotificationTemplatesEndpointRules } from './notification-templates.js';
import { WebAuthEndpointRules, WebCheckoutEndpointRules, WebDeliveryEndpointRules, WebLeadsEndpointRules } from './web.js';

/**
 * ENDPOINT_RULES_REGISTRY
 *
 * Maps each endpoint basePath to its *EndpointRules object.
 * Used by the api-guard-seed.js seeder to attach requestRules to resource records.
 */
export const ENDPOINT_RULES_REGISTRY = {
    '/sales': SalesEndpointRules,
    '/sale-items': SaleItemsEndpointRules,
    '/sale-returns': SaleReturnsEndpointRules,
    '/sale-return-items': SaleReturnItemsEndpointRules,
    '/purchases': PurchasesEndpointRules,
    '/purchase-items': PurchaseItemsEndpointRules,
    '/payments': PaymentsEndpointRules,
    '/cash-register-transactions': CashRegisterTransactionEndpointRules,
    '/cash-registers': CashRegistersEndpointRules,
    '/stock-items': StockItemsEndpointRules,
    '/products': ProductsEndpointRules,
    '/customers': CustomersEndpointRules,
    '/branches': BranchesEndpointRules,
    '/brands': BrandsEndpointRules,
    '/categories': CategoriesEndpointRules,
    '/suppliers': SuppliersEndpointRules,
    '/cms-pages': CmsPagesEndpointRules,
    '/enums': EnumsEndpointRules,
    '/term-types': TermTypesEndpointRules,
    '/terms': TermsEndpointRules,
    '/crm-leads': CrmLeadsEndpointRules,
    '/stock-inputs': StockInputsEndpointRules,
    '/notification-templates': NotificationTemplatesEndpointRules,
    '/auth': WebAuthEndpointRules,
    '/orders/checkout': WebCheckoutEndpointRules,
    '/orders': WebDeliveryEndpointRules,
    '/crm-leads': {
        ...CrmLeadsEndpointRules,
        ...WebLeadsEndpointRules,
    },
};

