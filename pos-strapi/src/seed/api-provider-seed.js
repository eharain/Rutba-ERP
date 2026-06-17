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

    // The first boot after a descriptor change runs the full ~2.4k-policy seed,
    // which can briefly contend with boot-time schema sync and exhaust the
    // connection pool ("Timeout acquiring a connection"). runFullSeed is
    // idempotent (upserts by stable keys), so retry a couple of times with a
    // short backoff rather than leaving the seed half-applied until the next
    // manual restart.
    const isPoolTimeout = (err) =>
        err && (err.name === 'KnexTimeoutError' ||
            /acquir(e|ing) a connection|pool is probably full/i.test(err.message || ''));

    let result;
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            result = await seederService.runFullSeed(strapi);
            break;
        } catch (err) {
            if (isPoolTimeout(err) && attempt < MAX_ATTEMPTS) {
                const waitMs = 2000 * attempt;
                strapi.log.warn(`[api-provider-seed] pool busy (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${waitMs}ms`);
                await new Promise((r) => setTimeout(r, waitMs));
                continue;
            }
            throw err;
        }
    }

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
