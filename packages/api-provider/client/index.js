import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';

import { AccAccountsEndpoints } from '@/api/acc-accounts.js';
export const AccAccountsClient = createClientProxy(AccAccountsEndpoints, authApi);

import { AccExpensesEndpoints } from '@/api/acc-expenses.js';
export const AccExpensesClient = createClientProxy(AccExpensesEndpoints, authApi);

import { AccInvoicesEndpoints } from '@/api/acc-invoices.js';
export const AccInvoicesClient = createClientProxy(AccInvoicesEndpoints, authApi);

import { AccJournalEntriesEndpoints } from '@/api/acc-journal-entries.js';
export const AccJournalEntriesClient = createClientProxy(AccJournalEntriesEndpoints, authApi);

import { AppContextEndpoints } from '@/api/app-context.js';
export const AppContextClient = createClientProxy(AppContextEndpoints, authApi);

import { AuthAdminEndpoints } from '@/api/auth-admin.js';
export const AuthAdminClient = createClientProxy(AuthAdminEndpoints, authApi);

import { AuthEndpoints } from '@/api/auth.js';
export const AuthClient = createClientProxy(AuthEndpoints, authApi);

import { BranchesEndpoints } from '@/api/branches.js';
export const BranchesClient = createClientProxy(BranchesEndpoints, authApi);

import { BrandGroupsEndpoints } from '@/api/brand-groups.js';
export const BrandGroupsClient = createClientProxy(BrandGroupsEndpoints, authApi);

import { BrandsEndpoints } from '@/api/brands.js';
export const BrandsClient = createClientProxy(BrandsEndpoints, authApi);

import { CashRegisterTransactionEndpoints } from '@/api/cash-register-transactions.js';
export const CashRegisterTransactionClient = createClientProxy(CashRegisterTransactionEndpoints, authApi);

import { CashRegistersEndpoints } from '@/api/cash-registers.js';
export const CashRegistersClient = createClientProxy(CashRegistersEndpoints, authApi);

import { CategoriesEndpoints } from '@/api/categories.js';
export const CategoriesClient = createClientProxy(CategoriesEndpoints, authApi);

import { CategoryGroupsEndpoints } from '@/api/category-groups.js';
export const CategoryGroupsClient = createClientProxy(CategoryGroupsEndpoints, authApi);

import { CmsFootersEndpoints } from '@/api/cms-footers.js';
export const CmsFootersClient = createClientProxy(CmsFootersEndpoints, authApi);

import { CmsPagesEndpoints } from '@/api/cms-pages.js';
export const CmsPagesClient = createClientProxy(CmsPagesEndpoints, authApi);

import { CrmActivitiesEndpoints } from '@/api/crm-activities.js';
export const CrmActivitiesClient = createClientProxy(CrmActivitiesEndpoints, authApi);

import { CrmContactsEndpoints } from '@/api/crm-contacts.js';
export const CrmContactsClient = createClientProxy(CrmContactsEndpoints, authApi);

import { CrmLeadsEndpoints } from '@/api/crm-leads.js';
export const CrmLeadsClient = createClientProxy(CrmLeadsEndpoints, authApi);

import { CustomersEndpoints } from '@/api/customers.js';
export const CustomersClient = createClientProxy(CustomersEndpoints, authApi);

import { DeliveryMethodsEndpoints } from '@/api/delivery-methods.js';
export const DeliveryMethodsClient = createClientProxy(DeliveryMethodsEndpoints, authApi);

import { DeliveryZonesEndpoints } from '@/api/delivery-zones.js';
export const DeliveryZonesClient = createClientProxy(DeliveryZonesEndpoints, authApi);

import { EnumsEndpoints } from '@/api/enums.js';
export const EnumsClient = createClientProxy(EnumsEndpoints, authApi);

import { HrAttendancesEndpoints } from '@/api/hr-attendances.js';
export const HrAttendancesClient = createClientProxy(HrAttendancesEndpoints, authApi);

import { HrDepartmentsEndpoints } from '@/api/hr-departments.js';
export const HrDepartmentsClient = createClientProxy(HrDepartmentsEndpoints, authApi);

import { HrEmployeesEndpoints } from '@/api/hr-employees.js';
export const HrEmployeesClient = createClientProxy(HrEmployeesEndpoints, authApi);

import { HrLeaveRequestsEndpoints } from '@/api/hr-leave-requests.js';
export const HrLeaveRequestsClient = createClientProxy(HrLeaveRequestsEndpoints, authApi);

import { HrTeamsEndpoints } from '@/api/hr-teams.js';
export const HrTeamsClient = createClientProxy(HrTeamsEndpoints, authApi);

import { MediaLibraryEndpoints } from '@/api/media-library.js';
export const MediaLibraryClient = createClientProxy(MediaLibraryEndpoints, authApi);

import { MediaUtilsEndpoints } from '@/api/media-utils.js';
export const MediaUtilsClient = createClientProxy(MediaUtilsEndpoints, authApi);

