// @ts-nocheck
'use strict';

// Transitional alias — the user-management console moved to the rutba-admin
// app (via rutba-users) and this controller moved with it (api::user-admin).
// Re-exporting keeps the legacy /auth-admin/* routes serving on BOTH servers
// (rutba-core posRequires this exact file), now accepting admin_* and users_*
// as well as auth_* admins. Delete this api (and the rutba-core alias routes)
// in the cleanup commit once rutba-admin has soaked.
module.exports = require('../../user-admin/controllers/user-admin');
