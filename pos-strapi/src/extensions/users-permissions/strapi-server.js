const meRoute = require('./routes/me');
const meController = require('./controllers/me');
// @ts-ignore
const meSchema = require('./content-types/me/schema.json');
// @ts-ignore
const userSchema = require('./content-types/user/schema.json');

module.exports = (plugin) => {
  // Ensure plugin content types use the shipped schemas rather than mutating runtime objects
  plugin.contentTypes = plugin.contentTypes || {};
  plugin.contentTypes.user = { schema: userSchema };
  plugin.contentTypes.me = { schema: meSchema };

  // Register custom controller
  plugin.controllers = plugin.controllers || {};
  plugin.controllers.me = meController;

  // Register routes for content-api (preserve existing routes)
  const capi = plugin.routes && plugin.routes['content-api'];
  if (capi) {
    plugin.routes['content-api'] = (...args) => {
      const resp = typeof capi === 'function' ? capi(...args) : capi;
      resp.routes = resp.routes || [];
      resp.routes.push(...meRoute);
      return resp;
    };
  } else {
    // fallback: define content-api routes if missing
    plugin.routes = plugin.routes || {};
    plugin.routes['content-api'] = { routes: [...meRoute] };
  }

  return plugin;
};
