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
    auth:      process.env.NEXT_PUBLIC_AUTH_URL      || 'http://localhost:3003',
    stock:     process.env.NEXT_PUBLIC_STOCK_URL     || 'http://localhost:3001',
    sale:      process.env.NEXT_PUBLIC_SALE_URL      || 'http://localhost:3002',
    'web-user': process.env.NEXT_PUBLIC_WEB_USER_URL || 'http://localhost:3004',
    crm:       process.env.NEXT_PUBLIC_CRM_URL       || 'http://localhost:3005',
    hr:        process.env.NEXT_PUBLIC_HR_URL        || 'http://localhost:3006',
    accounts:  process.env.NEXT_PUBLIC_ACCOUNTS_URL  || 'http://localhost:3007',
    payroll:   process.env.NEXT_PUBLIC_PAYROLL_URL   || 'http://localhost:3008',
};

/** All recognised app keys */
const VALID_APP_KEYS = ['stock', 'sale', 'auth', 'web-user', 'crm', 'hr', 'accounts', 'payroll'];

/**
 * Metadata for each app — icon (FontAwesome class), display label,
 * short description, and Bootstrap border-colour class.
 * Used by the auth home page cards and anywhere else that needs
 * a consistent catalogue of apps.
 */
export const APP_META = {
    stock:      { icon: 'fas fa-boxes',          label: 'Stock Management',  description: 'Products, purchases, inventory',             border: 'border-primary',   color: 'text-primary' },
    sale:       { icon: 'fas fa-cash-register',  label: 'Point of Sale',     description: 'Sales, cart, returns, reports',               border: 'border-success',   color: 'text-success' },
    'web-user': { icon: 'fas fa-shopping-bag',   label: 'My Orders',         description: 'Track orders, manage returns',                border: 'border-info',      color: 'text-info' },
    crm:        { icon: 'fas fa-handshake',      label: 'CRM',              description: 'Contacts, leads, activities',                  border: 'border-warning',   color: 'text-warning' },
    hr:         { icon: 'fas fa-users',          label: 'Human Resources',   description: 'Employees, departments, attendance, leave',   border: 'border-secondary', color: 'text-secondary' },
    accounts:   { icon: 'fas fa-chart-line',     label: 'Accounts',          description: 'Chart of accounts, journals, invoices',       border: 'border-dark',      color: 'text-dark' },
    payroll:    { icon: 'fas fa-money-check-alt', label: 'Payroll',          description: 'Salary structures, payroll runs, payslips',   border: 'border-danger',    color: 'text-danger' },
};

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
        auth:       '🔐 User Management',
        stock:      '📦 Stock Management',
        sale:       '🛒 Point of Sale',
        'web-user': '🛍️ My Orders',
        crm:        '🤝 CRM',
        hr:         '👥 HR',
        accounts:   '📊 Accounts',
        payroll:    '💰 Payroll',
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
