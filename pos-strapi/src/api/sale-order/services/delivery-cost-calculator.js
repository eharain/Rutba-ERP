'use strict';

const easypostService = require('./easypost-service');

/**
 * Delivery Cost Calculator Service
 *
 * Accepts cart items (with source_group_ids), destination address,
 * total weight, and cart total. Returns sorted array of applicable
 * delivery methods with calculated costs.
 */

module.exports = {
    /**
     * @param {object} params
     * @param {string[]} params.productGroupDocumentIds  - documentIds of all product groups in cart
     * @param {{ city: string, country: string }} params.destinationAddress
     * @param {number} params.cartWeightKg
     * @param {number} params.cartTotal
     * @returns {Promise<DeliveryOption[]>}
     */
    async calculate({ productGroupDocumentIds = [], destinationAddress, cartWeightKg = 0, cartTotal = 0 }) {
        const { city = '', country = 'PK' } = destinationAddress || {};
        const isInternational = country && country !== 'PK';

        // Find all active delivery methods that include ALL cart product groups
        const allMethods = await strapi.documents('api::delivery-method.delivery-method').findMany({
            filters: { is_active: { $eq: true } },
            populate: {
                delivery_zones: { fields: ['id', 'documentId', 'name', 'zone_type', 'cities', 'countries', 'is_active'] },
                product_groups: { fields: ['id', 'documentId'] },
            },
            sort: 'priority:asc',
        });

        const results = [];

        for (const method of allMethods) {
            // If cart has product groups, method must cover all of them
            if (productGroupDocumentIds.length > 0) {
                const methodGroupIds = (method.product_groups || []).map((g) => g.documentId);
                const coversAll = productGroupDocumentIds.every((gid) => methodGroupIds.includes(gid));
                if (!coversAll) continue;
            }

            // Find a matching delivery zone for the destination
            const matchingZone = (method.delivery_zones || []).find((zone) => {
                if (!zone.is_active) return false;
                if (isInternational) {
                    if (zone.zone_type !== 'international') return false;
                    const countries = Array.isArray(zone.countries) ? zone.countries : [];
                    return countries.length === 0 || countries.map((c) => c.toLowerCase()).includes(country.toLowerCase());
                }
                // Domestic: zone must be domestic type
                if (zone.zone_type === 'international') return false;
                const cities = Array.isArray(zone.cities) ? zone.cities : [];
                // Empty cities list means zone covers all domestic cities
                if (cities.length === 0) return true;
                return cities.map((c) => c.toLowerCase()).includes(city.toLowerCase());
            });

            if (!matchingZone) continue;

            // Calculate cost
            let cost = Number(method.base_cost || 0) + cartWeightKg * Number(method.per_kg_rate || 0);
            let easypostRateId = null;
            let easypostServiceName = null;
            let rateUnavailable = false;

            if (isInternational && method.service_provider === 'easypost') {
                const toAddress = {
                    name: destinationAddress?.name || 'Customer',
                    address: destinationAddress?.address || '',
                    city: destinationAddress?.city || '',
                    state: destinationAddress?.state || '',
                    zip_code: destinationAddress?.zip_code || '',
                    country: destinationAddress?.country || 'PK',
                    phone_number: destinationAddress?.phone_number || '',
                };

                const fromAddress = {
                    name: process.env.EASYPOST_FROM_NAME || 'Rutba Store',
                    address: process.env.EASYPOST_FROM_ADDRESS || 'Islamabad',
                    city: process.env.EASYPOST_FROM_CITY || 'Islamabad',
                    state: process.env.EASYPOST_FROM_STATE || 'Islamabad',
                    zip_code: process.env.EASYPOST_FROM_ZIP || '44000',
                    country: process.env.EASYPOST_FROM_COUNTRY || 'PK',
                    phone_number: process.env.EASYPOST_FROM_PHONE || '',
                };

                try {
                    const { rates = [] } = await easypostService.getRates(
                        toAddress,
                        fromAddress,
                        {
                            weight: Math.max(1, Number(cartWeightKg || 1) * 1000), // grams
                            length: Number(process.env.DEFAULT_PARCEL_LENGTH || 10),
                            width: Number(process.env.DEFAULT_PARCEL_WIDTH || 10),
                            height: Number(process.env.DEFAULT_PARCEL_HEIGHT || 5),
                        }
                    );

                    const parsedRates = rates
                        .map((r) => ({
                            rateId: r.id,
                            service: r.service,
                            amount: Number(r.rate),
                            currency: r.currency,
                        }))
                        .filter((r) => Number.isFinite(r.amount))
                        .sort((a, b) => a.amount - b.amount);

                    if (parsedRates.length > 0) {
                        cost = parsedRates[0].amount;
                        easypostRateId = parsedRates[0].rateId;
                        easypostServiceName = parsedRates[0].service;
                    } else {
                        rateUnavailable = true;
                    }
                } catch (err) {
                    rateUnavailable = true;
                    strapi.log.warn(`[delivery-cost] EasyPost rate lookup failed: ${err.message}`);
                }
            }

            // Apply free shipping threshold
            const threshold = Number(method.free_shipping_threshold || 0);
            if (threshold > 0 && cartTotal >= threshold) {
                cost = 0;
            }

            results.push({
                methodId: method.id,
                methodDocumentId: method.documentId,
                name: method.name,
                description: method.description || '',
                serviceProvider: method.service_provider,
                cost: Math.round(cost * 100) / 100,
                estimatedDaysMin: method.estimated_days_min || 1,
                estimatedDaysMax: method.estimated_days_max || 3,
                isFreeShipping: threshold > 0 && cartTotal >= threshold,
                zoneId: matchingZone.id,
                zoneDocumentId: matchingZone.documentId,
                zoneType: matchingZone.zone_type,
                offerTimeoutMinutes: method.offer_timeout_minutes || 5,
                // EasyPost methods: rates fetched separately client-side
                requiresRateQuery: method.service_provider === 'easypost',
                easypostRateId,
                easypostServiceName,
                rateUnavailable,
            });
        }

        return results;
    },
};
