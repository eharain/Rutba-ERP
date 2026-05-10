const fs = require('fs');
const path = require('path');

function loadApiProviderDomains() {
    const domains = require('@rutba/api-provider/config/domains');

    return { domains };
}

function normalizeBypassPath(rawPath) {
    const withApiPrefix = rawPath.startsWith('/') ? rawPath : `/api/${rawPath}`;
    const withoutQuery = withApiPrefix.split('?')[0];
    return withoutQuery.replace(/\/\$\{[^}]+\}/g, ':param').replace(/\/+$/, '') || withoutQuery;
}

function buildPublicBypassPathsFromApiProviderWeb() {
    const paths = new Set();

    try {
        const packageJsonPath = require.resolve('@rutba/api-provider/package.json');
        const packageRoot = path.dirname(packageJsonPath);
        const webApiDir = path.join(packageRoot, 'api', 'web');

        if (!fs.existsSync(webApiDir)) return [];

        const files = fs
            .readdirSync(webApiDir)
            .filter((name) => name.toLowerCase().endsWith('.js') && name !== 'index.js')
            .sort((a, b) => a.localeCompare(b));

        const pathRegex = /path\s*:\s*(?:`([^`]+)`|'([^']+)'|"([^"]+)")/g;

        for (const fileName of files) {
            const content = fs.readFileSync(path.join(webApiDir, fileName), 'utf8');

            let match;
            while ((match = pathRegex.exec(content))) {
                const candidate = (match[1] || match[2] || match[3] || '').trim();
                if (!candidate) continue;
                paths.add(normalizeBypassPath(candidate));
            }
        }
    } catch {
        return [];
    }

    return [...paths];
}

// ── Derive bypass paths and domains from api-provider source ─────────────────
const _apiConfig = loadApiProviderDomains();

const PUBLIC_BYPASS_PATHS = buildPublicBypassPathsFromApiProviderWeb();

const FIXED_BYPASS_PATHS = [
    '/api/auth',
    '/api/users/me',
    '/api/me/permissions',
    '/api/users-permissions/me/permissions',
    '/api/api-guard-pro/me/permissions',
    '/api/me/stock-items-search',
    '/api/users-permissions/me/stock-items-search',
    '/api/cash-registers/active',
    '/api/cash-registers/open',
    '/api/cash-registers',
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
