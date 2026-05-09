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
export { MediaLibraryEndpoints } from './media-library.js';
export { AppContextEndpoints } from './app-context.js';
export { MediaUtilsEndpoints } from './media-utils.js';
export { StockHelpersEndpoints } from './stock-helpers.js';
export { AuthEndpoints } from './auth.js';
export { AuthApiEndpoints, PublicApiEndpoints } from './http-client.js';
export { EnumsEndpoints } from './enums.js';
export { TermTypesEndpoints, TermsEndpoints } from './term-types.js';
export { CrmLeadsEndpoints } from './crm-leads.js';
export { CrmContactsEndpoints } from './crm-contacts.js';
export { CrmActivitiesEndpoints } from './crm-activities.js';
export { HrAttendancesEndpoints } from './hr-attendances.js';
export { HrDepartmentsEndpoints } from './hr-departments.js';
export { HrEmployeesEndpoints } from './hr-employees.js';
export { HrLeaveRequestsEndpoints } from './hr-leave-requests.js';
export { HrTeamsEndpoints } from './hr-teams.js';
export { AuthAdminEndpoints } from './auth-admin.js';
export { BrandGroupsEndpoints } from './brand-groups.js';
export { CategoryGroupsEndpoints } from './category-groups.js';
export { ProductGroupsEndpoints } from './product-groups.js';
export { CmsFootersEndpoints } from './cms-footers.js';
export { SaleOffersEndpoints } from './sale-offers.js';
export { StockInputsEndpoints } from './stock-inputs.js';
export { NotificationTemplatesEndpoints } from './notification-templates.js';
export { SocialAccountsEndpoints } from './social-accounts.js';
export { SocialPostsEndpoints } from './social-posts.js';
export { SocialRepliesEndpoints } from './social-replies.js';
export { WebOrdersEndpoints } from './web-orders.js';
export { ReturnRequestsEndpoints } from './return-requests.js';
export { DeliveryMethodsEndpoints } from './delivery-methods.js';
export { DeliveryZonesEndpoints } from './delivery-zones.js';
export { RidersEndpoints } from './riders.js';
export { SaleOrdersEndpoints } from './sale-orders.js';
export { SiteSettingEndpoints } from './site-setting.js';
export { AccInvoicesEndpoints } from './acc-invoices.js';
export { AccExpensesEndpoints } from './acc-expenses.js';
export { AccJournalEntriesEndpoints } from './acc-journal-entries.js';
export { AccAccountsEndpoints } from './acc-accounts.js';
export { PaySalaryStructuresEndpoints } from './pay-salary-structures.js';
export { PayPayslipsEndpoints } from './pay-payslips.js';
export { PayPayrollRunsEndpoints } from './pay-payroll-runs.js';

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
    NotificationTemplatesEndpointsMeta,
} from './notification-templates.js';
export {
    IMPLEMENTED_ENDPOINT_META,
    DISABLED_ENDPOINT_META,
    ENDPOINT_METADATA_REGISTRY,
} from './registry.js';

// Named operation functions — grouped by entity
export { fetchSaleByIdOrInvoice, fetchSales, fetchEntities, createSale, searchSales } from './sales.js';
export { fetchPurchaseByIdDocumentIdOrPO, fetchPurchases, savePurchaseItems, savePurchase, createPurchase, searchPurchases } from './purchases.js';
export { savePurchaseItem } from './purchase-items.js';
export { fetchProducts, loadProduct, saveProduct, saveProductItems, searchProduct, searchProducts, createProduct } from './products.js';
export { saveSaleItems } from './sale-items.js';
export { fetchReturns } from './sale-returns.js';
export { fetchCategories, searchCategories } from './categories.js';
export { fetchBrands } from './brands.js';
export { fetchEnumsValues } from './enums.js';
export { generateStockItems, searchStockItemsByName, searchStockItemsByBarcode, searchStockItems } from './stock-items.js';
export { searchBranches } from './branches.js';
