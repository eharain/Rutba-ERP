// @ts-nocheck
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
        const domainsPath = require.resolve('@rutba/api-provider/config/domains');
        const packageRoot = path.dirname(path.dirname(domainsPath));
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
    '/api/api-pro/me/permissions',
    '/api/me/stock-items-search',
    '/api/users-permissions/me/stock-items-search',
    '/api/cash-registers/active',
    '/api/cash-registers/open',
    '/api/cash-registers',
    '/api/cms-bulk',
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

    // ── api-pro plugin ──────────────────────────────────────────────
    // Auto-discovered from node_modules (api-pro is declared as a
    // file: dependency in package.json — Strapi reads pkg.strapi.name='api-pro'
    // and registers it). We deliberately DO NOT set `resolve` here:
    //
    //   • If `resolve` is a directory, Strapi's server loader does
    //     path.dirname(require.resolve(<dir>)) which follows the package's
    //     `main` field into `<dir>/dist/server/index.js` and dirname's the
    //     parent — leaving pathToPlugin pointing INSIDE dist/server. The
    //     loader then appends the `./strapi-server` export on top
    //     (`./dist/server/index.js`) producing a non-existent doubled path,
    //     and silently skips the plugin with no log.
    //   • If `resolve` points to package.json, the server loader works but
    //     the ADMIN loader treats `plugin.path` as a directory and does
    //     `path.join(<file>, 'package.json')` — which produces an invalid
    //     path that doesn't exist, so the plugin is omitted from
    //     `.strapi/client/app.js` and the sidebar icon never appears.
    //
    // Auto-discovery avoids both bugs because it passes `package.json` as
    // the resolve value AND the admin loader's `plugin.path` branch is not
    // taken for `type: 'module'` plugins.
    // 'api-pro': {
    //     enabled: true,
    //     config: {
    //         interceptorEnabled: true,
    //         denyByDefault: true,

    //         // ── Header bridging ─────────────────────────────────────
    //         // Client sends two authorization headers:
    //         //   x-rutba-app       — which app/domain the user is acting in
    //         //   x-rutba-app-role  — which of the user's roles for that app
    //         //                        the user is currently playing (admin /
    //         //                        cashier / accountant / etc.). Required
    //         //                        when the user holds more than one role
    //         //                        for the active app.
    //         headerDomainKey: 'x-rutba-app',
    //         headerRoleKey: 'x-rutba-app-role',

    //         // ── Enforcement mode ────────────────────────────────────
    //         // Switch to 'enforce' once all resources/policies/grants are verified.
    //         enforcementMode: 'hybrid',

    //         // ── Owner scoping ───────────────────────────────────────
    //         enforceOwnership: true,

    //         // ── Bypass paths ────────────────────────────────────────
    //         // Fixed system paths + public routes from api-provider/config/configuration.json
    //         bypassPaths: ALL_BYPASS_PATHS,

    //         // ── Domains ─────────────────────────────────────────────
    //         // Driven from api-provider/config/configuration.json — no manual list needed.
    //         domains: DOMAINS_FROM_CONFIG,
    //     },
    // },

    // ── strapi-content-sync-pro ──────────────────────────────────────
    // Linked from D:\Rutba\strapi-plugins\strapi-content-sync-pro via the
    // file: dependency in package.json. Auto-discovered by Strapi
    // (pkg.strapi.kind === 'plugin'), so this block is just an explicit
    // on/off toggle — flip enabled to false to load Strapi without it
    // without touching the dep.
    'strapi-content-sync-pro': {
        enabled: true,
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
                allowedFields: ['displayName','app_roles'], // add your custom fields here
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
