module.exports = {
  type: 'content-api',
  routes: [
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
