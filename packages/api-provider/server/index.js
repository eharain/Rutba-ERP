import { createStrapiProxy } from '@/lib/providers/createStrapiProxy.js';

import { AccAccountsEndpoints } from '@/api/acc-accounts.js';
export const AccAccountsServer = createStrapiProxy(AccAccountsEndpoints);

import { AccExpensesEndpoints } from '@/api/acc-expenses.js';
export const AccExpensesServer = createStrapiProxy(AccExpensesEndpoints);

import { AccInvoicesEndpoints } from '@/api/acc-invoices.js';
export const AccInvoicesServer = createStrapiProxy(AccInvoicesEndpoints);

import { AccJournalEntriesEndpoints } from '@/api/acc-journal-entries.js';
export const AccJournalEntriesServer = createStrapiProxy(AccJournalEntriesEndpoints);

import { AppContextEndpoints } from '@/api/app-context.js';
export const AppContextServer = createStrapiProxy(AppContextEndpoints);

import { AuthAdminEndpoints } from '@/api/auth-admin.js';
export const AuthAdminServer = createStrapiProxy(AuthAdminEndpoints);

import { AuthEndpoints } from '@/api/auth.js';
export const AuthServer = createStrapiProxy(AuthEndpoints);

import { BranchesEndpoints } from '@/api/branches.js';
export const BranchesServer = createStrapiProxy(BranchesEndpoints);

import { BrandGroupsEndpoints } from '@/api/brand-groups.js';
export const BrandGroupsServer = createStrapiProxy(BrandGroupsEndpoints);

import { BrandsEndpoints } from '@/api/brands.js';
export const BrandsServer = createStrapiProxy(BrandsEndpoints);

import { CashRegisterTransactionEndpoints } from '@/api/cash-register-transactions.js';
export const CashRegisterTransactionServer = createStrapiProxy(CashRegisterTransactionEndpoints);

import { CashRegistersEndpoints } from '@/api/cash-registers.js';
export const CashRegistersServer = createStrapiProxy(CashRegistersEndpoints);

import { CategoriesEndpoints } from '@/api/categories.js';
export const CategoriesServer = createStrapiProxy(CategoriesEndpoints);

import { CategoryGroupsEndpoints } from '@/api/category-groups.js';
export const CategoryGroupsServer = createStrapiProxy(CategoryGroupsEndpoints);

import { CmsFootersEndpoints } from '@/api/cms-footers.js';
export const CmsFootersServer = createStrapiProxy(CmsFootersEndpoints);

import { CmsPagesEndpoints } from '@/api/cms-pages.js';
export const CmsPagesServer = createStrapiProxy(CmsPagesEndpoints);

import { CrmActivitiesEndpoints } from '@/api/crm-activities.js';
export const CrmActivitiesServer = createStrapiProxy(CrmActivitiesEndpoints);

import { CrmContactsEndpoints } from '@/api/crm-contacts.js';
export const CrmContactsServer = createStrapiProxy(CrmContactsEndpoints);

import { CrmLeadsEndpoints } from '@/api/crm-leads.js';
export const CrmLeadsServer = createStrapiProxy(CrmLeadsEndpoints);

import { CustomersEndpoints } from '@/api/customers.js';
export const CustomersServer = createStrapiProxy(CustomersEndpoints);

import { DeliveryMethodsEndpoints } from '@/api/delivery-methods.js';
export const DeliveryMethodsServer = createStrapiProxy(DeliveryMethodsEndpoints);

import { DeliveryZonesEndpoints } from '@/api/delivery-zones.js';
export const DeliveryZonesServer = createStrapiProxy(DeliveryZonesEndpoints);

import { EnumsEndpoints } from '@/api/enums.js';
export const EnumsServer = createStrapiProxy(EnumsEndpoints);

import { HrAttendancesEndpoints } from '@/api/hr-attendances.js';
export const HrAttendancesServer = createStrapiProxy(HrAttendancesEndpoints);

import { HrDepartmentsEndpoints } from '@/api/hr-departments.js';
export const HrDepartmentsServer = createStrapiProxy(HrDepartmentsEndpoints);

import { HrEmployeesEndpoints } from '@/api/hr-employees.js';
export const HrEmployeesServer = createStrapiProxy(HrEmployeesEndpoints);

import { HrLeaveRequestsEndpoints } from '@/api/hr-leave-requests.js';
export const HrLeaveRequestsServer = createStrapiProxy(HrLeaveRequestsEndpoints);

import { HrTeamsEndpoints } from '@/api/hr-teams.js';
export const HrTeamsServer = createStrapiProxy(HrTeamsEndpoints);

import { MediaLibraryEndpoints } from '@/api/media-library.js';
export const MediaLibraryServer = createStrapiProxy(MediaLibraryEndpoints);

import { MediaUtilsEndpoints } from '@/api/media-utils.js';
export const MediaUtilsServer = createStrapiProxy(MediaUtilsEndpoints);

