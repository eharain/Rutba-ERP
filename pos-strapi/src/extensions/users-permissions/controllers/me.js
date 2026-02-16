'use strict';
const { createCoreController } = require('@strapi/strapi').factories;
const { permissionsByKey, CLIENT_PLUGIN_PERMISSIONS } = require('../../../../config/app-access-permissions');

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
            const isAdmin = appAccess.includes('auth');

            let permissions = [];

            if (roleType === 'rutba_app_user') {
                // Filter permissions to only those granted by the X-Rutba-App app-access
                const appName = (ctx.request.headers['x-rutba-app'] || '').trim().toLowerCase();

                if (appName) {
                    const defs = permissionsByKey[appName];
                    if (defs) {
                        for (const def of defs) {
                            for (const action of def.actions) {
                                permissions.push(`${def.uid}.${action}`);
                            }
                        }
                    }
                }

                permissions = [...new Set([...permissions, ...CLIENT_PLUGIN_PERMISSIONS])].sort();
            } else {
                // Non-rutba_app_user: return their full role permissions
                const rolePerms = await strapi.query("plugin::users-permissions.permission").findMany({
                    where: { role: { id: user.role.id } },
                    populate: false,
                    select: ['action'],
                });
                permissions = [...new Set([...rolePerms.map(p => p.action), ...CLIENT_PLUGIN_PERMISSIONS])].sort();
            }

            const data = {
                role: fullUser.role.name,
                appAccess,
                adminAppAccess,
                permissions,
                isAdmin,
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
            const entries = await strapi.entityService.findMany('api::stock-item.stock-item', {
                filters: filters,
                start: pagination?.page > 1 ? (pagination.page - 1) * (pagination.pageSize || 20) : 0,
                limit: parseInt(pagination?.pageSize) || 20,
                sort: sort,
                populate: populate
            });

            const totalCount = await strapi.entityService.count('api::stock-item.stock-item', {
                filters: filters
            });
            return {
                data: entries,
                meta: {
                    pagination: {
                        page: parseInt(pagination?.page) || 1,
                        pageSize: parseInt(pagination?.pageSize) || 20,
                        total: totalCount,
                        pageCount: Math.ceil(totalCount / (parseInt(pagination?.pageSize) || 20))
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