export { SalesEndpoints } from '@rutba/pos-shared/lib/endpoints/sales.js';
export { SaleItemsEndpoints } from '@rutba/pos-shared/lib/endpoints/sale-items.js';
export { SaleReturnsEndpoints } from '@rutba/pos-shared/lib/endpoints/sale-returns.js';
export { SaleReturnItemsEndpoints } from '@rutba/pos-shared/lib/endpoints/sale-return-items.js';
export { PurchasesEndpoints } from '@rutba/pos-shared/lib/endpoints/purchases.js';
export { PurchaseItemsEndpoints } from '@rutba/pos-shared/lib/endpoints/purchase-items.js';
export { PaymentsEndpoints } from '@rutba/pos-shared/lib/endpoints/payments.js';
export { CashRegisterTransactionEndpoints } from '@rutba/pos-shared/lib/endpoints/cash-register-transactions.js';
export { CashRegistersEndpoints } from '@rutba/pos-shared/lib/endpoints/cash-registers.js';
export { StockItemsEndpoints } from '@rutba/pos-shared/lib/endpoints/stock-items.js';
export { ProductsEndpoints } from '@rutba/pos-shared/lib/endpoints/products.js';
export { CustomersEndpoints } from '@rutba/pos-shared/lib/endpoints/customers.js';
export { BranchesEndpoints } from '@rutba/pos-shared/lib/endpoints/branches.js';
export { BrandsEndpoints } from '@rutba/pos-shared/lib/endpoints/brands.js';
export { CategoriesEndpoints } from '@rutba/pos-shared/lib/endpoints/categories.js';
export { SuppliersEndpoints } from '@rutba/pos-shared/lib/endpoints/suppliers.js';
export { CmsPagesEndpoints } from '@rutba/pos-shared/lib/endpoints/cms-pages.js';
export { UploadEndpoints } from '@rutba/pos-shared/lib/endpoints/upload.js';
export { AppContextEndpoints } from '@rutba/pos-shared/lib/endpoints/app-context.js';
export { MediaUtilsEndpoints } from '@rutba/pos-shared/lib/endpoints/media-utils.js';
export { StockHelpersEndpoints } from '@rutba/pos-shared/lib/endpoints/stock-helpers.js';
export { AuthEndpoints } from '@rutba/pos-shared/lib/endpoints/auth.js';
export { AuthApiEndpoints, PublicApiEndpoints } from '@rutba/pos-shared/lib/endpoints/http-client.js';
export { EnumsEndpoints } from '@rutba/pos-shared/lib/endpoints/enums.js';
export { TermTypesEndpoints, TermsEndpoints } from '@rutba/pos-shared/lib/endpoints/term-types.js';
export { CrmLeadsEndpoints } from '@rutba/pos-shared/lib/endpoints/crm-leads.js';
export { CrmContactsEndpoints } from '@rutba/pos-shared/lib/endpoints/crm-contacts.js';
export { CrmActivitiesEndpoints } from '@rutba/pos-shared/lib/endpoints/crm-activities.js';
export { HrAttendancesEndpoints } from '@rutba/pos-shared/lib/endpoints/hr-attendances.js';
export { HrDepartmentsEndpoints } from '@rutba/pos-shared/lib/endpoints/hr-departments.js';
export { HrEmployeesEndpoints } from '@rutba/pos-shared/lib/endpoints/hr-employees.js';
export { HrLeaveRequestsEndpoints } from '@rutba/pos-shared/lib/endpoints/hr-leave-requests.js';
export { HrTeamsEndpoints } from '@rutba/pos-shared/lib/endpoints/hr-teams.js';
export { AuthAdminEndpoints } from '@rutba/pos-shared/lib/endpoints/auth-admin.js';
export { BrandGroupsEndpoints } from '@rutba/pos-shared/lib/endpoints/brand-groups.js';
export { CategoryGroupsEndpoints } from '@rutba/pos-shared/lib/endpoints/category-groups.js';
export { ProductGroupsEndpoints } from '@rutba/pos-shared/lib/endpoints/product-groups.js';
export { CmsFootersEndpoints } from '@rutba/pos-shared/lib/endpoints/cms-footers.js';
export { SaleOffersEndpoints } from '@rutba/pos-shared/lib/endpoints/sale-offers.js';
export { StockInputsEndpoints } from '@rutba/pos-shared/lib/endpoints/stock-inputs.js';
export { NotificationTemplatesEndpoints } from '@rutba/pos-shared/lib/endpoints/notification-templates.js';
export { MediaLibraryEndpoints } from '@rutba/pos-shared/lib/endpoints/media-library.js';
export { SocialAccountsEndpoints } from '@rutba/pos-shared/lib/endpoints/social-accounts.js';
export { SocialPostsEndpoints } from '@rutba/pos-shared/lib/endpoints/social-posts.js';
export { SocialRepliesEndpoints } from '@rutba/pos-shared/lib/endpoints/social-replies.js';
export { WebOrdersEndpoints } from '@rutba/pos-shared/lib/endpoints/web-orders.js';
export { ReturnRequestsEndpoints } from '@rutba/pos-shared/lib/endpoints/return-requests.js';
export { DeliveryMethodsEndpoints } from '@rutba/pos-shared/lib/endpoints/delivery-methods.js';
export { DeliveryZonesEndpoints } from '@rutba/pos-shared/lib/endpoints/delivery-zones.js';
export { RidersEndpoints } from '@rutba/pos-shared/lib/endpoints/riders.js';
export { SaleOrdersEndpoints } from '@rutba/pos-shared/lib/endpoints/sale-orders.js';
export { SiteSettingEndpoints } from '@rutba/pos-shared/lib/endpoints/site-setting.js';
export { AccInvoicesEndpoints } from '@rutba/pos-shared/lib/endpoints/acc-invoices.js';
export { AccExpensesEndpoints } from '@rutba/pos-shared/lib/endpoints/acc-expenses.js';
export { AccJournalEntriesEndpoints } from '@rutba/pos-shared/lib/endpoints/acc-journal-entries.js';
export { AccAccountsEndpoints } from '@rutba/pos-shared/lib/endpoints/acc-accounts.js';
export { PaySalaryStructuresEndpoints } from '@rutba/pos-shared/lib/endpoints/pay-salary-structures.js';
export { PayPayslipsEndpoints } from '@rutba/pos-shared/lib/endpoints/pay-payslips.js';
export { PayPayrollRunsEndpoints } from '@rutba/pos-shared/lib/endpoints/pay-payroll-runs.js';

