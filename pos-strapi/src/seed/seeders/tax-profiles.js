'use strict';

/**
 * Multi-country tax profiles → api::acc-tax-rate.acc-tax-rate.
 *
 * One seeder per region so a tenant runs only the profile(s) they operate in
 * (a Karachi shop doesn't want US state sales tax). Idempotent by the unique
 * `code` column — re-running never duplicates, and it never overwrites a rate an
 * admin has edited (existing code = skip).
 *
 * Rates are standard headline rates at time of authoring and DO change — treat
 * them as sensible defaults a tenant confirms, not tax advice. VAT/GST apply to
 * both sales and purchases (scope 'Both'); US sales tax is on sales only.
 *
 * Codes are globally unique and country-prefixed, e.g. PK-GST-18, UK-VAT-20,
 * US-CA, EU-DE-VAT, AE-VAT-5.
 */

// Upsert a list of { code, name, rate, scope?, type? } tax rows. Returns counts.
async function upsertTaxRates(strapi, rows) {
    const uid = 'api::acc-tax-rate.acc-tax-rate';
    let created = 0;
    let skipped = 0;
    for (const r of rows) {
        const existing = await strapi.db.query(uid).findOne({ where: { code: r.code }, select: ['id'] });
        if (existing) { skipped += 1; continue; }
        await strapi.db.query(uid).create({
            data: {
                code: r.code,
                name: r.name,
                rate: r.rate,
                type: r.type || 'Exclusive',
                scope: r.scope || 'Both',
                is_active: r.active !== false,
            },
        });
        created += 1;
    }
    return { created, skipped };
}

/* ── Pakistan — GST + provincial sales tax on services ─────────────── */
async function applyTaxPakistan(strapi) {
    return upsertTaxRates(strapi, [
        { code: 'PK-GST-18',    name: 'Sales Tax (GST) 18%',              rate: 18 },
        { code: 'PK-GST-0',     name: 'Zero-rated 0%',                    rate: 0 },
        { code: 'PK-GST-EXEMPT', name: 'Exempt',                         rate: 0 },
        { code: 'PK-PST-PB-16', name: 'Punjab Sales Tax on Services 16%', rate: 16, scope: 'Sales' },
        { code: 'PK-PST-SD-15', name: 'Sindh Sales Tax on Services 15%',  rate: 15, scope: 'Sales' },
        { code: 'PK-PST-KP-15', name: 'KPK Sales Tax on Services 15%',    rate: 15, scope: 'Sales' },
        { code: 'PK-PST-BL-15', name: 'Balochistan Sales Tax on Services 15%', rate: 15, scope: 'Sales' },
        { code: 'PK-PST-ICT-16', name: 'Islamabad (ICT) Sales Tax on Services 16%', rate: 16, scope: 'Sales' },
    ]);
}

/* ── United Kingdom — VAT ───────────────────────────────────────────── */
async function applyTaxUK(strapi) {
    return upsertTaxRates(strapi, [
        { code: 'UK-VAT-20', name: 'VAT Standard 20%', rate: 20 },
        { code: 'UK-VAT-5',  name: 'VAT Reduced 5%',   rate: 5 },
        { code: 'UK-VAT-0',  name: 'VAT Zero-rated 0%', rate: 0 },
    ]);
}

/* ── United States — state base sales tax (local add-ons vary) ──────── */
async function applyTaxUS(strapi) {
    // State-level base rates. Destination/local county+city rates stack on top
    // and are configured per store — these are the state floors.
    const states = [
        ['AL', 4], ['AK', 0], ['AZ', 5.6], ['AR', 6.5], ['CA', 7.25], ['CO', 2.9],
        ['CT', 6.35], ['DE', 0], ['FL', 6], ['GA', 4], ['HI', 4], ['ID', 6],
        ['IL', 6.25], ['IN', 7], ['IA', 6], ['KS', 6.5], ['KY', 6], ['LA', 4.45],
        ['ME', 5.5], ['MD', 6], ['MA', 6.25], ['MI', 6], ['MN', 6.875], ['MS', 7],
        ['MO', 4.225], ['MT', 0], ['NE', 5.5], ['NV', 6.85], ['NH', 0], ['NJ', 6.625],
        ['NM', 4.875], ['NY', 4], ['NC', 4.75], ['ND', 5], ['OH', 5.75], ['OK', 4.5],
        ['OR', 0], ['PA', 6], ['RI', 7], ['SC', 6], ['SD', 4.2], ['TN', 7],
        ['TX', 6.25], ['UT', 6.1], ['VT', 6], ['VA', 5.3], ['WA', 6.5], ['WV', 6],
        ['WI', 5], ['WY', 4], ['DC', 6],
    ];
    return upsertTaxRates(strapi, states.map(([st, rate]) => ({
        code: `US-${st}`,
        name: `US Sales Tax — ${st} ${rate}%`,
        rate,
        scope: 'Sales',
    })));
}

