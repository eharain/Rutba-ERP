import qs from 'qs';
import { authApi } from '../api';
import { urlAndRelations } from './queries';
import { dataNode } from './search';

// Fetch sales and returns for reports
export async function fetchEntities(entities, page, rowsPerPage = 100) {
    return await authApi.fetch("/" + entities, {
        sort: ["id:desc"], populate: ['logo'], pagination: { page, pageSize: rowsPerPage }
    },);
}
export async function fetchSales(page, rowsPerPage = 200, { sort, filters } = {}) {
    return await authApi.fetch("/sales", {
        sort: sort || ['createdAt:desc'],
        filters: filters || undefined,
        pagination: { page, pageSize: rowsPerPage },
        populate: { customer: true, employee: true, cash_register: true },
    });
}

export async function fetchReturns(page, rowsPerPage = 100) {
    return await authApi.fetch("/sale-returns", { pagination: { page, pageSize: rowsPerPage } });
}

// Fetch purchases for reports
export async function fetchPurchases(page, rowsPerPage = 100) {
    return await authApi.fetch("/purchases", { sort: ['createdAt:desc'], pagination: { page, pageSize: rowsPerPage }, populate: { suppliers: true } });
}

//fetchCategories 
export async function fetchCategories(page, rowsPerPage) {
    return await authApi.fetch("/categories", { sort: ["name:asc"], pagination: { page, pageSize: rowsPerPage ?? 100 } });
}

//fetchBrands
export async function fetchBrands(page, rowsPerPage) {
    return await authApi.fetch("/brands", { sort: ["name:asc"], pagination: { page, pageSize: rowsPerPage ?? 100 } });
}


// Fetch a sale or purchase by id or invoice_no
export async function fetchSaleByIdOrInvoice(id) {
    let res;
    res = await authApi.get("/sales/", {
        filters: {
            $or: [{ invoice_no: id }, { id }, { documentId: id }]
        },
        populate: {
            payments: true,
            customer: true,
            items: { populate: { product: true, items: { populate: ['product'] } } },
            sale_returns: { populate: { items: { populate: ['product'] } } },
            exchange_return: { populate: { items: { populate: ['product'] }, sale: true } }
        }
    });
    let data = res?.data ?? res;
    const sale = Array.isArray(data) ? data[0] : data;

    // Hydrate _exchangeReturns from the populated exchange_return relation
    if (sale) {
        if (sale.exchange_return) {
            sale._exchangeReturns = [sale.exchange_return];
        }

        // Fallback: if exchange_return wasn't populated, try a separate query
        if (!sale._exchangeReturns?.length) {
            const saleDocId = sale.documentId || sale.id;
            try {
                const excRes = await authApi.get("/sale-returns/", {
                    filters: {
                        type: { $eq: 'Exchange' },
                        exchange_sale: saleDocId
                    },
                    populate: { items: { populate: ['product'] }, sale: true }
                });
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
    let res;
    let { url, relations } = urlAndRelations('purchases', id)

    res = await authApi.get(url);
    let data = dataNode(res);
    return Array.isArray(data) ? data[0] : data;
}


export async function fetchEnumsValues(name, field) {

    const res = await authApi.fetch(`/enums/${name}/${field}`);
    console.log('res', res)
    let data = dataNode(res);
    return data?.values;
}


export async function fetchProducts(filters, page, rowsPerPage, sort) {
    const { brands, categories, suppliers, terms, stockStatus, searchText } = filters;



    const entity = 'products';
    const documentId = null;

    let { query, relations, url } = urlAndRelations(entity, documentId, searchText, page, rowsPerPage)

    for (const [field, values] of Object.entries(filters)) {
        if (field === 'stockStatus' || field === 'searchText') {
            continue;
        }
        if (Array.isArray(values) && values.length > 0) {
            values.forEach((val, index) => {
                url += `&filters[${field}][documentId][$in][${index}]=${val}`;
            });
        }
    }

    if (sort) {
        url += `&sort=${encodeURIComponent(sort)}`;
    }

    console.log('products search url', url);
    const res = await authApi.get(url);
    return res;
}

export async function loadProduct(id) {

    const query = {
      //  filters: { documentId: id },
        populate: {
            categories: true,
            brands: true,
            suppliers: true,
            logo: true,
            gallery: true,
            terms: true,
            parent: true,
        }
    }

    let res = await authApi.get(`/products/${id}`, query);
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
