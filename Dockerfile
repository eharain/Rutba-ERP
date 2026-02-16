# ============================================================
# Rutba POS — Multi-stage Dockerfile
# ============================================================
# Builds every Next.js app and Strapi from a single monorepo
# context.  Each service has its own final stage so
# docker-compose can target it with `build.target`.
#
# Usage (standalone):
#   docker build --target strapi  -t rutba/strapi  .
#   docker build --target auth    -t rutba/auth    .
#   docker build --target stock   -t rutba/stock   .
#   ...
#
# Usage (compose):
#   docker compose up --build
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

RUN npm ci --ignore-scripts

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
RUN npm run build

FROM base AS strapi
WORKDIR /app
COPY --from=strapi-build /app/pos-strapi   ./pos-strapi
COPY --from=deps /app/node_modules         ./node_modules
# Strapi may import shared code at runtime; copy the shared package
COPY --from=strapi-build /app/packages     ./packages

ENV NODE_ENV=production
EXPOSE 1337
WORKDIR /app/pos-strapi
CMD ["npx", "strapi", "start"]

# ============================================================
#  NEXT.JS APP BUILDER  (shared build stage)
# ============================================================
# Each app is built as a separate stage so only changed apps
# need to rebuild.  Next.js standalone output is used so the
# final image doesn't need the full node_modules tree.
#
# All POS apps (auth, stock, sale, web-user, crm, hr,
# accounts, payroll) follow the exact same pattern.
# ============================================================

# --- NEXT_PUBLIC_* vars are inlined at build time by Next.js ---
# They MUST be available as ENV during `next build`.  We
# declare them as ARGs (no defaults) so every value is
# sourced from the .env file via docker-compose `build.args`.

# ----------------------------------------------------------
#  pos-auth  (port 3003)
# ----------------------------------------------------------
FROM source AS auth-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_STOCK_URL
ARG NEXT_PUBLIC_SALE_URL
ARG NEXT_PUBLIC_WEB_USER_URL
ARG NEXT_PUBLIC_CRM_URL
ARG NEXT_PUBLIC_HR_URL
ARG NEXT_PUBLIC_ACCOUNTS_URL
ARG NEXT_PUBLIC_PAYROLL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_STOCK_URL=$NEXT_PUBLIC_STOCK_URL \
    NEXT_PUBLIC_SALE_URL=$NEXT_PUBLIC_SALE_URL \
    NEXT_PUBLIC_WEB_USER_URL=$NEXT_PUBLIC_WEB_USER_URL \
    NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL \
    NEXT_PUBLIC_HR_URL=$NEXT_PUBLIC_HR_URL \
    NEXT_PUBLIC_ACCOUNTS_URL=$NEXT_PUBLIC_ACCOUNTS_URL \
    NEXT_PUBLIC_PAYROLL_URL=$NEXT_PUBLIC_PAYROLL_URL
RUN mkdir -p pos-auth/public && npm run build --workspace=pos-auth

FROM base AS auth
WORKDIR /app
ENV NODE_ENV=production PORT=3003
COPY --from=auth-build /app/pos-auth/.next/standalone ./
COPY --from=auth-build /app/pos-auth/.next/static     ./pos-auth/.next/static
COPY --from=auth-build /app/pos-auth/public            ./pos-auth/public
EXPOSE 3003
CMD ["node", "pos-auth/server.js"]

# ----------------------------------------------------------
#  pos-stock  (port 3001)
# ----------------------------------------------------------
FROM source AS stock-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_STOCK_URL
ARG NEXT_PUBLIC_SALE_URL
ARG NEXT_PUBLIC_CRM_URL
ARG NEXT_PUBLIC_HR_URL
ARG NEXT_PUBLIC_ACCOUNTS_URL
ARG NEXT_PUBLIC_PAYROLL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_STOCK_URL=$NEXT_PUBLIC_STOCK_URL \
    NEXT_PUBLIC_SALE_URL=$NEXT_PUBLIC_SALE_URL \
    NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL \
    NEXT_PUBLIC_HR_URL=$NEXT_PUBLIC_HR_URL \
    NEXT_PUBLIC_ACCOUNTS_URL=$NEXT_PUBLIC_ACCOUNTS_URL \
    NEXT_PUBLIC_PAYROLL_URL=$NEXT_PUBLIC_PAYROLL_URL
