/**
 * ContactTicketsEndpoints — generic support ticket primitive.
 *
 * submit/addReply/reportSlaBreach are the existing public (auth:false)
 * storefront contact-us flow — not exposed here (see lib/http-client.js /
 * PublicApiEndpoints for that surface). The methods below are the internal
 * HR/IT/Facilities employee helpdesk flow layered on the same content-type
 * via its `category`/`employee` fields, authenticated like every other ESS
 * self-service action.
 */
export const ContactTicketsEndpoints = {
    meta: {
        uid: 'api::contact-ticket.contact-ticket',
        domains: ['hr', 'ess'],
        roles: ['admin', 'manager', 'staff'],
    },

    /** The caller's own helpdesk tickets (self-service). */
    listMine: () => ({
        path: '/contact-tickets/mine',
        action: 'myTickets',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
    }),

    /** Submit an IT/HR/Facilities helpdesk ticket (self-service). */
    submitInternal: (data) => ({
        path: '/contact-tickets/submit-internal',
        action: 'submitInternalTicket',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager', 'staff', 'user'],
        data,
    }),

    /** Open tickets the caller may resolve (HR manager org-wide / line manager -> reports). */
    listTeam: () => ({
        path: '/contact-tickets/team',
        action: 'teamTickets',
        method: 'get',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
    }),

    resolve: (documentId) => ({
        path: `/contact-tickets/${documentId}/resolve`,
        action: 'resolveTicket',
        method: 'post',
        apps: ['hr', 'ess'],
        approle: ['admin', 'manager'],
    }),
};
