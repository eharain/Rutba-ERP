// @ts-nocheck
'use strict';
const { createCoreController } = require('@strapi/strapi').factories;

const DEFAULT_SESSION_TIMEOUT = 300;

module.exports = createCoreController('plugin::users-permissions.me', ({ strapi }) => ({
    mePermissions: async (ctx) => {
        try {
            const user = ctx.state.user;
            if (!user) {
                return ctx.unauthorized("You must be logged in");
            }

            // ── Load user with Strapi role + API-Pro app roles (with their domains) ──
            const fullUser = await strapi.db.query('plugin::users-permissions.user').findOne({
                where: { id: user.id },
                populate: {
                    role: { select: ['type', 'name', 'id'] },
                    app_roles: {
                        populate: { appDomains: true },
                    },
                },
            });

            const roleType = fullUser?.role?.type;
            const appRoles = fullUser?.app_roles || [];

            // ── Build domain list: one entry per (domain × role) pair ────────
            // The client (pos-shared AuthContext) derives rolesByApp from
            // this array, so emitting only the first role per domain would
            // hide the user's other roles from the RoleSwitcher.
            const domains = [];
            const seenDomainRole = new Set();
            const appRoleKeys = [];

            for (const role of appRoles) {
                if (!role.isActive) continue;
                appRoleKeys.push(role.key);
                for (const domain of role.appDomains || []) {
                    const dedupeKey = `${domain.key}|${role.key}`;
                    if (seenDomainRole.has(dedupeKey)) continue;
                    seenDomainRole.add(dedupeKey);
                    domains.push({ key: domain.key, name: domain.name, roleKey: role.key });
                }
            }

            // ── Load active method policies granted to resolved app roles ─────
            let permissions = {};
            if (appRoleKeys.length) {
                const knex = strapi.db.connection;
                const policyRows = await knex('api_pro_method_policies')
                    .join('api_pro_interface_methods', 'api_pro_interface_methods.id', 'api_pro_method_policies.interface_method_id')
                    .join('api_pro_interfaces', 'api_pro_interfaces.id', 'api_pro_interface_methods.api_interface_id')
                    .whereIn('api_pro_method_policies.role_key', appRoleKeys)
                    .select(
                        'api_pro_method_policies.key',
                        'api_pro_interfaces.uid',
                        'api_pro_interface_methods.action',
                        'api_pro_method_policies.query_template',
                        'api_pro_method_policies.filters_template',
                        'api_pro_method_policies.body_template'
                    )
                    .catch(() => []);

                for (const policy of policyRows) {
                    const ctUid = policy.uid;
                    const action = policy.action;
                    if (!ctUid || !action) continue;
                    if (!permissions[ctUid]) permissions[ctUid] = {};
                    if (!permissions[ctUid][action]) {
                        permissions[ctUid][action] = { allowed: true, policies: [] };
                    }
                    // Deduplicate by policy key
                    if (!permissions[ctUid][action].policies.find((p) => p.key === policy.key)) {
                        permissions[ctUid][action].policies.push({
                            key: policy.key,
                            query: typeof policy.query_template === 'string' ? JSON.parse(policy.query_template) : (policy.query_template || {}),
                            filters: typeof policy.filters_template === 'string' ? JSON.parse(policy.filters_template) : (policy.filters_template || {}),
                            body: typeof policy.body_template === 'string' ? JSON.parse(policy.body_template) : (policy.body_template || {}),
                        });
                    }
                }
            }

            // ── Strapi role permissions for non-app users ─────────────────────
            let strapiPermissions = [];
            if (roleType !== 'rutba_app_user' && fullUser?.role?.id) {
                const rolePerms = await strapi.db.query('plugin::users-permissions.permission').findMany({
                    where: { role: { id: fullUser.role.id } },
                    populate: false,
                    select: ['action'],
                });
                strapiPermissions = rolePerms.map((p) => p.action);
            }

            ctx.send({
                role: fullUser?.role?.name,
                roleType,
                domains,
                appRoles: appRoles.map((r) => ({ key: r.key, name: r.name || r.key })),
                permissions,
                strapiPermissions,
                sessionTimeout: DEFAULT_SESSION_TIMEOUT,
            });
        } catch (err) {
            strapi.log.error(`[me/permissions] Error: ${err.message}`);
            ctx.internalServerError("Error fetching permissions");
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