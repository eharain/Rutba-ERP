# Copilot Instructions

## Workspace Layout (npm workspaces monorepo)

| Directory | Purpose | Port |
|---|---|---|
| `packages/pos-shared/` | Shared library consumed by all front-end apps — contains `lib/`, `context/`, `components/`, `domain/`, `styles/` | — |
| `pos-auth/` | **Auth Portal** Next.js app (login, role-based dashboard, central authentication) | 4003 |
| `pos-stock/` | **Stock Management** Next.js app (products, purchases, stock items, suppliers, brands, categories) | 4001 |
| `pos-sale/` | **Point of Sale** Next.js app (sales, cart, returns, cash register, reports) | 4002 |
| `rutba-web/` | **Public Website** Next.js 15 app (TypeScript, Tailwind CSS — customer-facing store) | 4000 |
| `rutba-web-user/` | **My Orders** Next.js app (customer order tracking, returns, account) | 4004 |
| `rutba-crm/` | **CRM** Next.js app (contacts, leads, activities) | 4005 |
| `rutba-hr/` | **Human Resources** Next.js app (employees, departments, attendance, leave) | 4006 |
| `rutba-accounts/` | **Accounting** Next.js app (chart of accounts, journal entries, invoices, expenses) | 4007 |
| `rutba-payroll/` | **Payroll** Next.js app (salary structures, payroll runs, payslips) | 4008 |
| `pos-desk/` | Legacy combined app (kept for reference, not actively developed) | 4000 |
| `pos-strapi/` | Strapi 5.x API provider — schemas and components in `pos-strapi/src/` | 1337 |

