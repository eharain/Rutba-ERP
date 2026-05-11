// Moved to their endpoint files -- re-exported for backward compatibility.
import {
    StockItemsEndpoints,
    ProductsEndpoints,
    SalesEndpoints,
    PurchasesEndpoints,
    BranchesEndpoints,
    CategoriesEndpoints,
} from '../endpoints/index.js';

export const searchStockItemsByName = StockItemsEndpoints.searchStockItemsByName;
export const searchStockItemsByBarcode = StockItemsEndpoints.searchStockItemsByBarcode;
export const searchStockItems = StockItemsEndpoints.searchStockItems;
export const searchProduct = ProductsEndpoints.searchProduct;
export const searchProducts = ProductsEndpoints.searchProducts;
export const searchSales = SalesEndpoints.searchSales;
export const searchPurchases = PurchasesEndpoints.searchPurchases;
export const searchBranches = BranchesEndpoints.searchBranches;
export const searchCategories = CategoriesEndpoints.searchCategories;

export function dataNode(res) {
    return res.data?.data ?? res.data ?? res;
}

// General full-text search across multiple entities (stays here).
export async function fetchSearch(searchTerm, page, rowsPerPage) {
    const {
        ProductsEndpoints,
        PurchasesEndpoints,
        SalesEndpoints,
        StockItemsEndpoints,
    } = await import('../endpoints/index.js');

    const [products, purchases, sales, stockItems] = await Promise.allSettled([
        ProductsEndpoints.searchProducts(searchTerm, page, rowsPerPage),
        PurchasesEndpoints.searchPurchases(searchTerm, page, rowsPerPage),
        SalesEndpoints.searchSales(searchTerm, page, rowsPerPage),
        StockItemsEndpoints.searchStockItems(searchTerm, page, rowsPerPage),
    ]);

    const results = [
        { entity: 'products', data: products.status === 'fulfilled' ? (Array.isArray(products.value) ? products.value : products.value?.data ?? []) : [], pagination: null },
        { entity: 'purchases', data: purchases.status === 'fulfilled' ? (Array.isArray(purchases.value) ? purchases.value : purchases.value?.data ?? []) : [], pagination: null },
        { entity: 'sales', data: sales.status === 'fulfilled' ? (Array.isArray(sales.value) ? sales.value : sales.value?.data ?? []) : [], pagination: null },
        { entity: 'stock-items', data: stockItems.status === 'fulfilled' ? (Array.isArray(stockItems.value) ? stockItems.value : stockItems.value?.data ?? []) : [], pagination: null },
    ];

    const data = results.flatMap((res) =>
        res.data.map((r) => ({
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
            logo: r.logo,
        }))
    );
    const pagination = results.reduce(
        (pre, curr) => { pre.total = Math.max(pre.total, curr.pagination?.total ?? 0); return pre; },
        { total: 0, page, pageSize: rowsPerPage }
    );
    return { results, data, pagination, meta: { pagination } };
}