import { NotificationTemplatesEndpoints } from '@/api/notification-templates.js';
export const NotificationTemplatesServer = createStrapiProxy(NotificationTemplatesEndpoints);

import { PayPayrollRunsEndpoints } from '@/api/pay-payroll-runs.js';
export const PayPayrollRunsServer = createStrapiProxy(PayPayrollRunsEndpoints);

import { PayPayslipsEndpoints } from '@/api/pay-payslips.js';
export const PayPayslipsServer = createStrapiProxy(PayPayslipsEndpoints);

import { PaySalaryStructuresEndpoints } from '@/api/pay-salary-structures.js';
export const PaySalaryStructuresServer = createStrapiProxy(PaySalaryStructuresEndpoints);

import { PaymentsEndpoints } from '@/api/payments.js';
export const PaymentsServer = createStrapiProxy(PaymentsEndpoints);

import { ProductGroupsEndpoints } from '@/api/product-groups.js';
export const ProductGroupsServer = createStrapiProxy(ProductGroupsEndpoints);

import { ProductsEndpoints } from '@/api/products.js';
export const ProductsServer = createStrapiProxy(ProductsEndpoints);

import { PurchaseItemsEndpoints } from '@/api/purchase-items.js';
export const PurchaseItemsServer = createStrapiProxy(PurchaseItemsEndpoints);

import { PurchasesEndpoints } from '@/api/purchases.js';
export const PurchasesServer = createStrapiProxy(PurchasesEndpoints);

import { ReturnRequestsEndpoints } from '@/api/return-requests.js';
export const ReturnRequestsServer = createStrapiProxy(ReturnRequestsEndpoints);

import { RiderEndpoints } from '@/api/rider-endpoints.js';
export const RiderServer = createStrapiProxy(RiderEndpoints);

import { RidersEndpoints } from '@/api/riders.js';
export const RidersServer = createStrapiProxy(RidersEndpoints);

import { SaleItemsEndpoints } from '@/api/sale-items.js';
export const SaleItemsServer = createStrapiProxy(SaleItemsEndpoints);

import { SaleOffersEndpoints } from '@/api/sale-offers.js';
export const SaleOffersServer = createStrapiProxy(SaleOffersEndpoints);

import { SaleOrdersEndpoints } from '@/api/sale-orders.js';
export const SaleOrdersServer = createStrapiProxy(SaleOrdersEndpoints);

import { SaleReturnItemsEndpoints } from '@/api/sale-return-items.js';
export const SaleReturnItemsServer = createStrapiProxy(SaleReturnItemsEndpoints);

import { SaleReturnsEndpoints } from '@/api/sale-returns.js';
export const SaleReturnsServer = createStrapiProxy(SaleReturnsEndpoints);

import { SalesEndpoints } from '@/api/sales.js';
export const SalesServer = createStrapiProxy(SalesEndpoints);

import { SiteSettingEndpoints } from '@/api/site-setting.js';
export const SiteSettingServer = createStrapiProxy(SiteSettingEndpoints);

import { SocialAccountsEndpoints } from '@/api/social-accounts.js';
export const SocialAccountsServer = createStrapiProxy(SocialAccountsEndpoints);

import { SocialPostsEndpoints } from '@/api/social-posts.js';
export const SocialPostsServer = createStrapiProxy(SocialPostsEndpoints);

import { SocialRepliesEndpoints } from '@/api/social-replies.js';
export const SocialRepliesServer = createStrapiProxy(SocialRepliesEndpoints);

import { StockHelpersEndpoints } from '@/api/stock-helpers.js';
export const StockHelpersServer = createStrapiProxy(StockHelpersEndpoints);

import { StockInputsEndpoints } from '@/api/stock-inputs.js';
export const StockInputsServer = createStrapiProxy(StockInputsEndpoints);

import { StockItemsEndpoints } from '@/api/stock-items.js';
export const StockItemsServer = createStrapiProxy(StockItemsEndpoints);

import { SuppliersEndpoints } from '@/api/suppliers.js';
export const SuppliersServer = createStrapiProxy(SuppliersEndpoints);

import { TermTypesEndpoints } from '@/api/term-types.js';
export const TermTypesServer = createStrapiProxy(TermTypesEndpoints);

import { TermsEndpoints } from '@/api/terms.js';
export const TermsServer = createStrapiProxy(TermsEndpoints);

import { UploadEndpoints } from '@/api/upload.js';
export const UploadServer = createStrapiProxy(UploadEndpoints);

import { WebOrdersEndpoints } from '@/api/web-orders.js';
export const WebOrdersServer = createStrapiProxy(WebOrdersEndpoints);

import { WebAuthEndpointRules } from '@/api/web.js';
export const WebAuthEndpointRules = createStrapiProxy(WebAuthEndpointRules);
