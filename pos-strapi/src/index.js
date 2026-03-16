'use strict';

const { ENTRIES, PLUGIN_PERMISSIONS, PUBLIC_PERMISSIONS } = require('../config/app-access-permissions');

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

/**
 * Build the set of Strapi role-permission actions for rutba_app_user.
 *
 * We grant full CRUD (find, findOne, create, update, delete) for every
 * UID that appears in any app-access entry, PLUS any custom actions
 * (open, close, bulk, process, …).  Strapi's own role-permission system
 * is therefore a wide gate; the real fine-grained check happens in the
 * app-access-guard middleware.
 */
function buildAllPermissionActions() {
    const BASE_CRUD = ['find', 'findOne', 'create', 'update', 'delete'];
    const all = new Set();
    for (const entry of ENTRIES) {
        if (!entry.permissions) continue;
        for (const def of entry.permissions) {
            for (const action of BASE_CRUD) {
                all.add(`${def.uid}.${action}`);
            }
            // also include any custom actions beyond CRUD
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
                .insert({
                    document_id: String(hashCode(action)),
                    action,
                    created_at: new Date(),
                    updated_at: new Date(),
                    published_at: new Date(),
                })
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
    register(/*{ strapi }*/) { },

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

                    document_id: ROLE_TYPE,
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
                document_id: ROLE_TYPE,
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

        try {
            await syncPermissionsToRole(knex, role.id, ROLE_NAME, requiredActions, strapi, true);
        } catch (err) {
            strapi.log.error(`[bootstrap] Failed to sync permissions for "${ROLE_NAME}": ${err.message}`);
            strapi.log.error(err.stack);
        }

        // ─── a.4  Ensure permissions on ALL existing roles ─────────
        //    • public  → plugin perms + public content-API perms
        //    • other authenticated roles (e.g. "Authenticated")
        //      → same wide-gate content-API perms as rutba_app_user
        //        + plugin perms.  Fine-grained access is enforced by
        //        the app-access-guard middleware, not by Strapi's
        //        built-in role-permission system.
        const allRoles = await knex('up_roles').select('id', 'name', 'type');
        for (const otherRole of allRoles) {
            if (otherRole.type === ROLE_TYPE) continue; // already handled above
            let permsForRole;
            if (otherRole.type === 'public') {
                permsForRole = [...new Set([...PLUGIN_PERMISSIONS, ...PUBLIC_PERMISSIONS])].sort();
            } else {
                // Every authenticated role gets the full content-API
                // permission set so Strapi's route-level auth never
                // blocks requests that the app-access layer allows.
                permsForRole = requiredActions;  // allActions + PLUGIN_PERMISSIONS
            }
            try {
                await syncPermissionsToRole(knex, otherRole.id, otherRole.name, permsForRole, strapi);
            } catch (err) {
                strapi.log.error(`[bootstrap] Failed to sync permissions for "${otherRole.name}": ${err.message}`);
            }
        }
    },
};
