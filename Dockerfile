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
# build`, producing dist/ that pos-strapi loads), and native deps run their
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
WORKDIR /app/pos-strapi
RUN npm install
RUN npm run build

FROM base AS strapi
WORKDIR /app
COPY --from=strapi-build /app/pos-strapi   ./pos-strapi
COPY --from=deps /app/node_modules         ./node_modules
COPY --from=strapi-build /app/packages     ./packages

ENV NODE_ENV=production
WORKDIR /app/pos-strapi
CMD ["npx", "strapi", "start"]

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
ARG NEXT_PUBLIC_SALE_URL
ARG NEXT_PUBLIC_WEB_URL
ARG NEXT_PUBLIC_WEB_USER_URL
ARG NEXT_PUBLIC_ORDER_MANAGEMENT_URL
ARG NEXT_PUBLIC_MANUFACTURING_URL
ARG NEXT_PUBLIC_MARKETPLACE_URL
ARG NEXT_PUBLIC_INVENTORY_URL
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
    NEXT_PUBLIC_SALE_URL=$NEXT_PUBLIC_SALE_URL \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_WEB_USER_URL=$NEXT_PUBLIC_WEB_USER_URL \
    NEXT_PUBLIC_ORDER_MANAGEMENT_URL=$NEXT_PUBLIC_ORDER_MANAGEMENT_URL \
    NEXT_PUBLIC_MANUFACTURING_URL=$NEXT_PUBLIC_MANUFACTURING_URL \
    NEXT_PUBLIC_MARKETPLACE_URL=$NEXT_PUBLIC_MARKETPLACE_URL \
    NEXT_PUBLIC_INVENTORY_URL=$NEXT_PUBLIC_INVENTORY_URL \
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
#  pos-auth
# ----------------------------------------------------------
FROM build-env AS auth-build
RUN mkdir -p pos-auth/public && npm run build --workspace=pos-auth

FROM base AS auth
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=auth-build /app/pos-auth/.next/standalone ./
COPY --from=auth-build /app/pos-auth/.next/static     ./pos-auth/.next/static
COPY --from=auth-build /app/pos-auth/public            ./pos-auth/public
CMD ["node", "pos-auth/server.js"]

# ----------------------------------------------------------
#  pos-stock
# ----------------------------------------------------------
FROM build-env AS stock-build
RUN mkdir -p pos-stock/public && npm run build --workspace=pos-stock

FROM base AS stock
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=stock-build /app/pos-stock/.next/standalone ./
COPY --from=stock-build /app/pos-stock/.next/static     ./pos-stock/.next/static
COPY --from=stock-build /app/pos-stock/public            ./pos-stock/public
CMD ["node", "pos-stock/server.js"]

# ----------------------------------------------------------
#  pos-sale
# ----------------------------------------------------------
FROM build-env AS sale-build
RUN mkdir -p pos-sale/public && npm run build --workspace=pos-sale

FROM base AS sale
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=sale-build /app/pos-sale/.next/standalone ./
COPY --from=sale-build /app/pos-sale/.next/static     ./pos-sale/.next/static
COPY --from=sale-build /app/pos-sale/public            ./pos-sale/public
CMD ["node", "pos-sale/server.js"]

# ----------------------------------------------------------
#  rutba-web
# ----------------------------------------------------------
FROM build-env AS web-build
# rutba-web runs via `next start` (NOT standalone). Turbopack's standalone
# externalization is broken in Next 16.2 — every externalized node_modules
# package (next-auth, axios, @radix-ui/*, …) is emitted as an unresolvable
# hashed specifier (<pkg>-<hash>) that fails at runtime. Unset standalone so a
# normal .next build is produced (flatten-standalone then no-ops), and serve it
# with `next start`, exactly how the systemd production path runs it.
ENV NEXT_BUILD_OUTPUT=
RUN mkdir -p rutba-web/public && npm run build --workspace=rutba-web

