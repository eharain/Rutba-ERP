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

- **Sale items — no duplicates**: When adding stock items to a sale, skip items already present. The same stock item must never appear in two different sale items.
- **Branch relations**: Relations from `products`, `sales`, `sale_returns`, and `purchase_returns` to branches must stay **manyToMany** (field name: plural `branches`). A product can exist on many branches; a sale made on one branch can be returned on another. When refactoring, flip the owning side rather than singularizing the relation.