import { listParams, byIdParams } from './__param_builders.js';

// Staff-facing return-management surface. Customer-side endpoints live in
// /api/web/return-requests.js so the public-`webApi` client (X-Rutba-App: web)
// keeps them separate per project_api_provider_web_public_client.
//
// Verb naming: every method starts with a whitelisted prefix per
// feedback_api_pro_descriptor_verb_whitelist (list, by, create, approve,
// reject, cancel, set, resolve) — otherwise the api-pro seeder skips them
// and every request 403s.

const ROLE_SCOPES = {
    admin:   {},
    manager: {},
    staff:   { scope: 'owner+recency', ownerField: 'createdBy', recencyField: 'createdAt' },
};

export const ReturnRequestsEndpoints = {
    meta: {
        uid:     'api::return-request.return-request',
        domains: ['order-management', 'sale', 'web-user'],
        roles:   ['admin', 'manager', 'staff'],
    },

    // POST /return-requests
    // Staff-initiated return on behalf of a customer. Same body shape as
    // the web client's createReturnRequest. Controller's owner check uses
    // the staff role to bypass the customer-only gate.
    createReturnRequest: (data) => ({
        path: '/return-requests',
        action: 'createReturnRequest',
        method: 'post',
        apps: ['order-management', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    list: ({ page, pageSize, sort, populate, filters, fields } = {}) => ({
        path: '/return-requests',
        action: 'find',
        method: 'get',
        apps: ['order-management', 'sale', 'accounts'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: listParams(
            { page, pageSize, sort, populate, filters, fields },
            {
                sort: ['createdAt:desc'],
                pageSize: 25,
                populate: ['sale_order', 'items', 'owners'],
            },
        ),
    }),

    byId: (documentId, { populate, fields } = {}) => ({
        path: `/return-requests/${documentId}`,
        action: 'findOne',
        method: 'get',
        apps: ['order-management', 'sale', 'accounts'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        params: byIdParams(
            { populate, fields },
            { populate: ['sale_order', 'items', 'owners', 'customer_evidence', 'approved_by', 'received_by'] },
        ),
    }),

    // POST /return-requests/:documentId/approve
    // Body: { pickup_method?, pickup_scheduled_at?, notes? }
    approveReturn: (documentId, data) => ({
        path: `/return-requests/${documentId}/approve`,
        action: 'approveReturn',
        method: 'post',
        apps: ['order-management', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // POST /return-requests/:documentId/reject
    // Body: { rejection_reason }
    rejectReturn: (documentId, data) => ({
        path: `/return-requests/${documentId}/reject`,
        action: 'rejectReturn',
        method: 'post',
        apps: ['order-management', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // POST /return-requests/:documentId/cancel — staff can cancel on the
    // customer's behalf; the customer-side cancel lives in web/return-requests.
    cancelReturn: (documentId, data) => ({
        path: `/return-requests/${documentId}/cancel`,
        action: 'cancelReturn',
        method: 'post',
        apps: ['order-management', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // POST /return-requests/:documentId/set-received
    // Body: { item_decisions?: [{ order_line_index, restock_decision, inspection_notes? }, …] }
    // Triggers the stock-item walk (Sold → InStock | ReturnedDamaged) via the state machine.
    setReceived: (documentId, data) => ({
        path: `/return-requests/${documentId}/set-received`,
        action: 'setReceived',
        method: 'post',
        apps: ['order-management', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // POST /return-requests/:documentId/resolve
    // Body: { refund_amount_paisa?, refund_method?, refund_status?, refund_notes? }
    // Closes the return → COMPLETED. refund_status defaults to pending_manual
    // (accounts settles by hand for MVP — no gateway refund integration yet).
    resolveReturn: (documentId, data) => ({
        path: `/return-requests/${documentId}/resolve`,
        action: 'resolveReturn',
        method: 'post',
        apps: ['order-management', 'sale', 'accounts'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
        data,
    }),

    // GET /return-requests/:documentId/label
    // Provider-specific return label / pickup slip. Dispatches via the same
    // label-providers registry as the forward label, keyed off the
    // return_method.service_provider (or the parent order's delivery_method
    // when no return-method is set). Returns binary PDF for own_rider/custom
    // and a 302 redirect for easypost. Callers typically open the URL in a
    // new tab rather than going through the JSON client.
    getReturnLabel: (documentId, { reprint } = {}) => ({
        path: `/return-requests/${documentId}/label${reprint ? '?reprint=1' : ''}`,
        action: 'getReturnLabel',
        method: 'get',
        apps: ['order-management', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        scope: ROLE_SCOPES,
    }),
};