FROM base AS web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
# Full app + hoisted node_modules (workspace symlinks resolve into ./packages).
COPY --from=web-build /app/node_modules ./node_modules
COPY --from=web-build /app/package.json ./package.json
COPY --from=web-build /app/packages     ./packages
COPY --from=web-build /app/scripts      ./scripts
COPY --from=web-build /app/rutba-web    ./rutba-web
WORKDIR /app/rutba-web
CMD ["sh", "-c", "node /app/node_modules/next/dist/bin/next start -H 0.0.0.0 -p ${PORT:-4000}"]

# ----------------------------------------------------------
#  rutba-web-user
# ----------------------------------------------------------
FROM build-env AS web-user-build
RUN mkdir -p rutba-web-user/public && npm run build --workspace=rutba-web-user

FROM base AS web-user
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=web-user-build /app/rutba-web-user/.next/standalone ./
COPY --from=web-user-build /app/rutba-web-user/.next/static     ./rutba-web-user/.next/static
COPY --from=web-user-build /app/rutba-web-user/public            ./rutba-web-user/public
CMD ["node", "rutba-web-user/server.js"]

# ----------------------------------------------------------
#  rutba-order-management
# ----------------------------------------------------------
FROM build-env AS order-management-build
RUN mkdir -p rutba-order-management/public && npm run build --workspace=rutba-order-management

FROM base AS order-management
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=order-management-build /app/rutba-order-management/.next/standalone ./
COPY --from=order-management-build /app/rutba-order-management/.next/static     ./rutba-order-management/.next/static
COPY --from=order-management-build /app/rutba-order-management/public            ./rutba-order-management/public
CMD ["node", "rutba-order-management/server.js"]

# ----------------------------------------------------------
#  rutba-rider
# ----------------------------------------------------------
FROM build-env AS rider-build
RUN mkdir -p rutba-rider/public && npm run build --workspace=rutba-rider

FROM base AS rider
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=rider-build /app/rutba-rider/.next/standalone ./
COPY --from=rider-build /app/rutba-rider/.next/static     ./rutba-rider/.next/static
COPY --from=rider-build /app/rutba-rider/public            ./rutba-rider/public
CMD ["node", "rutba-rider/server.js"]

# ----------------------------------------------------------
#  rutba-crm
# ----------------------------------------------------------
FROM build-env AS crm-build
RUN mkdir -p rutba-crm/public && npm run build --workspace=rutba-crm

FROM base AS crm
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=crm-build /app/rutba-crm/.next/standalone ./
COPY --from=crm-build /app/rutba-crm/.next/static     ./rutba-crm/.next/static
COPY --from=crm-build /app/rutba-crm/public            ./rutba-crm/public
CMD ["node", "rutba-crm/server.js"]

# ----------------------------------------------------------
#  rutba-hr
# ----------------------------------------------------------
FROM build-env AS hr-build
RUN mkdir -p rutba-hr/public && npm run build --workspace=rutba-hr

FROM base AS hr
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=hr-build /app/rutba-hr/.next/standalone ./
COPY --from=hr-build /app/rutba-hr/.next/static     ./rutba-hr/.next/static
COPY --from=hr-build /app/rutba-hr/public            ./rutba-hr/public
CMD ["node", "rutba-hr/server.js"]

# ----------------------------------------------------------
#  rutba-ess
# ----------------------------------------------------------
FROM build-env AS ess-build
RUN mkdir -p rutba-ess/public && npm run build --workspace=rutba-ess

FROM base AS ess
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=ess-build /app/rutba-ess/.next/standalone ./
COPY --from=ess-build /app/rutba-ess/.next/static     ./rutba-ess/.next/static
COPY --from=ess-build /app/rutba-ess/public            ./rutba-ess/public
CMD ["node", "rutba-ess/server.js"]

# ----------------------------------------------------------
#  rutba-accounts
# ----------------------------------------------------------
FROM build-env AS accounts-build
RUN mkdir -p rutba-accounts/public && npm run build --workspace=rutba-accounts

