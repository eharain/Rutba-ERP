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
    pos:      process.env.NEXT_PUBLIC_POS_URL      || 'http://localhost:4002',
    'portal': process.env.NEXT_PUBLIC_PORTAL_URL || 'http://localhost:4004',
    'orders': process.env.NEXT_PUBLIC_ORDERS_URL || 'http://localhost:4013',
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
    control:     process.env.NEXT_PUBLIC_CONTROL_URL     || 'http://localhost:4017',
    seed:          process.env.NEXT_PUBLIC_SEED_URL          || 'http://localhost:4018',
    campaigns:     process.env.NEXT_PUBLIC_CAMPAIGNS_URL     || 'http://localhost:4019',
    mail:          process.env.NEXT_PUBLIC_MAIL_URL          || 'http://localhost:4021',
    console:         process.env.NEXT_PUBLIC_CONSOLE_URL         || 'http://localhost:4022',
    helpdesk:      process.env.NEXT_PUBLIC_HELPDESK_URL      || 'http://localhost:4023',
    storefront:       process.env.NEXT_PUBLIC_STOREFRONT_URL       || 'http://localhost:4000',
};

/** All recognised app keys */
// NOTE: the 'users' app key is deliberately absent. rutba-users was replaced by
// apps/admin/console ('admin'); the backend 'users' DOMAIN stays alive as a deprecated
// alias for existing users_* grants, but there is no longer a frontend to launch,
// and a dead launcher tile is worse than none. These are different registries —
// see packages/api-provider/config/domains.json.
const VALID_APP_KEYS = ['stock', 'pos', 'auth', 'portal', 'orders', 'rider', 'crm', 'hr', 'ess', 'accounts', 'payroll', 'cms', 'social', 'manufacturing', 'marketplace', 'control', 'seed', 'campaigns', 'mail', 'console', 'helpdesk'];

/**
 * App categories — the ordered taxonomy used to arrange the growing
 * app catalogue in the footer launcher and anywhere else that groups
 * apps. Each app's `group` key (in APP_META) points at one of these.
 * `icon` is the representative icon for the category's footer menu button.
 */
export const APP_CATEGORIES = [
    { key: 'sales',     label: 'Sales & Customers',      icon: 'fa-solid fa-cart-shopping', color: '#10b981' }, // emerald
    { key: 'control', label: 'Inventory & Production', icon: 'fa-solid fa-warehouse',     color: '#3b82f6' }, // blue
    { key: 'people',    label: 'People',                 icon: 'fa-solid fa-users',         color: '#ec4899' }, // pink
    { key: 'finance',   label: 'Finance & Payroll',      icon: 'fa-solid fa-coins',         color: '#f59e0b' }, // amber
    { key: 'content',   label: 'Content & Channels',     icon: 'fa-solid fa-bullhorn',      color: '#8b5cf6' }, // violet
    { key: 'console',     label: 'Administration',         icon: 'fa-solid fa-gear',          color: '#64748b' }, // slate
];

/**
 * Metadata for each app — icon (FontAwesome class), display label,
 * short description, Bootstrap border-colour class, and the `group`
 * key (one of APP_CATEGORIES) it belongs to.
 * Used by the auth home page cards, the footer launcher, and anywhere
 * else that needs a consistent catalogue of apps.
 */
