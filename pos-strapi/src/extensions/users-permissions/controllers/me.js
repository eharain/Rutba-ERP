'use strict';
const { createCoreController } = require('@strapi/strapi').factories;
const { permissionsByKey, settingsByKey, DEFAULT_SESSION_TIMEOUT, CLIENT_PLUGIN_PERMISSIONS } = require('../../../../config/app-access-permissions');

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
                },
            });

            const roleType = fullUser?.role?.type;
            const appAccess = (fullUser?.app_accesses || []).map(a => a.key);
            const adminAppAccess = (fullUser?.admin_app_accesses || []).map(a => a.key);
            const appName = (ctx.request.headers['x-rutba-app'] || '').trim().toLowerCase();

            let permissions = [];

            // ── Build app-access permissions from the X-Rutba-App header ──
            // Applicable to ANY role whose user holds the corresponding
            // app_access (or admin_app_access).
            if (appName && (appAccess.includes(appName) || adminAppAccess.includes(appName))) {
                const defs = permissionsByKey[appName];
                if (defs) {
                    for (const def of defs) {
                        for (const action of def.actions) {
                            permissions.push(`${def.uid}.${action}`);
                        }
                    }
                }
            }

            if (roleType !== 'rutba_app_user') {
                // Non-rutba_app_user: also include their Strapi role permissions
                const rolePerms = await strapi.query("plugin::users-permissions.permission").findMany({
                    where: { role: { id: user.role.id } },
                    populate: false,
                    select: ['action'],
                });
                for (const p of rolePerms) {
                    permissions.push(p.action);
                }
            }

            permissions = [...new Set([...permissions, ...CLIENT_PLUGIN_PERMISSIONS])].sort();

            const data = {
                role: fullUser.role.name,
                roleType,
                appAccess,
                adminAppAccess,
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