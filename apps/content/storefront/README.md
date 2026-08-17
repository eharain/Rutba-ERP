# Rutba Web — Public Storefront

Customer-facing e-commerce storefront built with **Next.js 16**, **React 19**, and **Tailwind CSS**. Part of the Rutba ERP monorepo.

## Tech Stack

- **Next.js 16** (pages router, TypeScript)
- **React 19**
- **Tailwind CSS** + Radix UI primitives
- **NextAuth** for customer authentication (Google OAuth, credentials), with Strapi access-token rotation
- **TanStack React Query v5** for data fetching
- **Strapi 5** REST API backend (via `@rutba/api-provider`'s public `webApi` client — `X-Rutba-App: web` baked in)

## Features

- Product catalogue with filtering, search, collections, and **CMS-driven pages, menus & product groups**
- Readable **slug URLs** (`/product/<slug>`) with canonical tags, JSON-LD, and a slug sitemap
- Shopping cart and checkout — **express + full-address**, with **COD** and online payment
- Customer authentication (login, register, forgot/reset password) + server-side **address book** (`/me/addresses`)
- Order tracking, order history, and **self-service returns**
- Responsive mobile-first design

## Credits

The initial e-commerce boilerplate for this app was adapted from the open-source project by Jung Rama:

- GitHub: https://github.com/JungRama/strapi-ecommerce-nextjs

It has been repurposed and developed further on new foundations to fit the Rutba ERP architecture.

## Getting Started

```bash
# From the monorepo root:
npm install
npm run dev:web        # → http://localhost:4000
```

### Environment Variables

In the monorepo, env is loaded from the root `.env.<ENVIRONMENT>` via `scripts/js/load-env.js`, which strips the `RUTBA_WEB__` prefix for this app (and maps the shared `WEB_*` NextAuth/OAuth secrets). The effective vars this app consumes:

```
NEXTAUTH_SECRET=<your-secret>
NEXTAUTH_URL=https://<storefront-host>
GOOGLE_CLIENT_KEY=<google-oauth-client-id>
GOOGLE_SECRET_KEY=<google-oauth-secret>
NEXT_PUBLIC_API_URL=http://localhost:4010/api
NEXT_PUBLIC_IMAGE_URL=http://localhost:4010
NEXT_PUBLIC_IMAGE_HOST_PROTOCOL=http
NEXT_PUBLIC_IMAGE_HOST_NAME=localhost
NEXT_PUBLIC_IMAGE_HOST_PORT=4010
```

See the root [README](../README.md) and [DEPLOYMENT guide](../docs/DEPLOYMENT.md) for the full env contract.

## Build

```bash
npm run build:web
```

## License

MIT — see [LICENSE](../LICENSE) for details.
