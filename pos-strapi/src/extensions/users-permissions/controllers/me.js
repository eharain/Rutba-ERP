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

            // ── Load user with Strapi role + AGP roles (with their domains) ──
            const fullUser = await strapi.db.query('plugin::users-permissions.user').findOne({
                where: { id: user.id },
                populate: {
                    role: { select: ['type', 'name', 'id'] },
                    api_guard_roles: {
                        populate: { domains: true },
                    },
                },
            });

            const roleType = fullUser?.role?.type;
            const guardRoles = fullUser?.api_guard_roles || [];

            // ── Build unique domain list from assigned guard roles ─────────────
            const domains = [];
            const guardRoleKeys = [];

            for (const role of guardRoles) {
                if (!role.isActive) continue;
                guardRoleKeys.push(role.key);
                for (const domain of role.domains || []) {
                    if (!domains.find((d) => d.key === domain.key)) {
                        domains.push({ key: domain.key, name: domain.name, roleKey: role.key });
                    }
                }
            }

            // ── Load active policies granted to resolved roles ────────────────
            let permissions = {};
            if (guardRoleKeys.length) {
                const knex = strapi.db.connection;
                const policyRows = await knex('guard_policies')
                    .join('guard_policies_grants_lnk', 'guard_policies_grants_lnk.policy_id', 'guard_policies.id')
                    .join('guard_roles', 'guard_roles.id', 'guard_policies_grants_lnk.role_id')
                    .whereIn('guard_roles.key', guardRoleKeys)
                    .where('guard_policies.is_active', true)
                    .select(
                        'guard_policies.key',
                        'guard_policies.content_type_uid as contentTypeUid',
                        'guard_policies.action_name as actionName',
                        'guard_policies.query',
                        'guard_policies.filters',
                        'guard_policies.body'
                    )
                    .catch(() => []);

                for (const policy of policyRows) {
                    const ctUid = policy.contentTypeUid;
                    const action = policy.actionName;
                    if (!ctUid || !action) continue;
                    if (!permissions[ctUid]) permissions[ctUid] = {};
                    if (!permissions[ctUid][action]) {
                        permissions[ctUid][action] = { allowed: true, policies: [] };
                    }
                    // Deduplicate by policy key
                    if (!permissions[ctUid][action].policies.find((p) => p.key === policy.key)) {
                        permissions[ctUid][action].policies.push({
                            key: policy.key,
                            query: typeof policy.query === 'string' ? JSON.parse(policy.query) : (policy.query || {}),
                            filters: typeof policy.filters === 'string' ? JSON.parse(policy.filters) : (policy.filters || {}),
                            body: typeof policy.body === 'string' ? JSON.parse(policy.body) : (policy.body || {}),
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