import { authApi } from '@rutba/pos-shared/lib/api.js';

export const RiderEndpoints = {
  myProfile: () => ({ path: '/rider/me' }),
  updateStatus: () => ({ path: '/rider/me/status' }),
  deliveryOffers: () => ({ path: '/rider/delivery-offers' }),
  acceptDeliveryOffer: (offerDocumentId) => ({ path: `/rider/delivery-offers/${offerDocumentId}/accept` }),
  rejectDeliveryOffer: (offerDocumentId) => ({ path: `/rider/delivery-offers/${offerDocumentId}/reject` }),
  deliveries: ({ status } = {}) => ({
    path: '/rider/deliveries',
    params: status ? { status } : undefined,
  }),
  updateDeliveryStatus: (orderDocumentId) => ({ path: `/rider/deliveries/${orderDocumentId}/status` }),

  fetchMyProfile: () => {
    const ep = RiderEndpoints.myProfile();
    return authApi.get(ep.path, ep.params);
  },
  putUpdateStatus: (data) => {
    const ep = RiderEndpoints.updateStatus();
    return authApi.put(ep.path, data);
  },
  fetchDeliveryOffers: () => {
    const ep = RiderEndpoints.deliveryOffers();
    return authApi.get(ep.path, ep.params);
  },
  postAcceptDeliveryOffer: (offerDocumentId, data = {}) => {
    const ep = RiderEndpoints.acceptDeliveryOffer(offerDocumentId);
    return authApi.post(ep.path, data);
  },
  postRejectDeliveryOffer: (offerDocumentId, data = {}) => {
    const ep = RiderEndpoints.rejectDeliveryOffer(offerDocumentId);
    return authApi.post(ep.path, data);
  },
  fetchDeliveries: (opts = {}) => {
    const ep = RiderEndpoints.deliveries(opts);
    return authApi.get(ep.path, ep.params);
  },
  postUpdateDeliveryStatus: (orderDocumentId, data) => {
    const ep = RiderEndpoints.updateDeliveryStatus(orderDocumentId);
    return authApi.post(ep.path, data);
  },
};

export const SaleOrdersEndpoints = {
  messages: (documentId) => ({ path: `/sale-orders/${documentId}/messages` }),

  fetchMessages: (documentId) => {
    const ep = SaleOrdersEndpoints.messages(documentId);
    return authApi.get(ep.path, ep.params);
  },
  postSendMessage: (documentId, data) => {
    const ep = SaleOrdersEndpoints.messages(documentId);
    return authApi.post(ep.path, data);
  },
};
