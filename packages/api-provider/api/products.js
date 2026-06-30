/**
 * ProductsEndpoints
 * Pure endpoint descriptors for the /products resource.
 * All methods return { path, params?, data? } objects.
 * Transport execution happens via createClientProxy in /endpoints/products.js.
 *
 * Complex orchestration helpers (saveProduct, loadProduct, etc.) have been
 * moved to /endpoints/products.js.
 */
// --- small helpers for the list() filter builder -------------------------
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
function startOfDay(d) {
    return DATE_ONLY.test(d) ? `${d}T00:00:00.000Z` : d;
}
function endOfDay(d) {
    return DATE_ONLY.test(d) ? `${d}T23:59:59.999Z` : d;
}
function toNumberOrNull(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export const ProductsEndpoints = {

    meta: {
        uid: 'api::product.product',
        domains: ['cms', 'order-management', 'social', 'stock'],
        roles: ['admin', 'manager', 'staff']
    },

    /**
     * Paged product list — no search, no extra filters.
     * @param {number} page
     * @param {number} pageSize
     * @param {{ sort?, populate? }} opts
     */
    listPaged: (page = 1, pageSize = 100, { sort, populate } = {}) => ({
        path: '/products',
        action: 'find',
        method: 'get',
        apps: ['stock', 'product'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            pagination: { page, pageSize },
            populate: populate ?? {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                items: true,
                purchase_items: { populate: { purchase: true } },
            },
        },
    }),

    /**
     * Fetch all products without pagination (use only when count is small).
     * @param {{ sort?, populate? }} opts
     */
    listAll: ({ sort, populate } = {}) => ({
        path: '/products',
        action: 'find',
        method: 'get',
        apps: ['stock', 'product'],
        approle: ['admin', 'manager', 'staff'],
        params: {
            sort: sort ?? ['name:asc'],
            pagination: { page: 1, pageSize: 1000 },
            populate: populate ?? { categories: true, brands: true, suppliers: true, logo: true },
        },
    }),

    /**
     * List products with conditional filters (brands, categories, suppliers, purchases,
     * kinds, parentOnly, status, sort).
     *
     * @param {number} page
     * @param {number} pageSize
     * @param {{
     *   brands?: string[],
     *   categories?: string[],
     *   suppliers?: string[],
     *   purchases?: string[],
     *   kinds?: string[],
     *   parentOnly?: boolean,
     *   status?: string,
     *   sort?: string,
     *   fields?: string[]
     * }} filters
     */
    list: (page = 1, pageSize = 100, filters = {}) => {
        const {
            brands, categories, suppliers, purchases, kinds, parentOnly, status, sort, fields,
            populate: extraPopulate,
            // Content / asset completeness + range filters (shared by the CMS and
            // stock product lists). See product-filter.js for the UI cells.
            missingContent, missingLogo, missingGallery,
            priceMin, priceMax,
            createdFrom, createdTo, updatedFrom, updatedTo,
            // Publish state (CMS only): 'published' | 'unpublished'. 'published'
            // is served purely by Strapi status; 'unpublished' (draft exists but
            // no published sibling) is a set-difference the product controller's
            // find() override resolves via the `publishState` query param.
            publishState,
        } = filters;

        const filterObj = {};
        // Conditions that need their own boolean grouping (or that could collide
        // on a shared key) are collected here and ANDed at the top level.
        const and = [];

        if (Array.isArray(kinds) && kinds.length > 0) {
            filterObj.kind = { $in: kinds };
        }

        if (Array.isArray(brands) && brands.length > 0) {
            filterObj.brands = { documentId: { $in: brands } };
        }
        if (Array.isArray(categories) && categories.length > 0) {
            filterObj.categories = { documentId: { $in: categories } };
        }
        if (Array.isArray(suppliers) && suppliers.length > 0) {
            filterObj.suppliers = { documentId: { $in: suppliers } };
        }
        if (Array.isArray(purchases) && purchases.length > 0) {
            filterObj.purchase_items = { purchase: { documentId: { $in: purchases } } };
        }
        if (parentOnly) {
            filterObj.parent = { $null: true };
        }

        // "Missing content" — flagged when EITHER summary OR description is blank
        // (null or empty string). Richtext fields persist as plain columns.
        if (missingContent) {
            and.push({
                $or: [
                    { summary: { $null: true } },
                    { summary: { $eq: '' } },
                    { description: { $null: true } },
                    { description: { $eq: '' } },
                ],
            });
        }
        // Missing media — the relation-null form (`{ id: { $null: true } }`)
        // matches rows with no linked file(s), for both single (logo) and
        // multiple (gallery) media.
        if (missingLogo) {
            and.push({ logo: { id: { $null: true } } });
        }
        if (missingGallery) {
            and.push({ gallery: { id: { $null: true } } });
        }

        // Price range on selling_price (inclusive).
        const pMin = toNumberOrNull(priceMin);
        const pMax = toNumberOrNull(priceMax);
        if (pMin != null) and.push({ selling_price: { $gte: pMin } });
        if (pMax != null) and.push({ selling_price: { $lte: pMax } });

        // Date ranges (inclusive). A date-only "to" bound is widened to the end
        // of that day so the whole day is included.
        if (createdFrom) and.push({ createdAt: { $gte: startOfDay(createdFrom) } });
        if (createdTo) and.push({ createdAt: { $lte: endOfDay(createdTo) } });
        if (updatedFrom) and.push({ updatedAt: { $gte: startOfDay(updatedFrom) } });
        if (updatedTo) and.push({ updatedAt: { $lte: endOfDay(updatedTo) } });

        if (and.length > 0) filterObj.$and = and;

        // Resolve publish state into Strapi status + an optional controller hint.
        let effectiveStatus = status;
        let publishStateParam;
        if (publishState === 'published') {
            effectiveStatus = 'published';
        } else if (publishState === 'unpublished') {
            effectiveStatus = 'draft';
            publishStateParam = 'unpublished';
        }

        const params = {
            populate: {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                items: true,
                purchase_items: { populate: { purchase: true } },
                ...(extraPopulate && typeof extraPopulate === 'object' ? extraPopulate : {}),
            },
            pagination: { page, pageSize },
            filters: Object.keys(filterObj).length > 0 ? filterObj : undefined,
            ...(sort ? { sort } : {}),
            ...(effectiveStatus ? { status: effectiveStatus } : {}),
            ...(fields ? { fields } : {}),
            ...(publishStateParam ? { publishState: publishStateParam } : {}),
        };

        return { path: '/products', params };
    },

    /**
     * Full-text search across products. Hits, in order:
     *   - product.name           ($containsi — partial match)
     *   - product.barcode        ($eq — barcodes are scanned exact)
     *   - product.sku            ($eq — SKUs are exact)
     *   - product.supplierCode   ($containsi — the supplier's reference for THIS product)
     *   - suppliers.name / phone ($containsi)
     *   - purchase_items.purchase.orderId ($containsi — find every product on PO X)
     *
     * @param {string} searchText
     * @param {number} page
     * @param {number} pageSize
     */
    search: (searchText, page = 1, pageSize = 20) => ({
        path: '/products',
        params: {
            filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { barcode: { $eq: searchText } },
                    { sku: { $eq: searchText } },
                    { supplierCode: { $containsi: searchText } },
                    { suppliers: { $or: [{ name: { $containsi: searchText } }, { phone: { $containsi: searchText } }] } },
                    { purchase_items: { purchase: { orderId: { $containsi: searchText } } } },
                ],
            },
            populate: {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                items: true,
                purchase_items: { populate: { purchase: true } },
            },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Search products for use inside a relation picker (lighter populate).
     * @param {string} searchText
     * @param {number} page
     * @param {number} pageSize
     */
    searchInRelation: (searchText, page = 1, pageSize = 10) => ({
        path: '/products',
        params: {
            filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { barcode: { $eq: searchText } },
                    { sku: { $eq: searchText } },
                    { supplierCode: { $containsi: searchText } },
                ],
            },
            populate: { logo: true, categories: true, brands: true },
            pagination: { page, pageSize },
        },
    }),

    /**
     * Fetch a single product by documentId / id with full detail populate.
     * @param {string|number} documentId
     * @param {{ populate? }} opts
     */
    byId: (documentId, { populate } = {}) => ({
        path: `/products/${documentId}`,
        params: {
            populate: populate ?? {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                terms: true,
                parent: true,
                seo_meta: { populate: { og_image: true } },
            },
        },
    }),
    save(id, data) {
        if (!id || id === 'new') {
            return ProductsEndpoints.create(data);
        }
        return ProductsEndpoints.update(id, data);
    },

    /** Create a new product — body provided by caller as { data }. */
    create: (data) => ({ path: '/products', method: 'post', data }),

    /**
     * Update a product by documentId — body provided by caller as { data }.
     * @param {string} documentId
     */
    update: (documentId, data) => ({ path: `/products/${documentId}`, method: 'put', data }),

    /**
     * Delete a product by documentId.
     * @param {string} documentId
     */
    del: (documentId) => ({ path: `/products/${documentId}`, method: 'delete' }),

    /**
     * Search products by name/SKU/barcode, excluding a specific documentId.
     * @param {string} term
     * @param {{ excludeDocId?, pageSize?, populate? }} opts
     */
    searchByTerm: (term, { excludeDocId, pageSize = 20, populate } = {}) => ({
        path: '/products',
        params: {
            sort: ['name:asc'],
            filters: {
                ...(excludeDocId ? { documentId: { $ne: excludeDocId } } : {}),
                $or: [
                    { name: { $containsi: term } },
                    { sku: { $containsi: term } },
                    { barcode: { $containsi: term } },
                ],
            },
            populate: populate ?? { categories: true, brands: true, suppliers: true, terms: true, logo: true },
            pagination: { page: 1, pageSize },
        },
    }),

    loadProduct: (id) => ({
        path: `/products/${id}`,
        params: {
            //  filters: { documentId: id },
            populate: {
                categories: true,
                brands: true,
                suppliers: true,
                logo: true,
                gallery: true,
                terms: true,
                parent: true,
            },
        },
    }),

    /**
     * List child products (variants) by parent documentId.
     * @param {string} parentDocId
     * @param {{ page?, pageSize?, populate? }} opts
     */
    byParent: (parentDocId, { page = 1, pageSize = 500, populate } = {}) => ({
        path: '/products',
        params: {
            filters: { parent: { documentId: parentDocId } },
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Same as byParent but constrained to draft status — used by the bulk-edit flow
     * to enumerate variant drafts for parent records.
     *
     * todo: speculative stub — added so pos-shared/components/BulkProductActions.js
     * resolves. Confirm the `status: 'draft'` query is honored by Strapi for the
     * /products route under bundled draft-publish, and that the filter shape matches
     * what byParent currently produces in production traffic.
     */
    byParentDraft: (parentDocId, { page = 1, pageSize = 500, populate } = {}) => ({
        path: '/products',
        params: {
            status: 'draft',
            filters: { parent: { documentId: parentDocId } },
            pagination: { page, pageSize },
            ...(populate ? { populate } : {}),
        },
    }),

    /**
     * Fetch product by ID in draft status.
     * @param {string} documentId
     * @param {object} params - Additional query params
     */
    byIdDraft: (documentId, params = {}) => ({
        path: `/products/${documentId}`,
        params: { status: 'draft', ...params },
    }),

    /**
     * Fetch product by ID in published status.
     * @param {string} documentId
     * @param {object} params - Additional query params
     */
    byIdPublished: (documentId, params = {}) => ({
        path: `/products/${documentId}`,
        params: { status: 'published', ...params },
    }),

    /**
     * Update product in draft status.
     * @param {string} documentId
     */
    updateDraft: (documentId, data) => ({
        path: `/products/${documentId}`,
        params: { status: 'draft' },
        data,   
    }),

    /**
     * Publish a product — custom Strapi action.
     * @param {string} documentId
     */
    publish: (documentId) => ({
        path: `/products/${documentId}/publish`,
        method: 'post',
    }),

    /**
     * Unpublish a product — custom Strapi action.
     * @param {string} documentId
     */
    unpublish: (documentId) => ({
        path: `/products/${documentId}/unpublish`,
        method: 'post',
    }),
};

