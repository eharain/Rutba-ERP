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

# Copy root workspace manifests
COPY package.json package-lock.json ./

# Copy every workspace's package.json so npm can resolve them
COPY packages/pos-shared/package.json  packages/pos-shared/
COPY pos-strapi/package.json           pos-strapi/
COPY pos-auth/package.json             pos-auth/
COPY pos-stock/package.json            pos-stock/
COPY pos-sale/package.json             pos-sale/
COPY pos-desk/package.json             pos-desk/
COPY rutba-web/package.json            rutba-web/
COPY rutba-web-user/package.json       rutba-web-user/
COPY rutba-crm/package.json            rutba-crm/
COPY rutba-hr/package.json             rutba-hr/
COPY rutba-accounts/package.json       rutba-accounts/
COPY rutba-payroll/package.json        rutba-payroll/

RUN npm ci

# ----------------------------------------------------------
# 2.  Source — copy all source code on top of deps
# ----------------------------------------------------------
FROM deps AS source
COPY . .

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
ARG NEXT_PUBLIC_CRM_URL
ARG NEXT_PUBLIC_HR_URL
ARG NEXT_PUBLIC_ACCOUNTS_URL
ARG NEXT_PUBLIC_PAYROLL_URL
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
    NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL \
    NEXT_PUBLIC_HR_URL=$NEXT_PUBLIC_HR_URL \
    NEXT_PUBLIC_ACCOUNTS_URL=$NEXT_PUBLIC_ACCOUNTS_URL \
    NEXT_PUBLIC_PAYROLL_URL=$NEXT_PUBLIC_PAYROLL_URL \
    NEXT_PUBLIC_IMAGE_HOST_PROTOCOL=$NEXT_PUBLIC_IMAGE_HOST_PROTOCOL \
    NEXT_PUBLIC_IMAGE_HOST_NAME=$NEXT_PUBLIC_IMAGE_HOST_NAME \
    NEXT_PUBLIC_IMAGE_HOST_PORT=$NEXT_PUBLIC_IMAGE_HOST_PORT \
    NEXTAUTH_SECRET=$WEB_NEXTAUTH_SECRET \
    NEXTAUTH_URL=$WEB_NEXTAUTH_URL \
    GOOGLE_CLIENT_KEY=$WEB_GOOGLE_CLIENT_KEY \
    GOOGLE_SECRET_KEY=$WEB_GOOGLE_SECRET_KEY

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
RUN mkdir -p rutba-web/public && npm run build --workspace=rutba-web

FROM base AS web
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0
COPY --from=web-build /app/rutba-web/.next/standalone ./
COPY --from=web-build /app/rutba-web/.next/static     ./rutba-web/.next/static
COPY --from=web-build /app/rutba-web/public            ./rutba-web/public
CMD ["node", "rutba-web/server.js"]

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
