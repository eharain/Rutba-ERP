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