FROM base AS accounts
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=accounts-build /app/rutba-accounts/.next/standalone ./
COPY --from=accounts-build /app/rutba-accounts/.next/static     ./rutba-accounts/.next/static
COPY --from=accounts-build /app/rutba-accounts/public            ./rutba-accounts/public
CMD ["node", "rutba-accounts/server.js"]

# ----------------------------------------------------------
#  rutba-payroll
# ----------------------------------------------------------
FROM build-env AS payroll-build
RUN mkdir -p rutba-payroll/public && npm run build --workspace=rutba-payroll

FROM base AS payroll
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=payroll-build /app/rutba-payroll/.next/standalone ./
COPY --from=payroll-build /app/rutba-payroll/.next/static     ./rutba-payroll/.next/static
COPY --from=payroll-build /app/rutba-payroll/public            ./rutba-payroll/public
CMD ["node", "rutba-payroll/server.js"]

# ----------------------------------------------------------
#  rutba-cms
# ----------------------------------------------------------
FROM build-env AS cms-build
RUN mkdir -p rutba-cms/public && npm run build --workspace=rutba-cms

FROM base AS cms
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=cms-build /app/rutba-cms/.next/standalone ./
COPY --from=cms-build /app/rutba-cms/.next/static     ./rutba-cms/.next/static
COPY --from=cms-build /app/rutba-cms/public            ./rutba-cms/public
CMD ["node", "rutba-cms/server.js"]

# ----------------------------------------------------------
#  rutba-social
# ----------------------------------------------------------
FROM build-env AS social-build
RUN mkdir -p rutba-social/public && npm run build --workspace=rutba-social

FROM base AS social
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=social-build /app/rutba-social/.next/standalone ./
COPY --from=social-build /app/rutba-social/.next/static     ./rutba-social/.next/static
COPY --from=social-build /app/rutba-social/public            ./rutba-social/public
CMD ["node", "rutba-social/server.js"]

# ----------------------------------------------------------
#  rutba-manufacturing
# ----------------------------------------------------------
FROM build-env AS manufacturing-build
RUN mkdir -p rutba-manufacturing/public && npm run build --workspace=rutba-manufacturing

FROM base AS manufacturing
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=manufacturing-build /app/rutba-manufacturing/.next/standalone ./
COPY --from=manufacturing-build /app/rutba-manufacturing/.next/static     ./rutba-manufacturing/.next/static
COPY --from=manufacturing-build /app/rutba-manufacturing/public            ./rutba-manufacturing/public
CMD ["node", "rutba-manufacturing/server.js"]

# ----------------------------------------------------------
#  rutba-marketplace (Daraz integration UI)
# ----------------------------------------------------------
FROM build-env AS marketplace-build
RUN mkdir -p rutba-marketplace/public && npm run build --workspace=rutba-marketplace

FROM base AS marketplace
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=marketplace-build /app/rutba-marketplace/.next/standalone ./
COPY --from=marketplace-build /app/rutba-marketplace/.next/static     ./rutba-marketplace/.next/static
COPY --from=marketplace-build /app/rutba-marketplace/public            ./rutba-marketplace/public
CMD ["node", "rutba-marketplace/server.js"]

# ----------------------------------------------------------
#  rutba-marketplace worker (standalone sync process — no HTTP)
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
COPY --from=marketplace-build /app/rutba-marketplace ./rutba-marketplace
WORKDIR /app/rutba-marketplace
CMD ["node", "worker.js"]

# ----------------------------------------------------------
#  rutba-inventory (Inventory Management UI)
# ----------------------------------------------------------
FROM build-env AS inventory-build
RUN mkdir -p rutba-inventory/public && npm run build --workspace=rutba-inventory

FROM base AS inventory
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=inventory-build /app/rutba-inventory/.next/standalone ./
COPY --from=inventory-build /app/rutba-inventory/.next/static     ./rutba-inventory/.next/static
COPY --from=inventory-build /app/rutba-inventory/public            ./rutba-inventory/public
CMD ["node", "rutba-inventory/server.js"]
