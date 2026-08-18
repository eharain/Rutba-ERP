#!/usr/bin/env node
'use strict';

/**
 * scripts/env-config.js — Central registry of required environment variables
 *
 * Each entry:
 *   { key: string, severity: 'error'|'warn', default?: string, description: string }
 *
 *   severity 'error' → loader halts if the variable is missing (and no default)
 *   severity 'warn'  → loader prints a warning but continues
 *   default          → used when the variable is absent (prevents error/warn)
 *
 * App-specific keys are listed WITHOUT the PREFIX__ prefix.
 * At runtime the loader prepends PREFIX__ when looking up from the env source.
 */

// ── Global variables (injected into every app) ─────────────

const GLOBAL_VARS = [
  { key: 'NEXT_PUBLIC_API_URL',              severity: 'error', description: 'Strapi API base URL' },
  { key: 'NEXT_PUBLIC_IMAGE_URL',            severity: 'error', description: 'Strapi media base URL' },
  { key: 'NEXT_PUBLIC_STOREFRONT_URL',              severity: 'error', description: 'Public storefront URL' },
  { key: 'NEXT_PUBLIC_AUTH_URL',             severity: 'error', description: 'Auth portal URL' },
  { key: 'NEXT_PUBLIC_STOCK_URL',            severity: 'error', description: 'Stock app URL' },
  { key: 'NEXT_PUBLIC_POS_URL',             severity: 'error', description: 'Sale app URL' },
  { key: 'NEXT_PUBLIC_PORTAL_URL',         severity: 'error', description: 'Web User portal URL' },
  { key: 'NEXT_PUBLIC_CRM_URL',              severity: 'error', description: 'CRM app URL' },
  { key: 'NEXT_PUBLIC_HR_URL',               severity: 'error', description: 'HR app URL' },
  { key: 'NEXT_PUBLIC_ESS_URL',              severity: 'warn',  description: 'Employee Self-Service (ESS) portal URL' },
  { key: 'NEXT_PUBLIC_ACCOUNTS_URL',         severity: 'error', description: 'Accounts app URL' },
  { key: 'NEXT_PUBLIC_PAYROLL_URL',          severity: 'error', description: 'Payroll app URL' },
  { key: 'NEXT_PUBLIC_CMS_URL',              severity: 'error', description: 'CMS app URL' },
  { key: 'NEXT_PUBLIC_SOCIAL_URL',           severity: 'error', description: 'Social app URL' },
  { key: 'NEXT_PUBLIC_RIDER_URL',            severity: 'warn',  description: 'Rider app URL' },
  { key: 'NEXT_PUBLIC_ORDERS_URL', severity: 'warn',  description: 'Order Management app URL' },
  { key: 'NEXT_PUBLIC_MANUFACTURING_URL',    severity: 'warn',  description: 'Manufacturing app URL' },
  { key: 'NEXT_PUBLIC_MARKETPLACE_URL',      severity: 'warn',  description: 'Marketplace app URL' },
  { key: 'NEXT_PUBLIC_CONTROL_URL',        severity: 'warn',  description: 'Inventory Management app URL' },
  { key: 'NEXT_PUBLIC_SEED_URL',             severity: 'warn',  description: 'Seeding control app URL' },
  { key: 'NEXT_PUBLIC_CAMPAIGNS_URL',        severity: 'warn',  description: 'Campaigns app URL' },
  { key: 'NEXT_PUBLIC_HELPDESK_URL',         severity: 'warn',  description: 'Helpdesk app URL' },
  { key: 'NEXT_PUBLIC_MAIL_URL',             severity: 'warn',  description: 'Mail app URL' },
  { key: 'NEXT_PUBLIC_CONSOLE_URL',            severity: 'warn',  description: 'Rutba Admin console URL' },
  { key: 'NEXT_PUBLIC_IMAGE_HOST_PROTOCOL',  severity: 'error', description: 'Image host protocol (http/https)' },
  { key: 'NEXT_PUBLIC_IMAGE_HOST_NAME',      severity: 'error', description: 'Image host name' },
  { key: 'NEXT_PUBLIC_IMAGE_HOST_PORT',      severity: 'error', description: 'Image host port' },
  { key: 'NEXT_BUILD_OUTPUT',                     severity: 'warn',  description: 'Next.js build output type (standalone, export). Omit for Next.js default.' },
  { key: 'BUILD_DEST_DIR',                        severity: 'warn',  description: 'Common build output directory relative to workspace root (e.g. dist)' },
];

