const fs = require('fs');
const path = require('path');

function readJsonSafe(filePath, fallback = {}) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
        return fallback;
    }
}

function loadApiProviderConfiguration() {
    const domains = require('@rutba/api-provider/config/domains');
    const publicResources = require('@rutba/api-provider/config/public-resources');

    const domainsPath = require.resolve('@rutba/api-provider/config/domains');
    const configRoot = path.dirname(domainsPath);
    const resourcesDir = path.join(configRoot, 'resources');

    const resources = {};
    if (fs.existsSync(resourcesDir)) {
        const files = fs.readdirSync(resourcesDir).filter((name) => name.toLowerCase().endsWith('.json'));
        for (const fileName of files) {
            const item = readJsonSafe(path.join(resourcesDir, fileName), null);
            if (!item || typeof item.uid !== 'string') continue;
            resources[item.uid] = item.policies || {};
        }
    }

    return {
        domains,
        publicResources,
        resources,
    };
}

// ── Derive bypass paths and domains from api-provider config ─────────────────
// publicResources keys are "METHOD /path" — extract unique paths only.
// These routes bypass the api-guard-pro interceptor (no auth required).
const _apiConfig = loadApiProviderConfiguration();

const PUBLIC_BYPASS_PATHS = [...new Set(
    Object.keys(_apiConfig.publicResources || {}).map((key) => {
        // key format: "GET /api/orders/checkout" — take the path portion
        const parts = key.trim().split(/\s+/);
        const rawPath = parts.length >= 2 ? parts[1] : parts[0];
        // strip trailing param segments so prefix matching covers all variants
        return rawPath.replace(/:[\w]+$/, '').replace(/\/$/, '') || rawPath;
    })
)];

const FIXED_BYPASS_PATHS = [
    '/api/auth',
    '/api/users/me',
    '/api/me/permissions',
    '/api/users-permissions/me/permissions',
    '/api/api-guard-pro/me/permissions',
    '/api/me/stock-items-search',
    '/api/users-permissions/me/stock-items-search',
    '/uploads',
    '/users-permissions',
];

const ALL_BYPASS_PATHS = [...new Set([...FIXED_BYPASS_PATHS, ...PUBLIC_BYPASS_PATHS])];

// domains from configuration.json (used by plugin setup service for upsert)
const DOMAINS_FROM_CONFIG = Object.entries(_apiConfig.domains || {}).map(([key, d]) => ({
    key,
    name: d?.name || key,
    ...(d?.aliasKeys ? { aliasKeys: d.aliasKeys } : {}),
}));

module.exports = ({ env }) => ({
    "strapi-content-sync-pro": {
        enabled: true,
    },

    'api-guard-pro': {
        enabled: true,
        config: {
            interceptorEnabled: true,
            denyByDefault: true,

            // ── Header bridging ─────────────────────────────────────
            headerDomainKey: 'x-rutba-app',
            headerElevatedKey: 'x-rutba-app-admin',

            // ── Enforcement mode ────────────────────────────────────
            // Switch to 'enforce' once all resources/policies/grants are verified.
            enforcementMode: 'hybrid',

            // ── Owner scoping ───────────────────────────────────────
            enforceOwnership: true,

            // ── Bypass paths ────────────────────────────────────────
            // Fixed system paths + public routes from api-provider/config/configuration.json
            bypassPaths: ALL_BYPASS_PATHS,

            // ── Domains ─────────────────────────────────────────────
            // Driven from api-provider/config/configuration.json — no manual list needed.
            domains: DOMAINS_FROM_CONFIG,
        },
    },

    email: {
        config: {
            provider: 'nodemailer',
            providerOptions: {
                host: env('EMAIL_HOST', 'smtp.gmail.com'),
                port: env.int('EMAIL_PORT', 587),
                auth: {
                    user: env('EMAIL_USER', ''),
                    pass: env('EMAIL_PASS', ''),
                },
            },
            settings: {
                defaultFrom: env('EMAIL_FROM', 'noreply@rutba.pk'),
                defaultReplyTo: env('EMAIL_FROM', 'noreply@rutba.pk'),
            },
        },
    },
    'users-permissions': {
        config: {
            register: {
                allowedFields: ['displayName','api_guard_roles'], // add your custom fields here
            },
            jwtManagement: 'refresh',
            sessions: {
                accessTokenLifespan: toSeconds(env('UP_ACCESS_TOKEN_LIFESPAN', '120m'), 7200),
                maxRefreshTokenLifespan: toSeconds(env('UP_MAX_REFRESH_TOKEN_LIFESPAN', '30d'), 2592000),
                idleRefreshTokenLifespan: toSeconds(env('UP_IDLE_REFRESH_TOKEN_LIFESPAN', '30d'), 2592000),
            },
        },
    },
    upload: {
        config: {
            sizeLimit: env.int('UPLOAD_MAX_FILE_SIZE', 250 * 1024 * 1024), // 250 MB default
        },
    },
});



function toSeconds(value, fallback) {
    const v = String(value ?? fallback).trim().toLowerCase();
    const match = v.match(/^(\d+)([smhd]?)$/);

    if (!match) return fallback;

    const amount = Number(match[1]);
    const unit = match[2] || 's';

    switch (unit) {
        case 'm': return amount * 60;
        case 'h': return amount * 60 * 60;
        case 'd': return amount * 24 * 60 * 60;
        default: return amount;
    }
}
