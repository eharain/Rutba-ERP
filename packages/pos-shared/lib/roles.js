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
    stock:      { icon: 'fa-solid fa-boxes-stacked',    label: 'Stock Management',  description: 'Products, purchases, inventory',             border: 'border-primary',   color: 'text-primary' },
    sale:       { icon: 'fa-solid fa-cash-register',    label: 'Point of Sale',     description: 'Sales, cart, returns, reports',               border: 'border-success',   color: 'text-success' },
    'web-user': { icon: 'fa-solid fa-bag-shopping',     label: 'My Orders',         description: 'Track orders, manage returns',                border: 'border-info',      color: 'text-info' },
    crm:        { icon: 'fa-solid fa-handshake',        label: 'CRM',              description: 'Contacts, leads, activities',                  border: 'border-warning',   color: 'text-warning' },
    hr:         { icon: 'fa-solid fa-users',            label: 'Human Resources',   description: 'Employees, departments, attendance, leave',   border: 'border-secondary', color: 'text-secondary' },
    accounts:   { icon: 'fa-solid fa-chart-line',       label: 'Accounts',          description: 'Chart of accounts, journals, invoices',       border: 'border-dark',      color: 'text-dark' },
    payroll:    { icon: 'fa-solid fa-money-check-dollar', label: 'Payroll',         description: 'Salary structures, payroll runs, payslips',   border: 'border-danger',    color: 'text-danger' },
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
 * Check if the user is an admin for a given app key.
 * @param {string[]} adminAppAccess - from AuthContext
 * @param {string} appKey - 'stock' | 'sale' | 'hr' | etc.
 * @returns {boolean}
 */
export function isAppAdmin(adminAppAccess, appKey) {
    if (!adminAppAccess || !appKey) return false;
    return Array.isArray(adminAppAccess) && adminAppAccess.includes(appKey);
}

/**
 * Build navigation cross-links for the current user.
 * Shows all recognised apps (except the current one) so the Switch App
 * dropdown is consistent across every app.  Apps the user does NOT have
 * access to are still listed but marked with `disabled: true` so the UI
 * can grey them out or hide them as needed.
 * @param {string[]} appAccess
 * @param {string} currentApp - the app key we're currently in
 * @returns {{ label: string, href: string, key: string, disabled: boolean }[]}
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

    for (const appKey of VALID_APP_KEYS) {
        if (appKey !== currentApp && APP_URLS[appKey]) {
            links.push({
                key: appKey,
                label: labels[appKey] || appKey,
                href: APP_URLS[appKey],
                disabled: !allowed.includes(appKey),
            });
        }
    }
    return links;
}

//// Silently show a "Delete All" button only to admins
//<PermissionCheck showIf="admin">
//    <button onClick={deleteAll}>Delete All Records</button>
//</PermissionCheck>

//// Block the entire page for non-admins with a message
//<PermissionCheck adminOnly>
//    <AdminDashboard />
//</PermissionCheck>

//// Combine admin check with permission check
//<PermissionCheck showIf="admin" required="api::sale.sale.delete">
//    <button>Force Delete Sale</button>
//</PermissionCheck>

//// Check admin for a specific app (not the current one)
//<PermissionCheck showIf="admin" appKey="stock">
//    <button>Manage Stock Settings</button>
//</PermissionCheck>
