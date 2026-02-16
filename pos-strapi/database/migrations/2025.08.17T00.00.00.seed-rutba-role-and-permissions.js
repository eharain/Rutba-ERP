'use strict';

const { ENTRIES } = require('../../config/app-access-permissions');

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

// ── migration ───────────────────────────────────────────────

async function up(knex) {

  // ─── 1. Create the "Rutba App User" role ──────────────────
  const ROLE_NAME = 'Rutba App User';
  const ROLE_TYPE = 'rutba_app_user';
  const ROLE_DESC = 'Role for Rutba front-end application users. Permissions are managed automatically via app-access configuration.';

  let role = await knex('up_roles').where('type', ROLE_TYPE).first();

  if (!role) {
    const [insertedId] = await knex('up_roles').insert({
      name: ROLE_NAME,
      description: ROLE_DESC,
      type: ROLE_TYPE,
      created_at: new Date(),
      updated_at: new Date(),
    }).returning('id');

    const roleId = typeof insertedId === 'object' ? insertedId.id : insertedId;
    role = { id: roleId, name: ROLE_NAME, type: ROLE_TYPE };
    console.log(`  ✓ Created role "${ROLE_NAME}" (id=${role.id})`);
  } else {
    await knex('up_roles').where('id', role.id).update({
      name: ROLE_NAME,
      description: ROLE_DESC,
      updated_at: new Date(),
    });
    console.log(`  ✓ Role "${ROLE_NAME}" already exists (id=${role.id})`);
  }

  // ─── 2. Sync permissions to the role ──────────────────────
  const allActions = buildAllPermissionActions();

  const pluginActions = [
    'plugin::users-permissions.auth.callback',
    'plugin::users-permissions.auth.connect',
    'plugin::users-permissions.auth.forgotPassword',
    'plugin::users-permissions.auth.resetPassword',
    'plugin::users-permissions.auth.changePassword',
    'plugin::users-permissions.auth.emailConfirmation',
    'plugin::users-permissions.user.me',
    'plugin::users-permissions.user.update',
    'plugin::users-permissions.me.mePermissions',
    'plugin::users-permissions.me.stockItemsSearch',
    'plugin::upload.content-api.find',
    'plugin::upload.content-api.findOne',
    'plugin::upload.content-api.upload',
    'plugin::upload.content-api.destroy',
  ];

  const requiredActions = [...new Set([...allActions, ...pluginActions])].sort();

  // In Strapi 5, permissions ↔ roles use a link table: up_permissions_role_lnk
  // Columns: permission_id, role_id
  const existingPerms = await knex('up_permissions')
    .join('up_permissions_role_lnk', 'up_permissions.id', 'up_permissions_role_lnk.permission_id')
    .where('up_permissions_role_lnk.role_id', role.id)
    .select('up_permissions.id', 'up_permissions.action');

  const existingActions = new Set(existingPerms.map(p => p.action));

  // Add missing permissions
  let added = 0;
  for (const action of requiredActions) {
    if (!existingActions.has(action)) {
      const [insertedId] = await knex('up_permissions').insert({
        action,
        created_at: new Date(),
        updated_at: new Date(),
      }).returning('id');

      const permId = typeof insertedId === 'object' ? insertedId.id : insertedId;

      // Link the permission to the role
      await knex('up_permissions_role_lnk').insert({
        permission_id: permId,
        role_id: role.id,
      });

      added++;
    }
  }

  // Remove permissions that are no longer needed
  const requiredSet = new Set(requiredActions);
  const toRemove = existingPerms.filter(p => !requiredSet.has(p.action));
  if (toRemove.length > 0) {
    const removeIds = toRemove.map(p => p.id);
    // Remove link rows first, then the permission rows
    await knex('up_permissions_role_lnk').whereIn('permission_id', removeIds).del();
    await knex('up_permissions').whereIn('id', removeIds).del();
  }

  console.log(`  ✓ Synced permissions for "${ROLE_NAME}": ${added} added, ${toRemove.length} removed, ${requiredActions.length} total`);

  // ─── 3. Update app_accesses with permissions JSON ─────────
  for (const entry of ENTRIES) {
    if (!entry.permissions) continue;
    const permActions = buildPermissionActions(entry.permissions);
    const permJson = JSON.stringify(permActions);

    const updated = await knex('app_accesses')
      .where('key', entry.key)
      .update({
        permissions: permJson,
        updated_at: new Date(),
      });

    if (updated > 0) {
      console.log(`  ✓ Updated app-access "${entry.key}" with ${permActions.length} permissions`);
    } else {
      console.log(`  ⚠ App-access "${entry.key}" not found — run the seed-app-access-entries migration first`);
    }
  }
}

async function down(knex) {
  const ROLE_TYPE = 'rutba_app_user';
  const role = await knex('up_roles').where('type', ROLE_TYPE).first();

  if (role) {
    // Get permission IDs linked to this role
    const linkedPerms = await knex('up_permissions_role_lnk')
      .where('role_id', role.id)
      .select('permission_id');
    const permIds = linkedPerms.map(p => p.permission_id);

    // Remove links, then permissions, then role
    if (permIds.length > 0) {
      await knex('up_permissions_role_lnk').whereIn('permission_id', permIds).del();
      await knex('up_permissions').whereIn('id', permIds).del();
    }
    await knex('up_roles').where('id', role.id).del();
    console.log(`  ✓ Removed role "Rutba App User" and its permissions`);
  }

  for (const entry of ENTRIES) {
    await knex('app_accesses')
      .where('key', entry.key)
      .update({ permissions: null, updated_at: new Date() });
  }
}

module.exports = { up, down };
