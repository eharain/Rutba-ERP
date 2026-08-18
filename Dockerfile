# ============================================================
# Rutba POS — Multi-stage Dockerfile
# ============================================================
# Builds every Next.js app and Strapi from a single monorepo
# context.  Each service has its own final stage so
# docker-compose can target it with `build.target`.
#
# Pre-requisite:
#   node scripts/generate-docker-env.js
#
# Usage (standalone):
#   docker build --target strapi  -t rutba/strapi  .
#   docker build --target core    -t rutba/core    .
#   docker build --target auth    -t rutba/auth    .
#
# Usage (compose):
#   docker compose --env-file .env.docker up --build
# ============================================================

# ----------------------------------------------------------
# 0.  Base — shared Node image
# ----------------------------------------------------------
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# ----------------------------------------------------------
# 1.  Dependencies — install the full monorepo once
# ----------------------------------------------------------
FROM base AS deps

# Copy the FULL monorepo source BEFORE installing. Some workspaces run a
# `prepare` build during `npm install` (e.g. strapi-api-pro → `strapi-plugin
# build`, producing dist/ that services/strapi loads), and native deps run their
# postinstall — both need source present, so the old "package.json only first"
# layer-cache trick breaks here. .dockerignore keeps node_modules/.next/.git/
# .env* out of the context. .npmrc carries legacy-peer-deps=true, required by
# the react@19 + @strapi/strapi@5 peer set (else npm ERESOLVEs).
COPY . .

# `npm install` (not `npm ci`) so a slightly stale lockfile reconciles in-image
# — matches the production systemd deploy path (rutba_deploy.sh uses npm install).
RUN npm install --no-audit --no-fund

# ----------------------------------------------------------
# 2.  Source — full source already present in deps (alias stage)
# ----------------------------------------------------------
FROM deps AS source

# ============================================================
#  STRAPI
# ============================================================
FROM source AS strapi-build
WORKDIR /app/services/strapi
RUN npm install
RUN npm run build

FROM base AS strapi
WORKDIR /app
COPY --from=strapi-build /app/services/strapi   ./services/strapi
COPY --from=deps /app/node_modules         ./node_modules
COPY --from=strapi-build /app/packages     ./packages

ENV NODE_ENV=production
WORKDIR /app/services/strapi
CMD ["npx", "strapi", "start"]

# ============================================================
#  CORE API  (services/core — strangler replacement for Strapi)
# ============================================================
# Two packaging facts drive this stage:
#
#  1. services/core is NOT an npm workspace. Like services/strapi it installs on its
#     own via --prefix, so the root `npm install` in `deps` does not cover it.
#  2. It loads services/strapi ZERO-COPY at runtime — controllers, services and
#     lifecycles through posRequire(), and bcryptjs / @strapi/utils / nodemailer
#     / the users-permissions validators through posModule() — plus every
#     content-type's schema.json for the table registry. So the image has to
#     carry services/strapi's source AND its node_modules. That is a strangler
#     artefact; it goes away with Strapi itself.
#
# services/strapi deps are installed here rather than copied from `strapi-build`
# because core never serves the admin panel and should not pay for building it.
FROM source AS core-build
RUN npm install --prefix services/strapi --no-audit --no-fund
RUN npm install --prefix services/core --no-audit --no-fund

FROM base AS core
WORKDIR /app
COPY --from=core-build /app/services/core     ./services/core
COPY --from=core-build /app/services/strapi     ./services/strapi
COPY --from=deps       /app/node_modules   ./node_modules
COPY --from=deps       /app/packages       ./packages
# config/env resolves REPO_ROOT three levels up from src/config, i.e. /app —
# it looks for .env/.env.<environment> there. .dockerignore keeps those out of
# the image on purpose; compose supplies the values as real environment
# variables, which get() picks up as the bare-name fallback.
COPY --from=deps       /app/package.json   ./package.json

ENV NODE_ENV=production
WORKDIR /app/services/core
CMD ["node", "src/index.js"]

