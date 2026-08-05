module.exports = {
  type: 'content-api',
  routes: [
    // Internal HR/IT/Facilities helpdesk — authenticated employee routes
    // (distinct from the public auth:false submit/reply flow below).
    {
      method: 'GET',
      path: '/contact-tickets/mine',
      handler: 'api::contact-ticket.contact-ticket.myTickets',
    },
    {
      method: 'POST',
      path: '/contact-tickets/submit-internal',
      handler: 'api::contact-ticket.contact-ticket.submitInternalTicket',
    },
    {
      method: 'GET',
      path: '/contact-tickets/team',
      handler: 'api::contact-ticket.contact-ticket.teamTickets',
    },
    {
      method: 'POST',
      path: '/contact-tickets/:documentId/resolve',
      handler: 'api::contact-ticket.contact-ticket.resolveTicket',
    },

    {
      method: 'POST',
      path: '/contact-tickets/submit',
      handler: 'api::contact-ticket.contact-ticket.submit',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/contact-tickets/:documentId/reply',
      handler: 'api::contact-ticket.contact-ticket.addReply',
      config: { auth: false },
    },
    {
      method: 'POST',
      path: '/contact-tickets/:documentId/sla-breach',
      handler: 'api::contact-ticket.contact-ticket.reportSlaBreach',
      config: { auth: false },
    },
  ],
};
