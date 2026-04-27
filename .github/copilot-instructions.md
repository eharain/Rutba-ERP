# Copilot Instructions — rutba-web

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (Pages Router) · TypeScript |
| Backend / CMS | Strapi v5 (REST API) · JavaScript (pos-strapi) |
| Styling | TailwindCSS · shadcn/ui (Radix UI primitives) |
| State | Zustand |
| Data fetching | Axios · TanStack React Query v5 |
| Auth | NextAuth v4 (Google + Credentials) |
| Forms | React Hook Form · Zod · @hookform/resolvers |

## Project Structure

```
rutba-web/src/
├── components/       # Domain-grouped components
│   └── ui/           # shadcn/ui primitives (Button, Card, Dialog, …)
├── hooks/            # Custom React hooks (useDebounce, useErrorHandler, …)
├── lib/              # Utilities (cn(), currency, marked helpers)
├── pages/            # Next.js Pages Router (pages + API routes)
│   └── api/auth/     # NextAuth route handler
├── services/         # API service layer (Axios calls to Strapi)
├── static/           # Constants (BASE_URL, IMAGE_URL from env)
├── store/            # Zustand stores (cart, checkout)
├── types/api/        # TypeScript interfaces mirroring Strapi content-types
└── validations/      # Zod schemas for forms
```

### Routing & Pages

- Use the Next.js Pages Router under `src/pages/`.
- Maintain default app behavior: keep list pages separate from create/edit pages.
- Implement create and edit on dedicated routes (for example: `/products`, `/products/create`, `/products/[id]/edit`).
- Avoid combining listing and create/edit functionality on the same page or route.

## Coding Conventions

- **Path alias**: `@/` maps to `src/`.
- **Services**: Export either a hook factory (`useProductsService()`) or plain async functions. Always import `BASE_URL` from `@/static/const`.
- **Types**: Every Strapi entity interface includes `id` (numeric) and `documentId` (string). Keep both fields present. pos-strapi uses plain JavaScript (not TypeScript); do not expect Strapi to emit TypeScript types — maintain and update TS interfaces in `src/types/api/` to mirror content-types.
- **UI components**: Follow the shadcn/ui pattern — thin wrappers around Radix primitives in `components/ui/`, composed in domain components.
- **State management**: Use Zustand stores in `src/store/`. Do not introduce additional state libraries.
- **Forms**: Validate with Zod schemas in `src/validations/`, bind via `@hookform/resolvers/zod`.

## Strapi v5 Rules

- pos-strapi uses plain JavaScript (the Strapi codebase is not TypeScript). Treat the CMS as a JS project and do not rely on auto-generated TypeScript artifacts from the Strapi instance.
- **Draft / Publish**: Strapi v5 `draftAndPublish` creates two DB rows per entity sharing the same `documentId` but each with a unique numeric `id`. Always fetch and work with the **draft** version. Publish only when the user explicitly requests it. For the rutba-web storefront (public-facing), do NOT add `status: 'draft'` to API calls. The web app should only display published content. Draft/publish workflow is managed in the CMS (rutba-cms) where editors explicitly publish content.
- **Media attachments**: Reference media by numeric `id`, not `documentId`, to avoid ambiguity between draft and published rows.

## Domain Rules

- **Sale items — products-first workflow & no duplicates**
  - Create sale orders by associating products (product id + quantity) only; do not attach stock items at creation time.
  - Attach stock items to sale items later during fulfillment. Implement a distinct fulfillment flow/screen for stock-item assignment.
  - Implement create/edit screens to support product association (product selection, quantity, pricing, discounts) without requiring stock-item IDs.
  - During fulfillment, attach stock items by numeric stock-item id. Skip items already attached; enforce that the same stock item never appears in two different sale items.
  - Validate on the server that stock-item uniqueness holds and that attachments occur only in the fulfillment step.
- **Branch relations**: Relations from `products`, `sales`, `sale_returns`, and `purchase_returns` to branches must stay **manyToMany** (field name: plural `branches`). A product can exist on many branches; a sale made on one branch can be returned on another. When refactoring, flip the owning side rather than singularizing the relation.
- **Team Hierarchy & Access Control**
  - Implement a unified TeamMember model in Strapi (content-type: `team_members`) that represents riders, branch workers, managers, and other staff.
  - Model fields (examples):
    - `role` (enum): `rider`, `branch_worker`, `manager`, ...
    - `user` (relation): link to Strapi user or external identity
    - `branches` (manyToMany): assigned branches for the member (use numeric branch IDs)
    - `managedBranches` (manyToMany): branches the member manages (managers only)
    - `approvalScopes` (enumeration or set): allowed approval domains (e.g., `HR`, `Accounts`, `OrderManagement`)
    - Preserve `id` and `documentId` as with other Strapi entities
  - Mirror the TeamMember content-type in `src/types/api/` (TeamMember interface with `id`, `documentId`, `role`, `branches`, `managedBranches`, `approvalScopes`).
  - Enforce manager-scoped access and approvals in backend services and API routes:
    - Require that approval actions (HR, Accounts, Order Management) verify the actor’s `approvalScopes` and that the target resource’s branch intersects the actor’s `managedBranches`.
    - Implement reusable authorization middleware or service-layer guards that accept required scope(s) and target branch IDs.
  - Integrate with NextAuth:
    - Populate session/claims with team member id, role, and managed branch ids on sign-in.
    - Use session claims in server API routes to perform authorization checks without extra lookups where safe.
  - Use numeric branch IDs for all branch checks and relations (consistent with Strapi relation rules).
  - Update Zod schemas and forms (validations) to reflect approval flows and role-based constraints.
  - Ensure front-end UI shows only actions the current user is permitted to perform (hide disabled actions and validate on submit server-side).

## Team & Access Notes

- Keep access logic domain-driven and centralized in services/middleware — do not scatter permission checks across components.
- When adding new workflows that require approvals, register the workflow’s required approval scopes and reuse the same manager-scoped guard.