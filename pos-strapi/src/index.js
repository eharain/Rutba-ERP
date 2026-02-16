'use strict';

const { ENTRIES, PLUGIN_PERMISSIONS } = require('../config/app-access-permissions');

// ── helpers ─────────────────────────────────────────────────

function buildPermissionActions(permDefs) {
  const actions = new Set();
  for (const def of permDefs) {
    for (const action of def.actions) {
      actions.add(`${def.uid}.${action}`);
    }
  }
  return [...actions].sort();
}

function buildAllPermissionActions() {
  const all = new Set();
  for (const entry of ENTRIES) {
    if (!entry.permissions) continue;
    for (const def of entry.permissions) {
      for (const action of def.actions) {
        all.add(`${def.uid}.${action}`);
      }
    }
  }
  return [...all].sort();
}

function hashCode(s) {
  return s.split('').reduce(function (a, b) {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0);
}

/**
 * Ensure a role has (at least) the given permissions.
 * Always adds missing ones.  When `prune` is true, also removes
 * permissions that are NOT in requiredActions (used for rutba_app_user
 * whose permissions are fully managed by the bootstrap).
 */
async function syncPermissionsToRole(knex, roleId, roleName, requiredActions, strapi, prune = false) {
  const existingPerms = await knex('up_permissions')
    .join('up_permissions_role_lnk', 'up_permissions.id', 'up_permissions_role_lnk.permission_id')
    .where('up_permissions_role_lnk.role_id', roleId)
    .select('up_permissions.id', 'up_permissions.action');

  const existingActions = new Set(existingPerms.map((p) => p.action));

  let added = 0;
  for (const action of requiredActions) {
    if (!existingActions.has(action)) {
      const [insertedId] = await knex('up_permissions')
        .insert({ action, created_at: new Date(), updated_at: new Date() })
        .returning('id');

      const permId = typeof insertedId === 'object' ? insertedId.id : insertedId;

      await knex('up_permissions_role_lnk').insert({
        permission_id: permId,
        role_id: roleId,
      });

      added++;
    }
  }

  let removed = 0;
  if (prune) {
    const requiredSet = new Set(requiredActions);
    const toRemove = existingPerms.filter((p) => !requiredSet.has(p.action));
    if (toRemove.length > 0) {
      const removeIds = toRemove.map((p) => p.id);
      await knex('up_permissions_role_lnk').whereIn('permission_id', removeIds).del();
      await knex('up_permissions').whereIn('id', removeIds).del();
      removed = toRemove.length;
    }
  }

  if (added > 0 || removed > 0) {
    strapi.log.info(
      `[bootstrap] Synced permissions for "${roleName}": ${added} added, ${removed} removed, ${requiredActions.length} required`
    );
  }
}

// ── bootstrap ───────────────────────────────────────────────

module.exports = {
  register(/*{ strapi }*/) {},

  async bootstrap({ strapi }) {
    const knex = strapi.db.connection;

    // ─── a.1  Ensure the "Rutba App User" role ────────────────
    const ROLE_NAME = 'Rutba App User';
    const ROLE_TYPE = 'rutba_app_user';
    const ROLE_DESC =
      'Role for Rutba front-end application users. Permissions are managed automatically via app-access configuration.';

    let role = await knex('up_roles').where('type', ROLE_TYPE).first();

    if (!role) {
      const [insertedId] = await knex('up_roles')
        .insert({
          name: ROLE_NAME,
          description: ROLE_DESC,
          type: ROLE_TYPE,
          created_at: new Date(),
          updated_at: new Date(),
        })
        .returning('id');

      const roleId = typeof insertedId === 'object' ? insertedId.id : insertedId;
      role = { id: roleId, name: ROLE_NAME, type: ROLE_TYPE };
      strapi.log.info(`[bootstrap] Created role "${ROLE_NAME}" (id=${role.id})`);
    } else {
      await knex('up_roles').where('id', role.id).update({
        name: ROLE_NAME,
        description: ROLE_DESC,
        updated_at: new Date(),
      });
      strapi.log.info(`[bootstrap] Role "${ROLE_NAME}" already exists (id=${role.id})`);
    }

    // ─── a.2  Ensure all app-access entries exist ─────────────
    for (const entry of ENTRIES) {
      const permJson = entry.permissions
        ? JSON.stringify(buildPermissionActions(entry.permissions))
        : null;

      const existing = await knex('app_accesses').where('key', entry.key).first();

      if (!existing) {
        await knex('app_accesses').insert({
          document_id: hashCode([entry.description, entry.key, entry.name].join('-')),
          key: entry.key,
          name: entry.name,
          description: entry.description,
          permissions: permJson,
          created_at: new Date(),
          updated_at: new Date(),
          published_at: new Date(),
        });
        strapi.log.info(`[bootstrap] Created app-access "${entry.key}"`);
      } else {
        await knex('app_accesses').where('key', entry.key).update({
          name: entry.name,
          description: entry.description,
          permissions: permJson,
          updated_at: new Date(),
        });
        strapi.log.info(`[bootstrap] Updated app-access "${entry.key}"`);
      }
    }

    // ─── a.3  Sync permissions for rutba_app_user role ────────
    const allActions = buildAllPermissionActions();

    const requiredActions = [...new Set([...allActions, ...PLUGIN_PERMISSIONS])].sort();

    await syncPermissionsToRole(knex, role.id, ROLE_NAME, requiredActions, strapi, true);

    // ─── a.4  Ensure plugin permissions on ALL existing roles ─
    //    me/permissions, auth, upload etc. must be reachable by
    //    every authenticated user regardless of their role.
    const allRoles = await knex('up_roles').select('id', 'name', 'type');
    for (const otherRole of allRoles) {
      if (otherRole.type === ROLE_TYPE) continue; // already handled above
      await syncPermissionsToRole(knex, otherRole.id, otherRole.name, PLUGIN_PERMISSIONS, strapi);
    }
  },
};
