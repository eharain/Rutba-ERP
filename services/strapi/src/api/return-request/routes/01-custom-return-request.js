/** @type {import('@strapi/strapi').Core.RouterConfig} */
//
// Custom routes registered BEFORE the core /return-requests/:documentId
// router so literal-prefix paths (mine, approve, …) win against the
// parametric one. Per feedback_koa_router_literal_prefix_order.
//
// All routes use `auth: false` because workflow actions need to run their
// own role checks (customer-vs-staff). ensureUser + requireStaffUser
// handle JWT parsing inside the controller. Matches the sale-order pattern.

const config = {
  type: 'content-api',
  routes: [
    // Customer-facing
    {
      method: 'POST',
      path: '/return-requests',
      handler: 'api::return-request.return-request.createReturnRequest',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/return-requests/mine',
      handler: 'api::return-request.return-request.listMine',
      config: { auth: false },
    },
    {
      method: 'GET',
      path: '/return-requests/:documentId',
      handler: 'api::return-request.return-request.findOneScoped',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/return-requests/:documentId/cancel',
      handler: 'api::return-request.return-request.cancelReturn',
      config: { auth: false },
    },

    // Staff workflow
    {
      method: 'POST',
      path: '/return-requests/:documentId/approve',
      handler: 'api::return-request.return-request.approveReturn',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/return-requests/:documentId/reject',
      handler: 'api::return-request.return-request.rejectReturn',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/return-requests/:documentId/set-received',
      handler: 'api::return-request.return-request.setReceived',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/return-requests/:documentId/resolve',
      handler: 'api::return-request.return-request.resolveReturn',
      config: { auth: false },
    },
    // Label generation. Literal `/label` segment registered before any
    // /return-requests/:documentId catch-all per
    // feedback_koa_router_literal_prefix_order.
    {
      method: 'GET',
      path: '/return-requests/:documentId/label',
      handler: 'api::return-request.return-request.getReturnLabel',
      config: { auth: false },
    },
  ],
};

module.exports = config;
