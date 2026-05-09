const meRoute = require('./routes/me');
const meController = require('./controllers/me');
const { resolveGuardRoles } = require('../../utils/guard-roles');
// @ts-ignore
const meSchema = require('./content-types/me/schema.json');
// @ts-ignore
const userSchema = require('./content-types/user/schema.json');

async function ensureUsersPermissionsDefaultRole() {
  const roleQuery = strapi.query('plugin::users-permissions.role');

  let authenticatedRole = await roleQuery.findOne({ where: { type: 'authenticated' } });
  if (!authenticatedRole) {
    authenticatedRole = await roleQuery.create({
      data: {
        name: 'Authenticated',
        description: 'Default role given to authenticated user.',
        type: 'authenticated',
      },
    });
    strapi.log.info('[users-permissions] Created missing authenticated role');
  }

  const publicRole = await roleQuery.findOne({ where: { type: 'public' } });
  if (!publicRole) {
    await roleQuery.create({
      data: {
        name: 'Public',
        description: 'Default role given to unauthenticated user.',
        type: 'public',
      },
    });
    strapi.log.info('[users-permissions] Created missing public role');
  }

  const pluginStore = strapi.store({
    type: 'plugin',
    name: 'users-permissions',
    key: 'advanced',
  });

  const advanced = (await pluginStore.get()) || {};
  if (advanced.default_role !== 'authenticated') {
    await pluginStore.set({ value: { ...advanced, default_role: 'authenticated' } });
    strapi.log.info('[users-permissions] Set advanced.default_role to authenticated');
  }
}

async function ensureWebUserGuardRole(userId) {
  if (!userId) return;

  const user = await strapi.query('plugin::users-permissions.user').findOne({
    where: { id: userId },
    populate: {
      role: { select: ['type'] },
      api_guard_roles: { select: ['id', 'key'] },
    },
  });

  if (!user || user.role?.type !== 'authenticated') return;

  const { roleIds } = await resolveGuardRoles(strapi, { roleKeys: ['web_user'] });
  if (!roleIds.length) return;

  const existing = new Set((user.api_guard_roles || []).map((r) => Number(r.id)));
  const mergedRoleIds = [...existing, ...roleIds.filter((id) => !existing.has(id))];

  await strapi.query('plugin::users-permissions.user').update({
    where: { id: user.id },
    data: { api_guard_roles: mergedRoleIds },
  });
}

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

  const authController = plugin.controllers.auth;
  if (authController && typeof authController.register === 'function') {
    const originalRegister = authController.register.bind(authController);
    authController.register = async (ctx) => {
      await ensureUsersPermissionsDefaultRole();
      await originalRegister(ctx);
      await ensureWebUserGuardRole(ctx?.body?.user?.id);
      return ctx;
    };
  }

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