# ============================================================
#  NEXT.JS BUILD ENV — all NEXT_PUBLIC_* globals declared once
# ============================================================
# Next.js inlines NEXT_PUBLIC_* at build time.  Declare them as
# ARGs once here; every app build stage inherits via FROM.

FROM source AS build-env
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_IMAGE_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_STOCK_URL
ARG NEXT_PUBLIC_POS_URL
ARG NEXT_PUBLIC_STOREFRONT_URL
ARG NEXT_PUBLIC_PORTAL_URL
ARG NEXT_PUBLIC_ORDERS_URL
ARG NEXT_PUBLIC_MANUFACTURING_URL
ARG NEXT_PUBLIC_MARKETPLACE_URL
ARG NEXT_PUBLIC_CONTROL_URL
ARG NEXT_PUBLIC_SEED_URL
ARG NEXT_PUBLIC_CAMPAIGNS_URL
ARG NEXT_PUBLIC_MAIL_URL
ARG NEXT_PUBLIC_CONSOLE_URL
ARG NEXT_PUBLIC_RIDER_URL
ARG NEXT_PUBLIC_SOCIAL_URL
ARG NEXT_PUBLIC_CRM_URL
ARG NEXT_PUBLIC_HR_URL
ARG NEXT_PUBLIC_ESS_URL
ARG NEXT_PUBLIC_ACCOUNTS_URL
ARG NEXT_PUBLIC_PAYROLL_URL
ARG NEXT_PUBLIC_CMS_URL
ARG NEXT_PUBLIC_IMAGE_HOST_PROTOCOL
ARG NEXT_PUBLIC_IMAGE_HOST_NAME
ARG NEXT_PUBLIC_IMAGE_HOST_PORT
# Web-only build-time vars (harmless for other apps)
ARG WEB_NEXTAUTH_SECRET
ARG WEB_NEXTAUTH_URL
ARG WEB_GOOGLE_CLIENT_KEY
ARG WEB_GOOGLE_SECRET_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_IMAGE_URL=$NEXT_PUBLIC_IMAGE_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_STOCK_URL=$NEXT_PUBLIC_STOCK_URL \
    NEXT_PUBLIC_POS_URL=$NEXT_PUBLIC_POS_URL \
    NEXT_PUBLIC_STOREFRONT_URL=$NEXT_PUBLIC_STOREFRONT_URL \
    NEXT_PUBLIC_PORTAL_URL=$NEXT_PUBLIC_PORTAL_URL \
    NEXT_PUBLIC_ORDERS_URL=$NEXT_PUBLIC_ORDERS_URL \
    NEXT_PUBLIC_MANUFACTURING_URL=$NEXT_PUBLIC_MANUFACTURING_URL \
    NEXT_PUBLIC_MARKETPLACE_URL=$NEXT_PUBLIC_MARKETPLACE_URL \
    NEXT_PUBLIC_CONTROL_URL=$NEXT_PUBLIC_CONTROL_URL \
    NEXT_PUBLIC_SEED_URL=$NEXT_PUBLIC_SEED_URL \
    NEXT_PUBLIC_CAMPAIGNS_URL=$NEXT_PUBLIC_CAMPAIGNS_URL \
    NEXT_PUBLIC_MAIL_URL=$NEXT_PUBLIC_MAIL_URL \
    NEXT_PUBLIC_CONSOLE_URL=$NEXT_PUBLIC_CONSOLE_URL \
    NEXT_PUBLIC_RIDER_URL=$NEXT_PUBLIC_RIDER_URL \
    NEXT_PUBLIC_SOCIAL_URL=$NEXT_PUBLIC_SOCIAL_URL \
    NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL \
    NEXT_PUBLIC_HR_URL=$NEXT_PUBLIC_HR_URL \
    NEXT_PUBLIC_ESS_URL=$NEXT_PUBLIC_ESS_URL \
    NEXT_PUBLIC_ACCOUNTS_URL=$NEXT_PUBLIC_ACCOUNTS_URL \
    NEXT_PUBLIC_PAYROLL_URL=$NEXT_PUBLIC_PAYROLL_URL \
    NEXT_PUBLIC_CMS_URL=$NEXT_PUBLIC_CMS_URL \
    NEXT_PUBLIC_IMAGE_HOST_PROTOCOL=$NEXT_PUBLIC_IMAGE_HOST_PROTOCOL \
    NEXT_PUBLIC_IMAGE_HOST_NAME=$NEXT_PUBLIC_IMAGE_HOST_NAME \
    NEXT_PUBLIC_IMAGE_HOST_PORT=$NEXT_PUBLIC_IMAGE_HOST_PORT \
    NEXTAUTH_SECRET=$WEB_NEXTAUTH_SECRET \
    NEXTAUTH_URL=$WEB_NEXTAUTH_URL \
    GOOGLE_CLIENT_KEY=$WEB_GOOGLE_CLIENT_KEY \
    GOOGLE_SECRET_KEY=$WEB_GOOGLE_SECRET_KEY