RUN mkdir -p pos-stock/public && npm run build --workspace=pos-stock

FROM base AS stock
WORKDIR /app
ENV NODE_ENV=production PORT=3001
COPY --from=stock-build /app/pos-stock/.next/standalone ./
COPY --from=stock-build /app/pos-stock/.next/static     ./pos-stock/.next/static
COPY --from=stock-build /app/pos-stock/public            ./pos-stock/public
EXPOSE 3001
CMD ["node", "pos-stock/server.js"]

# ----------------------------------------------------------
#  pos-sale  (port 3002)
# ----------------------------------------------------------
FROM source AS sale-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_STOCK_URL
ARG NEXT_PUBLIC_SALE_URL
ARG NEXT_PUBLIC_CRM_URL
ARG NEXT_PUBLIC_HR_URL
ARG NEXT_PUBLIC_ACCOUNTS_URL
ARG NEXT_PUBLIC_PAYROLL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_STOCK_URL=$NEXT_PUBLIC_STOCK_URL \
    NEXT_PUBLIC_SALE_URL=$NEXT_PUBLIC_SALE_URL \
    NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL \
    NEXT_PUBLIC_HR_URL=$NEXT_PUBLIC_HR_URL \
    NEXT_PUBLIC_ACCOUNTS_URL=$NEXT_PUBLIC_ACCOUNTS_URL \
    NEXT_PUBLIC_PAYROLL_URL=$NEXT_PUBLIC_PAYROLL_URL
RUN mkdir -p pos-sale/public && npm run build --workspace=pos-sale

FROM base AS sale
WORKDIR /app
ENV NODE_ENV=production PORT=3002
COPY --from=sale-build /app/pos-sale/.next/standalone ./
COPY --from=sale-build /app/pos-sale/.next/static     ./pos-sale/.next/static
COPY --from=sale-build /app/pos-sale/public            ./pos-sale/public
EXPOSE 3002
CMD ["node", "pos-sale/server.js"]

# ----------------------------------------------------------
#  rutba-web  (port 3000)
# ----------------------------------------------------------
FROM source AS web-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_IMAGE_URL
ARG NEXT_PUBLIC_IMAGE_HOST_PROTOCOL
ARG NEXT_PUBLIC_IMAGE_HOST_NAME
ARG NEXT_PUBLIC_IMAGE_HOST_PORT
ARG NEXTAUTH_SECRET
ARG NEXTAUTH_URL
ARG GOOGLE_CLIENT_KEY
ARG GOOGLE_SECRET_KEY
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_IMAGE_URL=$NEXT_PUBLIC_IMAGE_URL \
    NEXT_PUBLIC_IMAGE_HOST_PROTOCOL=$NEXT_PUBLIC_IMAGE_HOST_PROTOCOL \
    NEXT_PUBLIC_IMAGE_HOST_NAME=$NEXT_PUBLIC_IMAGE_HOST_NAME \
    NEXT_PUBLIC_IMAGE_HOST_PORT=$NEXT_PUBLIC_IMAGE_HOST_PORT \
    NEXTAUTH_SECRET=$NEXTAUTH_SECRET \
    NEXTAUTH_URL=$NEXTAUTH_URL \
    GOOGLE_CLIENT_KEY=$GOOGLE_CLIENT_KEY \
    GOOGLE_SECRET_KEY=$GOOGLE_SECRET_KEY
RUN mkdir -p rutba-web/public && npm run build --workspace=rutba-web

FROM base AS web
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=web-build /app/rutba-web/.next/standalone ./
COPY --from=web-build /app/rutba-web/.next/static     ./rutba-web/.next/static
COPY --from=web-build /app/rutba-web/public            ./rutba-web/public
EXPOSE 3000
CMD ["node", "rutba-web/server.js"]

