// Re-exported from endpoint files for backward compatibility.
import { SalesEndpoints } from '../endpoints/sales.js';
import { PurchasesEndpoints } from '../endpoints/purchases.js';
import { SaleReturnsEndpoints } from '../endpoints/sale-returns.js';
import { CategoriesEndpoints } from '../endpoints/categories.js';
import { BrandsEndpoints } from '../endpoints/brands.js';
import { EnumsEndpoints } from '../endpoints/enums.js';
import { ProductsEndpoints } from '../endpoints/products.js';

export const fetchEntities = SalesEndpoints.fetchEntities;
export const fetchSales = SalesEndpoints.fetchSales;
export const fetchSaleByIdOrInvoice = SalesEndpoints.fetchSaleByIdOrInvoice;
export const fetchPurchaseByIdDocumentIdOrPO = PurchasesEndpoints.fetchPurchaseByIdDocumentIdOrPO;
export const fetchPurchases = PurchasesEndpoints.fetchPurchases;
export const fetchReturns = SaleReturnsEndpoints.fetchReturns;
export const fetchCategories = CategoriesEndpoints.fetchCategories;
export const fetchBrands = BrandsEndpoints.fetchBrands;
export const fetchEnumsValues = EnumsEndpoints.fetchEnumsValues;
export const fetchProducts = ProductsEndpoints.fetchProducts;
export const loadProduct = ProductsEndpoints.loadProduct;