# Docker runtime stages run each app as a Next.js standalone server
# (COPY .next/standalone + `node server.js`). The shared next-config-base only
# emits output:'standalone' when NEXT_BUILD_OUTPUT is set — so set it here for
# every app build. (The systemd path instead uses `next start`, hence unset there.)
ENV NEXT_BUILD_OUTPUT=standalone

# ============================================================
#  NEXT.JS APP STAGES
# ============================================================
# Each app: build stage (FROM build-env) + runtime stage (FROM base).
# PORT is set at runtime via docker-compose environment.

# ----------------------------------------------------------
#  apps/admin/auth
# ----------------------------------------------------------
FROM build-env AS auth-build
RUN mkdir -p apps/admin/auth/public && npm run build --workspace=@rutba/auth

FROM base AS auth
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=auth-build /app/apps/admin/auth/.next/standalone ./
COPY --from=auth-build /app/apps/admin/auth/.next/static     ./apps/admin/auth/.next/static
COPY --from=auth-build /app/apps/admin/auth/public            ./apps/admin/auth/public
CMD ["node", "apps/admin/auth/server.js"]

# ----------------------------------------------------------
#  apps/inventory/stock
# ----------------------------------------------------------
FROM build-env AS stock-build
RUN mkdir -p apps/inventory/stock/public && npm run build --workspace=@rutba/stock

FROM base AS stock
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=stock-build /app/apps/inventory/stock/.next/standalone ./
COPY --from=stock-build /app/apps/inventory/stock/.next/static     ./apps/inventory/stock/.next/static
COPY --from=stock-build /app/apps/inventory/stock/public            ./apps/inventory/stock/public
CMD ["node", "apps/inventory/stock/server.js"]

# ----------------------------------------------------------
#  apps/sales/pos
# ----------------------------------------------------------
FROM build-env AS pos-build
RUN mkdir -p apps/sales/pos/public && npm run build --workspace=@rutba/pos

FROM base AS pos
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=pos-build /app/apps/sales/pos/.next/standalone ./
COPY --from=pos-build /app/apps/sales/pos/.next/static     ./apps/sales/pos/.next/static
COPY --from=pos-build /app/apps/sales/pos/public            ./apps/sales/pos/public
CMD ["node", "apps/sales/pos/server.js"]

# ----------------------------------------------------------
#  apps/content/storefront
# ----------------------------------------------------------
FROM build-env AS storefront-build
# apps/content/storefront runs via `next start` (NOT standalone). Turbopack's standalone
# externalization is broken in Next 16.2 — every externalized node_modules
# package (next-auth, axios, @radix-ui/*, …) is emitted as an unresolvable
# hashed specifier (<pkg>-<hash>) that fails at runtime. Unset standalone so a
# normal .next build is produced (flatten-standalone then no-ops), and serve it
# with `next start`, exactly how the systemd production path runs it.
ENV NEXT_BUILD_OUTPUT=
RUN mkdir -p apps/content/storefront/public && npm run build --workspace=@rutba/storefront

