#!/usr/bin/env node
'use strict';

/**
 * scripts/hostinger/hostinger.config.js — Central Hostinger deployment config
 *
 * All app-to-domain mappings, SSH credentials, and server paths live here.
 * SSH password is read from the HOSTINGER_SSH_PASSWORD env var (required).
 */

const path = require('path');

// ── SSH connection ─────────────────────────────────────────

const SSH = {
  host: '147.93.88.29',
  port: 65002,
  username: 'u350906794',
  password: process.env.HOSTINGER_SSH_PASSWORD || (() => { throw new Error('Set HOSTINGER_SSH_PASSWORD env var'); })(),
  readyTimeout: 30000,
};

// ── Server paths ───────────────────────────────────────────

const REMOTE_HOME = `/home/${SSH.username}`;
const DOMAINS_ROOT = `${REMOTE_HOME}/domains`;
const NODE_BIN = '/opt/alt/alt-nodejs22/root/usr/bin/node';

// ── App registry ───────────────────────────────────────────
//
// Each key is the short app name used on the CLI (e.g. `node deploy.js web`).
//
//   type        'nextjs' | 'strapi'
//   workspace   npm workspace name (= local directory name)
//   domain      Hostinger website domain
//   prefix      env-config.js prefix (for CORS_ORIGINS auto-generation)
//
// For Next.js apps the build is done locally and uploaded as standalone.
// For Strapi the build runs on the server (no Turbopack issues).

const APPS = {
  strapi: {
    type: 'strapi',
    workspace: 'services/strapi',
    domain: 'rutba.rutba.pk',
    prefix: 'POS_STRAPI',
  },
  web: {
    type: 'nextjs',
    workspace: 'apps/content/storefront',
    domain: 'rutba.pk',
    prefix: 'RUTBA_WEB',
  },
  'web-user': {
    type: 'nextjs',
    workspace: 'apps/sales/portal',
    domain: 'user.rutba.pk',
    prefix: 'RUTBA_WEB_USER',
  },
  'order-management': {
    type: 'nextjs',
    workspace: 'apps/sales/orders',
    domain: 'orders.rutba.pk',
    prefix: 'RUTBA_ORDER_MANAGEMENT',
  },
  rider: {
    type: 'nextjs',
    workspace: 'apps/sales/rider',
    domain: 'rider.rutba.pk',
    prefix: 'RUTBA_RIDER',
  },
  auth: {
    type: 'nextjs',
    workspace: 'apps/admin/auth',
    domain: 'auth.rutba.pk',
    prefix: 'POS_AUTH',
  },
  stock: {
    type: 'nextjs',
    workspace: 'apps/inventory/stock',
    domain: 'stock.rutba.pk',
    prefix: 'POS_STOCK',
  },
  sale: {
    type: 'nextjs',
    workspace: 'apps/sales/pos',
    domain: 'sale.rutba.pk',
    prefix: 'POS_SALE',
  },
  crm: {
    type: 'nextjs',
    workspace: 'apps/sales/crm',
    domain: 'crm.rutba.pk',
    prefix: 'RUTBA_CRM',
  },
  hr: {
    type: 'nextjs',
    workspace: 'apps/people/hr',
    domain: 'hr.rutba.pk',
    prefix: 'RUTBA_HR',
  },
  ess: {
    type: 'nextjs',
    workspace: 'apps/people/ess',
    domain: 'ess.rutba.pk',
    prefix: 'RUTBA_ESS',
  },
  accounts: {
    type: 'nextjs',
    workspace: 'apps/finance/accounts',
    domain: 'accounts.rutba.pk',
    prefix: 'RUTBA_ACCOUNTS',
  },
  payroll: {
    type: 'nextjs',
    workspace: 'apps/finance/payroll',
    domain: 'payroll.rutba.pk',
    prefix: 'RUTBA_PAYROLL',
  },
  cms: {
    type: 'nextjs',
    workspace: 'apps/content/cms',
    domain: 'cms.rutba.pk',
    prefix: 'RUTBA_CMS',
  },
  social: {
    type: 'nextjs',
    workspace: 'apps/content/social',
    domain: 'social.rutba.pk',
    prefix: 'RUTBA_SOCIAL',
  },
};

// ── Helpers ────────────────────────────────────────────────

/** Resolve the remote public_html path for an app. */
function remoteAppRoot(appName) {
  const app = APPS[appName];
  if (!app) throw new Error(`Unknown app: ${appName}`);
  return `${DOMAINS_ROOT}/${app.domain}/public_html`;
}

/** Resolve the local workspace directory for an app. */
function localWorkspaceDir(appName) {
  const app = APPS[appName];
  if (!app) throw new Error(`Unknown app: ${appName}`);
  return path.resolve(__dirname, '..', '..', app.workspace);
}

/** Return the monorepo root directory. */
function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

/** List all registered app names. */
function appNames() {
  return Object.keys(APPS);
}

/** Get all production CORS origins (all app domains as https URLs). */
function allCorsOrigins() {
  const origins = new Set();
  for (const app of Object.values(APPS)) {
    origins.add(`https://${app.domain}`);
  }
  return [...origins];
}

module.exports = {
  SSH,
  REMOTE_HOME,
  DOMAINS_ROOT,
  NODE_BIN,
  APPS,
  remoteAppRoot,
  localWorkspaceDir,
  repoRoot,
  appNames,
  allCorsOrigins,
};
