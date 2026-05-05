'use strict';
const { createCoreController } = require('@strapi/strapi').factories;
const {
    settingsByKey,
    DEFAULT_SESSION_TIMEOUT,
    CLIENT_PLUGIN_PERMISSIONS,
    canGroupElevateToAdmin,
    getEnabledPermissionGroups,
    getEffectiveAppAccessFromUser,
    getAccessibleAppKeysForRequest,
    getPermissionDefsForAccessibleApps,
    permissionDefsToActions,
} = require('../../../../../packages/pos-shared/lib/endpoints/access-metadata.js');

module.exports = createCoreController('plugin::users-permissions.me', ({ strapi }) => ({
    mePermissions: async (ctx) => {
        try {
            const user = ctx.state.user;
            if (!user) {
                return ctx.unauthorized("You must be logged in");
            }

            const fullUser = await strapi.query("plugin::users-permissions.user").findOne({
                where: { id: user.id },
                populate: {
                    role: { select: ['type', 'name'] },
                    app_accesses: { select: ['key'] },
                    admin_app_accesses: { select: ['key'] },
                    permission_roles: {
                        select: ['key', 'level'],
                        populate: {
                            domain: { select: ['key'] },
                        },
                    },
                },
            });

            const roleType = fullUser?.role?.type;
            const { appKeys: effectiveAppAccess, adminKeys: effectiveAdminAppAccess } =
                getEffectiveAppAccessFromUser(fullUser);
            const appName = (ctx.request.headers['x-rutba-app'] || '').trim().toLowerCase();

            let permissions = [];

            // ── Build app-access permissions from the X-Rutba-App header ──
            // Applicable to ANY role whose user holds the corresponding
            // app_access (or admin_app_access).
            if (appName) {
                const accessibleKeys = getAccessibleAppKeysForRequest(
                    appName,
                    effectiveAppAccess,
                    effectiveAdminAppAccess
                );
                const permissionDefs = getPermissionDefsForAccessibleApps(
                    accessibleKeys,
                    effectiveAppAccess,
                    effectiveAdminAppAccess
                );
                permissions = permissionDefsToActions(permissionDefs);
            }

            if (roleType !== 'rutba_app_user') {
                // Non-rutba_app_user: also include their Strapi role permissions
                const rolePerms = await strapi.query("plugin::users-permissions.permission").findMany({
                    where: { role: { id: user.role.id } },
                    populate: false,
                    select: ['action'],
                });
                permissions.push(...rolePerms.map((p) => p.action));
            }

            permissions = [...new Set([...permissions, ...CLIENT_PLUGIN_PERMISSIONS])].sort();

            const data = {
                role: fullUser.role.name,
                roleType,
                appAccess: effectiveAppAccess,
                adminAppAccess: effectiveAdminAppAccess,
                permissionGroups: ['staff', 'manager', 'admin'].map((g) => ({
                    key: g,
                    canElevateToAdmin: canGroupElevateToAdmin(g),
                })),
                enabledPermissionGroups: appName ? getEnabledPermissionGroups(appName) : [],
                permissions,
                sessionTimeout: (settingsByKey[appName] || {}).sessionTimeout || DEFAULT_SESSION_TIMEOUT,
            };
            ctx.send(data);
        } catch (err) {
            ctx.internalServerError("Error fetching permissions");
            console.error("Error Fetching user permissions...", err);
        }
    },
    stockItemsSearch: async (ctx) => {
        try {
            const user = ctx.state.user;
            if (!user) {
                return ctx.unauthorized("You must be logged in");
            }
            const { filters, pagination, sort, populate } = ctx.query;

            // Exclude archived items by default unless explicitly requested
            const archiveFilter = filters?.archived !== undefined
                ? {}
                : { $or: [{ archived: false }, { archived: { $null: true } }] };

            const mergedFilters = Object.keys(archiveFilter).length
                ? { $and: [filters, archiveFilter].filter(Boolean) }
                : { ...filters };

            const pageSize = parseInt(pagination?.pageSize) || 20;
            const page = parseInt(pagination?.page) || 1;
            const start = (page - 1) * pageSize;

            const [entries, totalCount] = await Promise.all([
                strapi.entityService.findMany('api::stock-item.stock-item', {
                    filters: mergedFilters,
                    start,
                    limit: pageSize,
                    sort: sort || [],
                    populate: populate
                }),
                strapi.entityService.count('api::stock-item.stock-item', {
                    filters: mergedFilters
                })
            ]);

            return {
                data: entries,
                meta: {
                    pagination: {
                        page: page,
                        pageSize: pageSize,
                        total: totalCount,
                        pageCount: Math.ceil(totalCount / pageSize)
                    }
                }
            };
        } catch (err) {
            ctx.internalServerError("Error searching stock items");
            console.error("Error searching stock items...", err);
            return ctx.badRequest("Error searching stock items", err);
        }
    }
})); 