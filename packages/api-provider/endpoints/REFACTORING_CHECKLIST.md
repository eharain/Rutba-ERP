# Endpoint Refactoring Checklist

## Standalone Functions to Move Into Endpoint Objects

This document lists all standalone `export function` declarations found in endpoint files that need to be moved into their respective endpoint constant objects.

### Summary
- **Total Files with Standalone Functions:** 11
- **Total Functions to Refactor:** 27

---

## Files and Functions

### 1. **brands.js**
- `fetchBrands(page, rowsPerPage)` → Move into `BrandsEndpoints`

### 2. **categories.js**
- `fetchCategories(page, rowsPerPage)` → Move into `CategoriesEndpoints`
- `searchCategories(searchTerm, page, rowsPerPage)` → Move into `CategoriesEndpoints`

### 3. **enums.js**
- `fetchEnumsValues(name, field)` → Move into `EnumsEndpoints`

### 4. **products.js** (7 functions)
- `saveProductItems(id, items)` → Move into `ProductsEndpoints`
- `saveProduct(id, formData)` → Move into `ProductsEndpoints`
- `fetchProducts(filters, page, rowsPerPage, sort)` → Move into `ProductsEndpoints`
- `loadProduct(id)` → Move into `ProductsEndpoints`
- `searchProduct(searchTerm, page, rowsPerPage)` → Move into `ProductsEndpoints`
- `createProduct()` → Move into `ProductsEndpoints`
- `searchProducts(searchTerm, page, rowsPerPage)` → Move into `ProductsEndpoints`

### 5. **purchase-items.js**
- `savePurchaseItem(item)` → Move into `PurchaseItemsEndpoints`

### 6. **purchases.js** (6 functions)
- `fetchPurchaseByIdDocumentIdOrPO(id)` → Move into `PurchasesEndpoints`
- `savePurchaseItems(id, items)` → Move into `PurchasesEndpoints`
- `savePurchase(idx, purchase)` → Move into `PurchasesEndpoints`
- `fetchPurchases(page, rowsPerPage)` → Move into `PurchasesEndpoints`
- `createPurchase()` → Move into `PurchasesEndpoints`
- `searchPurchases(searchTerm, page, rowsPerPage)` → Move into `PurchasesEndpoints`

### 7. **sale-items.js**
- `saveSaleItems(saleId, items)` → Move into `SaleItemsEndpoints`

### 8. **sale-returns.js**
- `fetchReturns(page, rowsPerPage)` → Move into `SaleReturnsEndpoints`

### 9. **sales.js** (5 functions)
- `fetchEntities(entities, page, rowsPerPage)` → Move into `SalesEndpoints`
- `fetchSales(page, rowsPerPage, opts)` → Move into `SalesEndpoints`
- `fetchSaleByIdOrInvoice(id)` → Move into `SalesEndpoints`
- `createSale()` → Move into `SalesEndpoints`
- `searchSales(searchTerm, page, rowsPerPage)` → Move into `SalesEndpoints`

### 10. **stock-items.js** (4 functions)
- `generateStockItems(purchase, purchaseItem, quantity)` → Move into `StockItemsEndpoints`
- `searchStockItemsByName(searchTerm)` → Move into `StockItemsEndpoints`
- `searchStockItemsByBarcode(barcode)` → Move into `StockItemsEndpoints`
- `searchStockItems(searchTerm, page, rowsPerPage, statusFilter, branch, ...)` → Move into `StockItemsEndpoints`

---

## Refactoring Pattern

**Before:**
```javascript
export const SomeEndpoints = {
    list: () => ({ path: '/resource', params: {...} })
};

export async function fetchSomething(page, rowsPerPage) {
    const ep = SomeEndpoints.list({ page, pageSize: rowsPerPage });
    return await AuthApiEndpoints.fetch(ep.path, ep.params);
}
```

**After:**
```javascript
export const SomeEndpoints = {
    meta: {
        uid: 'api::resource.resource',
        domains: ['stock', 'sale'],
        roles: ['admin', 'manager', 'staff']
    },

    list: () => ({
        path: '/resource',
        action: 'find',
        method: 'get',
        apps: ['stock', 'sale'],
        approle: ['admin', 'manager', 'staff'],
        params: {...}
    }),

    // ✅ Moved from standalone function
    fetchSomething: async (page, rowsPerPage) => {
        const ep = SomeEndpoints.list({ page, pageSize: rowsPerPage });
        return await authApi.fetch(ep.path, ep.params);
    }
};
```

---

## Next Steps

1. ✅ Step 1: Move HTTP clients to lib/ (COMPLETED)
2. ✅ Step 2: Analyze and document standalone functions (CURRENT)
3. Step 3-12: Refactor each file systematically
4. Step 13: Update all import references
5. Step 14: Verify build and tests
