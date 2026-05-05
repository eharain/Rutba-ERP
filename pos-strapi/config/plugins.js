
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
            // Must match the headers the Rutba front-end apps actually send.
            headerDomainKey: 'x-rutba-app',        // was defaulting to 'x-app-name' — wrong
            headerElevatedKey: 'x-rutba-app-admin', // was defaulting to 'x-app-admin'  — wrong

            // ── Enforcement mode ────────────────────────────────────
            // 'hybrid': if no guard grant matches, fall back to users-permissions.
            // Keep as 'hybrid' during migration; switch to 'enforce' when
            // all resources, domains, roles, policies and grants are seeded.
            enforcementMode: 'hybrid',

            // ── Owner scoping ───────────────────────────────────────
            // When true the interceptor auto-injects owners filters for
            // content-types that have an `owners` relation, mirroring the
            // behaviour of app-access-guard for non-elevated users.
            enforceOwnership: true,

            bypassPaths: [
                '/api/auth',
                '/api/users/me',
                '/api/me/permissions',
                '/api/me/stock-items-search',
                '/upload',
                '/users-permissions',
            ],

            // ── Domains ─────────────────────────────────────────────
            // Seeded by the plugin setup service on every restart (upsert — safe to re-run).
            // Mirrors APP_ENTRIES in packages/pos-shared/lib/endpoints/access-metadata.js.
            // aliasKeys are resolved by the permission engine to widen grant lookups
            // when one app key should also inherit another domain's grants.
            domains: [
                { key: 'stock',            name: 'Stock Management'    },
                { key: 'order-management', name: 'Order Management',   aliasKeys: ['delivery', 'cms'] },
                { key: 'sale',             name: 'Point of Sale'       },
                { key: 'accounts',         name: 'Accounting'          },
                { key: 'accounts-ap',      name: 'Accounts Payable'    },
                { key: 'accounts-ar',      name: 'Accounts Receivable' },
                { key: 'accounts-viewer',  name: 'Accounting Viewer'   },
                { key: 'delivery',         name: 'Delivery'            },
                { key: 'rider',            name: 'Rider App',          aliasKeys: ['delivery'] },
                { key: 'crm',              name: 'CRM'                 },
                { key: 'auth',             name: 'User Management'     },
                { key: 'web-user',         name: 'Web Orders',         aliasKeys: ['web-user'] },
                { key: 'hr',               name: 'Human Resources'     },
                { key: 'payroll',          name: 'Payroll'             },
                { key: 'cms',              name: 'Content Management'  },
                { key: 'social',           name: 'Social Media'        },
            ],
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
                allowedFields: ['displayName', "isStaff"], // add your custom fields here
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
