// Re-exported from endpoint files for backward compatibility.
import { SalesEndpoints } from '../endpoints/sales.js';
import { PurchasesEndpoints } from '../endpoints/purchases.js';
import { SaleReturnsEndpoints } from '../endpoints/sale-returns.js';
import { CategoriesEndpoints } from '../endpoints/categories.js';
import { BrandsEndpoints } from '../endpoints/brands.js';
import { EnumsEndpoints } from '../endpoints/enums.js';
import { ProductsEndpoints } from '../endpoints/products.js';
import { PurchaseItemsEndpoints } from '../endpoints/purchase-items.js';

// export const fetchEntities = SalesEndpoints.fetchEntities;
// export const fetchSales = SalesEndpoints.fetchSales;
// export const fetchSaleByIdOrInvoice = SalesEndpoints.fetchSaleByIdOrInvoice;
// export const fetchPurchaseByIdDocumentIdOrPO = PurchasesEndpoints.fetchPurchaseByIdDocumentIdOrPO;
// export const fetchPurchases = PurchasesEndpoints.fetchPurchases;
// export const fetchReturns = SaleReturnsEndpoints.fetchReturns;
// export const fetchCategories = CategoriesEndpoints.fetchCategories;
// export const fetchBrands = BrandsEndpoints.fetchBrands;
// export const fetchEnumsValues = EnumsEndpoints.fetchEnumsValues;
// export const fetchProducts = ProductsEndpoints.fetchProducts;
// export const loadProduct = ProductsEndpoints.loadProduct;



export async function fetchEntities(entities, page, rowsPerPage = 100) {
    const endpoints =
        Object.keys({ SaleReturnsEndpoints, PurchasesEndpoints, CategoriesEndpoints, BrandsEndpoints, EnumsEndpoints, ProductsEndpoints, PurchaseItemsEndpoints }).reduce((acc, key, { }) => {
            return { ...acc, [key.replace('Endpoints', '')]: eval(key), [key.replace('Endpoints', '').toLocaleLowerCase()]: eval(key) }
        })

    const ep = endpoints[entities];
    if (ep) {
        return await ep.fetchEntities(page, rowsPerPage);
    }
    console.warn(`No endpoints found for entity: ${entities}`);
}

export async function fetchSales(page, rowsPerPage = 200, { sort, filters, populate } = {}) {
    return await SalesEndpoints.Sales(page, rowsPerPage, { sort, filters, populate });
}

export async function fetchReturns(page, rowsPerPage = 100) {
    return await SaleReturnsEndpoints.list(page, rowsPerPage);
}

// Fetch purchases for reports
export async function fetchPurchases(page, rowsPerPage = 100) {
    return await PurchasesEndpoints.list(page, rowsPerPage);
}

//fetchCategories 
export async function fetchCategories(page, rowsPerPage) {
    return await CategoriesEndpoints.list(page, rowsPerPage);
}

//fetchBrands
export async function fetchBrands(page, rowsPerPage) {
    return await BrandsEndpoints.list(page, rowsPerPage);
}



// Fetch a sale or purchase by id or invoice_no
export async function fetchSaleByIdOrInvoice(id) {
    let res;
    res = SalesEndpoints.fetchSaleByIdOrInvoice(id);
    let data = res?.data ?? res;
    const sale = Array.isArray(data) ? data[0] : data;

    return sale;
}

export async function fetchPurchaseByIdDocumentIdOrPO(id) {

    let res = await PurchaseItemsEndpoints.fetchById(id);

    let data = dataNode(res);
    return Array.isArray(data) ? data[0] : data;
}


export async function fetchEnumsValues(name, field) {
    const res = EnumsEndpoints.fetchEnumsValues(name, field);
    console.log('res', res)
    let data = dataNode(res);
    return data?.values;
}


export async function fetchProducts(filters, page, rowsPerPage, sort) {
    const res = await ProductsEndpoints.fetchProducts(filters, page, rowsPerPage, sort);
    return res;
}

export async function loadProduct(id) {
    const res = await ProductsEndpoints.loadProduct(id);
    let prod = res.data || res;
    return prod;
}
