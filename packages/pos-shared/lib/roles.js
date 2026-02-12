/**
 * Role-to-app mapping and cross-app URL utilities.
 *
 * Roles (Strapi users-permissions plugin):
 *   - "Admin"         → full access to all apps
 *   - "Stock Manager" → pos-stock
 *   - "Sales Clerk"   → pos-sale
 *   - "Authenticated" → default, no app access until assigned a specific role
 */

/** Base URLs for each app — read from env or fall back to localhost defaults */
export const APP_URLS = {
    auth:  process.env.NEXT_PUBLIC_AUTH_URL  || 'http://localhost:3003',
    stock: process.env.NEXT_PUBLIC_STOCK_URL || 'http://localhost:3001',
    sale:  process.env.NEXT_PUBLIC_SALE_URL  || 'http://localhost:3002',
};

/** Which apps each role can access */
const ROLE_ACCESS = {
    'Admin':         ['stock', 'sale'],
    'Stock Manager': ['stock'],
    'Sales Clerk':   ['sale'],
};

/**
 * Return the list of app keys the given role can access.
 * @param {string} role - Strapi role name
 * @returns {string[]} e.g. ['stock', 'sale']
 */
export function getAllowedApps(role) {
    return ROLE_ACCESS[role] || [];
}

/**
 * Return the primary app URL to redirect to after login.
 * @param {string} role
 * @returns {string}
 */
export function getHomeUrl(role) {
    const apps = getAllowedApps(role);
    if (apps.length === 0) return APP_URLS.auth;
    return APP_URLS[apps[0]];
}

/**
 * Check if a role grants access to the given app key.
 * @param {string} role
 * @param {string} appKey - 'stock' | 'sale' | 'auth'
 * @returns {boolean}
 */
export function canAccessApp(role, appKey) {
    if (appKey === 'auth') return true;
    return getAllowedApps(role).includes(appKey);
}

/**
 * Build navigation cross-links for the current user's role.
 * @param {string} role
 * @param {string} currentApp - the app key we're currently in
 * @returns {{ label: string, href: string, key: string }[]}
 */
export function getCrossAppLinks(role, currentApp) {
    const links = [];
    const allowed = getAllowedApps(role);
    const labels = {
        stock: '📦 Stock Management',
        sale:  '🛒 Point of Sale',
    };

    for (const appKey of allowed) {
        if (appKey !== currentApp) {
            links.push({
                key: appKey,
                label: labels[appKey] || appKey,
                href: APP_URLS[appKey],
            });
        }
    }
    return links;
}