/* ── European Union — standard VAT per member state ─────────────────── */
async function applyTaxEU(strapi) {
    const members = [
        ['AT', 'Austria', 20], ['BE', 'Belgium', 21], ['BG', 'Bulgaria', 20],
        ['HR', 'Croatia', 25], ['CY', 'Cyprus', 19], ['CZ', 'Czechia', 21],
        ['DK', 'Denmark', 25], ['EE', 'Estonia', 22], ['FI', 'Finland', 25.5],
        ['FR', 'France', 20], ['DE', 'Germany', 19], ['GR', 'Greece', 24],
        ['HU', 'Hungary', 27], ['IE', 'Ireland', 23], ['IT', 'Italy', 22],
        ['LV', 'Latvia', 21], ['LT', 'Lithuania', 21], ['LU', 'Luxembourg', 17],
        ['MT', 'Malta', 18], ['NL', 'Netherlands', 21], ['PL', 'Poland', 23],
        ['PT', 'Portugal', 23], ['RO', 'Romania', 19], ['SK', 'Slovakia', 23],
        ['SI', 'Slovenia', 22], ['ES', 'Spain', 21], ['SE', 'Sweden', 25],
    ];
    return upsertTaxRates(strapi, members.map(([cc, country, rate]) => ({
        code: `EU-${cc}-VAT`,
        name: `${country} VAT ${rate}%`,
        rate,
    })));
}

/* ── Middle East ────────────────────────────────────────────────────── */
async function applyTaxMena(strapi) {
    return upsertTaxRates(strapi, [
        { code: 'AE-VAT-5',  name: 'UAE VAT 5%',           rate: 5 },
        { code: 'SA-VAT-15', name: 'Saudi Arabia VAT 15%', rate: 15 },
        { code: 'BH-VAT-10', name: 'Bahrain VAT 10%',      rate: 10 },
        { code: 'OM-VAT-5',  name: 'Oman VAT 5%',          rate: 5 },
        { code: 'QA-VAT-0',  name: 'Qatar (no VAT) 0%',    rate: 0 },
        { code: 'KW-VAT-0',  name: 'Kuwait (no VAT) 0%',   rate: 0 },
        { code: 'EG-VAT-14', name: 'Egypt VAT 14%',        rate: 14 },
        { code: 'TR-KDV-20', name: 'Türkiye KDV 20%',      rate: 20 },
    ]);
}

/* ── Asia-Pacific ───────────────────────────────────────────────────── */
async function applyTaxApac(strapi) {
    return upsertTaxRates(strapi, [
        { code: 'AU-GST-10', name: 'Australia GST 10%',     rate: 10 },
        { code: 'NZ-GST-15', name: 'New Zealand GST 15%',   rate: 15 },
        { code: 'SG-GST-9',  name: 'Singapore GST 9%',      rate: 9 },
        { code: 'IN-GST-18', name: 'India GST 18%',         rate: 18 },
        { code: 'IN-GST-12', name: 'India GST 12%',         rate: 12 },
        { code: 'IN-GST-5',  name: 'India GST 5%',          rate: 5 },
        { code: 'MY-SST-10', name: 'Malaysia SST 10%',      rate: 10 },
        { code: 'BD-VAT-15', name: 'Bangladesh VAT 15%',    rate: 15 },
    ]);
}

/* ── Canada — federal GST + provincial HST/PST examples ─────────────── */
async function applyTaxCanada(strapi) {
    return upsertTaxRates(strapi, [
        { code: 'CA-GST-5',   name: 'Canada GST 5%',            rate: 5 },
        { code: 'CA-HST-ON-13', name: 'Ontario HST 13%',        rate: 13 },
        { code: 'CA-HST-NS-15', name: 'Nova Scotia HST 15%',    rate: 15 },
        { code: 'CA-HST-NB-15', name: 'New Brunswick HST 15%',  rate: 15 },
        { code: 'CA-QST-QC-14975', name: 'Quebec GST+QST 14.975%', rate: 14.975 },
        { code: 'CA-BC-12',   name: 'British Columbia GST+PST 12%', rate: 12 },
    ]);
}

module.exports = {
    applyTaxPakistan,
    applyTaxUK,
    applyTaxUS,
    applyTaxEU,
    applyTaxMena,
    applyTaxApac,
    applyTaxCanada,
};
