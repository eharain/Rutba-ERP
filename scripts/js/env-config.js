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
  { key: 'NEXT_PUBLIC_WEB_URL',              severity: 'error', description: 'Public storefront URL' },
  { key: 'NEXT_PUBLIC_AUTH_URL',             severity: 'error', description: 'Auth portal URL' },
  { key: 'NEXT_PUBLIC_STOCK_URL',            severity: 'error', description: 'Stock app URL' },
  { key: 'NEXT_PUBLIC_SALE_URL',             severity: 'error', description: 'Sale app URL' },
  { key: 'NEXT_PUBLIC_WEB_USER_URL',         severity: 'error', description: 'Web User portal URL' },
  { key: 'NEXT_PUBLIC_CRM_URL',              severity: 'error', description: 'CRM app URL' },
  { key: 'NEXT_PUBLIC_HR_URL',               severity: 'error', description: 'HR app URL' },
  { key: 'NEXT_PUBLIC_ACCOUNTS_URL',         severity: 'error', description: 'Accounts app URL' },
  { key: 'NEXT_PUBLIC_PAYROLL_URL',          severity: 'error', description: 'Payroll app URL' },
  { key: 'NEXT_PUBLIC_CMS_URL',              severity: 'error', description: 'CMS app URL' },
  { key: 'NEXT_PUBLIC_SOCIAL_URL',           severity: 'error', description: 'Social app URL' },
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
    { key: 'APP_KEYS',                       severity: 'error', description: 'Strapi app keys (comma-separated)' },
    { key: 'API_TOKEN_SALT',                 severity: 'error', description: 'API token salt' },
    { key: 'ADMIN_JWT_SECRET',               severity: 'error', description: 'Admin JWT secret' },
    { key: 'JWT_SECRET',                     severity: 'error', description: 'JWT secret' },
    { key: 'TRANSFER_TOKEN_SALT',            severity: 'error', description: 'Transfer token salt' },
    { key: 'ENCRYPTION_KEY',                 severity: 'error', description: 'Encryption key' },
    { key: 'MYSQL_ROOT_PASSWORD',            severity: 'warn',  description: 'MySQL root password (Docker only)' },
    { key: 'UP_ACCESS_TOKEN_LIFESPAN',       severity: 'warn',  default: '15m',  description: 'Access token lifespan' },
    { key: 'UP_MAX_REFRESH_TOKEN_LIFESPAN',  severity: 'warn',  default: '30d',  description: 'Max refresh token lifespan' },
    { key: 'UP_IDLE_REFRESH_TOKEN_LIFESPAN', severity: 'warn',  default: '30d',  description: 'Idle refresh token lifespan' },
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
