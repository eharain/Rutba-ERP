# Rutba Web — Public Website

Customer-facing e-commerce storefront built with **Next.js 15**, **React 19**, and **Tailwind CSS**. Part of the Rutba POS monorepo.

## Tech Stack

- **Next.js 15** (pages router, TypeScript)
- **React 19**
- **Tailwind CSS 3** + Radix UI primitives
- **NextAuth** for customer authentication (Google OAuth, credentials)
- **TanStack React Query v5** for data fetching
- **Strapi 5** REST API backend

## Features

- Product catalogue with filtering, search, and collections
- Shopping cart and checkout
- Customer authentication (login, register, forgot password)
- Order tracking and order history
- Responsive mobile-first design

## Getting Started

```bash
# From the monorepo root:
npm install
npm run dev:web        # → http://localhost:3000
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```
NEXTAUTH_SECRET=<your-secret>
GOOGLE_CLIENT_KEY=<google-oauth-client-id>
GOOGLE_SECRET_KEY=<google-oauth-secret>
NEXT_PUBLIC_API_URL=http://localhost:1337/api/
NEXT_PUBLIC_IMAGE_URL=http://localhost:1337
NEXT_PUBLIC_IMAGE_HOST_PROTOCOL=http
NEXT_PUBLIC_IMAGE_HOST_NAME=localhost
NEXT_PUBLIC_IMAGE_HOST_PORT=1337
```

## Build

```bash
npm run build:web
```

## License

MIT — see [LICENSE](../LICENSE) for details.
