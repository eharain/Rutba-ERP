import qs from 'qs';
import { authApi } from '../api';
import { buildQueries } from './queries';

//export function buildSearchQueries(searchText, page = 1, rowsPerPage = 5) {

//    const queriesObject = buildQueries(searchText, page, rowsPerPage);

//    const queries = Object.entries(queriesObject).map(([entity, { query }]) => {
//        return {
//            entity, query: { ...query, ...{ filters: query.search_filters } }
//        };
//    });

//    const hasSearch = !!searchText && searchText.trim().length > 0;
//    queries.forEach(q => {
//        if (!hasSearch) {
//            delete q.query.filters;
//        }

//        q.url = `/${q.entity}?` + qs.stringify(q.query, { encodeValuesOnly: true });
//    })
//    return queries;

//}
//export function createQueries(searchText, page, rowsPerPage) {
//    // Helper to build filters only if searchText is present

//    const queries = buildSearchQueries(searchText, page, rowsPerPage);



//    return queries;
//}


// General search function across multiple entities
export async function featchSearch(searchTerm, page, rowsPerPage) {
    let queries = Object.values(buildQueries(searchTerm, page, rowsPerPage));

    let results = [];
    // for (let { name, query } in queries) {
    for (let { entity, query, url } of queries) {

        const res = await authApi.fetch(url);
        console.log('Fetching', entity, url, res.data);
        results.push({ entity, data: res?.data ?? [], pagination: res?.meta?.pagination })
    }


    const data = results.map((res, i) => {
        return res.data.map((r) => {
            //   const r = res.data;
            //const total
            return {
                entity: res.entity,
                name: r.name ?? r?.product?.name,
                code: r.orderId ?? r.invoice_no,
                barcode: r.barcode,
                sku: r.sku,
                id: r.id,
                documentId: r.documentId,
                date: r.sale_date ?? r.order_date,
                person_name: r.customer?.name ?? r.supplier?.name ?? r.name,
                phone: r.customer?.phone ?? r.supplier?.phone ?? '',
                email: r.customer?.email ?? r.supplier?.email ?? '',
                total: r.total,
                subtotal: r.subtotal,
                logo: r.logo
            }
        })
    }).flat();

    const pagination = results.reduce((pre, curr) => {
        const p = curr.pagination
        pre.total = Math.max(pre.total, p?.total ?? 0);
        return pre;
    }, { total: 0, page, pageSize: rowsPerPage });

    const result = { results, data, pagination, meta: { pagination } };
    console.log(result);

    return result;
}




// Search stock items by name
export async function searchStockItemsByName(searchTerm) {
    const res = await authApi.get(`/stock-items?filters[name][$containsi]=${searchTerm}`);
    return dataNode(res);
}

// Search stock items by barcode and add to sale
export async function searchStockItemsByBarcode(barcode) {
    const res = await authApi.get(`/stock-items?filters[barcode][$eq]=${barcode}`);
    return dataNode(res);
}



// Mock function - replace with your actual API call
export async function searchProduct(searchTerm, page = 0, rowsPerPage = 100) {
    const query = buildQueries(searchTerm, page, rowsPerPage).products
    console.log('Product search query:', query);
    const res = await authApi.fetch(query.url);
    return dataNode( res);
};


export function dataNode(res) {
    return res.data?.data ?? res.data ?? res;
}


export async function searchStockItems(searchTerm, page = 0, rowsPerPage = 100, statusFilter = null) {
    const query = buildQueries(searchTerm, page, rowsPerPage, statusFilter)['stock-items']
    console.log('Stock items search query:', query);    
    const res = await authApi.fetchWithPagination(query.url);
    return { data: res.data, meta: res.meta };
}