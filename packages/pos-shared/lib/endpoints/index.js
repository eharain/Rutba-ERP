/**
 * packages/pos-shared/lib/endpoints/index.js
 *
 * Central re-export of all shared endpoint registries.
 * Import from here wherever you need path + params definitions:
 *
 *   import { SalesEndpoints, ProductsEndpoints } from '@rutba/pos-shared/lib/endpoints';
 */

export { SalesEndpoints } from './sales.js';
export { SaleItemsEndpoints } from './sale-items.js';
export { SaleReturnsEndpoints } from './sale-returns.js';
export { SaleReturnItemsEndpoints } from './sale-return-items.js';
export { PurchasesEndpoints } from './purchases.js';
export { PurchaseItemsEndpoints } from './purchase-items.js';
export { PaymentsEndpoints } from './payments.js';
export { CashRegisterTransactionEndpoints } from './cash-register-transactions.js';
export { CashRegistersEndpoints } from './cash-registers.js';
export { StockItemsEndpoints } from './stock-items.js';
export { ProductsEndpoints } from './products.js';
export { CustomersEndpoints } from './customers.js';
export { BranchesEndpoints } from './branches.js';
export { BrandsEndpoints } from './brands.js';
export { CategoriesEndpoints } from './categories.js';
export { SuppliersEndpoints } from './suppliers.js';
export { CmsPagesEndpoints } from './cms-pages.js';
export { UploadEndpoints } from './upload.js';
export { EnumsEndpoints } from './enums.js';
export { TermTypesEndpoints, TermsEndpoints } from './term-types.js';
export { CrmLeadsEndpoints } from './crm-leads.js';
export { StockInputsEndpoints } from './stock-inputs.js';
export { AppAccessMetadata, DISABLED_PLACEHOLDERS } from './access-metadata.js';
export { DisabledPlaceholderEndpoints } from './disabled-placeholders.js';

export {
    SalesEndpointsMeta,
} from './sales.js';
export {
    SaleItemsEndpointsMeta,
} from './sale-items.js';
export {
    SaleReturnsEndpointsMeta,
} from './sale-returns.js';
export {
    SaleReturnItemsEndpointsMeta,
} from './sale-return-items.js';
export {
    PurchasesEndpointsMeta,
} from './purchases.js';
export {
    PurchaseItemsEndpointsMeta,
} from './purchase-items.js';
export {
    PaymentsEndpointsMeta,
} from './payments.js';
export {
    CashRegisterTransactionEndpointsMeta,
} from './cash-register-transactions.js';
export {
    CashRegistersEndpointsMeta,
} from './cash-registers.js';
export {
    StockItemsEndpointsMeta,
} from './stock-items.js';
export {
    ProductsEndpointsMeta,
} from './products.js';
export {
    CustomersEndpointsMeta,
} from './customers.js';
export {
    BranchesEndpointsMeta,
} from './branches.js';
export {
    BrandsEndpointsMeta,
} from './brands.js';
export {
    CategoriesEndpointsMeta,
} from './categories.js';
export {
    SuppliersEndpointsMeta,
} from './suppliers.js';
export {
    CmsPagesEndpointsMeta,
} from './cms-pages.js';
export {
    UploadEndpointsMeta,
} from './upload.js';
export {
    EnumsEndpointsMeta,
} from './enums.js';
export {
    TermTypesEndpointsMeta,
    TermsEndpointsMeta,
} from './term-types.js';
export {
    CrmLeadsEndpointsMeta,
} from './crm-leads.js';
export {
    StockInputsEndpointsMeta,
} from './stock-inputs.js';
export {
    IMPLEMENTED_ENDPOINT_META,
    DISABLED_ENDPOINT_META,
    ENDPOINT_METADATA_REGISTRY,
} from './registry.js';