FROM base AS storefront
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
# Full app + hoisted node_modules (workspace symlinks resolve into ./packages).
COPY --from=storefront-build /app/node_modules ./node_modules
COPY --from=storefront-build /app/package.json ./package.json
COPY --from=storefront-build /app/packages     ./packages
COPY --from=storefront-build /app/scripts      ./scripts
COPY --from=storefront-build /app/apps/content/storefront    ./apps/content/storefront
WORKDIR /app/apps/content/storefront
CMD ["sh", "-c", "node /app/node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-4000}"]

# ----------------------------------------------------------
#  apps/sales/portal
# ----------------------------------------------------------
FROM build-env AS portal-build
RUN mkdir -p apps/sales/portal/public && npm run build --workspace=@rutba/portal

FROM base AS portal
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=portal-build /app/apps/sales/portal/.next/standalone ./
COPY --from=portal-build /app/apps/sales/portal/.next/static     ./apps/sales/portal/.next/static
COPY --from=portal-build /app/apps/sales/portal/public            ./apps/sales/portal/public
CMD ["node", "apps/sales/portal/server.js"]

# ----------------------------------------------------------
#  apps/sales/orders
# ----------------------------------------------------------
FROM build-env AS orders-build
RUN mkdir -p apps/sales/orders/public && npm run build --workspace=@rutba/orders

FROM base AS orders
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=orders-build /app/apps/sales/orders/.next/standalone ./
COPY --from=orders-build /app/apps/sales/orders/.next/static     ./apps/sales/orders/.next/static
COPY --from=orders-build /app/apps/sales/orders/public            ./apps/sales/orders/public
CMD ["node", "apps/sales/orders/server.js"]

# ----------------------------------------------------------
#  apps/sales/rider
# ----------------------------------------------------------
FROM build-env AS rider-build
RUN mkdir -p apps/sales/rider/public && npm run build --workspace=@rutba/rider

FROM base AS rider
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=rider-build /app/apps/sales/rider/.next/standalone ./
COPY --from=rider-build /app/apps/sales/rider/.next/static     ./apps/sales/rider/.next/static
COPY --from=rider-build /app/apps/sales/rider/public            ./apps/sales/rider/public
CMD ["node", "apps/sales/rider/server.js"]

# ----------------------------------------------------------
#  apps/sales/crm
# ----------------------------------------------------------
FROM build-env AS crm-build
RUN mkdir -p apps/sales/crm/public && npm run build --workspace=@rutba/crm

FROM base AS crm
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=crm-build /app/apps/sales/crm/.next/standalone ./
COPY --from=crm-build /app/apps/sales/crm/.next/static     ./apps/sales/crm/.next/static
COPY --from=crm-build /app/apps/sales/crm/public            ./apps/sales/crm/public
CMD ["node", "apps/sales/crm/server.js"]

# ----------------------------------------------------------
#  apps/people/hr
# ----------------------------------------------------------
FROM build-env AS hr-build
RUN mkdir -p apps/people/hr/public && npm run build --workspace=@rutba/hr

FROM base AS hr
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=hr-build /app/apps/people/hr/.next/standalone ./
COPY --from=hr-build /app/apps/people/hr/.next/static     ./apps/people/hr/.next/static
COPY --from=hr-build /app/apps/people/hr/public            ./apps/people/hr/public
CMD ["node", "apps/people/hr/server.js"]

# ----------------------------------------------------------
#  apps/people/ess
# ----------------------------------------------------------
FROM build-env AS ess-build
RUN mkdir -p apps/people/ess/public && npm run build --workspace=@rutba/ess

FROM base AS ess
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=ess-build /app/apps/people/ess/.next/standalone ./
COPY --from=ess-build /app/apps/people/ess/.next/static     ./apps/people/ess/.next/static
COPY --from=ess-build /app/apps/people/ess/public            ./apps/people/ess/public
CMD ["node", "apps/people/ess/server.js"]

# ----------------------------------------------------------
#  apps/finance/accounts
# ----------------------------------------------------------
FROM build-env AS accounts-build
RUN mkdir -p apps/finance/accounts/public && npm run build --workspace=@rutba/accounts

