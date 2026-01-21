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
export async function fetchSales(page, rowsPerPage = 200) {
    return await authApi.fetch("/sales", { sort: ['createdAt:desc'], pagination: { page, pageSize: rowsPerPage } },);
}

export async function fetchReturns(page, rowsPerPage = 100) {
    return await authApi.fetch("/sale-returns", { pagination: { page, pageSize: rowsPerPage } });
}

// Fetch purchases for reports
export async function fetchPurchases( page, rowsPerPage = 100) {
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
        populate: { items: { populate: ["product"] } }
    });
    let data = res?.data?.data ?? res?.data;
    return Array.isArray(data) ? data[0] : data;
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


export async function fetchProducts(filters, page, rowsPerPage) {
    const { brands, categories, suppliers, terms, stockStatus, searchText } = filters;

   

    const entity = 'products';
    const documentId = null;

    const { query, relations, url } = urlAndRelations(entity, documentId, searchText, page, rowsPerPage)

    
    for (const key of Object.entries(filters)) {

        if (relations.includes(key)) {
            query.filters

        }
     //   delete query.query.filters[key];
    }


    const res = await authApi.get(url);
    console.log('res', res)
   // let data = dataNode(res);
    return res; //{data: res.data, meta: res.meta };
    //  return await fetchEntities('products', page, rowsPerPage);
}

export async function loadProduct(id) {
    let res = await authApi.get(`/products/${id}?populate[categories][populate]=*&populate[brands][populate]=*&populate[suppliers][populate]=*`);
    let prod = res.data || res;
    let data = {
        name: prod.name || '',
        sku: prod.sku || '',
        barcode: prod.barcode || '',
        cost_price: prod.cost_price || 0,
        selling_price: prod.selling_price || 0,
        tax_rate: prod.tax_rate || 0,
        stock_quantity: prod.stock_quantity || 0,
        reorder_level: prod.reorder_level || 0,
        is_active: prod.is_active !== undefined ? prod.is_active : true,
        categories: prod.categories[0]?.id || '',
        brands: prod.brands[0]?.id || '',
        suppliers: prod.suppliers || []
    };
    return data;
}
