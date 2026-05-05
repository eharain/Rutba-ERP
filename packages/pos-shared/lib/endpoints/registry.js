import { SalesEndpointsMeta, SalesEndpointRules } from './sales.js';
import { SaleItemsEndpointsMeta, SaleItemsEndpointRules } from './sale-items.js';
import { SaleReturnsEndpointsMeta, SaleReturnsEndpointRules } from './sale-returns.js';
import { SaleReturnItemsEndpointsMeta, SaleReturnItemsEndpointRules } from './sale-return-items.js';
import { PurchasesEndpointsMeta, PurchasesEndpointRules } from './purchases.js';
import { PurchaseItemsEndpointsMeta, PurchaseItemsEndpointRules } from './purchase-items.js';
import { PaymentsEndpointsMeta, PaymentsEndpointRules } from './payments.js';
import { CashRegisterTransactionEndpointsMeta, CashRegisterTransactionEndpointRules } from './cash-register-transactions.js';
import { CashRegistersEndpointsMeta, CashRegistersEndpointRules } from './cash-registers.js';
import { StockItemsEndpointsMeta, StockItemsEndpointRules } from './stock-items.js';
import { ProductsEndpointsMeta, ProductsEndpointRules } from './products.js';
import { CustomersEndpointsMeta, CustomersEndpointRules } from './customers.js';
import { BranchesEndpointsMeta, BranchesEndpointRules } from './branches.js';
import { BrandsEndpointsMeta, BrandsEndpointRules } from './brands.js';
import { CategoriesEndpointsMeta, CategoriesEndpointRules } from './categories.js';
import { SuppliersEndpointsMeta, SuppliersEndpointRules } from './suppliers.js';
import { CmsPagesEndpointsMeta, CmsPagesEndpointRules } from './cms-pages.js';
import { UploadEndpointsMeta } from './upload.js';
import { EnumsEndpointsMeta, EnumsEndpointRules } from './enums.js';
import { TermTypesEndpointsMeta, TermTypesEndpointRules, TermsEndpointsMeta, TermsEndpointRules } from './term-types.js';
import { CrmLeadsEndpointsMeta, CrmLeadsEndpointRules } from './crm-leads.js';
import { StockInputsEndpointsMeta, StockInputsEndpointRules } from './stock-inputs.js';
import { NotificationTemplatesEndpointsMeta, NotificationTemplatesEndpointRules } from './notification-templates.js';
import { WebAuthEndpointsMeta, WebAuthEndpointRules, WebCheckoutEndpointsMeta, WebCheckoutEndpointRules, WebDeliveryEndpointsMeta, WebDeliveryEndpointRules, WebLeadsEndpointsMeta, WebLeadsEndpointRules } from './web.js';
import { DisabledPlaceholderEndpoints } from './disabled-placeholders.js';

const IMPLEMENTED_ENDPOINT_META = [
    SalesEndpointsMeta,
    SaleItemsEndpointsMeta,
    SaleReturnsEndpointsMeta,
    SaleReturnItemsEndpointsMeta,
    PurchasesEndpointsMeta,
    PurchaseItemsEndpointsMeta,
    PaymentsEndpointsMeta,
    CashRegisterTransactionEndpointsMeta,
    CashRegistersEndpointsMeta,
    StockItemsEndpointsMeta,
    ProductsEndpointsMeta,
    CustomersEndpointsMeta,
    BranchesEndpointsMeta,
    BrandsEndpointsMeta,
    CategoriesEndpointsMeta,
    SuppliersEndpointsMeta,
    CmsPagesEndpointsMeta,
    UploadEndpointsMeta,
    EnumsEndpointsMeta,
    TermTypesEndpointsMeta,
    TermsEndpointsMeta,
    CrmLeadsEndpointsMeta,
    StockInputsEndpointsMeta,
    NotificationTemplatesEndpointsMeta,
    WebAuthEndpointsMeta,
    WebCheckoutEndpointsMeta,
    WebDeliveryEndpointsMeta,
    WebLeadsEndpointsMeta,
];

const DISABLED_ENDPOINT_META = Object.values(DisabledPlaceholderEndpoints || {});

const ENDPOINT_METADATA_REGISTRY = {
    implemented: IMPLEMENTED_ENDPOINT_META,
    disabled: DISABLED_ENDPOINT_META,
    all: [
        ...IMPLEMENTED_ENDPOINT_META,
        ...DISABLED_ENDPOINT_META,
    ],
};

export {
    IMPLEMENTED_ENDPOINT_META,
    DISABLED_ENDPOINT_META,
    ENDPOINT_METADATA_REGISTRY,
};

/**
 * ENDPOINT_RULES_REGISTRY
 *
 * Maps each endpoint basePath to its *EndpointRules object.
 * Used by the api-guard-seed.js seeder to attach requestRules to resource records.
 * Keys match the basePath fields on the corresponding *EndpointsMeta.
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

