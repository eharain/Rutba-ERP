'use strict';

const { ENTRIES, PLUGIN_PERMISSIONS, PUBLIC_PERMISSIONS, WEB_USER_PLUGIN_PERMISSIONS } = require('../config/app-access-permissions');
const seedAccounting = require('./seed/accounting-seed');

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

// ── Phase 2: restore backed-up link-table data ─────────────
// Runs in bootstrap (AFTER Strapi schema sync has created the new tables).
// Reads from the temp tables created by the migration, inserts into the
// new manyToMany link tables, then drops the temp tables.

const MIGRATION_RELATIONS = [
    {
        newTable: 'stock_items_sale_items_lnk',
        tempTable: '_tmp_stock_items_sale_item_lnk',
        sourceCol: 'stock_item_id',
        targetCol: 'sale_item_id',
        sourceOrdCol: 'stock_item_ord',
        targetOrdCol: 'sale_item_ord',
    },
    {
        newTable: 'stock_items_sale_return_items_lnk',
        tempTable: '_tmp_stock_items_sale_return_item_lnk',
        sourceCol: 'stock_item_id',
        targetCol: 'sale_return_item_id',
        sourceOrdCol: 'stock_item_ord',
        targetOrdCol: 'sale_return_item_ord',
    },
];

async function restoreFromTempTables(knex, logger) {
    for (const rel of MIGRATION_RELATIONS) {
        await restoreRelation(knex, rel, logger);
    }
}

async function restoreRelation(knex, opts, logger) {
    const { newTable, tempTable, sourceCol, targetCol, sourceOrdCol, targetOrdCol } = opts;

    const tempExists = await knex.schema.hasTable(tempTable);
    if (!tempExists) return; // no backup data, nothing to do

    const newExists = await knex.schema.hasTable(newTable);
    if (!newExists) {
        logger.warn('[bootstrap-migrate] New table "' + newTable + '" does not exist yet - cannot restore.');
        return;
    }

    const tempRows = await knex(tempTable).select(sourceCol, targetCol);
    if (!tempRows.length) {
        logger.info('[bootstrap-migrate] Temp table "' + tempTable + '" is empty - dropping.');
        await knex.schema.dropTableIfExists(tempTable);
        return;
    }

    // Read existing rows in the new table to avoid duplicates
    const existingRows = await knex(newTable).select(sourceCol, targetCol);
    const existingSet = new Set(existingRows.map(function (r) {
        return r[sourceCol] + ':' + r[targetCol];
    }));

    // Deduplicate temp rows
    const seen = new Set();
    const toInsert = [];
    for (const row of tempRows) {
        if (!row[sourceCol] || !row[targetCol]) continue;
        const key = row[sourceCol] + ':' + row[targetCol];
        if (seen.has(key) || existingSet.has(key)) continue;
        seen.add(key);
        toInsert.push(row);
    }

    if (!toInsert.length) {
        logger.info('[bootstrap-migrate] All rows from "' + tempTable + '" already in "' + newTable + '" - dropping temp.');
        await knex.schema.dropTableIfExists(tempTable);
        return;
    }

    logger.info('[bootstrap-migrate] Restoring ' + toInsert.length + ' row(s) from "' + tempTable + '" to "' + newTable + '".');

    // Compute ordering: get max existing ord per source and target
    const maxSrcOrds = await knex(newTable).select(sourceCol).max({ maxOrd: sourceOrdCol }).groupBy(sourceCol);
    const srcOrdMap = {};
    for (const r of maxSrcOrds) { srcOrdMap[r[sourceCol]] = r.maxOrd || 0; }

    const maxTgtOrds = await knex(newTable).select(targetCol).max({ maxOrd: targetOrdCol }).groupBy(targetCol);
    const tgtOrdMap = {};
    for (const r of maxTgtOrds) { tgtOrdMap[r[targetCol]] = r.maxOrd || 0; }

    // Build rows with ordering columns
    const insertRows = toInsert.map(function (row) {
        const srcId = row[sourceCol];
        const tgtId = row[targetCol];
        srcOrdMap[srcId] = (srcOrdMap[srcId] || 0) + 1;
        tgtOrdMap[tgtId] = (tgtOrdMap[tgtId] || 0) + 1;
        const out = {};
        out[sourceCol] = srcId;
        out[targetCol] = tgtId;
        out[sourceOrdCol] = srcOrdMap[srcId];
        out[targetOrdCol] = tgtOrdMap[tgtId];
        return out;
    });

    // Insert in batches
    const BATCH = 100;
    for (let i = 0; i < insertRows.length; i += BATCH) {
        await knex(newTable).insert(insertRows.slice(i, i + BATCH));
    }

    logger.info('[bootstrap-migrate] Restored ' + insertRows.length + ' row(s) into "' + newTable + '".');

    // Drop the temp table now that data is restored
    await knex.schema.dropTableIfExists(tempTable);
    logger.info('[bootstrap-migrate] Dropped temp table "' + tempTable + '".');
}

