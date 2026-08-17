'use strict';

// Public QR resolution. `auth: false` because a printed code is scanned by
// anonymous phone cameras; the handler only ever reads published documents.
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/qr/resolve/:code',
      handler: 'qr.resolve',
      config: { auth: false },
    },
    {
      // Query-string form, for codes that would need escaping in a path.
      method: 'GET',
      path: '/qr/resolve',
      handler: 'qr.resolve',
      config: { auth: false },
    },
  ],
};
