'use strict';

const {
    ENTRIES,
    PERMISSION_GROUPS,
    SYSTEM_PERMISSION_GROUPS,
    permissionsByKey,
    PLUGIN_PERMISSIONS,
    PUBLIC_PERMISSIONS,
} = require('../config/app-access-permissions');
const seedAccounting = require('./seed/accounting-seed');

// ── helpers ─────────────────────────────────────────────────

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
        const defs = permissionsByKey[entry.key] || [];
        if (!defs.length) continue;
        for (const def of defs) {
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

const ROLE_BOOTSTRAP_META = {
    rutba_app_user: {
        name: 'Rutba App User',
        description: 'Role for Rutba front-end application users. Permissions are managed by app-access-guard and app-access assignments.',
    },
    rutba_web_user: {
        name: 'Rutba Web User',
        description: 'Role for Rutba web storefront users. Permissions are managed by app-access-guard and app-access assignments.',
    },
};

const CONFIGURED_ROLE_TYPES = [...new Set([
    ...Object.values(PERMISSION_GROUPS).map((group) => group.roleType),
    ...Object.values(SYSTEM_PERMISSION_GROUPS).map((group) => group.roleType),
])].filter((roleType) => roleType && roleType !== 'public');

function getRoleBootstrapMeta(roleType) {
    return ROLE_BOOTSTRAP_META[roleType] || {
        name: roleType,
        description: `Role managed by app-access configuration (${roleType}).`,
    };
}

async function ensureConfiguredRole(knex, strapi, roleType) {
    const meta = getRoleBootstrapMeta(roleType);
    let role = await knex('up_roles').where('type', roleType).first();

    if (!role) {
        const roleId = await insertReturningId(knex, 'up_roles', {
            document_id: roleType,
            name: meta.name,
            description: meta.description,
            type: roleType,
            created_at: new Date(),
            updated_at: new Date(),
        });
        role = { id: roleId, name: meta.name, type: roleType };
        strapi.log.info(`[bootstrap] Created role "${meta.name}" (id=${role.id})`);
    } else {
        await knex('up_roles').where('id', role.id).update({
            document_id: roleType,
            name: meta.name,
            description: meta.description,
            updated_at: new Date(),
        });
        strapi.log.info(`[bootstrap] Role "${meta.name}" already exists (id=${role.id})`);
    }

    return role;
}

function hashCode(s) {
    return s.split('').reduce(function (a, b) {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);
}

/**
 * Insert a row and return the auto-increment id.
 * Skips `.returning()` on MySQL/MariaDB to avoid noisy warnings.
 */
async function insertReturningId(knex, table, data) {
    const client = (knex.client.config.client || '').toLowerCase();
    const isMySQL = ['mysql', 'mysql2', 'mariadb'].includes(client);

    if (isMySQL) {
        const [insertedId] = await knex(table).insert(data);
        return insertedId;
    }

    const [insertedId] = await knex(table).insert(data).returning('id');
    return typeof insertedId === 'object' ? insertedId.id : insertedId;
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
            const permId = await insertReturningId(knex, 'up_permissions', {
                    document_id: String(hashCode(action)),
                    action,
                    created_at: new Date(),
                    updated_at: new Date(),
                    published_at: new Date(),
                });

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

        // ─── a.1  Ensure roles configured in app-access config ───
        const ensuredRolesByType = {};
        for (const roleType of CONFIGURED_ROLE_TYPES) {
            ensuredRolesByType[roleType] = await ensureConfiguredRole(knex, strapi, roleType);
        }

        const role = ensuredRolesByType.rutba_app_user;
        const webRole = ensuredRolesByType.rutba_web_user;

        // ─── a.2  Ensure all app-access entries exist ─────────────
        for (const entry of ENTRIES) {
            const existing = await knex('app_accesses').where('key', entry.key).first();

            if (!existing) {
                await knex('app_accesses').insert({
                    document_id: hashCode([entry.description, entry.key, entry.name].join('-')),
                    key: entry.key,
                    name: entry.name,
                    description: entry.description,
                    created_at: new Date(),
                    updated_at: new Date(),
                    published_at: new Date(),
                });
                strapi.log.info(`[bootstrap] Created app-access "${entry.key}"`);
            } else {
                await knex('app_accesses').where('key', entry.key).update({
                    name: entry.name,
                    description: entry.description,
                    updated_at: new Date(),
                });
                strapi.log.info(`[bootstrap] Updated app-access "${entry.key}"`);
            }
        }

        // ─── a.3  For configured app-access roles, do not sync content permissions here.
        //          Route-level permission enforcement is handled by app-access-guard.

        const allActions = buildAllPermissionActions();
        const requiredActions = [...new Set([...allActions, ...PLUGIN_PERMISSIONS])].sort();

        // ─── a.3d  Set rutba_web_user as default registration role ─
        //    Users who register via auth/local/register or OAuth
        //    callbacks receive this role automatically.  Internal
        //    staff users are assigned rutba_app_user via the admin.
        try {
            const pluginStore = strapi.store({ type: 'plugin', name: 'users-permissions' });
            const advanced = await pluginStore.get({ key: 'advanced' });
            if (advanced && String(advanced.default_role) !== String(webRole.id)) {
                advanced.default_role = String(webRole.id);
                await pluginStore.set({ key: 'advanced', value: advanced });
                strapi.log.info(`[bootstrap] Set default registration role to "${webRole.name}" (id=${webRole.id})`);
            }
        } catch (err) {
            strapi.log.error(`[bootstrap] Failed to set default registration role: ${err.message}`);
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
            if (CONFIGURED_ROLE_TYPES.includes(otherRole.type)) continue; // managed by app-access assignments + guard
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

        // ─── Phase 3: Seed accounting Chart of Accounts & mappings ──
        try {
            await seedAccounting(strapi);
        } catch (err) {
            strapi.log.error('[bootstrap] Accounting seed failed: ' + err.message);
            strapi.log.error(err.stack);
        }
    },
};