// ── bootstrap ───────────────────────────────────────────────

module.exports = {
    register(/*{ strapi }*/) { },

    async bootstrap({ strapi }) {
        const knex = strapi.db.connection;

        // ─── Phase 2: restore link-table data from migration backup ──
        try {
            await restoreFromTempTables(knex, strapi.log);
        } catch (err) {
            strapi.log.error('[bootstrap-migrate] Failed to restore link-table data: ' + err.message);
            strapi.log.error(err.stack);
        }
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

        // ─── a.3b  Ensure the "Rutba Web User" role ──────────────
        const WEB_ROLE_NAME = 'Rutba Web User';
        const WEB_ROLE_TYPE = 'rutba_web_user';
        const WEB_ROLE_DESC =
            'Role for Rutba web storefront users. Only web-registered customers receive this role.';

        let webRole = await knex('up_roles').where('type', WEB_ROLE_TYPE).first();

        if (!webRole) {
            const [insertedWebId] = await knex('up_roles')
                .insert({
                    document_id: WEB_ROLE_TYPE,
                    name: WEB_ROLE_NAME,
                    description: WEB_ROLE_DESC,
                    type: WEB_ROLE_TYPE,
                    created_at: new Date(),
                    updated_at: new Date(),
                })
                .returning('id');

            const webRoleId = typeof insertedWebId === 'object' ? insertedWebId.id : insertedWebId;
            webRole = { id: webRoleId, name: WEB_ROLE_NAME, type: WEB_ROLE_TYPE };
            strapi.log.info(`[bootstrap] Created role "${WEB_ROLE_NAME}" (id=${webRole.id})`);
        } else {
            await knex('up_roles').where('id', webRole.id).update({
                document_id: WEB_ROLE_TYPE,
                name: WEB_ROLE_NAME,
                description: WEB_ROLE_DESC,
                updated_at: new Date(),
            });
            strapi.log.info(`[bootstrap] Role "${WEB_ROLE_NAME}" already exists (id=${webRole.id})`);
        }

        // ─── a.3c  Sync permissions for rutba_web_user role ──────
        //    Build permissions from the "web-user" app-access entry
        //    plus the minimal web-user plugin permissions.
        const webUserEntry = ENTRIES.find(e => e.key === 'web-user');
        const webUserContentActions = webUserEntry && webUserEntry.permissions
            ? buildPermissionActions(webUserEntry.permissions)
            : [];
        const webUserRequiredActions = [...new Set([...webUserContentActions, ...WEB_USER_PLUGIN_PERMISSIONS])].sort();

        try {
            await syncPermissionsToRole(knex, webRole.id, WEB_ROLE_NAME, webUserRequiredActions, strapi, true);
        } catch (err) {
            strapi.log.error(`[bootstrap] Failed to sync permissions for "${WEB_ROLE_NAME}": ${err.message}`);
            strapi.log.error(err.stack);
        }

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
                strapi.log.info(`[bootstrap] Set default registration role to "${WEB_ROLE_NAME}" (id=${webRole.id})`);
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
            if (otherRole.type === ROLE_TYPE) continue; // already handled above
            if (otherRole.type === WEB_ROLE_TYPE) continue; // already handled above
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
