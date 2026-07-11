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
    auth:      process.env.NEXT_PUBLIC_AUTH_URL      || 'http://localhost:4003',
    stock:     process.env.NEXT_PUBLIC_STOCK_URL     || 'http://localhost:4001',
    sale:      process.env.NEXT_PUBLIC_SALE_URL      || 'http://localhost:4002',
    'web-user': process.env.NEXT_PUBLIC_WEB_USER_URL || 'http://localhost:4004',
    'order-management': process.env.NEXT_PUBLIC_ORDER_MANAGEMENT_URL || 'http://localhost:4013',
    rider:     process.env.NEXT_PUBLIC_RIDER_URL     || 'http://localhost:4012',
    crm:       process.env.NEXT_PUBLIC_CRM_URL       || 'http://localhost:4005',
    hr:        process.env.NEXT_PUBLIC_HR_URL        || 'http://localhost:4006',
    ess:       process.env.NEXT_PUBLIC_ESS_URL       || 'http://localhost:4015',
    accounts:  process.env.NEXT_PUBLIC_ACCOUNTS_URL  || 'http://localhost:4007',
    payroll:   process.env.NEXT_PUBLIC_PAYROLL_URL   || 'http://localhost:4008',
    cms:       process.env.NEXT_PUBLIC_CMS_URL       || 'http://localhost:4009',
    social:    process.env.NEXT_PUBLIC_SOCIAL_URL    || 'http://localhost:4011',
    manufacturing: process.env.NEXT_PUBLIC_MANUFACTURING_URL || 'http://localhost:4014',
    marketplace:   process.env.NEXT_PUBLIC_MARKETPLACE_URL   || 'http://localhost:4016',
    inventory:     process.env.NEXT_PUBLIC_INVENTORY_URL     || 'http://localhost:4017',
    seed:          process.env.NEXT_PUBLIC_SEED_URL          || 'http://localhost:4018',
    web:       process.env.NEXT_PUBLIC_WEB_URL       || 'http://localhost:4010',
};

/** All recognised app keys */
const VALID_APP_KEYS = ['stock', 'sale', 'auth', 'web-user', 'order-management', 'rider', 'crm', 'hr', 'ess', 'accounts', 'payroll', 'cms', 'social', 'manufacturing', 'marketplace', 'inventory', 'seed'];

/**
 * App categories — the ordered taxonomy used to arrange the growing
 * app catalogue in the footer launcher and anywhere else that groups
 * apps. Each app's `group` key (in APP_META) points at one of these.
 * `icon` is the representative icon for the category's footer menu button.
 */
export const APP_CATEGORIES = [
    { key: 'sales',     label: 'Sales & Customers',      icon: 'fa-solid fa-cart-shopping' },
    { key: 'inventory', label: 'Inventory & Production', icon: 'fa-solid fa-warehouse' },
    { key: 'people',    label: 'People',                 icon: 'fa-solid fa-users' },
    { key: 'finance',   label: 'Finance & Payroll',      icon: 'fa-solid fa-coins' },
    { key: 'content',   label: 'Content & Channels',     icon: 'fa-solid fa-bullhorn' },
    { key: 'admin',     label: 'Administration',         icon: 'fa-solid fa-gear' },
];

/**
 * Metadata for each app — icon (FontAwesome class), display label,
 * short description, Bootstrap border-colour class, and the `group`
 * key (one of APP_CATEGORIES) it belongs to.
 * Used by the auth home page cards, the footer launcher, and anywhere
 * else that needs a consistent catalogue of apps.
 */
