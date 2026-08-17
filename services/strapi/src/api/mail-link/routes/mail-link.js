'use strict';

// Read-only surface: link mutations go through the mail-message custom routes
// (createLink / removeLink), which enforce account access.
module.exports = {
  routes: [
    {
      method: 'GET',
      path: '/mail-links',
      handler: 'api::mail-link.mail-link.find',
    },
  ],
};
