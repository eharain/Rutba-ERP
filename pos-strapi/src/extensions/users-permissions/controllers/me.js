'use strict';
const { createCoreController } = require('@strapi/strapi').factories;

module.exports = createCoreController('plugin::users-permissions.me', ({ strapi }) => ({
    mePermissions: async (ctx) => {
        try {

            const user = ctx.state.user;
            if (!user) {
                return ctx.unauthorized("You must be logged in");
            }

            // Fetch the user's app_accesses relation
            const fullUser = await strapi.query("plugin::users-permissions.user").findOne({
                where: { id: user.id },
                populate: { app_accesses: { select: ['key'] } },
            });

            const permissions = await strapi.query("plugin::users-permissions.permission").findMany({
                where: { role: { id: user.role.id } },
                populate: false,
                select: ['action'],
            });

            const appAccess = (fullUser?.app_accesses || []).map(a => a.key);
            const isAdmin = appAccess.includes('auth');

            const data = {
                role: user.role.name,
                appAccess,
                permissions: permissions.map(p => p.action),
                isAdmin,
            }
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