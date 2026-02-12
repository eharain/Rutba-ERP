# Copilot Instructions

## Workspace Layout (npm workspaces monorepo)

| Directory | Purpose | Port |
|---|---|---|
| `packages/pos-shared/` | Shared library consumed by all front-end apps — contains `lib/`, `context/`, `components/`, `domain/`, `styles/` | — |
| `pos-auth/` | **Auth Portal** Next.js app (login, role-based dashboard, central authentication) | 3003 |
| `pos-stock/` | **Stock Management** Next.js app (products, purchases, stock items, suppliers, brands, categories) | 3001 |
| `pos-sale/` | **Point of Sale** Next.js app (sales, cart, returns, cash register, reports) | 3002 |
| `pos-desk/` | Legacy combined app (kept for reference, not actively developed) | 3000 |
| `pos-strapi/` | Strapi 5.x API provider — schemas and components in `pos-strapi/src/` | 1337 |
| `rutba-web/` | Public website (Next.js 13, standalone) | 3000 |

## Authentication & Roles
- All login flows go through `pos-auth` (port 3003). **Do not** add login pages to `pos-stock` or `pos-sale`.
- JWT and user/role data are stored in **cookies** (`rutba_jwt`, `rutba_user`, `rutba_role`, `rutba_permissions`) via `authStorage` in `packages/pos-shared/lib/authStorage.js`. Cookies on localhost are shared across ports, enabling cross-app auth.
- `AuthContext` reads from cookies first, then falls back to `localStorage` for backward compatibility.
- `ProtectedRoute` redirects unauthenticated users to `pos-auth/login?returnUrl=...`.
- Strapi roles (seeded in `pos-strapi/src/index.js` bootstrap):
  - **Admin** → access to all apps
  - **Stock Manager** → `pos-stock` only
  - **Sales Clerk** → `pos-sale` only
- Role-to-app mapping is defined in `packages/pos-shared/lib/roles.js`. Update `ROLE_ACCESS` there when adding new roles.
- Cross-app "Switch App" links appear in Navigation bars based on the user's role.

## Import Convention
- `pos-stock`, `pos-sale`, and `pos-auth` import shared code **directly** from the package: `import { authApi } from '@rutba/pos-shared/lib/api'`.
- App-specific files (`Layout.js`, `Navigation.js`, `NavigationSecondary.js`, and domain components under the app's own `components/`) use relative imports within the same app.
- **Never** create proxy/re-export files in the apps for shared code; always import from `@rutba/pos-shared/...`.
- When adding a new shared utility, component, or context, place it in `packages/pos-shared/` and import it directly from the consuming apps.

## Strapi API
- Strapi version is **5.x.x**. Schemas and components are defined in `pos-strapi/src/`.
- Before editing any front-end component that calls a Strapi endpoint, check the corresponding schema in `pos-strapi/src/`.
- Custom user permissions endpoint: `POST /me/permissions` returns `{ role, permissions[] }`.

## Front-End Guidelines (pos-stock, pos-sale & pos-auth)
- All apps use **Next.js 15 pages router** with `transpilePackages: ['@rutba/pos-shared']` in `next.config.js`.
- Prefer **Bootstrap utility classes** over inline `<style jsx>` blocks, especially in print-related components.
- Use Bootstrap grid (`row`/`col`) for print label layout: product name on top; company and price in the left column; QR/Barcode in the right column with barcode text below. Use classes: `.name`, `.company`, `.price`, `.barcode-container`, `.barcode-text`.
- All pages that use auth/context must export `getServerSideProps` to avoid static-prerender failures during build.

## Context Providers (`packages/pos-shared/context/`)
- Load state from local storage **once** on mount (empty dependency array).
- Use distinct internal setter names (e.g., `setLabelSizeState`) to avoid collisions with the public setter exposed via context.
- Persist every change to local storage using consistent keys (e.g., `'label-size'` for label size, `'currency'` for currency).

## Adding a New Page
- **Login/auth concern** → add to `pos-auth/pages/`.
- **Stock/inventory concern** → add to `pos-stock/pages/`.
- **Sales/POS concern** → add to `pos-sale/pages/`.
- Import shared components and libs from `@rutba/pos-shared/...`; create app-specific components (Layout, Navigation) locally.