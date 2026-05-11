export { AccAccountsEndpoints } from '../providers/generated/client/acc-accounts.js';
export { AccExpensesEndpoints } from '../providers/generated/client/acc-expenses.js';
export { AccInvoicesEndpoints } from '../providers/generated/client/acc-invoices.js';
export { AccJournalEntriesEndpoints } from '../providers/generated/client/acc-journal-entries.js';
export { AppContextEndpoints } from '../providers/generated/client/app-context.js';
export { AppContextEndpoints as AppAccessesEndpoints } from '../providers/generated/client/app-context.js';
export { AuthEndpoints } from '../providers/generated/client/auth.js';
export { AuthAdminEndpoints } from '../providers/generated/client/auth-admin.js';
export { BranchesEndpoints } from '../providers/generated/client/branches.js';
export { BrandGroupsEndpoints } from '../providers/generated/client/brand-groups.js';
export { BrandsEndpoints } from '../providers/generated/client/brands.js';
export { CashRegistersEndpoints } from '../providers/generated/client/cash-registers.js';
export { CashRegisterTransactionEndpoints } from '../providers/generated/client/cash-register-transactions.js';
export { CategoriesEndpoints } from '../providers/generated/client/categories.js';
export { CategoryGroupsEndpoints } from '../providers/generated/client/category-groups.js';
export { CmsFootersEndpoints } from '../providers/generated/client/cms-footers.js';
export { CmsPagesEndpoints } from '../providers/generated/client/cms-pages.js';
export { CrmActivitiesEndpoints } from '../providers/generated/client/crm-activities.js';
export { CrmContactsEndpoints } from '../providers/generated/client/crm-contacts.js';
export { CrmLeadsEndpoints } from '../providers/generated/client/crm-leads.js';
export { CustomersEndpoints } from '../providers/generated/client/customers.js';
export { DeliveryMethodsEndpoints } from '../providers/generated/client/delivery-methods.js';
export { DeliveryZonesEndpoints } from '../providers/generated/client/delivery-zones.js';
export { EnumsEndpoints } from '../providers/generated/client/enums.js';
export { HrAttendancesEndpoints } from '../providers/generated/client/hr-attendances.js';
export { HrDepartmentsEndpoints } from '../providers/generated/client/hr-departments.js';
export { HrEmployeesEndpoints } from '../providers/generated/client/hr-employees.js';
export { HrLeaveRequestsEndpoints } from '../providers/generated/client/hr-leave-requests.js';
export { HrTeamsEndpoints } from '../providers/generated/client/hr-teams.js';
export { MediaLibraryEndpoints } from '../providers/generated/client/media-library.js';
export { MediaUtilsEndpoints } from '../providers/generated/client/media-utils.js';
export { NotificationTemplatesEndpoints } from '../providers/generated/client/notification-templates.js';
export { PaymentsEndpoints } from '../providers/generated/client/payments.js';
export { PayPayrollRunsEndpoints } from '../providers/generated/client/pay-payroll-runs.js';
export { PayPayslipsEndpoints } from '../providers/generated/client/pay-payslips.js';
export { PaySalaryStructuresEndpoints } from '../providers/generated/client/pay-salary-structures.js';
export { ProductGroupsEndpoints } from '../providers/generated/client/product-groups.js';
export { ProductsEndpoints } from '../providers/generated/client/products.js';
export { PurchaseItemsEndpoints } from '../providers/generated/client/purchase-items.js';
export { PurchasesEndpoints } from '../providers/generated/client/purchases.js';
export { ReturnRequestsEndpoints } from '../providers/generated/client/return-requests.js';
export { RiderEndpoints } from '../providers/generated/client/rider-endpoints.js';
export { RidersEndpoints } from '../providers/generated/client/riders.js';
export { SaleItemsEndpoints } from '../providers/generated/client/sale-items.js';
export { SaleOffersEndpoints } from '../providers/generated/client/sale-offers.js';
export { SaleOrdersEndpoints } from '../providers/generated/client/sale-orders.js';
export { SaleReturnItemsEndpoints } from '../providers/generated/client/sale-return-items.js';
export { SaleReturnsEndpoints } from '../providers/generated/client/sale-returns.js';
export { SalesEndpoints } from '../providers/generated/client/sales.js';
export { SiteSettingEndpoints } from '../providers/generated/client/site-setting.js';
export { SocialAccountsEndpoints } from '../providers/generated/client/social-accounts.js';
export { SocialPostsEndpoints } from '../providers/generated/client/social-posts.js';
export { SocialRepliesEndpoints } from '../providers/generated/client/social-replies.js';
export { StockHelpersEndpoints } from '../providers/generated/client/stock-helpers.js';
export { StockInputsEndpoints } from '../providers/generated/client/stock-inputs.js';
export { StockItemsEndpoints } from '../providers/generated/client/stock-items.js';
export { SuppliersEndpoints } from '../providers/generated/client/suppliers.js';
export { TermsEndpoints } from '../providers/generated/client/terms.js';
export { TermTypesEndpoints } from '../providers/generated/client/term-types.js';
export { UploadEndpoints } from '../providers/generated/client/upload.js';
export { WebAuthEndpointRules } from '../providers/generated/client/web.js';
export { WebOrdersEndpoints } from '../providers/generated/client/web-orders.js';

export { dataNode, searchBranches } from './helpers/branches.js';
export {
    dataNode as extractData,
    saveProductItems,
    saveProduct,
    fetchProducts,
    loadProduct,
    searchProduct,
    createProduct,
    searchProducts,
} from './helpers/products.js';
