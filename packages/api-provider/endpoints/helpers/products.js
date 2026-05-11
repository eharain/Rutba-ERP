import { getBranch, getUser } from '../../utils.js';
import endpoints from '../../providers/generated/client/products.js';

// Create a reusable proxy instance for helpers
const proxy = endpoints;

/**
 * Helper: Extract data node from Strapi response.
 * @param {object} res - Response from authApi
 * @returns {any} Unwrapped data
 */
function dataNode(res) {
    return res.data?.data ?? res.data ?? res;
}

/**
 * ORCHESTRATION HELPERS
 * These helpers coordinate multiple endpoints or add business logic on top
 * of pure descriptors. They belong here rather than in /api/products.js.
 */

/**
 * Inline-update product items without creating separate records.
 * @param {string} documentId - documentId of the product
 * @param {Array} items - Array of { stock_item, quantity, price }
 */
export async function saveProductItems(documentId, items) {
    return proxy.update(documentId, {
        items: items.map((i) => ({
            stock_item: i.stock_item.id,
            quantity: i.quantity,
            price: i.price,
        })),
    });
}

/**
 * Create or update a product with automatic numeric conversion.
 * @param {string|number} id - documentId or 'new'
 * @param {Object} formData - Form data to save
 */
export async function saveProduct(id, formData) {
    const containsAlphabet = (str) => /[a-zA-Z]/.test(str);
    const isUpdate = id && id !== 'new';
    const numericProps = [
        'offer_price', 'selling_price', 'tax_rate',
        'stock_quantity', 'reorder_level', 'bundle_units',
    ];
    const convertedFormData = { ...formData };
    numericProps.forEach((prop) => {
        if (convertedFormData[prop] !== undefined && convertedFormData[prop] !== '') {
            const num = Number(convertedFormData[prop]);
            if (!isNaN(num)) convertedFormData[prop] = num;
        }
    });
    const data = typeof id === 'string' && containsAlphabet(id)
        ? { ...convertedFormData }
        : { ...convertedFormData, id };
    return isUpdate
        ? proxy.update(id, data)
        : proxy.create(data);
}

/**
 * Fetch a filtered/paginated product list with search support.
 * @param {{ searchText?, brands?, categories?, suppliers?, purchases?, parentOnly?, status? }} filters
 * @param {number} page
 * @param {number} rowsPerPage
 * @param {string} sort
 */
export async function fetchProducts(filters, page, rowsPerPage, sort) {
    const { searchText } = filters;
    if (searchText && searchText.trim().length > 0) {
        return proxy.search(searchText.trim(), page, rowsPerPage);
    }
    return proxy.list(page, rowsPerPage, {
        brands: filters.brands,
        categories: filters.categories,
        suppliers: filters.suppliers,
        purchases: filters.purchases,
        parentOnly: filters.parentOnly,
        status: filters.status,
        sort,
    });
}

/**
 * Load a single product by id / documentId.
 * @param {string|number} id
 */
export async function loadProduct(id) {
    const res = await proxy.byId(id);
    return dataNode(res);
}

/**
 * Full-text search for products with data node extraction.
 * @param {string} searchTerm
 * @param {number} page
 * @param {number} rowsPerPage
 */
export async function searchProduct(searchTerm, page = 0, rowsPerPage = 100) {
    const res = await proxy.search(searchTerm, page, rowsPerPage);
    return dataNode(res);
}

/**
 * Create a new draft product owned by the current user on the current branch.
 * @returns {{ data, id, nameSingular, namePlural }}
 */
export async function createProduct() {
    const user = getUser();
    const branch = getBranch();
    const data = {
        cost_price: 0,
        selling_price: 0,
        reorder_level: 1,
        is_active: false,
        branches: { connect: [branch.documentId] },
        owners: { connect: [user.documentId] },
    };
    const res = await proxy.create(data);
    const rdata = res?.data ?? res;
    return {
        data: rdata,
        id: rdata.documentId ?? rdata.id,
        nameSingular: 'product',
        namePlural: 'products'
    };
}

/**
 * LEGACY HELPER: Search products by name, barcode, SKU, supplier, or purchase order.
 * 
 * NOTE: This is largely redundant now — prefer using the proxy directly:
 *   const result = await ProductsEndpointsProxy.search(term, page, pageSize);
 * 
 * @param {string} searchTerm
 * @param {number} page
 * @param {number} rowsPerPage
 * @deprecated Use ProductsEndpointsProxy.search() instead
 */
export async function searchProducts(searchTerm, page = 1, rowsPerPage = 5) {
    const res = await proxy.search(searchTerm?.trim() || '', page, rowsPerPage);
    return dataNode(res);
}