FROM base AS accounts
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=accounts-build /app/apps/finance/accounts/.next/standalone ./
COPY --from=accounts-build /app/apps/finance/accounts/.next/static     ./apps/finance/accounts/.next/static
COPY --from=accounts-build /app/apps/finance/accounts/public            ./apps/finance/accounts/public
CMD ["node", "apps/finance/accounts/server.js"]

# ----------------------------------------------------------
#  apps/finance/payroll
# ----------------------------------------------------------
FROM build-env AS payroll-build
RUN mkdir -p apps/finance/payroll/public && npm run build --workspace=@rutba/payroll

FROM base AS payroll
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=payroll-build /app/apps/finance/payroll/.next/standalone ./
COPY --from=payroll-build /app/apps/finance/payroll/.next/static     ./apps/finance/payroll/.next/static
COPY --from=payroll-build /app/apps/finance/payroll/public            ./apps/finance/payroll/public
CMD ["node", "apps/finance/payroll/server.js"]

# ----------------------------------------------------------
#  apps/content/cms
# ----------------------------------------------------------
FROM build-env AS cms-build
RUN mkdir -p apps/content/cms/public && npm run build --workspace=@rutba/cms

FROM base AS cms
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=cms-build /app/apps/content/cms/.next/standalone ./
COPY --from=cms-build /app/apps/content/cms/.next/static     ./apps/content/cms/.next/static
COPY --from=cms-build /app/apps/content/cms/public            ./apps/content/cms/public
CMD ["node", "apps/content/cms/server.js"]

# ----------------------------------------------------------
#  apps/content/social
# ----------------------------------------------------------
FROM build-env AS social-build
RUN mkdir -p apps/content/social/public && npm run build --workspace=@rutba/social

FROM base AS social
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=social-build /app/apps/content/social/.next/standalone ./
COPY --from=social-build /app/apps/content/social/.next/static     ./apps/content/social/.next/static
COPY --from=social-build /app/apps/content/social/public            ./apps/content/social/public
CMD ["node", "apps/content/social/server.js"]

# ----------------------------------------------------------
#  apps/inventory/manufacturing
# ----------------------------------------------------------
FROM build-env AS manufacturing-build
RUN mkdir -p apps/inventory/manufacturing/public && npm run build --workspace=@rutba/manufacturing

FROM base AS manufacturing
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=manufacturing-build /app/apps/inventory/manufacturing/.next/standalone ./
COPY --from=manufacturing-build /app/apps/inventory/manufacturing/.next/static     ./apps/inventory/manufacturing/.next/static
COPY --from=manufacturing-build /app/apps/inventory/manufacturing/public            ./apps/inventory/manufacturing/public
CMD ["node", "apps/inventory/manufacturing/server.js"]

# ----------------------------------------------------------
#  apps/sales/marketplace (Daraz integration UI)
# ----------------------------------------------------------
FROM build-env AS marketplace-build
RUN mkdir -p apps/sales/marketplace/public && npm run build --workspace=@rutba/marketplace

FROM base AS marketplace
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=marketplace-build /app/apps/sales/marketplace/.next/standalone ./
COPY --from=marketplace-build /app/apps/sales/marketplace/.next/static     ./apps/sales/marketplace/.next/static
COPY --from=marketplace-build /app/apps/sales/marketplace/public            ./apps/sales/marketplace/public
CMD ["node", "apps/sales/marketplace/server.js"]

# ----------------------------------------------------------
#  apps/sales/marketplace worker (standalone sync process — no HTTP)
#  Runs worker.js, not the Next server, so it needs the full
#  workspace (lib/, worker.js) + hoisted node_modules — which the
#  Next standalone stage above omits. Env (STRAPI_SERVICE_TOKEN,
#  DARAZ_*, …) is injected at runtime by compose, not baked in.
# ----------------------------------------------------------
FROM base AS marketplace-worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=marketplace-build /app/node_modules      ./node_modules
COPY --from=marketplace-build /app/package.json      ./package.json
COPY --from=marketplace-build /app/packages          ./packages
COPY --from=marketplace-build /app/apps/sales/marketplace ./apps/sales/marketplace
WORKDIR /app/apps/sales/marketplace
CMD ["node", "worker.js"]

