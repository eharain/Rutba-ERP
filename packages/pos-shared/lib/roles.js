/**
 * App-access utilities for cross-app navigation and role-based routing.
 *
 * App access is controlled per-user via the App Access content type
 * linked to users in Strapi.  Valid keys: "stock", "sale", "auth".
 *
 * Example appAccess arrays:
 *   ["stock"]                → stock management only
 *   ["sale"]                 → point of sale only
 *   ["stock", "sale"]        → both apps
 *   ["stock", "sale", "auth"] → all apps + user management
 */

/** Base URLs for each app — read from env or fall back to localhost defaults */
export const APP_URLS = { 
    auth:  process.env.NEXT_PUBLIC_AUTH_URL  || 'http://localhost:3003',
    stock: process.env.NEXT_PUBLIC_STOCK_URL || 'http://localhost:3001',
    sale:  process.env.NEXT_PUBLIC_SALE_URL  || 'http://localhost:3002',
};

/** All recognised app keys */
const VALID_APP_KEYS = ['stock', 'sale', 'auth'];

/**
 * Normalise the raw appAccess value (from the API / cookie) into a
 * guaranteed string array of valid app keys.
 * @param {unknown} appAccess
 * @returns {string[]}
 */
export function normalizeAppAccess(appAccess) {
    if (!appAccess) return [];
    const arr = Array.isArray(appAccess) ? appAccess : [];
    return arr.filter(k => VALID_APP_KEYS.includes(k));
}

/**
 * Return the list of app keys the user can access.
 * @param {string[]} appAccess - from AuthContext
 * @returns {string[]}
 */
export function getAllowedApps(appAccess) {
    return normalizeAppAccess(appAccess);
}

/**
 * Return the primary app URL to redirect to after login.
 * @param {string[]} appAccess
 * @returns {string}
 */
export function getHomeUrl(appAccess) {
    const apps = getAllowedApps(appAccess);
    if (apps.length === 0) return APP_URLS.auth;
    return APP_URLS[apps[0]];
}

/**
 * Check if the user has access to the given app key.
 * @param {string[]} appAccess
 * @param {string} appKey - 'stock' | 'sale' | 'auth'
 * @returns {boolean}
 */
export function canAccessApp(appAccess, appKey) {
    return getAllowedApps(appAccess).includes(appKey);
}

/**
 * Build navigation cross-links for the current user.
 * @param {string[]} appAccess
 * @param {string} currentApp - the app key we're currently in
 * @returns {{ label: string, href: string, key: string }[]}
 */
export function getCrossAppLinks(appAccess, currentApp) {
    const links = [];
    const allowed = getAllowedApps(appAccess);
    const labels = {
        auth:  '🔐 User Management',
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
