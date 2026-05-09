import { authApi } from '../api';
import { dataNode } from './search';
import { SalesEndpoints, SaleReturnsEndpoints, PurchasesEndpoints, CategoriesEndpoints, BrandsEndpoints, ProductsEndpoints, EnumsEndpoints } from '@rutba/api-provider/endpoints';

// Fetch sales and returns for reports
export async function fetchEntities(entities, page, rowsPerPage = 100) {
    return await authApi.fetch("/" + entities, {
        sort: ["id:desc"], populate: ['logo'], pagination: { page, pageSize: rowsPerPage }
    },);
}
export async function fetchSales(page, rowsPerPage = 200, { sort, filters, populate } = {}) {
    const ep = SalesEndpoints.list(page, rowsPerPage, { sort, filters, populate });
    return await authApi.fetch(ep.path, ep.params);
}

export async function fetchReturns(page, rowsPerPage = 100) {
    const ep = SaleReturnsEndpoints.list(page, rowsPerPage);
    return await authApi.fetch(ep.path, ep.params);
}

// Fetch purchases for reports
export async function fetchPurchases(page, rowsPerPage = 100) {
    const ep = PurchasesEndpoints.list(page, rowsPerPage);
    return await authApi.fetch(ep.path, ep.params);
}

//fetchCategories
export async function fetchCategories(page, rowsPerPage) {
    const ep = CategoriesEndpoints.list({ page, pageSize: rowsPerPage ?? 100 });
    return await authApi.fetch(ep.path, ep.params);
}

//fetchBrands
export async function fetchBrands(page, rowsPerPage) {
    const ep = BrandsEndpoints.list({ page, pageSize: rowsPerPage ?? 100 });
    return await authApi.fetch(ep.path, ep.params);
}


// Fetch a sale or purchase by id or invoice_no
export async function fetchSaleByIdOrInvoice(id) {
    let res;
    const byIdEp = SalesEndpoints.byId(id);
    res = await authApi.get(byIdEp.path, byIdEp.params);
    let data = res?.data ?? res;
    const sale = Array.isArray(data) ? data[0] : data;

    // Hydrate _exchangeReturns from the populated exchange_returns relation
    if (sale) {
        const populated = sale.exchange_returns;
        if (Array.isArray(populated) && populated.length > 0) {
            sale._exchangeReturns = populated;
        } else if (populated && typeof populated === 'object' && !Array.isArray(populated)) {
            // Backwards-compat: if Strapi returns a single object (old oneToOne)
            sale._exchangeReturns = [populated];
        }

        // Fallback: if exchange_returns wasn't populated, try a separate query
        if (!sale._exchangeReturns?.length) {
            const saleDocId = sale.documentId || sale.id;
            try {
                const excEp = SalesEndpoints.exchangeReturns(saleDocId);
                const excRes = await authApi.get(excEp.path, excEp.params);
                const excData = excRes?.data ?? excRes;
                const excReturns = Array.isArray(excData) ? excData : excData ? [excData] : [];
                if (excReturns.length > 0) {
                    sale._exchangeReturns = excReturns;
                }
            } catch (err) {
                console.error('Failed to load exchange returns', err);
            }
        }
    }

    return sale;
}

export async function fetchPurchaseByIdDocumentIdOrPO(id) {
    const ep = PurchasesEndpoints.byId(id);
    const res = await authApi.get(ep.path, ep.params);
    let data = dataNode(res);
    return Array.isArray(data) ? data[0] : data;
}


export async function fetchEnumsValues(name, field) {
    const ep = EnumsEndpoints.values(name, field);
    const res = await authApi.fetch(ep.path);
    console.log('res', res);
    let data = dataNode(res);
    return data?.values;
}


export async function fetchProducts(filters, page, rowsPerPage, sort) {
    const { searchText } = filters;

    // If there is a search term, use the full-text search endpoint shape.
    // Otherwise, use the parameterised list builder which handles relation filters cleanly.
    if (searchText && searchText.trim().length > 0) {
        const ep = ProductsEndpoints.search(searchText.trim(), page, rowsPerPage);
        return await authApi.get(ep.path, ep.params);
    }

    const ep = ProductsEndpoints.list(page, rowsPerPage, {
        brands: filters.brands,
        categories: filters.categories,
        suppliers: filters.suppliers,
        purchases: filters.purchases,
        parentOnly: filters.parentOnly,
        status: filters.status,
        sort,
    });
    return await authApi.get(ep.path, ep.params);
}

export async function loadProduct(id) {
    const byIdEp = ProductsEndpoints.byId(id);
    let res = await authApi.get(byIdEp.path, byIdEp.params);
    let prod = res.data || res;
    //let data = {
    //    id: prod.id || '',
    //    documentId: prod.documentId || '',
    //    name: prod.name || '',
    //    sku: prod.sku || '',
    //    barcode: prod.barcode || '',
    //    cost_price: prod.cost_price || 0,
    //    selling_price: prod.selling_price || 0,
    //    offer_price: prod.offer_price || 0,
    //    tax_rate: prod.tax_rate || 0,
    //    stock_quantity: prod.stock_quantity || 0,
    //    reorder_level: prod.reorder_level || 0,
    //    is_active: prod.is_active !== undefined ? prod.is_active : true,
    //    categories: prod.categories[0]?.id || '',
    //    brands: prod.brands[0]?.id || '',
    //    suppliers: prod.suppliers || [],
    //    logo: prod.logo || null,
    //    gallery: prod.gallery || [],

    //};
    return prod;
}