import { NotificationTemplatesEndpoints } from '@/api/notification-templates.js';
export const NotificationTemplatesClient = createClientProxy(NotificationTemplatesEndpoints, authApi);

import { PayPayrollRunsEndpoints } from '@/api/pay-payroll-runs.js';
export const PayPayrollRunsClient = createClientProxy(PayPayrollRunsEndpoints, authApi);

import { PayPayslipsEndpoints } from '@/api/pay-payslips.js';
export const PayPayslipsClient = createClientProxy(PayPayslipsEndpoints, authApi);

import { PaySalaryStructuresEndpoints } from '@/api/pay-salary-structures.js';
export const PaySalaryStructuresClient = createClientProxy(PaySalaryStructuresEndpoints, authApi);

import { PaymentsEndpoints } from '@/api/payments.js';
export const PaymentsClient = createClientProxy(PaymentsEndpoints, authApi);

import { ProductGroupsEndpoints } from '@/api/product-groups.js';
export const ProductGroupsClient = createClientProxy(ProductGroupsEndpoints, authApi);

import { ProductsEndpoints } from '@/api/products.js';
export const ProductsClient = createClientProxy(ProductsEndpoints, authApi);

import { PurchaseItemsEndpoints } from '@/api/purchase-items.js';
export const PurchaseItemsClient = createClientProxy(PurchaseItemsEndpoints, authApi);

import { PurchasesEndpoints } from '@/api/purchases.js';
export const PurchasesClient = createClientProxy(PurchasesEndpoints, authApi);

import { ReturnRequestsEndpoints } from '@/api/return-requests.js';
export const ReturnRequestsClient = createClientProxy(ReturnRequestsEndpoints, authApi);

import { RiderEndpoints } from '@/api/rider-endpoints.js';
export const RiderClient = createClientProxy(RiderEndpoints, authApi);

import { RidersEndpoints } from '@/api/riders.js';
export const RidersClient = createClientProxy(RidersEndpoints, authApi);

import { SaleItemsEndpoints } from '@/api/sale-items.js';
export const SaleItemsClient = createClientProxy(SaleItemsEndpoints, authApi);

import { SaleOffersEndpoints } from '@/api/sale-offers.js';
export const SaleOffersClient = createClientProxy(SaleOffersEndpoints, authApi);

import { SaleOrdersEndpoints } from '@/api/sale-orders.js';
export const SaleOrdersClient = createClientProxy(SaleOrdersEndpoints, authApi);

import { SaleReturnItemsEndpoints } from '@/api/sale-return-items.js';
export const SaleReturnItemsClient = createClientProxy(SaleReturnItemsEndpoints, authApi);

import { SaleReturnsEndpoints } from '@/api/sale-returns.js';
export const SaleReturnsClient = createClientProxy(SaleReturnsEndpoints, authApi);

import { SalesEndpoints } from '@/api/sales.js';
export const SalesClient = createClientProxy(SalesEndpoints, authApi);

import { SiteSettingEndpoints } from '@/api/site-setting.js';
export const SiteSettingClient = createClientProxy(SiteSettingEndpoints, authApi);

import { SocialAccountsEndpoints } from '@/api/social-accounts.js';
export const SocialAccountsClient = createClientProxy(SocialAccountsEndpoints, authApi);

import { SocialPostsEndpoints } from '@/api/social-posts.js';
export const SocialPostsClient = createClientProxy(SocialPostsEndpoints, authApi);

import { SocialRepliesEndpoints } from '@/api/social-replies.js';
export const SocialRepliesClient = createClientProxy(SocialRepliesEndpoints, authApi);

import { StockHelpersEndpoints } from '@/api/stock-helpers.js';
export const StockHelpersClient = createClientProxy(StockHelpersEndpoints, authApi);

import { StockInputsEndpoints } from '@/api/stock-inputs.js';
export const StockInputsClient = createClientProxy(StockInputsEndpoints, authApi);

import { StockItemsEndpoints } from '@/api/stock-items.js';
export const StockItemsClient = createClientProxy(StockItemsEndpoints, authApi);

import { SuppliersEndpoints } from '@/api/suppliers.js';
export const SuppliersClient = createClientProxy(SuppliersEndpoints, authApi);

import { TermTypesEndpoints } from '@/api/term-types.js';
export const TermTypesClient = createClientProxy(TermTypesEndpoints, authApi);

import { TermsEndpoints } from '@/api/terms.js';
export const TermsClient = createClientProxy(TermsEndpoints, authApi);

import { UploadEndpoints } from '@/api/upload.js';
export const UploadClient = createClientProxy(UploadEndpoints, authApi);

import { WebOrdersEndpoints } from '@/api/web-orders.js';
export const WebOrdersClient = createClientProxy(WebOrdersEndpoints, authApi);

import { WebAuthEndpointRules as WebAuthEndpointRulesApi } from '@/api/web.js';
export const WebAuthEndpointRules = createClientProxy(WebAuthEndpointRulesApi, authApi);
