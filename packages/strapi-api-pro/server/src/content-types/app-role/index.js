'use strict';

const schema = require('./schema.json');





'use strict';

const schema = require('./schema.json');

// ─── Lifecycle note ─────────────────────────────────────────────────────────
// Strapi initialization order:
//   1. Plugin extensions (strapi-server.js in consuming apps) — run first
//   2. Each plugin's register()                               — runs second
//   3. DB schema sync / metadata build                        — runs third
//   4. Each plugin's bootstrap()                              — runs last
//
// Because DB sync happens AFTER register(), patching the raw plugin schema
// inside register() is the correct and only safe way for a plugin to extend
// another plugin's content-type. The consuming app does NOT need to declare
// api_guard_roles in its own extension — the plugin is self-contained.
// ────────────────────────────────────────────────────────────────────────────

const RELATION_DEF = {
    type: 'relation',
    relation: 'manyToMany',
    target: 'plugin::api-pro.app-role',
    inversedBy: 'users',
    configurable: false,
    writable: true,
    visible: true,        // true = appears in admin content manager on the User form
    // useJoinTable: true,
};

/**
 * Called from register.js to inject the owning side of the app_roles
 * manyToMany relation onto plugin::users-permissions.user.
 *
 * register() runs after plugin extensions (strapi-server.js) but before DB
 * schema sync, so patching here is the correct lifecycle phase.
 *
 * Access path in register():
 *   strapi.plugin('users-permissions') → the plugin instance built from its
 *   raw definition. Its .contentTypes.user.schema.attributes IS the object
 *   Strapi reads when it builds DB metadata in phase 3.
 */
const extendUserRelation = (strapi) => {
    const upPlugin = strapi.plugin('users-permissions');
    if (!upPlugin) {
        strapi.log.warn('[api-pro] Could not extend user schema — plugin::users-permissions is not loaded.');
        return;
    }

    // Strapi can expose attributes through different object shapes depending on
    // version/build mode. Patch all known containers deterministically.
    const containers = [
        upPlugin.contentTypes?.user?.schema?.attributes,
        upPlugin.contentTypes?.user?.attributes,
        upPlugin.contentTypes?.['plugin::users-permissions.user']?.schema?.attributes,
        upPlugin.contentTypes?.['plugin::users-permissions.user']?.attributes,
        strapi.contentTypes?.['plugin::users-permissions.user']?.schema?.attributes,
        strapi.contentTypes?.['plugin::users-permissions.user']?.attributes,
    ].filter(Boolean);

    const uniqueContainers = Array.from(new Set(containers));
    if (uniqueContainers.length === 0) {
        strapi.log.warn('[api-pro] users-permissions.user schema attributes not accessible.');
        return;
    }

    let patched = 0;
    for (const attrs of uniqueContainers) {
        if (!attrs.app_roles) {
            attrs.app_roles = { ...RELATION_DEF };
            patched += 1;
        }
    }

    if (patched > 0) {
        strapi.log.info(`[api-pro] Injected app_roles onto plugin::users-permissions.user (${patched} container${patched === 1 ? '' : 's'})`);
    }
};

module.exports = {
    schema,
    extendUserRelation,
};

