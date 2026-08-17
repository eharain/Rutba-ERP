'use strict';

/**
 * Shipping / delivery profiles → api::delivery-zone + api::delivery-method
 * (linked many-to-many).
 *
 * One seeder per region so a tenant enables only the lanes they ship. Idempotent
 * by name: an existing zone is reused (its id is still linked to new methods); an
 * existing method is left untouched (skip) so admin edits and zone links aren't
 * clobbered. Amounts are illustrative defaults in the tenant's base currency
 * (PKR for the Pakistan lanes) — confirm against live carrier rates.
 */

// Reuse a zone by name or create it; always returns its numeric id.
async function ensureZone(strapi, def, counters) {
    const uid = 'api::delivery-zone.delivery-zone';
    const existing = await strapi.db.query(uid).findOne({ where: { name: def.name }, select: ['id'] });
    if (existing) { counters.skipped += 1; return existing.id; }
    const row = await strapi.db.query(uid).create({
        data: {
            name: def.name,
            zone_type: def.zone_type,
            cities: def.cities || null,
            countries: def.countries || null,
            is_active: true,
        },
    });
    counters.created += 1;
    return row.id;
}

// Create a method by name if missing, linking it to the given zone ids. Existing
// methods are skipped (not relinked) to preserve admin edits.
async function ensureMethod(strapi, def, zoneIds, counters) {
    const uid = 'api::delivery-method.delivery-method';
    const existing = await strapi.db.query(uid).findOne({ where: { name: def.name }, select: ['id'] });
    if (existing) { counters.skipped += 1; return; }
    await strapi.db.query(uid).create({
        data: {
            name: def.name,
            description: def.description || null,
            base_cost: def.base_cost ?? 0,
            per_kg_rate: def.per_kg_rate ?? 0,
            free_shipping_threshold: def.free_shipping_threshold ?? null,
            service_provider: def.service_provider || 'custom',
            supports_cod: def.supports_cod ?? false,
            estimated_days_min: def.estimated_days_min ?? 1,
            estimated_days_max: def.estimated_days_max ?? 3,
            priority: def.priority ?? 0,
            is_active: true,
            delivery_zones: zoneIds,
        },
    });
    counters.created += 1;
}

/* ── Pakistan — own-rider + local couriers, COD-first ──────────────── */
async function applyShippingPakistan(strapi) {
    const c = { created: 0, skipped: 0 };

    const localId = await ensureZone(strapi, {
        name: 'Pakistan — Local (Own Rider)',
        zone_type: 'domestic_own_rider',
        cities: ['Islamabad', 'Rawalpindi'],
    }, c);
    const majorId = await ensureZone(strapi, {
        name: 'Pakistan — Major Cities',
        zone_type: 'domestic_courier',
        cities: ['Karachi', 'Lahore', 'Islamabad', 'Rawalpindi', 'Faisalabad',
            'Multan', 'Peshawar', 'Quetta', 'Gujranwala', 'Sialkot', 'Hyderabad'],
    }, c);
    const natId = await ensureZone(strapi, {
        name: 'Pakistan — Nationwide',
        zone_type: 'domestic_courier',
        cities: [],
    }, c);

    await ensureMethod(strapi, {
        name: 'Own Rider (Local)', service_provider: 'own_rider',
        base_cost: 150, per_kg_rate: 0, supports_cod: true,
        estimated_days_min: 0, estimated_days_max: 1, priority: 10,
        description: 'Same/next-day delivery by in-house riders in the local zone.',
    }, [localId], c);

    await ensureMethod(strapi, {
        name: 'TCS Overnight', service_provider: 'custom',
        base_cost: 250, per_kg_rate: 50, supports_cod: true,
        estimated_days_min: 1, estimated_days_max: 2, priority: 8,
    }, [majorId, natId], c);

    await ensureMethod(strapi, {
        name: 'Leopards Courier', service_provider: 'custom',
        base_cost: 200, per_kg_rate: 40, supports_cod: true,
        estimated_days_min: 2, estimated_days_max: 3, priority: 6,
    }, [majorId, natId], c);

    await ensureMethod(strapi, {
        name: 'M&P Courier', service_provider: 'custom',
        base_cost: 200, per_kg_rate: 40, supports_cod: true,
        estimated_days_min: 2, estimated_days_max: 4, priority: 5,
    }, [natId], c);

    await ensureMethod(strapi, {
        name: 'Pakistan Post', service_provider: 'custom',
        base_cost: 150, per_kg_rate: 30, supports_cod: false,
        estimated_days_min: 3, estimated_days_max: 7, priority: 2,
    }, [natId], c);

    return c;
}

/* ── International — carrier lanes by region ────────────────────────── */
async function applyShippingInternational(strapi) {
    const c = { created: 0, skipped: 0 };

    const meId = await ensureZone(strapi, {
        name: 'International — Middle East', zone_type: 'international',
        countries: ['AE', 'SA', 'QA', 'KW', 'OM', 'BH'],
    }, c);
    const euId = await ensureZone(strapi, {
        name: 'International — Europe', zone_type: 'international',
        countries: ['GB', 'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'SE', 'IE', 'PL', 'PT', 'AT', 'DK', 'FI'],
    }, c);
    const naId = await ensureZone(strapi, {
        name: 'International — North America', zone_type: 'international',
        countries: ['US', 'CA'],
    }, c);
    const apId = await ensureZone(strapi, {
        name: 'International — Asia Pacific', zone_type: 'international',
        countries: ['AU', 'NZ', 'SG', 'MY', 'IN', 'CN', 'JP', 'HK'],
    }, c);
    const rowId = await ensureZone(strapi, {
        name: 'International — Rest of World', zone_type: 'international',
        countries: [],
    }, c);

    const allIntl = [meId, euId, naId, apId, rowId];

    await ensureMethod(strapi, {
        name: 'DHL Express International', service_provider: 'custom',
        base_cost: 3500, per_kg_rate: 800, supports_cod: false,
        estimated_days_min: 3, estimated_days_max: 6, priority: 9,
    }, allIntl, c);

    await ensureMethod(strapi, {
        name: 'FedEx International Priority', service_provider: 'custom',
        base_cost: 3800, per_kg_rate: 850, supports_cod: false,
        estimated_days_min: 3, estimated_days_max: 7, priority: 8,
    }, allIntl, c);

    await ensureMethod(strapi, {
        name: 'UPS Worldwide', service_provider: 'custom',
        base_cost: 3600, per_kg_rate: 820, supports_cod: false,
        estimated_days_min: 4, estimated_days_max: 8, priority: 7,
    }, allIntl, c);

    await ensureMethod(strapi, {
        name: 'Aramex International', service_provider: 'custom',
        base_cost: 2800, per_kg_rate: 600, supports_cod: false,
        estimated_days_min: 4, estimated_days_max: 9, priority: 6,
    }, [meId, euId, apId], c);

    return c;
}

module.exports = {
    applyShippingPakistan,
    applyShippingInternational,
};
