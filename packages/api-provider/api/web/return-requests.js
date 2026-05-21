// Customer-facing return-request surface for the storefront. Calls go
// through the public-`webApi` client (X-Rutba-App: web baked in) per
// project_api_provider_web_public_client. Routes hit the same controllers
// as the staff surface but rely on the controller's ownership gate to
// keep buyers from seeing each other's returns.

export const WebReturnRequestsEndpoints = {
    // POST /return-requests — buyer initiates from /profile/orders/[id].
    // Body: {
    //   sale_order_document_id, reason, reason_notes?, resolution?,
    //   items: [{ order_line_index, quantity, reason?, reason_notes?, unit_refund_paisa? }, …],
    //   customer_evidence?: media-ids[]
    // }
    createReturnRequest: (data) => ({
        path: '/return-requests',
        method: 'post',
        data,
    }),

    // GET /return-requests/mine — owner-scoped list.
    listMine: () => ({
        path: '/return-requests/mine',
        method: 'get',
    }),

    // GET /return-requests/:documentId — same handler as staff find, the
    // controller's owner check gates non-staff callers.
    byId: (documentId) => ({
        path: `/return-requests/${documentId}`,
        method: 'get',
    }),

    cancelMine: (documentId) => ({
        path: `/return-requests/${documentId}/cancel`,
        method: 'post',
    }),
};
