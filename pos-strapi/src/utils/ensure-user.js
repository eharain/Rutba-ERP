'use strict';

/**
 * Manually parse the JWT and populate ctx.state.user.
 *
 * Custom routes that use `auth: false` (to bypass Strapi's
 * scope-based permission check for non-standard action names)
 * also skip JWT parsing.  Call this helper at the top of every
 * such handler to restore authentication.
 *
 * Returns the user object, or null (after sending 401).
 */
async function ensureUser(ctx, strapi) {
  if (ctx.state?.user) return ctx.state.user;
  try {
    const token = await strapi
      .plugin('users-permissions')
      .service('jwt')
      .getToken(ctx);
    if (token?.id) {
      const user = await strapi
        .plugin('users-permissions')
        .service('user')
        .fetchAuthenticatedUser(token.id);
      if (user && !user.blocked) {
        ctx.state.user = user;
        return user;
      }
    }
  } catch (_) { /* invalid / missing token */ }
  ctx.unauthorized('Authentication required');
  return null;
}

module.exports = { ensureUser };