# ----------------------------------------------------------
#  apps/inventory/control (Inventory Management UI)
# ----------------------------------------------------------
FROM build-env AS control-build
RUN mkdir -p apps/inventory/control/public && npm run build --workspace=@rutba/control

FROM base AS control
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=control-build /app/apps/inventory/control/.next/standalone ./
COPY --from=control-build /app/apps/inventory/control/.next/static     ./apps/inventory/control/.next/static
COPY --from=control-build /app/apps/inventory/control/public            ./apps/inventory/control/public
CMD ["node", "apps/inventory/control/server.js"]

# ----------------------------------------------------------
#  apps/admin/seed (Seeding control UI)
# ----------------------------------------------------------
FROM build-env AS seed-build
RUN mkdir -p apps/admin/seed/public && npm run build --workspace=@rutba/seed

FROM base AS seed
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=seed-build /app/apps/admin/seed/.next/standalone ./
COPY --from=seed-build /app/apps/admin/seed/.next/static     ./apps/admin/seed/.next/static
COPY --from=seed-build /app/apps/admin/seed/public            ./apps/admin/seed/public
CMD ["node", "apps/admin/seed/server.js"]

# ----------------------------------------------------------
#  apps/content/campaigns (Email marketing UI over Rutba-MTA)
# ----------------------------------------------------------
FROM build-env AS campaigns-build
RUN mkdir -p apps/content/campaigns/public && npm run build --workspace=@rutba/campaigns

FROM base AS campaigns
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=campaigns-build /app/apps/content/campaigns/.next/standalone ./
COPY --from=campaigns-build /app/apps/content/campaigns/.next/static     ./apps/content/campaigns/.next/static
COPY --from=campaigns-build /app/apps/content/campaigns/public            ./apps/content/campaigns/public
CMD ["node", "apps/content/campaigns/server.js"]

# ----------------------------------------------------------
#  apps/content/mail (Personal + shared inboxes over live IMAP)
# ----------------------------------------------------------
FROM build-env AS mail-build
RUN mkdir -p apps/content/mail/public && npm run build --workspace=@rutba/mail

FROM base AS mail
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=mail-build /app/apps/content/mail/.next/standalone ./
COPY --from=mail-build /app/apps/content/mail/.next/static     ./apps/content/mail/.next/static
COPY --from=mail-build /app/apps/content/mail/public            ./apps/content/mail/public
CMD ["node", "apps/content/mail/server.js"]

# ----------------------------------------------------------
#  apps/sales/helpdesk (Agent console: ticket queue, thread, desks, routing)
# ----------------------------------------------------------
FROM build-env AS helpdesk-build
RUN mkdir -p apps/sales/helpdesk/public && npm run build --workspace=@rutba/helpdesk

FROM base AS helpdesk
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=helpdesk-build /app/apps/sales/helpdesk/.next/standalone ./
COPY --from=helpdesk-build /app/apps/sales/helpdesk/.next/static     ./apps/sales/helpdesk/.next/static
COPY --from=helpdesk-build /app/apps/sales/helpdesk/public            ./apps/sales/helpdesk/public
CMD ["node", "apps/sales/helpdesk/server.js"]

# ----------------------------------------------------------
#  apps/admin/console (Admin console: users, roles, access, app domains, mail)
# ----------------------------------------------------------
FROM build-env AS console-build
RUN mkdir -p apps/admin/console/public && npm run build --workspace=@rutba/console

FROM base AS console
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=console-build /app/apps/admin/console/.next/standalone ./
COPY --from=console-build /app/apps/admin/console/.next/static     ./apps/admin/console/.next/static
COPY --from=console-build /app/apps/admin/console/public            ./apps/admin/console/public
CMD ["node", "apps/admin/console/server.js"]
