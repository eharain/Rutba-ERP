'use strict';

/**
 * api-provider-seed.js
 *
 * Seeds the api-pro plugin from @rutba/api-provider.
 *
 * Source of truth:
 * - domains/roles: `@rutba/api-provider/config/{domains,roles}.json`
 * - interfaces/methods/policies: `@rutba/api-provider/api/*.js` endpoint descriptors
 *
 * Delegates to the plugin's `seeder` service which is idempotent â€” re-running
 * upserts by stable keys (domain.key, role.key, interface.key, method composite
 * key, policy composite key).
 */

/**
 * @param {any} strapi
 */
async function seedApiProvider(strapi) {
    const plugin = strapi.plugin('api-pro');
    if (!plugin) {
        strapi.log.warn('[api-provider-seed] api-pro plugin not found â€” skipping seed');
        return;
    }

    const seederService = plugin.service('seeder');
    if (!seederService || typeof seederService.runFullSeed !== 'function') {
        strapi.log.warn('[api-provider-seed] api-pro.seeder service unavailable â€” skipping seed');
        return;
    }

    const result = await seederService.runFullSeed(strapi);

    if (!result?.ok) {
        strapi.log.error(`[api-provider-seed] seed failed: ${result?.error || 'unknown error'}`);
        return;
    }

    strapi.log.info(
        `[api-provider-seed] complete: domains=${result.domains} roles=${result.roles} ` +
        `interfaces=${result.interfaces} methods=${result.methods} policies=${result.policies} ` +
        `(scanned ${result.descriptorsScanned} descriptors)`
    );
}

module.exports = seedApiProvider;
