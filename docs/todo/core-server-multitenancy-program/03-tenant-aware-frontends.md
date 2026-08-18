# Phase 2 — Tenant-aware frontend fleet

Goal: **one shared deployment of each Next.js app serves every tenant**, resolved by
hostname at request time. Only the backend + DB are per-tenant. Without this, the model
is 18 apps × N tenants of Node processes and dies on cost immediately.

## 2.1 Runtime tenant resolution (shared package)

- [ ] New module in `packages/shared` (or api-provider): `resolveTenant(host)` →
      `{ slug, apiOrigin, mediaOrigin, storefrontOrigin }`, backed by the rutba-console
      registry with an in-process TTL cache + startup snapshot fallback (console being
      down must not take tenants down).
- [ ] Wire into every app's server side: Next middleware/server components read the
      incoming `Host`, resolve once, and thread the tenant context through.
- [ ] Browser side: the app exposes its resolved `apiOrigin` to the client at runtime
      (server-rendered config, not build-time env). This finally retires the remaining
      build-time `NEXT_PUBLIC_API_URL` assumptions.
      **Landmines already mapped, do not re-trip them**: the hostname-swap resolver bug
      (never derive API origin from `window.location`), the double-slash 404 (origin must
      be slash-free), and the baked `X-Rutba-App` header convention for webApi stays as-is.

## 2.2 Per-tenant app config that is currently static

- [ ] `domains.json` / app-registry: today a static file gates which domains are valid
      per app. Move its per-tenant portion (domains) into the tenant registry; the static
      part (app list, ports, role registry) stays code.
- [ ] `roles.js` registry + `/auth/callback` + switcher flow: verify the whole
      registering-a-new-app checklist works when the hostname is tenant-scoped
      (`pos.shop-x.rutba.app` style). Decide and document the fleet hostname scheme:
      recommended `<app>.<tenant>.<fleet-domain>` with one wildcard cert level, or
      path-based apps under one tenant host if wildcard-of-wildcard TLS gets awkward
      (Caddy on-demand TLS handles per-name issuance either way).

## 2.3 Auth/session scoping

- [ ] NextAuth (storefront) and the apps/admin/auth cookie flow: cookies must scope to the
      tenant's host (they do by default — verify nothing sets a fleet-wide cookie
      domain); callback/redirect URL allow-lists become tenant-registry-driven.
- [ ] JWT secrets are per-tenant, so a token from tenant A dies at tenant B's backend by
      construction — add a contract test asserting exactly that.
- [ ] Token-refresh rotation (the /auth/refresh NextAuth fix) must be verified under
      tenant-scoped origins.

## 2.4 Tenant-scoped branding & content

Already solved by design — site-settings, CMS pages/menus, storefront URL preference all
live in the tenant's DB. Verify the site_url-driven pieces (social Shop-now links, email
From/templates) read the tenant DB, not env, when run in the fleet.

## 2.5 Frontend deploy shape

- [ ] One container (or PM2 set) per app for the whole fleet, N instances scaled by
      total traffic, behind the same Caddy. Fleet frontend version can lead/lag tenant
      backend versions by at most one ring — contract suite guards the skew.

**Exit criteria**: the same running apps/content/storefront / apps/sales/pos / apps/inventory/stock processes serve
rutba.pk and the demo tenant concurrently, with correct data isolation, login, role
switching, and media on both.
