// @ts-nocheck
'use strict';

// Transitional alias — the user-management console moved to the rutba-users
// app and this controller moved with it (api::user-admin). Re-exporting keeps
// the legacy /auth-admin/* routes serving on BOTH servers (rutba-core
// posRequires this exact file), now accepting users_* as well as auth_*
// admins. Delete this api (and the rutba-core alias routes) in the cleanup
// commit once rutba-users has soaked.
module.exports = require('../../user-admin/controllers/user-admin');
