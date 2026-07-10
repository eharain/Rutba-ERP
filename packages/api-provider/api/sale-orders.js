import { listParams, byIdParams } from './__param_builders.js';

// Per-role scope shared by every policy below. Staff sees only orders they
// created in the last 7 days; admin/manager unrestricted.
const ROLE_SCOPES = {
    admin: {},
    manager: {},
    staff: { scope: 'owner+recency', ownerField: 'createdBy', recencyField: 'createdAt' },
};

export const SaleOrdersEndpoints = {
    meta: {
        uid: 'api::sale-order.sale-order',
        domains: ['delivery', 'order-management', 'sale', 'web-user'],
        roles: ['admin', 'manager', 'staff'],
    },

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/sale-orders',
        action: 'find',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            {
                sort: ['createdAt:desc'],
                pageSize: 25,
                populate: ['customer_person', 'delivery_address', 'delivery_method', 'assigned_rider', 'delivery_zone'],
            },
        ),
    }),
    byId: (documentId, { populate, fields } = {}) => ({
        path: `/sale-orders/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: byIdParams({ populate, fields }),
    }),
    create: (data) => ({
        path: '/sale-orders',
        action: 'create',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    update: (documentId, data) => ({
        path: `/sale-orders/${documentId}`,
        action: 'update',
        method: 'put',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    updateStatus: (documentId, data) => ({
        path: `/sale-orders/${documentId}/update-status`,
        action: 'updateStatus',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    assignRider: (documentId, data) => ({
        path: `/sale-orders/${documentId}/assign-rider`,
        action: 'assignRider',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    // Fulfillment — bind a specific InStock stock-item to an order line.
    // Body shape: { item_index, stock_item_document_id }
    // Server transitions stock-item.status InStock → Reserved on success.
    attachStockItem: (documentId, data) => ({
        path: `/sale-orders/${documentId}/attach-stock-item`,
        action: 'attachStockItem',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    // Divisible product line: allocate `qty` sub-units across InStock items.
    // Body: { item_index, qty, scanned_item_document_id? }
    attachDivisible: (documentId, data) => ({
        path: `/sale-orders/${documentId}/attach-divisible`,
        action: 'attachDivisible',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),
    // todo: speculative stub — added so rutba-rider/pages/deliveries/[id].js
    // call site resolves at the descriptor level. Verify route path against
    // pos-strapi (order-message content type) and confirm controller action
    // exists before relying on the wire shape.
    messages: (documentId) => ({
        path: `/sale-orders/${documentId}/messages`,
        action: 'messages',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),
    // todo: speculative stub — see messages above.
    sendMessage: (documentId, data) => ({
        path: `/sale-orders/${documentId}/messages`,
        action: 'sendMessage',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // Record a payment collection event (typically COD). Used by:
    //   - rutba-order-management when staff/courier hands over cash
    //   - rutba-rider when the rider collects at the door
    // Body shape: { payment_method, paid_amount,
    //               collected_by_rider_document_id?, collected_by_note?,
    //               collected_at? }
    recordPayment: (documentId, data) => ({
        path: `/sale-orders/${documentId}/record-payment`,
        action: 'recordPayment',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery', 'accounts'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // Verify (or dispute) a previously-recorded payment. Used by
    // rutba-accounts as the cash-drop reconciliation action.
    // Body shape: { status: 'verified' | 'disputed' | 'unverified', notes? }
    verifyPayment: (documentId, data) => ({
        path: `/sale-orders/${documentId}/verify-payment`,
        action: 'verifyPayment',
        method: 'post',
        apps: ['order-management', 'accounts'],
        approle: ['admin', 'manager'],
        scope: ROLE_SCOPES,
        data,
    }),

    // Stamp pending_cost_change on an already-confirmed order + dispatch the
    // customer approval email. Called when staff adjusts items/total after
    // the customer has placed the order. Idempotent on resend: keeping the
    // same new_total reuses the existing token so older email links stay
    // valid (refreshes last_email_sent_at).
    // Body shape: { old_total, new_total, reason? }
    requestCostChangeAck: (documentId, data) => ({
        path: `/sale-orders/${documentId}/request-cost-change-ack`,
        action: 'requestCostChangeAck',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // Staff-side override — the customer agreed out-of-band (phone, walk-in,
    // WhatsApp). Clears pending_cost_change and stamps the audit fields.
    // Body shape: { via: 'phone' | 'whatsapp' | 'in_person' | 'email', notes? }
    overrideCostChangeAck: (documentId, data) => ({
        path: `/sale-orders/${documentId}/override-cost-change-ack`,
        action: 'overrideCostChangeAck',
        method: 'post',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // Provider-specific shipping label. Server dispatches via the label-
    // providers registry keyed off delivery_method.service_provider:
    //   - own_rider → 4×6 thermal PDF (binary stream)
    //   - easypost  → 302 redirect to carrier-hosted URL
    //   - custom    → courier-agnostic pick slip PDF (binary stream)
    // The descriptor exists so the api-pro seeder grants staff the policy;
    // callers usually open `getLabelUrl()` in a new tab rather than going
    // through the JSON-oriented client (binary responses don't fit there).
    getLabel: (documentId, { reprint } = {}) => ({
        path: `/sale-orders/${documentId}/label${reprint ? '?reprint=1' : ''}`,
        action: 'getLabel',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

    // Return-mode label. Same registry, return-mode flag flips ship-to to
    // the warehouse and stamps the return_ref. Requires an active
    // return-request on the order.
    getReturnLabel: (documentId, { reprint } = {}) => ({
        path: `/sale-orders/${documentId}/return-label${reprint ? '?reprint=1' : ''}`,
        action: 'getReturnLabel',
        method: 'get',
        apps: ['order-management', 'sale', 'delivery'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),

};
