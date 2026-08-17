'use strict';

// Bulk import endpoint for the rutba-cms Excel I/O flow. `auth: false` skips
// Strapi's scope-based check (the action name isn't a standard CRUD verb), but
// the controller calls ensureUser + an admin-role check before doing anything.
module.exports = {
    routes: [
        {
            method: 'POST',
            path: '/cms-bulk/import',
            handler: 'cms-bulk.import',
            config: { auth: false },
        },
    ],
};
