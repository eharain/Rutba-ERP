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
export { EnumsEndpoints } from '@rutba/pos-shared/lib/endpoints/enums.js';
export { TermTypesEndpoints, TermsEndpoints } from '@rutba/pos-shared/lib/endpoints/term-types.js';
export { CrmLeadsEndpoints } from '@rutba/pos-shared/lib/endpoints/crm-leads.js';
export { StockInputsEndpoints } from '@rutba/pos-shared/lib/endpoints/stock-inputs.js';
export { NotificationTemplatesEndpoints } from '@rutba/pos-shared/lib/endpoints/notification-templates.js';

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
