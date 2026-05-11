// Re-exported compatibility helpers backed by current endpoint methods.
import {
    SalesEndpoints,
    PurchasesEndpoints,
    SaleReturnsEndpoints,
    CategoriesEndpoints,
    BrandsEndpoints,
    EnumsEndpoints,
    PurchaseItemsEndpoints,
    fetchProducts as fetchProductsHelper,
    loadProduct as loadProductHelper,
} from '../endpoints/index.js';

function extractData(res) {
    return res?.data?.data ?? res?.data ?? res;
}

export async function fetchEntities(entities, page = 1, rowsPerPage = 100) {
    const key = String(entities || '').toLowerCase();

    if (key === 'sales' || key === 'sale') return fetchSales(page, rowsPerPage);
    if (key === 'purchases' || key === 'purchase') return fetchPurchases(page, rowsPerPage);
    if (key === 'salereturns' || key === 'sale-returns' || key === 'returns') return fetchReturns(page, rowsPerPage);
    if (key === 'categories' || key === 'category') return fetchCategories(page, rowsPerPage);
    if (key === 'brands' || key === 'brand') return fetchBrands(page, rowsPerPage);
    if (key === 'purchaseitems' || key === 'purchase-items') {
        console.warn('fetchEntities does not support purchase-items without a purchase document id');
        return null;
    }

    console.warn(`No endpoints found for entity: ${entities}`);
    return null;
}

export async function fetchSales(page, rowsPerPage = 200, { sort, filters, populate } = {}) {
    return SalesEndpoints.list(page, rowsPerPage, { sort, filters, populate });
}

export async function fetchReturns(page, rowsPerPage = 100, opts = {}) {
    return SaleReturnsEndpoints.list(page, rowsPerPage, opts);
}

export async function fetchPurchases(page, rowsPerPage = 100, opts = {}) {
    return PurchasesEndpoints.list(page, rowsPerPage, opts);
}

export async function fetchCategories(page = 1, rowsPerPage = 100) {
    return CategoriesEndpoints.list({ page, pageSize: rowsPerPage });
}

export async function fetchBrands(page = 1, rowsPerPage = 100) {
    return BrandsEndpoints.list({ page, pageSize: rowsPerPage });
}

export async function fetchSaleByIdOrInvoice(id) {
    const res = await SalesEndpoints.byId(id);
    const data = extractData(res);
    return Array.isArray(data) ? data[0] : data;
}

export async function fetchPurchaseByIdDocumentIdOrPO(id) {
    const res = await PurchasesEndpoints.byId(id);
    const data = extractData(res);
    return Array.isArray(data) ? data[0] : data;
}

export async function fetchEnumsValues(name, field) {
    const res = await EnumsEndpoints.values(name, field);
    const data = extractData(res);
    return data?.values;
}

export async function fetchProducts(filters, page, rowsPerPage, sort) {
    return fetchProductsHelper(filters, page, rowsPerPage, sort);
}

export async function loadProduct(id) {
    return loadProductHelper(id);
}
