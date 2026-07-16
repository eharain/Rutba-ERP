'use strict';

/**
 * Industry starter packs → api::category (nested tree) + api::term-type / api::term
 * (the variant/attribute system).
 *
 * Each pack is a tenant-onboarding template for one trade: a starter catalog
 * taxonomy plus the attributes that trade sells on (size/colour for apparel,
 * form/schedule for pharmacy, storage/warranty for electronics, …). A tenant
 * runs the ONE pack for their business; every entry is opt-in, non-essential.
 *
 * Idempotency:
 *   - categories by slug (industry-prefixed so packs don't collide; a tenant
 *     renames to taste). Existing slug = reuse, never overwrite.
 *   - term-types by name (shared across industries — "Size" is one row reused).
 *   - terms by slug (term-type-prefixed). Linked to their term-type via M2M.
 *
 * Only a starter tree is seeded (2 levels, representative) — not an exhaustive
 * catalog. Extend per tenant through the admin, not here.
 */

function slugify(s) {
    return String(s || '').toLowerCase().trim()
        .replace(/&/g, 'and')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

const CATEGORY_UID = 'api::category.category';
const TERM_TYPE_UID = 'api::term-type.term-type';
const TERM_UID = 'api::term.term';

// Create/reuse a category by slug; returns its id. parentId optional.
async function ensureCategory(strapi, name, slug, parentId, c) {
    const existing = await strapi.db.query(CATEGORY_UID).findOne({ where: { slug }, select: ['id'] });
    if (existing) { c.skipped += 1; return existing.id; }
    const row = await strapi.db.query(CATEGORY_UID).create({
        data: { name, slug, ...(parentId ? { parent: parentId } : {}) },
    });
    c.created += 1;
    return row.id;
}

// Walk a nested tree: [{ name, children: [...] }]. Slugs are prefixed with the
// pack key to keep packs isolated.
async function ensureTree(strapi, key, nodes, parentId, c) {
    for (const node of nodes) {
        const slug = `${key}-${slugify(node.name)}`;
        const id = await ensureCategory(strapi, node.name, slug, parentId, c);
        if (Array.isArray(node.children) && node.children.length) {
            await ensureTree(strapi, key, node.children, id, c);
        }
    }
}

// Create/reuse a term-type by name; returns its id.
async function ensureTermType(strapi, name, isVariant, c) {
    const existing = await strapi.db.query(TERM_TYPE_UID).findOne({ where: { name }, select: ['id'] });
    if (existing) { c.skipped += 1; return existing.id; }
    const row = await strapi.db.query(TERM_TYPE_UID).create({
        data: { name, slug: slugify(name), is_variant: Boolean(isVariant), is_public: true },
    });
    c.created += 1;
    return row.id;
}

// Create/reuse a term (by term-type-prefixed slug) linked to its term-type.
async function ensureTerm(strapi, typeSlug, typeId, name, c) {
    const slug = `${typeSlug}-${slugify(name)}`;
    const existing = await strapi.db.query(TERM_UID).findOne({ where: { slug }, select: ['id'] });
    if (existing) { c.skipped += 1; return; }
    await strapi.db.query(TERM_UID).create({
        data: { name, slug, term_types: [typeId] },
    });
    c.created += 1;
}

// Seed a pack's attributes: [{ name, variant?, terms: [...] }].
async function ensureAttributes(strapi, attrs, c) {
    for (const attr of attrs) {
        const typeId = await ensureTermType(strapi, attr.name, attr.variant, c);
        const typeSlug = slugify(attr.name);
        for (const term of attr.terms || []) {
            await ensureTerm(strapi, typeSlug, typeId, term, c);
        }
    }
}

/* ------------------------------------------------------------------ */
/*  Pack definitions                                                  */
/* ------------------------------------------------------------------ */
const INDUSTRIES = {
    apparel: {
        categories: [
            { name: 'Men', children: [{ name: 'Shirts' }, { name: 'Trousers' }, { name: 'Kurta & Shalwar' }, { name: 'Undergarments' }] },
            { name: 'Women', children: [{ name: 'Kurtis' }, { name: 'Lawn Suits' }, { name: 'Sarees' }, { name: 'Abayas' }] },
            { name: 'Kids', children: [{ name: 'Boys' }, { name: 'Girls' }] },
            { name: 'Footwear' },
            { name: 'Accessories', children: [{ name: 'Bags' }, { name: 'Belts' }, { name: 'Scarves & Dupattas' }] },
            { name: 'Unstitched Fabric', children: [{ name: 'Cotton' }, { name: 'Lawn' }, { name: 'Silk' }, { name: 'Linen' }] },
        ],
        attributes: [
            { name: 'Size', variant: true, terms: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'] },
            { name: 'Colour', variant: true, terms: ['Black', 'White', 'Red', 'Blue', 'Green', 'Maroon', 'Navy', 'Beige', 'Pink'] },
            { name: 'Fabric', variant: false, terms: ['Cotton', 'Lawn', 'Silk', 'Linen', 'Polyester', 'Chiffon', 'Khaddar'] },
            { name: 'Fit', variant: false, terms: ['Slim', 'Regular', 'Loose'] },
            { name: 'Sleeve', variant: false, terms: ['Full Sleeve', 'Half Sleeve', 'Sleeveless'] },
        ],
    },
    pharmacy: {
        categories: [
            { name: 'Prescription (Rx)', children: [{ name: 'Antibiotics' }, { name: 'Cardiovascular' }, { name: 'Diabetes' }, { name: 'Respiratory' }] },
            { name: 'Over-the-Counter (OTC)', children: [{ name: 'Pain Relief' }, { name: 'Cold & Flu' }, { name: 'Antacids & Digestion' }, { name: 'First Aid' }] },
            { name: 'Vitamins & Supplements' },
            { name: 'Personal Care' },
            { name: 'Baby & Mother Care' },
            { name: 'Medical Devices', children: [{ name: 'BP Monitors' }, { name: 'Thermometers' }, { name: 'Glucometers' }] },
            { name: 'Surgical & Disposables' },
        ],
        attributes: [
            { name: 'Dosage Form', variant: true, terms: ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler'] },
            { name: 'Pack Size', variant: true, terms: ["Strip of 10", "Strip of 14", "Bottle 60ml", "Bottle 120ml", "Box of 30", "Single Vial"] },
            { name: 'Drug Schedule', variant: false, terms: ['OTC', 'Prescription', 'Controlled', 'Narcotic'] },
            { name: 'Storage', variant: false, terms: ['Room Temperature', 'Refrigerated (2-8°C)', 'Cool & Dry'] },
        ],
    },
    grocery: {
        categories: [
            { name: 'Fresh', children: [{ name: 'Fruits' }, { name: 'Vegetables' }, { name: 'Meat & Poultry' }, { name: 'Dairy & Eggs' }] },
            { name: 'Bakery' },
            { name: 'Beverages', children: [{ name: 'Soft Drinks' }, { name: 'Juices' }, { name: 'Tea & Coffee' }, { name: 'Water' }] },
            { name: 'Pantry', children: [{ name: 'Rice & Flour' }, { name: 'Oil & Ghee' }, { name: 'Spices & Masala' }, { name: 'Pulses & Lentils' }, { name: 'Sugar & Salt' }] },
            { name: 'Snacks & Confectionery' },
            { name: 'Frozen Foods' },
            { name: 'Household', children: [{ name: 'Cleaning' }, { name: 'Detergents' }, { name: 'Paper & Tissues' }] },
            { name: 'Personal Care' },
        ],
        attributes: [
            { name: 'Pack Size', variant: true, terms: ['250 g', '500 g', '1 kg', '2 kg', '5 kg', '10 kg', '1 L', '1.5 L', 'Dozen'] },
            { name: 'Unit of Sale', variant: false, terms: ['Per kg', 'Per gram', 'Per litre', 'Per piece', 'Per dozen', 'Per pack'] },
            { name: 'Dietary', variant: false, terms: ['Halal', 'Organic', 'Sugar-Free', 'Gluten-Free'] },
        ],
    },
    restaurant: {
        categories: [
            { name: 'Starters & Soups' },
            { name: 'Main Course', children: [{ name: 'Karahi & Handi' }, { name: 'Curry' }, { name: 'Chinese' }] },
            { name: 'BBQ & Grill' },
            { name: 'Rice & Biryani' },
            { name: 'Fast Food', children: [{ name: 'Burgers' }, { name: 'Pizza' }, { name: 'Sandwiches & Rolls' }, { name: 'Fries & Sides' }] },
            { name: 'Breads' },
            { name: 'Desserts' },
            { name: 'Beverages', children: [{ name: 'Hot Drinks' }, { name: 'Cold Drinks' }, { name: 'Shakes & Smoothies' }] },
            { name: 'Deals & Combos' },
        ],
        attributes: [
            { name: 'Portion Size', variant: true, terms: ['Regular', 'Small', 'Medium', 'Large', 'Family'] },
            { name: 'Spice Level', variant: false, terms: ['Mild', 'Medium', 'Hot', 'Extra Hot'] },
            { name: 'Diet Type', variant: false, terms: ['Veg', 'Non-Veg', 'Halal'] },
            { name: 'Add-ons', variant: false, terms: ['Extra Cheese', 'Extra Sauce', 'No Onion', 'Extra Spicy'] },
        ],
    },
    electronics: {
        categories: [
            { name: 'Mobile Phones', children: [{ name: 'Smartphones' }, { name: 'Feature Phones' }] },
            { name: 'Laptops & Computers', children: [{ name: 'Laptops' }, { name: 'Desktops' }, { name: 'Monitors' }] },
            { name: 'Tablets' },
            { name: 'Accessories', children: [{ name: 'Chargers & Cables' }, { name: 'Cases & Covers' }, { name: 'Power Banks' }, { name: 'Memory Cards' }] },
            { name: 'Audio', children: [{ name: 'Headphones' }, { name: 'Earbuds' }, { name: 'Speakers' }] },
            { name: 'Wearables' },
            { name: 'TV & Home Appliances' },
        ],
        attributes: [
            { name: 'Storage', variant: true, terms: ['32 GB', '64 GB', '128 GB', '256 GB', '512 GB', '1 TB'] },
            { name: 'RAM', variant: true, terms: ['2 GB', '3 GB', '4 GB', '6 GB', '8 GB', '12 GB', '16 GB'] },
            { name: 'Colour', variant: true, terms: ['Black', 'White', 'Silver', 'Blue', 'Gold', 'Graphite'] },
            { name: 'Warranty', variant: false, terms: ['No Warranty', '3 Months', '6 Months', '1 Year', '2 Years'] },
            { name: 'Condition', variant: false, terms: ['New', 'Open Box', 'Refurbished', 'Used'] },
        ],
    },
    jewellery: {
        categories: [
            { name: 'Gold', children: [{ name: 'Rings' }, { name: 'Necklaces & Sets' }, { name: 'Bangles' }, { name: 'Earrings' }] },
            { name: 'Silver' },
            { name: 'Diamond' },
            { name: 'Gemstone' },
            { name: 'Artificial & Fashion' },
            { name: 'Watches' },
        ],
        attributes: [
            { name: 'Metal', variant: true, terms: ['Gold', 'White Gold', 'Silver', 'Platinum'] },
            { name: 'Purity', variant: true, terms: ['18K', '21K', '22K', '24K', '925 Silver'] },
            { name: 'Gemstone', variant: false, terms: ['Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'None'] },
            { name: 'Occasion', variant: false, terms: ['Bridal', 'Party', 'Daily Wear', 'Gift'] },
        ],
    },
    autoparts: {
        categories: [
            { name: 'Engine Parts' },
            { name: 'Brakes & Suspension' },
            { name: 'Electrical & Batteries' },
            { name: 'Filters & Fluids', children: [{ name: 'Air Filters' }, { name: 'Oil Filters' }, { name: 'Engine Oil' }, { name: 'Lubricants' }] },
            { name: 'Body Parts & Lights' },
            { name: 'Tyres & Wheels' },
            { name: 'Interior & Accessories' },
        ],
        attributes: [
            { name: 'Vehicle Type', variant: false, terms: ['Car', 'Bike', 'Truck', 'Rickshaw', 'Bus'] },
            { name: 'Make', variant: false, terms: ['Toyota', 'Honda', 'Suzuki', 'Kia', 'Hyundai', 'Nissan', 'Universal'] },
            { name: 'Part Grade', variant: true, terms: ['Genuine (OEM)', 'Aftermarket', 'Used', 'Reconditioned'] },
        ],
    },
    wholesale: {
        categories: [
            { name: 'Bulk Goods' },
            { name: 'FMCG Cartons' },
            { name: 'Packaging & Supplies' },
            { name: 'Raw Materials' },
        ],
        attributes: [
            { name: 'Order Unit', variant: true, terms: ['Piece', 'Dozen', 'Carton', 'Bale', 'Pallet'] },
            { name: 'Customer Tier', variant: false, terms: ['Retailer', 'Wholesaler', 'Distributor', 'Sub-Dealer'] },
            { name: 'Payment Terms', variant: false, terms: ['Cash', 'Credit 7 Days', 'Credit 15 Days', 'Credit 30 Days'] },
        ],
    },
};

// Seed one industry pack. `key` must be a member of INDUSTRIES.
async function applyIndustry(strapi, key) {
    const pack = INDUSTRIES[key];
    if (!pack) throw new Error(`Unknown industry pack: ${key}`);
    const c = { created: 0, skipped: 0 };
    await ensureTree(strapi, key, pack.categories, null, c);
    await ensureAttributes(strapi, pack.attributes, c);
    return c;
}

module.exports = { applyIndustry, INDUSTRY_KEYS: Object.keys(INDUSTRIES) };