// ── App-specific variables (keyed by prefix, without PREFIX__) ──

const APP_VARS = {
  POS_STRAPI: [
    { key: 'DATABASE_CLIENT',                severity: 'error', description: 'Database driver (mysql, postgres, sqlite)' },
    { key: 'DATABASE_HOST',                  severity: 'error', description: 'Database host' },
    { key: 'DATABASE_NAME',                  severity: 'error', description: 'Database name' },
    { key: 'DATABASE_PASSWORD',              severity: 'error', description: 'Database password' },
    { key: 'DATABASE_PORT',                  severity: 'error', description: 'Database port' },
    { key: 'DATABASE_USERNAME',              severity: 'error', description: 'Database username' },
    { key: 'DATABASE_SSL',                   severity: 'warn',  default: 'false',   description: 'Database SSL' },
    { key: 'HOST',                           severity: 'warn',  default: '0.0.0.0', description: 'Strapi listen host' },
    { key: 'PORT',                           severity: 'warn',  default: '4010',     description: 'Strapi listen port' },
    { key: 'PUBLIC_URL',                     severity: 'warn',  description: 'Strapi public origin — used for absolute URLs (uploads, password-reset links). Required when running behind a reverse proxy on a public domain.' },
    { key: 'IS_PROXIED',                     severity: 'warn',  default: 'false',   description: 'Trust X-Forwarded-* headers from the reverse proxy (nginx/Caddy/Traefik). Set true in production.' },
    { key: 'APP_KEYS',                       severity: 'error', description: 'Strapi app keys (comma-separated)' },
    { key: 'API_TOKEN_SALT',                 severity: 'error', description: 'API token salt' },
    { key: 'ADMIN_JWT_SECRET',               severity: 'error', description: 'Admin JWT secret' },
    { key: 'JWT_SECRET',                     severity: 'error', description: 'JWT secret' },
    { key: 'TRANSFER_TOKEN_SALT',            severity: 'error', description: 'Transfer token salt' },
    { key: 'ENCRYPTION_KEY',                 severity: 'error', description: 'Encryption key' },
    { key: 'MYSQL_ROOT_PASSWORD',            severity: 'warn',  description: 'MySQL root password (Docker only)' },
    { key: 'EMAIL_HOST',                     severity: 'warn',  description: 'SMTP host for outbound mail (order alerts, password resets)' },
    { key: 'EMAIL_PORT',                     severity: 'warn',  default: '587',  description: 'SMTP port' },
    { key: 'EMAIL_USER',                     severity: 'warn',  description: 'SMTP username' },
    { key: 'EMAIL_PASS',                     severity: 'warn',  description: 'SMTP password' },
    { key: 'EMAIL_FROM',                     severity: 'warn',  description: 'Default From/Reply-To for outbound mail' },
    { key: 'ORDER_ALERT_EMAIL',              severity: 'warn',  description: 'Order management team mailbox — recipient for send_to=staff notification templates (e.g. the new-order alert). Comma-separated list allowed. Falls back to EMAIL_FROM.' },
    { key: 'MAIL_CRED_KEY',                  severity: 'warn',  description: 'AES-256-GCM key for mail-account IMAP/SMTP passwords (64 hex chars — `openssl rand -hex 32`). The mail module refuses to store or read credentials without it.' },
    { key: 'MAIL_IMAP_OP_TIMEOUT_MS',        severity: 'warn',  default: '15000',  description: 'Per-operation deadline for pooled IMAP commands' },
    { key: 'MAIL_CONNECT_TIMEOUT_MS',        severity: 'warn',  default: '10000',  description: 'IMAP/SMTP connect+login budget' },
    { key: 'MAIL_POOL_IDLE_MS',              severity: 'warn',  default: '300000', description: 'Idle eviction for pooled IMAP connections' },
    { key: 'MAIL_POOL_MAX',                  severity: 'warn',  default: '20',     description: 'Max live pooled IMAP connections' },
    { key: 'MAIL_ATTACH_MAX_MB',             severity: 'warn',  default: '15',     description: 'Attachment download/upload cap' },
    { key: 'MAIL_MESSAGE_MAX_MB',            severity: 'warn',  default: '25',     description: 'Full-message download cap for the reading pane' },
    { key: 'MAILCOW_BASE_URL',               severity: 'warn',  description: 'Mailcow origin for mailbox provisioning (e.g. https://mail.trustlist.uk). Blank = provisioning disabled.' },
    { key: 'MAILCOW_API_KEY',                severity: 'warn',  description: 'Mailcow admin API key (read-write) for mailbox/alias provisioning' },
    { key: 'MAILCOW_IMAP_HOST',              severity: 'warn',  description: 'IMAP host for provisioned mailboxes (defaults to the MAILCOW_BASE_URL hostname)' },
    { key: 'MAILCOW_SMTP_HOST',              severity: 'warn',  description: 'SMTP host for provisioned mailboxes (defaults to the MAILCOW_BASE_URL hostname)' },
    { key: 'UP_ACCESS_TOKEN_LIFESPAN',       severity: 'warn',  default: '15m',  description: 'Access token lifespan' },
    { key: 'UP_MAX_REFRESH_TOKEN_LIFESPAN',  severity: 'warn',  default: '30d',  description: 'Max refresh token lifespan' },
    { key: 'UP_IDLE_REFRESH_TOKEN_LIFESPAN', severity: 'warn',  default: '30d',  description: 'Idle refresh token lifespan' },
  ],

  // services/core reads the repo-root .env files directly (services/core/src/config/env.js)
  // and resolves shared keys through the POS_STRAPI__ fallback, so it needs no
  // duplicate DATABASE_*/JWT_SECRET entries here. PORT is the exception: it is
  // deliberately core-owned and must never inherit POS_STRAPI__PORT (4010).
  RUTBA_CORE: [
    { key: 'PORT',              severity: 'warn', default: '4020', description: 'Core API listen port' },
    { key: 'RUTBA_CORE_CRONS',  severity: 'warn', description: 'Set to 1 to run scheduled tasks here. Leave unset while services/strapi still schedules the same jobs — never run both.' },
    { key: 'RUTBA_CORE_EMAIL',  severity: 'warn', default: 'send', description: 'Outbound mail mode: send | log | off' },
    { key: 'RUTBA_CORE_LOG',    severity: 'warn', description: 'Request logging: requests | errors | off. Defaults to requests in development, errors elsewhere.' },
  ],

  RUTBA_WEB: [
    { key: 'PORT',              severity: 'warn',  default: '4000', description: 'Web listen port' },
    { key: 'NEXTAUTH_SECRET',   severity: 'error', description: 'NextAuth secret' },
    { key: 'NEXTAUTH_URL',      severity: 'error', description: 'NextAuth canonical URL' },
    { key: 'GOOGLE_CLIENT_KEY', severity: 'warn',  description: 'Google OAuth client key' },
    { key: 'GOOGLE_SECRET_KEY', severity: 'warn',  description: 'Google OAuth secret key' },
  ],
};

/** Default PORT-only entry for apps not explicitly listed above. */
const DEFAULT_APP_VARS = [
  { key: 'PORT',         severity: 'warn', description: 'App listen port' },
  { key: 'NEXT_BUILD_OUTPUT', severity: 'warn', description: 'Next.js build output type override (standalone, export)' },
  { key: 'BUILD_DEST_DIR',    severity: 'warn', description: 'Build output directory override' },
];

module.exports = { GLOBAL_VARS, APP_VARS, DEFAULT_APP_VARS };
