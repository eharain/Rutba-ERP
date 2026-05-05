'use strict';

/**
 * api-guard-seed.js
 *
 * Idempotent bootstrap seeder for strapi-api-guard-pro.
 *
 * Seeded entities (all upserted via key — safe to run on every restart):
 *   1. Resources  — one record per HTTP method × route, derived from IMPLEMENTED_ENDPOINT_META
 *                   Each resource carries requestRules from the corresponding *EndpointRules export.
 *   2. Domains    — one per APP_ENTRIES key
 *   3. Roles      — staff / manager / admin per domain
 *   4. Policies   — one per resource × role, carrying the allowed actions from APP_PERMISSION_DEFS
 *   5. Grants     — one per role × policy link
 *
 * Running order matters: resources → domains → roles → policies → grants.
 */

const {
    ENTRIES,
    PERMISSION_GROUPS,
    APP_PERMISSION_DEFS,
} = require('../../../packages/pos-shared/lib/endpoints/access-metadata.js');

let IMPLEMENTED_ENDPOINT_META = [];
let ENDPOINT_RULES_BY_BASE_PATH = {};

async function loadEndpointRegistry(strapi) {
    try {
        const registry = await import('../../../packages/pos-shared/lib/endpoints/registry.js');
        IMPLEMENTED_ENDPOINT_META = registry.IMPLEMENTED_ENDPOINT_META || [];
        ENDPOINT_RULES_BY_BASE_PATH = registry.ENDPOINT_RULES_REGISTRY || {};
        strapi.log.info(`[api-guard-seed] Loaded endpoint registry: ${IMPLEMENTED_ENDPOINT_META.length} metas, ${Object.keys(ENDPOINT_RULES_BY_BASE_PATH).length} rule groups`);
    } catch (err) {
        IMPLEMENTED_ENDPOINT_META = [];
        ENDPOINT_RULES_BY_BASE_PATH = {};
        strapi.log.error(`[api-guard-seed] Failed to load endpoint registry via import(): ${err.message}`);
    }
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * HTTP method for an action name.
 * Custom actions (cancel, publish, open, close, etc.) follow Rutba conventions.
 */
const ACTION_HTTP_METHOD = {
    find: 'GET',
    findOne: 'GET',
    create: 'POST',
    update: 'PUT',
    delete: 'DELETE',
    // Rutba custom actions
    open: 'POST',
    close: 'PUT',
    active: 'GET',
    expire: 'PUT',
    publish: 'PUT',
    unpublish: 'PUT',
    bulk: 'POST',
    process: 'POST',
    orphanGroups: 'GET',
    orphanGroupItems: 'GET',
    transfer: 'POST',
    cancel: 'PUT',
    saveNotes: 'PUT',
    archiveStock: 'POST',
    unarchiveStock: 'POST',
    listVariants: 'GET',
    listWithTerms: 'GET',
    listByProduct: 'GET',
    listByBarcode: 'GET',
    searchByBarcode: 'GET',
    searchByName: 'GET',
    listDraft: 'GET',
    listPublished: 'GET',
    bySlug: 'GET',
    bySlugCheck: 'GET',
    headerData: 'GET',
    byRegister: 'GET',
    byProduct: 'GET',
    byParent: 'GET',
    findByContact: 'GET',
    search: 'GET',
    listAll: 'GET',
    listPaged: 'GET',
    listWithDesks: 'GET',
    createRefund: 'POST',
    checkBarcode: 'GET',
    values: 'GET',
    disconnect: 'PUT',
    localSignIn: 'POST',
    localRegister: 'POST',
    providerCallback: 'GET',
    validateAddress: 'POST',
    shippingRate: 'POST',
    calculateDelivery: 'POST',
    tracking: 'GET',
    getMessages: 'GET',
    sendMessage: 'POST',
};

/**
 * Whether an action is a list (collection) action vs a single-item action.
 */
const ACTION_IS_LIST = {
    find: true,
    findOne: false,
    create: true,
    update: false,
    delete: false,
    open: true,
    close: false,
    active: true,
    expire: false,
    publish: false,
    unpublish: false,
    bulk: true,
    process: true,
    orphanGroups: true,
    orphanGroupItems: true,
    transfer: true,
    cancel: false,
    saveNotes: false,
    archiveStock: false,
    unarchiveStock: false,
    listVariants: true,
    listWithTerms: true,
    listByProduct: true,
    listByBarcode: true,
    searchByBarcode: true,
    searchByName: true,
    listDraft: true,
    listPublished: true,
    bySlug: true,
    bySlugCheck: true,
    headerData: true,
    byRegister: true,
    byProduct: true,
    byParent: true,
    findByContact: true,
    search: true,
    listAll: true,
    listPaged: true,
    listWithDesks: true,
    createRefund: true,
    checkBarcode: true,
    values: true,
    disconnect: false,
    localSignIn: true,
    localRegister: true,
    providerCallback: true,
    validateAddress: true,
    shippingRate: true,
    calculateDelivery: true,
    tracking: true,
    getMessages: false,
    sendMessage: false,
    byId: true, // byId uses list path + injected filters
};

/**
 * Custom path pattern overrides for actions that don't follow the standard /base or /base/:id convention.
 * Keys are endpointName. Value is a function (basePath) => pathPattern or a static string.
 */
const ACTION_PATH_OVERRIDE = {
    // cash-registers
    open: (base) => `/api${base}/open`,
    close: (base) => `/api${base}/:id/close`,
    active: (base) => `/api${base}/active`,
    // stock-items
    orphanGroups: (base) => `/api${base}/orphan-groups`,
    orphanGroupItems: (base) => `/api${base}/orphan-group-items`,
    transfer: (base) => `/api${base}/transfer`,
    // branches
    archiveStock: (base) => `/api${base}/:id/archive-stock`,
    unarchiveStock: (base) => `/api${base}/:id/unarchive-stock`,
    // stock-inputs
    process: (base) => `/api${base}/process`,
    // sale custom
    cancel: (base) => `/api${base}/:id/cancel`,
    saveNotes: (base) => `/api${base}/:id/save-notes`,
    // brands / cms-pages
    publish: (base) => `/api${base}/:id/publish`,
    unpublish: (base) => `/api${base}/:id/unpublish`,
    // stock-items search uses /me custom route
    list: (base) => base === '/stock-items' ? '/api/me/stock-items-search' : `/api${base}`,
    listByProduct: (base) => base === '/stock-items' ? '/api/me/stock-items-search' : `/api${base}`,
    listByBarcode: (base) => base === '/stock-items' ? '/api/me/stock-items-search' : `/api${base}`,
    searchByBarcode: (base) => base === '/stock-items' ? '/api/me/stock-items-search' : `/api${base}`,
    searchByName: (base) => base === '/stock-items' ? '/api/me/stock-items-search' : `/api${base}`,
    // enums
    values: (base) => `/api${base}/:name/:field`,
    // web auth + checkout + delivery custom routes
    localSignIn: () => '/api/auth/local',
    localRegister: () => '/api/auth/local/register',
    providerCallback: () => '/api/auth/:provider/callback',
    validateAddress: () => '/api/orders/checkout/validate-address',
    shippingRate: () => '/api/orders/checkout/shipping-rate',
    calculateDelivery: () => '/api/orders/calculate-delivery',
    tracking: () => '/api/orders/tracking/:documentId',
    getMessages: () => '/api/orders/:documentId/messages',
    sendMessage: () => '/api/orders/:documentId/messages',
};

/**
 * Convert a basePath + endpointName into a stable, unique resource key.
 *
 * Strategy:
 * - Generic list action (find)  → getApi{Slug}
 * - Generic byId path action    → getApi{Slug}Id
 * - Named variant (byId, byRegister, search, etc.) → getApi{Slug}_{endpointName}
 * - POST create                 → postApi{Slug}
 * - PUT update (generic path)   → putApi{Slug}Id
 * - DELETE (generic)            → deleteApi{Slug}Id
 * - Custom actions              → {method}Api{Slug}_{endpointName}
 */
function buildResourceKey(method, basePath, endpointName) {
    const mPart = method.toLowerCase();
    const slug = basePath.replace(/^\//, '').replace(/-/g, '_');
    const cap = slug.charAt(0).toUpperCase() + slug.slice(1);

    const genericListNames = new Set(['list', 'create']);
    const genericIdNames = new Set(['update', 'delete', 'byIdPath']);

    if (endpointName === 'list' && method === 'GET') return `getApi${cap}`;
    if (endpointName === 'create' && method === 'POST') return `postApi${cap}`;
    if (endpointName === 'update' && method === 'PUT') return `putApi${cap}Id`;
    if (endpointName === 'delete' && method === 'DELETE') return `deleteApi${cap}Id`;
    if (endpointName === 'byIdPath' && method === 'GET') return `getApi${cap}Id`;

    // Everything else gets a named suffix
    return `${mPart}Api${cap}_${endpointName}`;
}

/**
 * From an EndpointsMeta object produce resource seed records for every action.
 * Standard CRUD stubs always included; methodActions drives named variants and custom routes.
 */
function metaToResources(meta, rulesMap = {}) {
    if (!meta?.uid || !meta?.basePath) return [];

    const uid = meta.uid;
    const base = meta.basePath;

    const methodActions = meta.methodActions || {};

    // Build the full set of endpoint names to generate resources for.
    // Start with standard CRUD, then add everything in methodActions.
    const endpointNames = new Set([
        'list',
        'byId',      // filter-based GET on collection path
        'byIdPath',  // GET /base/:id
        'create',
        'update',
        'delete',
        ...Object.keys(methodActions),
    ]);

    const resources = [];

    for (const endpointName of endpointNames) {
        // Determine HTTP method
        const method = ACTION_HTTP_METHOD[endpointName] || 'GET';

        // Determine path pattern
        let pathPattern;
        if (ACTION_PATH_OVERRIDE[endpointName]) {
            const override = ACTION_PATH_OVERRIDE[endpointName];
            pathPattern = typeof override === 'function' ? override(base) : override;
        } else {
            const isList = ACTION_IS_LIST[endpointName] !== undefined ? ACTION_IS_LIST[endpointName] : true;
            pathPattern = isList ? `/api${base}` : `/api${base}/:id`;
        }

        const requestRules = rulesMap[endpointName] || {};
        const crudAction = methodActions[endpointName] || endpointName;
        const key = buildResourceKey(method, base, endpointName);

        const isPublic = base === '/auth'
            || base === '/orders/checkout'
            || (base === '/orders' && endpointName === 'calculateDelivery')
            || endpointName === 'tracking'
            || (base === '/crm-leads' && endpointName === 'create');

        resources.push({
            key,
            'route-name': `${method.toLowerCase()}.api${base.replace(/\//g, '.').replace(/-/g, '_')}.${endpointName}`,
            displayName: `${method} ${pathPattern} (${endpointName})`,
            description: `${uid} — ${crudAction} (${endpointName})`,
            type: 'standard',
            method,
            pathPattern,
            contentTypeUid: uid,
            isActive: true,
            isPublic,
            requestRules,
            responseRules: {},
        });
    }

    return resources;
}

// ── CRUD action → HTTP method set (for policy matching) ───────────────────

const CUSTOM_ACTION_MAP = {
    open: 'update', close: 'update', active: 'find', expire: 'update',
    bulk: 'create', process: 'update', publish: 'update', unpublish: 'update',
    orphanGroups: 'find', orphanGroupItems: 'find', transfer: 'create',
    cancel: 'update', saveNotes: 'update',
    archiveStock: 'update', unarchiveStock: 'update',
};

const ACTION_TO_HTTP_METHODS = {
    find: ['GET'],
    findOne: ['GET'],
    create: ['POST'],
    update: ['PUT', 'PATCH'],
    delete: ['DELETE'],
};

function normalizeAction(action) {
    return CUSTOM_ACTION_MAP[action] || action;
}

// ── upsert helper ──────────────────────────────────────────────────────────

async function upsert(strapi, contentType, keyField, key, data, label) {
    const query = strapi.db.query(contentType);
    const existing = await query.findOne({ where: { [keyField]: key } });
    if (!existing) {
        const created = await query.create({ data: { [keyField]: key, ...data } });
        strapi.log.debug(`[api-guard-seed] Created ${label}: ${key}`);
        return { record: created, created: true };
    }
    const updated = await query.update({ where: { id: existing.id }, data });
    return { record: updated, created: false };
}

// ── Phase 0: Promote live router catalog ──────────────────────────────────

async function promoteCatalogRoutes(strapi) {
    const routerStack = strapi.server?.router?.stack;
    if (!Array.isArray(routerStack)) return;

    let created = 0;
    let skipped = 0;
    const errors = [];

    for (const layer of routerStack) {
        const path = typeof layer.path === 'string' ? layer.path : null;
        if (!path || !path.startsWith('/api/')) continue;

        const methods = Object.keys(layer.methods || {})
            .filter((m) => layer.methods[m])
            .map((m) => m.toUpperCase())
            .filter((m) => m !== 'HEAD' && m !== 'OPTIONS');

        for (const method of methods) {
            try {
                const key = (method.toLowerCase() + '.' + path)
                    .replace(/\//g, '.').replace(/[:{}]/g, '')
                    .replace(/\.+/g, '.').replace(/^\.|\.$/g, '');
                if (!key) { skipped++; continue; }

                const existing = await strapi.db.query('plugin::api-guard-pro.resource').findOne({ where: { key } });
                if (existing) { skipped++; continue; }

                const pathSegments = path.split('/').filter(Boolean);
                const collectionSlug = pathSegments[1] || '';
                const ct = Object.values(strapi.contentTypes).find((c) =>
                    !c.plugin && (c.info?.pluralName === collectionSlug || c.info?.singularName === collectionSlug)
                );

                await strapi.db.query('plugin::api-guard-pro.resource').create({
                    data: {
                        key,
                        displayName: `${method} ${path}`,
                        method,
                        pathPattern: path,
                        contentTypeUid: ct?.uid || null,
                        isPublic: false,
                        isActive: true,
                        effect: 'allow',
                        requestRules: {},
                        responseRules: {},
                    },
                });
                created++;
            } catch (err) {
                errors.push({ path, method, error: err.message });
            }
        }
    }

    strapi.log.info(`[api-guard-seed] Phase 0 (catalog): ${created} created, ${skipped} skipped, ${errors.length} errors`);
}

// ── Phase 1: Resources ─────────────────────────────────────────────────────

async function seedResources(strapi) {
    let created = 0;
    let updated = 0;

    for (const meta of IMPLEMENTED_ENDPOINT_META) {
        if (!meta?.uid) continue; // skip upload / no-uid entries
        const rulesMap = ENDPOINT_RULES_BY_BASE_PATH[meta.basePath] || {};
        const resources = metaToResources(meta, rulesMap);

        for (const resource of resources) {
            const key = resource.key;
            const payload = { ...resource };
            delete payload.key;

            const { created: wasCreated } = await upsert(
                strapi,
                'plugin::api-guard-pro.resource',
                'key',
                key,
                payload,
                'resource'
            );
            if (wasCreated) created++; else updated++;
        }
    }

    strapi.log.info(`[api-guard-seed] Resources: ${created} created, ${updated} updated`);
}

// ── Phase 2: Domains ───────────────────────────────────────────────────────

async function seedDomains(strapi) {
    let created = 0;

    // Base domains from APP_ENTRIES metadata.
    const domainsToSeed = [
        ...ENTRIES.map((entry) => ({
            key: entry.key,
            name: entry.name,
            description: `Rutba ERP domain — ${entry.name}`,
            matchKey: 'x-rutba-app',
        })),
        // Explicit storefront domain alias used by rutba-web clients.
        // Keeps api-guard domain list intuitive: "web" and "web-user".
        {
            key: 'web',
            name: 'Web Storefront',
            description: 'Rutba ERP domain — Web Storefront',
            matchKey: 'x-rutba-app',
        },
    ];

    const seen = new Set();
    for (const domain of domainsToSeed) {
        if (seen.has(domain.key)) continue;
        seen.add(domain.key);

        const { created: wasCreated } = await upsert(
            strapi,
            'plugin::api-guard-pro.domain',
            'key',
            domain.key,
            {
                name: domain.name,
                description: domain.description,
                isActive: true,
                matchMode: 'header',
                matchKey: domain.matchKey,
            },
            'domain'
        );
        if (wasCreated) created++;
    }

    strapi.log.info(`[api-guard-seed] Domains: ${created} created`);
}

// ── Phase 3: Guard Roles ───────────────────────────────────────────────────

async function seedGuardRoles(strapi) {
    const domainRecords = await strapi.db.query('plugin::api-guard-pro.domain').findMany({
        where: { isActive: true },
        select: ['id', 'key'],
    });
    const domainIdByKey = new Map(domainRecords.map((d) => [d.key, d.id]));
    const groups = Object.values(PERMISSION_GROUPS).filter((g) => !g.aliasOf);

    let created = 0;

    // Standard app roles from ENTRIES (staff/manager/admin).
    for (const entry of ENTRIES) {
        const domainId = domainIdByKey.get(entry.key);
        if (!domainId) continue;

        for (const group of groups) {
            const roleKey = `${entry.key}-${group.key}`;
            const { created: wasCreated } = await upsert(
                strapi,
                'plugin::api-guard-pro.role',
                'key',
                roleKey,
                {
                    name: `${entry.name} — ${group.label}`,
                    level: group.key === 'admin' ? 'admin' : group.key === 'manager' ? 'manager' : 'staff',
                    description: `Guard role for ${entry.key} ${group.key} users`,
                    isActive: true,
                    domain: domainId,
                },
                'guard role'
            );
            if (wasCreated) created++;
        }
    }

    // Explicit web storefront roles under domain "web".
    // Keeps UI aligned with web-app concepts (public/user) even though role level is "staff".
    const webDomainId = domainIdByKey.get('web');
    if (webDomainId) {
        const webRoles = [
            {
                key: 'web-public',
                name: 'Web Storefront — Public',
                description: 'Public/anonymous storefront access',
                level: 'staff',
            },
            {
                key: 'web-user',
                name: 'Web Storefront — User',
                description: 'Authenticated storefront user access',
                level: 'staff',
            },
        ];

        for (const role of webRoles) {
            const { created: wasCreated } = await upsert(
                strapi,
                'plugin::api-guard-pro.role',
                'key',
                role.key,
                {
                    name: role.name,
                    level: role.level,
                    description: role.description,
                    isActive: true,
                    domain: webDomainId,
                },
                'guard role'
            );
            if (wasCreated) created++;
        }
    }

    strapi.log.info(`[api-guard-seed] Guard roles: ${created} created`);
}

// ── Phase 4: Policies ──────────────────────────────────────────────────────

async function seedPolicies(strapi) {
    const resourceRecords = await strapi.db.query('plugin::api-guard-pro.resource').findMany({
        where: { isActive: true },
        select: ['id', 'key', 'contentTypeUid', 'method', 'isPublic'],
    });

    const resourcesByUid = new Map();
    for (const r of resourceRecords) {
        if (!r.contentTypeUid) continue;
        const list = resourcesByUid.get(r.contentTypeUid) || [];
        list.push(r);
        resourcesByUid.set(r.contentTypeUid, list);
    }

    const groups = Object.values(PERMISSION_GROUPS).filter((g) => !g.aliasOf);

    let created = 0;
    let updated = 0;

    for (const entry of ENTRIES) {
        const permDefs = APP_PERMISSION_DEFS[entry.key] || [];

        for (const def of permDefs) {
            const resources = resourcesByUid.get(def.uid) || [];
            if (!resources.length) continue;

            const targetGroups = def.group
                ? groups.filter((g) => g.key === def.group)
                : groups;

            for (const group of targetGroups) {
                for (const resource of resources) {
                    const httpMethod = String(resource.method).toUpperCase();

                    const allowedHttpMethods = new Set(
                        def.actions.flatMap((a) => {
                            const normalized = normalizeAction(a);
                            return ACTION_TO_HTTP_METHODS[normalized] || [];
                        })
                    );

                    if (!allowedHttpMethods.has(httpMethod)) continue;

                    const policyKey = `${entry.key}-${group.key}-${resource.key}`;
                    const { created: wasCreated } = await upsert(
                        strapi,
                        'plugin::api-guard-pro.policy',
                        'key',
                        policyKey,
                        {
                            name: `${entry.key} ${group.key} — ${resource.key}`,
                            description: `Allow ${httpMethod} ${def.uid} for ${group.key} in ${entry.key}`,
                            actions: [httpMethod],
                            effect: 'allow',
                            conditions: [],
                            fields: [],
                            isActive: true,
                            resource: resource.id,
                        },
                        'policy'
                    );
                    if (wasCreated) created++; else updated++;
                }
            }
        }
    }

    // Web domain explicit policies:
    // 1) web-user role gets permissions from APP_PERMISSION_DEFS['web-user']
    // 2) web-public role gets all resources marked isPublic=true
    const webUserDefs = APP_PERMISSION_DEFS['web-user'] || [];
    for (const def of webUserDefs) {
        const resources = resourcesByUid.get(def.uid) || [];
        if (!resources.length) continue;

        for (const resource of resources) {
            const httpMethod = String(resource.method).toUpperCase();
            const allowedHttpMethods = new Set(
                (def.actions || []).flatMap((a) => {
                    const normalized = normalizeAction(a);
                    return ACTION_TO_HTTP_METHODS[normalized] || [];
                })
            );
            if (!allowedHttpMethods.has(httpMethod)) continue;

            const policyKey = `web-user-${resource.key}`;
            const { created: wasCreated } = await upsert(
                strapi,
                'plugin::api-guard-pro.policy',
                'key',
                policyKey,
                {
                    name: `web user — ${resource.key}`,
                    description: `Allow ${httpMethod} ${def.uid} for web-user`,
                    actions: [httpMethod],
                    effect: 'allow',
                    conditions: [],
                    fields: [],
                    isActive: true,
                    resource: resource.id,
                },
                'policy'
            );
            if (wasCreated) created++; else updated++;
        }
    }

    for (const resource of resourceRecords) {
        if (!resource.isPublic) continue;
        const httpMethod = String(resource.method).toUpperCase();

        const policyKey = `web-public-${resource.key}`;
        const { created: wasCreated } = await upsert(
            strapi,
            'plugin::api-guard-pro.policy',
            'key',
            policyKey,
            {
                name: `web public — ${resource.key}`,
                description: `Allow ${httpMethod} public access for web domain`,
                actions: [httpMethod],
                effect: 'allow',
                conditions: [],
                fields: [],
                isActive: true,
                resource: resource.id,
            },
            'policy'
        );
        if (wasCreated) created++; else updated++;
    }

    strapi.log.info(`[api-guard-seed] Policies: ${created} created, ${updated} updated`);
}

// ── Phase 5: Grants ────────────────────────────────────────────────────────

async function seedGrants(strapi) {
    const roleRecords = await strapi.db.query('plugin::api-guard-pro.role').findMany({
        where: { isActive: true },
        select: ['id', 'key'],
    });
    const roleIdByKey = new Map(roleRecords.map((r) => [r.key, r.id]));

    const policyRecords = await strapi.db.query('plugin::api-guard-pro.policy').findMany({
        where: { isActive: true },
        select: ['id', 'key'],
    });

    let created = 0;

    for (const policy of policyRecords) {
        // policy.key pattern: {domainKey}-{groupKey}-{resourceKey}
        // role.key pattern:   {domainKey}-{groupKey}
        // Derive role key by trying progressively shorter prefixes (handles multi-segment domain keys)
        const parts = policy.key.split('-');
        if (parts.length < 3) continue;

        let matchedRoleId = null;
        for (let splitAt = parts.length - 1; splitAt >= 2; splitAt--) {
            const candidateRoleKey = parts.slice(0, splitAt).join('-');
            if (roleIdByKey.has(candidateRoleKey)) {
                matchedRoleId = roleIdByKey.get(candidateRoleKey);
                break;
            }
        }

        if (!matchedRoleId) continue;

        const grantKey = `grant-${policy.key}`;
        const existing = await strapi.db.query('plugin::api-guard-pro.grant').findOne({ where: { key: grantKey } });
        if (!existing) {
            await strapi.db.query('plugin::api-guard-pro.grant').create({
                data: {
                    key: grantKey,
                    isActive: true,
                    role: matchedRoleId,
                    policy: policy.id,
                },
            });
            created++;
        }
    }

    strapi.log.info(`[api-guard-seed] Grants: ${created} created`);
}

// ── Main export ────────────────────────────────────────────────────────────

module.exports = async function seedApiGuard(strapi) {
    if (!strapi.plugin('api-guard-pro')) {
        strapi.log.warn('[api-guard-seed] api-guard-pro plugin not found — skipping seed');
        return;
    }

    await loadEndpointRegistry(strapi);

    const phases = [
        ['Phase 0 (catalog)', promoteCatalogRoutes],
        ['Resources', seedResources],
        ['Domains', seedDomains],
        ['Guard roles', seedGuardRoles],
        ['Policies', seedPolicies],
        ['Grants', seedGrants],
    ];

    for (const [label, fn] of phases) {
        try {
            await fn(strapi);
        } catch (err) {
            strapi.log.error(`[api-guard-seed] ${label} failed: ${err.message}`);
            strapi.log.error(err.stack);
        }
    }

    strapi.log.info('[api-guard-seed] api-guard-pro seed complete ✓');
};