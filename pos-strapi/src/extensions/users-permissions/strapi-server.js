const meRoute = require('./routes/me');
const meController = require('./controllers/me');
// @ts-ignore
const meSchema = require('./content-types/me/schema.json');
// @ts-ignore
const userSchema = require('./content-types/user/schema.json');

module.exports = (plugin) => {
  // Merge our custom attributes into the existing user content-type schema rather
  // than replacing the whole object. Replacing it wholesale would discard attributes
  // injected by independent plugins (e.g. AGP's permission_roles) because those
  // plugins run their register() after this extension is evaluated.
  plugin.contentTypes = plugin.contentTypes || {};

    const existingUser = plugin.contentTypes.user;

  if (existingUser && existingUser.schema) {
    // Preserve everything the original schema already has; our attributes win on conflict.
    existingUser.schema.attributes = Object.assign(
      {},
      existingUser.schema.attributes,
      userSchema.attributes
    );
  } else {
    // Fallback: no prior schema — use ours directly.
    plugin.contentTypes.user = { schema: userSchema };
  }

  // Merge all user attributes into the me schema so the /me endpoint exposes the
  // full user profile (displayName,  hr_employee, etc.) without losing
  // any attributes that are exclusive to the me schema.
  const mergedMeSchema = {
    ...meSchema,
    attributes: {
      ...userSchema.attributes,
      ...meSchema.attributes,
    },
  };
  plugin.contentTypes.me = { schema: mergedMeSchema };

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