# ----------------------------------------------------------
#  rutba-web-user  (port 3004)
# ----------------------------------------------------------
FROM source AS web-user-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_WEB_USER_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_WEB_USER_URL=$NEXT_PUBLIC_WEB_USER_URL
RUN mkdir -p rutba-web-user/public && npm run build --workspace=rutba-web-user

FROM base AS web-user
WORKDIR /app
ENV NODE_ENV=production PORT=3004
COPY --from=web-user-build /app/rutba-web-user/.next/standalone ./
COPY --from=web-user-build /app/rutba-web-user/.next/static     ./rutba-web-user/.next/static
COPY --from=web-user-build /app/rutba-web-user/public            ./rutba-web-user/public
EXPOSE 3004
CMD ["node", "rutba-web-user/server.js"]

# ----------------------------------------------------------
#  rutba-crm  (port 3005)
# ----------------------------------------------------------
FROM source AS crm-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_CRM_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_CRM_URL=$NEXT_PUBLIC_CRM_URL
RUN mkdir -p rutba-crm/public && npm run build --workspace=rutba-crm

FROM base AS crm
WORKDIR /app
ENV NODE_ENV=production PORT=3005
COPY --from=crm-build /app/rutba-crm/.next/standalone ./
COPY --from=crm-build /app/rutba-crm/.next/static     ./rutba-crm/.next/static
COPY --from=crm-build /app/rutba-crm/public            ./rutba-crm/public
EXPOSE 3005
CMD ["node", "rutba-crm/server.js"]

# ----------------------------------------------------------
#  rutba-hr  (port 3006)
# ----------------------------------------------------------
FROM source AS hr-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_HR_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_HR_URL=$NEXT_PUBLIC_HR_URL
RUN mkdir -p rutba-hr/public && npm run build --workspace=rutba-hr

FROM base AS hr
WORKDIR /app
ENV NODE_ENV=production PORT=3006
COPY --from=hr-build /app/rutba-hr/.next/standalone ./
COPY --from=hr-build /app/rutba-hr/.next/static     ./rutba-hr/.next/static
COPY --from=hr-build /app/rutba-hr/public            ./rutba-hr/public
EXPOSE 3006
CMD ["node", "rutba-hr/server.js"]

# ----------------------------------------------------------
#  rutba-accounts  (port 3007)
# ----------------------------------------------------------
FROM source AS accounts-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_ACCOUNTS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_ACCOUNTS_URL=$NEXT_PUBLIC_ACCOUNTS_URL
RUN mkdir -p rutba-accounts/public && npm run build --workspace=rutba-accounts

FROM base AS accounts
WORKDIR /app
ENV NODE_ENV=production PORT=3007
COPY --from=accounts-build /app/rutba-accounts/.next/standalone ./
COPY --from=accounts-build /app/rutba-accounts/.next/static     ./rutba-accounts/.next/static
COPY --from=accounts-build /app/rutba-accounts/public            ./rutba-accounts/public
EXPOSE 3007
CMD ["node", "rutba-accounts/server.js"]

# ----------------------------------------------------------
#  rutba-payroll  (port 3008)
# ----------------------------------------------------------
FROM source AS payroll-build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_URL
ARG NEXT_PUBLIC_PAYROLL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_AUTH_URL=$NEXT_PUBLIC_AUTH_URL \
    NEXT_PUBLIC_PAYROLL_URL=$NEXT_PUBLIC_PAYROLL_URL
RUN mkdir -p rutba-payroll/public && npm run build --workspace=rutba-payroll

FROM base AS payroll
WORKDIR /app
ENV NODE_ENV=production PORT=3008
COPY --from=payroll-build /app/rutba-payroll/.next/standalone ./
COPY --from=payroll-build /app/rutba-payroll/.next/static     ./rutba-payroll/.next/static
COPY --from=payroll-build /app/rutba-payroll/public            ./rutba-payroll/public
EXPOSE 3008
CMD ["node", "rutba-payroll/server.js"]
