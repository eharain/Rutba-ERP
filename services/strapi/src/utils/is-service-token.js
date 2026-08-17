'use strict';

// True when the request is authenticated with a Strapi content-API token and
// carries NO users-permissions user — the shape the marketplace worker (and a
// peer Rutba instance) uses. A token sets ctx.state.auth.strategy but never
// ctx.state.user, so a logged-in operator can never reach a gated endpoint.
//
// Strapi 5 registers the token strategy as 'content-api-token' (older: 'api-token').
function isServiceToken(ctx) {
  const name = ctx.state && ctx.state.auth && ctx.state.auth.strategy && ctx.state.auth.strategy.name;
  return (name === 'content-api-token' || name === 'api-token') && !(ctx.state && ctx.state.user);
}

module.exports = { isServiceToken };