export const APP_META = {
    auth:       { group: 'admin',     icon: 'fa-solid fa-right-to-bracket',   label: 'Sign-In & SSO',      description: 'Single sign-on, login and session portal',    border: 'border-dark',      color: 'text-dark' },
    console:      { group: 'admin',     icon: 'fa-solid fa-sliders',            label: 'Rutba Admin',        description: 'Users, roles, app access, app domains, mailbox and notification administration', border: 'border-dark', color: 'text-dark' },
    stock:      { group: 'inventory', icon: 'fa-solid fa-boxes-stacked',      label: 'Stock Management',   description: 'Products, purchases, inventory',              border: 'border-primary',   color: 'text-primary' },
    pos:       { group: 'sales',     icon: 'fa-solid fa-cash-register',      label: 'Point of Sale',      description: 'Sales, cart, returns, reports',               border: 'border-success',   color: 'text-success' },
    'portal': { group: 'sales',     icon: 'fa-solid fa-bag-shopping',       label: 'Web Orders',         description: 'Track customer orders, delivery status, and returns', border: 'border-info',      color: 'text-info' },
    'orders': { group: 'sales', icon: 'fa-solid fa-truck-fast',     label: 'Order Management',   description: 'Customer orders, delivery offers, riders, and notifications', border: 'border-warning', color: 'text-warning' },
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
    control:  { group: 'inventory', icon: 'fa-solid fa-warehouse',          label: 'Inventory Management', description: 'Warehouses, bins, stock levels, transfers, counts, reordering', border: 'border-primary',   color: 'text-primary' },
    seed:       { group: 'admin',     icon: 'fa-solid fa-seedling',           label: 'Seeding',            description: 'Run system, reference and backfill seeds', border: 'border-success',   color: 'text-success' },
    campaigns:  { group: 'content',   icon: 'fa-solid fa-envelope-open-text', label: 'Campaigns',          description: 'Email templates, audiences, campaigns, delivery reporting', border: 'border-purple',    color: 'text-purple' },
    mail:       { group: 'content',   icon: 'fa-solid fa-envelope',           label: 'Mail',               description: 'Personal and shared inboxes over live IMAP',  border: 'border-info',      color: 'text-info' },
    helpdesk:   { group: 'sales',     icon: 'fa-solid fa-headset',            label: 'Helpdesk',           description: 'Support desks, tickets, SLAs, service catalog, knowledge base', border: 'border-info',      color: 'text-info' },
    storefront:        { group: 'content',   icon: 'fa-solid fa-globe',              label: 'Storefront',         description: 'Public customer-facing website',              border: 'border-info',      color: 'text-info', public: true },
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
 * Same as isActiveAdminRole but for manager-level roles (`{domain}_manager`).
 *
 * @param {string} activeRoleKey - from useAuth().activeRoleKey
 * @returns {boolean}
 */
export function isActiveManagerRole(activeRoleKey) {
    if (!activeRoleKey || typeof activeRoleKey !== 'string') return false;
    return /(?:^|_)manager$/.test(activeRoleKey);
}

/**
 * The check nearly every admin-gated control wants: "should this user get the
 * admin affordance right now?".
 *
 * Prefers the ACTIVE role (RoleSwitcher model) and falls back to "holds an
 * admin role for this app" only while activeRoleKey is still unset — the same
 * rule PermissionCheck applies, so page chrome and inline buttons agree.
 *
 * Gating on `isAppAdmin() && isActiveAdminRole()` instead is a trap: it hides
 * the control during the bootstrap window where activeRoleKey is null, which
 * reads as "admin doesn't work".
 *
 * @param {string} activeRoleKey   - from useAuth().activeRoleKey
 * @param {string[]} adminAppAccess - from useAuth().adminAppAccess
 * @param {string} appKey          - 'sale' | 'stock' | …
 * @returns {boolean}
 */
export function isEffectiveAdmin(activeRoleKey, adminAppAccess, appKey) {
    return activeRoleKey
        ? isActiveAdminRole(activeRoleKey)
        : isAppAdmin(adminAppAccess, appKey);
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
    return groupLinksByCategory(links);
}

/**
 * Build links for EVERY configured app — the full catalogue, not just
 * what the user can access. Each link carries `allowed` (user has
 * access) and `current` (the app we're inside) so callers can render
 * locked/active states. The current app is INCLUDED (unlike
 * getCrossAppLinks) so the list doubles as a complete app directory.
 * @param {string[]} appAccess
 * @param {string} currentApp - the app key we're currently in
 * @returns {{ key, label, href, icon, color, description, external, allowed, current }[]}
 */
export function getAppCatalogLinks(appAccess, currentApp) {
    const allowed = getAllowedApps(appAccess);
    const links = [];

    for (const appKey of VALID_APP_KEYS) {
        if (!APP_URLS[appKey]) continue;
        const meta = APP_META[appKey] || {};
        links.push({
            key: appKey,
            label: meta.label || appKey,
            href: APP_URLS[appKey],
            icon: meta.icon || 'fa-solid fa-cube',
            color: meta.color || 'text-secondary',
            description: meta.description || '',
            allowed: allowed.includes(appKey),
            current: appKey === currentApp,
        });
    }

    // Public apps (e.g. the storefront) are open to everyone.
    for (const [appKey, meta] of Object.entries(APP_META)) {
        if (!meta || !meta.public) continue;
        if (!APP_URLS[appKey]) continue;
        if (links.find((l) => l.key === appKey)) continue;
        links.push({
            key: appKey,
            label: meta.label || appKey,
            href: APP_URLS[appKey],
            icon: meta.icon || 'fa-solid fa-cube',
            color: meta.color || 'text-secondary',
            description: meta.description || '',
            external: true,
            allowed: true,
            current: appKey === currentApp,
        });
    }

    return links;
}

/**
 * The full app catalogue grouped by category — every configured app,
 * including ones the user can't access (marked `allowed: false`) and
 * the current app (marked `current: true`). Used by the footer launcher
 * so the footer always shows the complete application directory.
 * @param {string[]} appAccess
 * @param {string} currentApp
 * @returns {{ key, label, icon, color, apps: object[] }[]}
 */
export function getAppCatalogGroups(appAccess, currentApp) {
    const links = getAppCatalogLinks(appAccess, currentApp);
    return groupLinksByCategory(links);
}

/** Shared grouping: arrange links into APP_CATEGORIES order, A-Z inside. */
function groupLinksByCategory(links) {
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

//// Combine admin check with a domain gate.
//// `required` / `has` take APP-DOMAIN keys from
//// packages/api-provider/config/domains.json — never a permission action
//// like "api::sale.sale.delete", and never "admin". A key that is not in
//// that file can be held by nobody, so the gate is permanently closed for
//// every user, admins included, and it fails silently with nothing logged.
//// (This example used to show an action string, and the POS and console
//// pages that copied it were unreachable for everyone until 2026-08-19.)
//// scripts/js/verify-app-wiring.js now fails the build on an unknown key.
//<PermissionCheck showIf="admin" required="pos">
//    <button>Force Delete Sale</button>
//</PermissionCheck>

//// Check admin for a specific app (not the current one)
//<PermissionCheck showIf="admin" appKey="stock">
//    <button>Manage Stock Settings</button>
//</PermissionCheck>