export const APP_META = {
    auth:       { group: 'admin',     icon: 'fa-solid fa-users',              label: 'User Management',    description: 'Users, roles, app access',                    border: 'border-dark',      color: 'text-dark' },
    stock:      { group: 'inventory', icon: 'fa-solid fa-boxes-stacked',      label: 'Stock Management',   description: 'Products, purchases, inventory',              border: 'border-primary',   color: 'text-primary' },
    sale:       { group: 'sales',     icon: 'fa-solid fa-cash-register',      label: 'Point of Sale',      description: 'Sales, cart, returns, reports',               border: 'border-success',   color: 'text-success' },
    'web-user': { group: 'sales',     icon: 'fa-solid fa-bag-shopping',       label: 'Web Orders',         description: 'Track customer orders, delivery status, and returns', border: 'border-info',      color: 'text-info' },
    'order-management': { group: 'sales', icon: 'fa-solid fa-truck-fast',     label: 'Order Management',   description: 'Customer orders, delivery offers, riders, and notifications', border: 'border-warning', color: 'text-warning' },
    rider:      { group: 'sales',     icon: 'fa-solid fa-motorcycle',         label: 'Rider App',          description: 'Delivery offers, active deliveries, history, and profile', border: 'border-primary',   color: 'text-primary' },
    crm:        { group: 'sales',     icon: 'fa-solid fa-handshake',          label: 'CRM',                description: 'Contacts, leads, activities',                 border: 'border-warning',   color: 'text-warning' },
    hr:         { group: 'people',    icon: 'fa-solid fa-users',              label: 'Human Resources',    description: 'Employees, departments, attendance, leave',   border: 'border-secondary', color: 'text-secondary' },
    ess:        { group: 'people',    icon: 'fa-solid fa-user-clock',         label: 'Employee Self-Service', description: 'My profile, attendance, leave requests, payslips', border: 'border-secondary', color: 'text-secondary' },
    accounts:   { group: 'finance',   icon: 'fa-solid fa-chart-line',         label: 'Accounts',           description: 'Chart of accounts, journals, invoices',       border: 'border-dark',      color: 'text-dark' },
    payroll:    { group: 'finance',   icon: 'fa-solid fa-money-check-dollar', label: 'Payroll',            description: 'Salary structures, payroll runs, payslips',   border: 'border-danger',    color: 'text-danger' },
    cms:        { group: 'content',   icon: 'fa-solid fa-pen-nib',            label: 'Content Management', description: 'Website content, pages, banners, and sales offers', border: 'border-purple',    color: 'text-purple' },
    social:     { group: 'content',   icon: 'fa-solid fa-share-nodes',        label: 'Social Media',       description: 'Posts, replies, multi-platform publishing',   border: 'border-info',      color: 'text-info' },
    manufacturing: { group: 'inventory', icon: 'fa-solid fa-industry',        label: 'Manufacturing',      description: 'Work orders, bundles, production, piece-rate payroll', border: 'border-primary',   color: 'text-primary' },
    marketplace:   { group: 'sales',  icon: 'fa-solid fa-store',              label: 'Marketplace',        description: 'Daraz & channel accounts, order/inventory sync', border: 'border-warning',   color: 'text-warning' },
    inventory:  { group: 'inventory', icon: 'fa-solid fa-warehouse',          label: 'Inventory Management', description: 'Warehouses, bins, stock levels, transfers, counts, reordering', border: 'border-primary',   color: 'text-primary' },
    seed:       { group: 'admin',     icon: 'fa-solid fa-seedling',           label: 'Seeding',            description: 'Run system, reference and backfill seeds', border: 'border-success',   color: 'text-success' },
    web:        { group: 'content',   icon: 'fa-solid fa-globe',              label: 'Storefront',         description: 'Public customer-facing website',              border: 'border-info',      color: 'text-info', public: true },
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
 * Check if the user has admin capability for a given app key.
 *
 * Background: in the AGP era this meant "the user holds an admin app-role
 * for this app". With the RoleSwitcher model, a user may HOLD multiple roles
 * but only ONE is active at a time — so "admin" means two things:
 *
 *   1. Capability: the user holds an admin role for this app (i.e. they could
 *      switch to admin if they chose). This is what adminAppAccess tracks.
 *   2. Active: the user is currently acting as an admin role for this app.
 *
 * UI elements that gate availability ("show the admin menu item") should
 * generally use #1. UI that reflects the current operational mode ("don't
 * show owner-scope hints when in admin mode") should use #2 via
 * isActiveAdminRole(activeRoleKey).
 *
 * @param {string[]} adminAppAccess - from AuthContext
 * @param {string} appKey - 'stock' | 'sale' | 'hr' | etc.
 * @returns {boolean}
 */
export function isAppAdmin(adminAppAccess, appKey) {
    if (!adminAppAccess || !appKey) return false;
    return Array.isArray(adminAppAccess) && adminAppAccess.includes(appKey);
}

/**
 * Check whether the currently-active role for an app is an admin-level role.
 *
 * Role keys follow the convention `{domain}_admin` / `{domain}_manager` /
 * `{domain}_staff`, so we just look for the `_admin` suffix.
 *
 * @param {string} activeRoleKey - from useAuth().activeRoleKey
 * @returns {boolean}
 */
export function isActiveAdminRole(activeRoleKey) {
    if (!activeRoleKey || typeof activeRoleKey !== 'string') return false;
    return /(?:^|_)admin$/.test(activeRoleKey);
}

/**
 * Build navigation cross-links for the current user.
 * Only includes apps the user actually has access to (excludes
 * the current app).
 * @param {string[]} appAccess
 * @param {string} currentApp - the app key we're currently in
 * @returns {{ label: string, href: string, key: string, icon: string }[]}
 */
export function getCrossAppLinks(appAccess, currentApp) {
    const links = [];
    const allowed = getAllowedApps(appAccess);

    for (const appKey of VALID_APP_KEYS) {
        if (appKey === currentApp) continue;
        if (!allowed.includes(appKey)) continue;
        if (!APP_URLS[appKey]) continue;

        const meta = APP_META[appKey] || {};
        links.push({
            key: appKey,
            label: meta.label || appKey,
            href: APP_URLS[appKey],
            icon: meta.icon || 'fa-solid fa-cube',
            color: meta.color || 'text-secondary',
        });
    }

    // Public apps (e.g. the storefront) are visible to everyone
    // regardless of access. Append after gated apps so admin tools
    // come first in the menu.
    for (const [appKey, meta] of Object.entries(APP_META)) {
        if (!meta || !meta.public) continue;
        if (appKey === currentApp) continue;
        if (!APP_URLS[appKey]) continue;
        if (links.find((l) => l.key === appKey)) continue;

        links.push({
            key: appKey,
            label: meta.label || appKey,
            href: APP_URLS[appKey],
            icon: meta.icon || 'fa-solid fa-cube',
            color: meta.color || 'text-secondary',
            external: true,
        });
    }

    return links;
}

/**
 * Build cross-app links grouped by category, in APP_CATEGORIES order.
 * Empty categories are omitted. Used by the footer launcher to arrange
 * the (growing) app catalogue into a small set of labelled menus.
 * @param {string[]} appAccess
 * @param {string} currentApp - the app key we're currently in
 * @returns {{ key: string, label: string, icon: string, apps: object[] }[]}
 */
export function getCrossAppGroups(appAccess, currentApp) {
    const links = getCrossAppLinks(appAccess, currentApp);

    const byGroup = new Map();
    for (const link of links) {
        const groupKey = (APP_META[link.key] || {}).group || 'admin';
        if (!byGroup.has(groupKey)) byGroup.set(groupKey, []);
        byGroup.get(groupKey).push(link);
    }

    const groups = [];
    for (const category of APP_CATEGORIES) {
        const apps = byGroup.get(category.key);
        if (!apps || apps.length === 0) continue;
        apps.sort((a, b) => String(a.label || '').localeCompare(String(b.label || '')));
        groups.push({ ...category, apps });
    }
    return groups;
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