## Authentication & Roles
- All login flows go through `pos-auth` (port 4003). **Do not** add login pages to `pos-stock` or `pos-sale`.
- Authentication uses an **OAuth-like flow** — no cookies. Each app stores auth data in its **own localStorage** only.
- **OAuth flow:**
  1. `ProtectedRoute` on a client app (stock/sale) detects no JWT → redirects to `pos-auth/authorize?redirect_uri=<origin>/auth/callback&state=<path>`
  2. `pos-auth/authorize` checks if the user is logged in (pos-auth's localStorage). If yes, redirects to `redirect_uri?token=JWT&state=...`. If no, redirects to `/login?redirect_uri=...&state=...`.
  3. After login, `/login` redirects to `/authorize` which then redirects the token to the client.
  4. `<app>/auth/callback` receives the JWT, calls `loginWithToken(token)` (fetches `/users/me` + `/me/permissions`), stores everything in localStorage, and redirects to the original page.
- `AuthContext` (`packages/pos-shared/context/AuthContext.js`) reads from `localStorage` only. It exposes `user`, `jwt`, `role`, `appAccess`, `permissions`, `loading`, `login`, `loginWithToken`, `logout`.
- `ProtectedRoute` (`packages/pos-shared/components/ProtectedRoute.js`) redirects unauthenticated users to `pos-auth/authorize`.
- `AuthCallback` (`packages/pos-shared/components/AuthCallback.js`) is the shared callback handler re-exported by each app at `pages/auth/callback.js`.
- **Logout:** Navigation calls `logout()` (clears local app state) then redirects to `pos-auth/logout` which clears pos-auth's state and shows the login page.
- **Strapi role** (`role` field) is 1:1 per user. The **"Rutba App User"** role (type `rutba_app_user`) is the standard role for all Rutba front-end app users. Its permissions are managed automatically — the migration in `pos-strapi/database/migrations/2025.08.17T00.00.00.seed-rutba-role-and-permissions.js` computes the union of all permissions from `config/app-access-permissions.js` and syncs them to this role on every Strapi start. New users should be assigned this role. The built-in `Authenticated` role is no longer used for Rutba app users.
- **App-access permissions** (`pos-strapi/config/app-access-permissions.js`) defines the exact Strapi content-API permissions each app-access key requires (content-type UID + actions: find, findOne, create, update, delete). This file is the **single source of truth** for what each app-access grants. When adding a new content-type or app, update this file.
- **App access** is controlled by the `App Access` content type (`api::app-access.app-access`), linked to users via a many-to-many relation (`user.app_accesses ↔ app-access.users`). Each entry has a unique `key` (e.g. `"stock"`, `"sale"`, `"auth"`), a display `name`, and a `permissions` JSON field listing the Strapi permission action strings it grants. Standard entries are seeded via database migrations in `pos-strapi/database/migrations/` — add new ones there when creating new apps.
- **App-access guard middleware** (`pos-strapi/src/middlewares/app-access-guard.js`) enforces three rules on every authenticated API request:
  1. **Gate** — checks the user's `app_accesses` against the route map in `pos-strapi/config/app-access-routes.js`. Each content-type is mapped to the app-access key(s) that own it, optionally per action (find/create/update/delete). Requests without a matching key are denied with 403. Users with `"auth"` app-access bypass all gates (admin).
  2. **Permission check** — verifies the user's combined app-access permissions (from `config/app-access-permissions.js`) grant the specific content-type + action being requested. Even if the gate passes, the request is denied if no app-access key includes the required permission.
  3. **Owner scoping** — for content-types that have an `owners` relation, the middleware auto-assigns `owners` on create, filters `find` queries to own records, and blocks update/delete on records owned by others. Users with `"auth"` bypass owner scoping.
- **Adding a new content-type to the guard:** add an entry to `config/app-access-routes.js` mapping the UID to the app-access key(s). Add an `owners` relation (manyToMany to `plugin::users-permissions.user`) to the schema if the data should be ownership-scoped. The ownership relation on Strapi content-types must always be named `owners` (plural, manyToMany to `plugin::users-permissions.user`). Never use singular `owner` or the old `users` field name. The user schema has no inverse relations to entities — only `role` and `app_accesses` remain.
- **`owners` is always manyToMany** (never manyToOne) so multiple users can share ownership of a record. The old `users` relation has been removed — use `owners` everywhere. 
- Standard app-access keys: `"stock"` (Stock Management), `"sale"` (Point of Sale), `"auth"` (User Management — required to access user/access admin pages in `pos-auth`), `"web-user"` (My Orders), `"crm"` (CRM), `"hr"` (Human Resources), `"accounts"` (Accounting), `"payroll"` (Payroll).
- `POST /me/permissions` returns `{ role, appAccess, adminAppAccess, permissions[], isAdmin }` where `appAccess` is an array of keys like `["stock", "sale", "auth", "crm", "hr", "accounts", "payroll"]` and `adminAppAccess` is an array of keys for which the user has admin privileges (bypasses owner scoping).
- App-access utilities live in `packages/pos-shared/lib/roles.js` — `getAllowedApps(appAccess)`, `getHomeUrl(appAccess)`, `canAccessApp(appAccess, appKey)`, `isAppAdmin(adminAppAccess, appKey)`, `getCrossAppLinks(appAccess, currentApp)`, and `APP_META` (icon/label/description for each app).
- Every front-end app calls `setAppName('<key>')` (from `@rutba/pos-shared/lib/api`) at module level in `_app.js`. This sets the `X-App-Name` header on all API requests so the middleware can identify which app the request originates from.
- **Per-app admin:** Users can be granted admin access to specific apps via the `admin_app_accesses` relation on the User schema (manyToMany to `api::app-access.app-access`). When a request arrives with an `X-App-Name` header matching one of the user's `admin_app_accesses`, the owner-scoping filter is bypassed for that request. Users with the global `'auth'` app-access bypass owner scoping on all apps regardless of header.
- In `pos-auth`, admin pages (users, app-access) are wrapped in `AppAccessGate appKey="auth"` (`pos-auth/components/AppAccessGate.js`) which shows an access-denied message if the user lacks the `"auth"` app-access entry.
- Cross-app "Switch App" links appear in Navigation bars based on the user's `appAccess`.
- `authStorage.js` is **deprecated** — kept only for cleaning up legacy cookies. Do not use it in new code.

## Import Convention
- `pos-stock`, `pos-sale`, and `pos-auth` import shared code **directly** from the package: `import { authApi } from '@rutba/pos-shared/lib/api'`.
- App-specific files (`Layout.js`, `Navigation.js`, `NavigationSecondary.js`, and domain components under the app's own `components/`) use relative imports within the same app.
- **Never** create proxy/re-export files in the apps for shared code; always import from `@rutba/pos-shared/...`.
- When adding a new shared utility, component, or context, place it in `packages/pos-shared/` and import it directly from the consuming apps.

## Strapi API
- Strapi version is **5.x.x**. Schemas and components are defined in `pos-strapi/src/`.
- Before editing any front-end component that calls a Strapi endpoint, check the corresponding schema in `pos-strapi/src/`.
- Custom user permissions endpoint: `POST /me/permissions` returns `{ role, appAccess[], permissions[], isAdmin }`.

## Front-End Guidelines (pos-stock, pos-sale & pos-auth)
- All apps use **Next.js 15 pages router** with `transpilePackages: ['@rutba/pos-shared']` in `next.config.js`.
- Prefer **Bootstrap utility classes** over inline `<style jsx>` blocks, especially in print-related components.
- Use Bootstrap grid (`row`/`col`) for print label layout: product name on top; company and price in the left column; QR/Barcode in the right column with barcode text below. Use classes: `.name`, `.company`, `.price`, `.barcode-container`, `.barcode-text`.
- All pages that use auth/context must export `getServerSideProps` to avoid static-prerender failures during build.
- **Use `[documentId]`** as the dynamic route parameter name under `pages/`. **Never** create pages under a `[id]` directory.

## Context Providers (`packages/pos-shared/context/`)
- Load state from local storage **once** on mount (empty dependency array).
- Use distinct internal setter names (e.g., `setLabelSizeState`) to avoid collisions with the public setter exposed via context.
- Persist every change to local storage using consistent keys (e.g., `'label-size'` for label size, `'currency'` for currency).

## Adding a New Page
- **Login/auth concern** → add to `pos-auth/pages/`.
- **Stock/inventory concern** → add to `pos-stock/pages/`.
- **Sales/POS concern** → add to `pos-sale/pages/`.
- **CRM concern** → add to `rutba-crm/pages/`.
- **HR concern** → add to `rutba-hr/pages/`.
- **Accounting concern** → add to `rutba-accounts/pages/`.
- **Payroll concern** → add to `rutba-payroll/pages/`.
- **Customer-facing store** → add to `rutba-web/src/pages/`.
- **Customer order tracking** → add to `rutba-web-user/pages/`.
- Import shared components and libs from `@rutba/pos-shared/...`; create app-specific components (Layout, Navigation) locally.