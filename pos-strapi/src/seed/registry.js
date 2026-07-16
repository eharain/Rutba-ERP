'use strict';

/**
 * The single source of truth for what "seeding" is in this project.
 *
 * Every seeding item — system bootstrap data, reference data, backfills — is one
 * ordered entry here. The seed engine (src/api/seed-run/services/seed-engine.js)
 * iterates this list; the CLI (scripts/seed.js) and the control app both drive
 * the engine. Nothing seeds inside the server's bootstrap() anymore.
 *
 * Entry shape:
 *   key              stable id (used by --only / --skip and the UI)
 *   title            human label for logs + UI
 *   category         'system' | 'reference' | 'backfill' | 'workflow' | 'demo'
 *   essential        run in the deploy one-shot / fresh-DB path
 *   supportsPartial  can run in incremental (skip-existing) mode
 *   supportsFull     can be force re-applied (bypass fingerprint/short-circuit)
 *   hasMigration     reference data that ALSO ships a first-boot Strapi migration
 *   run(strapi, { mode }) -> any   the idempotent seeder; return value is
 *                    normalized by the engine into a { created, updated, skipped }
 *                    summary where available.
 *
 * Order matters: indexes + essentials first, heavy descriptor/reference seeds
 * next, backfills (which operate on already-present content) last.
 */

const ensureSlugIndexes = require('../db/ensure-slug-indexes');
const {
    ensureUsersPermissionsDefaults,
    ensureUsersPermissionsEmailFrom,
    ensureUsersPermissionsEmailConfirmation,
    ensureSiteSettingSingleton,
} = require('./core-singletons');
const seedApiProvider = require('./api-provider-seed');
const seedUpPermissions = require('./up-permissions-seed');
const seedAccounting = require('./accounting-seed');
const { runJsonSeedFile } = require('./json-seed-runner');
const ensureSeoMetaPerEntity = require('./seo-meta-backfill');
const backfillProductSlugs = require('./product-slug-backfill');
const { applyReturnPolicy } = require('./seeders/return-policy');
const { applyCostChangeApprovalTemplate } = require('./seeders/cost-change-approval-template');
const { seedDefaultWorkflows } = require('./seeders/default-workflows');
const { backfillInventoryFoundation } = require('./seeders/inventory-foundation');
const { seedTailoringUnit } = require('./seeders/tailoring-unit-demo');

/** @type {Array<{key:string,title:string,category:string,essential:boolean,supportsPartial:boolean,supportsFull:boolean,hasMigration:boolean,run:(strapi:any,opts:{mode:string})=>any}>} */
const REGISTRY = [
    {
        key: 'up-defaults',
        title: 'Users-permissions roles + default role',
        category: 'system',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => ensureUsersPermissionsDefaults(strapi),
    },
    {
        key: 'up-email-from',
        title: 'Users-permissions email FROM',
        category: 'system',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => ensureUsersPermissionsEmailFrom(strapi),
    },
    {
        key: 'up-email-confirmation',
        title: 'Users-permissions email confirmation settings',
        category: 'system',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => ensureUsersPermissionsEmailConfirmation(strapi),
    },
    {
        key: 'site-setting',
        title: 'Site-setting singleton',
        category: 'reference',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => ensureSiteSettingSingleton(strapi),
    },
    {
        key: 'slug-indexes',
        title: 'Slug DB indexes',
        category: 'system',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => ensureSlugIndexes(strapi),
    },
    {
        key: 'api-provider',
        title: 'api-pro descriptors (domains/roles/interfaces/policies)',
        category: 'system',
        essential: true,
        supportsPartial: true,
        // Full-mode force (bypass the mtime fingerprint) is wired when the
        // endpoints land; today the seeder self-decides via its fingerprint.
        supportsFull: false,
        hasMigration: false,
        run: (strapi) => seedApiProvider(strapi),
    },
    {
        key: 'up-permissions',
        title: 'Users-permissions grants for descriptor content-types',
        category: 'system',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => seedUpPermissions(strapi),
    },
    {
        key: 'accounting',
        title: 'Accounting chart of accounts + mappings + fiscal period',
        category: 'reference',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => seedAccounting(strapi),
    },
    // Reference data backed by a first-boot Strapi migration; the same
    // idempotent body is exposed here so it can be re-run on demand from the
    // control app. (Migrations run once, filename-bound; these entries let an
    // admin re-apply a wiped/edited default without renaming a migration.)
    {
        key: 'return-policy',
        title: 'Default return policy',
        category: 'reference',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: true,
        run: (strapi) => applyReturnPolicy(strapi.db.connection),
    },
    {
        key: 'cost-change-template',
        title: 'Order cost-change approval email template',
        category: 'reference',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: true,
        run: (strapi) => applyCostChangeApprovalTemplate(strapi.db.connection),
    },
    // Definable workflows for manufacturing (work orders) + order management
    // (sale orders, return requests). Essential so a fresh DB comes up with the
    // default workflows instead of falling back to the state machines' hardcoded
    // maps. Idempotent: skips an entity that already has a workflow.
    {
        key: 'default-workflows',
        title: 'Default workflows (work order, sale order, return request)',
        category: 'workflow',
        essential: true,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => seedDefaultWorkflows(strapi),
    },
    // Per-file JSON content seeds (src/seed/data/*.json). Each dataset is its own
    // tailorable entry — media ($seedMedia) and relation ($seedLink) resolution
    // is handled by the shared json-seed runner.
    {
        key: 'delivery-methods',
        title: 'Delivery methods',
        category: 'reference',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => runJsonSeedFile(strapi, 'delivery-method.json'),
    },
    {
        key: 'notification-templates',
        title: 'Notification templates',
        category: 'reference',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => runJsonSeedFile(strapi, 'notification-template.json'),
    },
    {
        key: 'cms-pages',
        title: 'CMS pages',
        category: 'reference',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => runJsonSeedFile(strapi, 'cms-page.json'),
    },
    {
        key: 'site-setting-content',
        title: 'Site-setting content (logo, copy)',
        category: 'reference',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => runJsonSeedFile(strapi, 'site-setting.json'),
    },
    {
        key: 'seo-meta',
        title: 'SEO-meta sidecar backfill',
        category: 'backfill',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => ensureSeoMetaPerEntity(strapi),
    },
    {
        key: 'product-slug',
        title: 'Product slug backfill',
        category: 'backfill',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => backfillProductSlugs(strapi),
    },
    {
        key: 'inventory-foundation',
        title: 'Inventory foundation backfill (default warehouses/locations + stock-level cache)',
        category: 'backfill',
        essential: false,
        supportsPartial: true,
        supportsFull: true,
        hasMigration: false,
        run: (strapi) => backfillInventoryFoundation(strapi),
    },
    // Demo dataset — never essential; run explicitly with --only=tailoring-unit
    // on a clean/dev DB. Guards against re-running (skips if mfg-operations exist).
    {
        key: 'tailoring-unit',
        title: 'Demo: tailoring & stitching unit (mfg dataset)',
        category: 'demo',
        essential: false,
        supportsPartial: true,
        supportsFull: false,
        hasMigration: false,
        run: (strapi) => seedTailoringUnit(strapi),
    },
];

module.exports = { REGISTRY };
