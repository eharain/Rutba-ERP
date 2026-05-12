'use strict';

// GET /api/api-pro/me/permissions
//
// Returns the current authenticated user's effective permissions. The shape
// matches what packages/pos-shared/context/AuthContext.js expects. Bypassed
// by the global interceptor (path is in the default bypassPaths list).
//
// This controller intentionally does NOT use Strapi's users-permissions
// `auth: false` trick — the route relies on the standard isAuthenticated
// policy registered in routes/index.js.

module.exports = {
  async permissions(ctx) {
    const user = ctx.state?.user;
    if (!user?.id) {
      ctx.status = 401;
      ctx.body = { error: { code: 'AUTH_REQUIRED', message: 'Authenticated user required' } };
      return;
    }

    const payload = await strapi
      .plugin('api-pro')
      .service('mePermissions')
      .build(strapi, user.id);

    ctx.body = payload;
  },
};
