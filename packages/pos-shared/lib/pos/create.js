// Each entity-specific create function lives in its endpoint file.
// This orchestrator delegates by name for backward compatibility.
import { createSale } from '../endpoints/sales.js';
import { createPurchase } from '../endpoints/purchases.js';
import { createProduct } from '../endpoints/products.js';

export { createSale, createPurchase, createProduct };

// generateStockItems lives in the stock-items endpoint.
export { generateStockItems } from '../endpoints/stock-items.js';

/**
 * Create a new entity by type name.
 * @param {'sale'|'sales'|'purchase'|'purchases'|'product'|'products'} name
 */
export async function createNewEntity(name) {
    const n = name.toLowerCase();
    if (n === 'sale' || n === 'sales') return await createSale();
    if (n === 'purchase' || n === 'purchases') return await createPurchase();
    if (n === 'product' || n === 'products') return await createProduct();
    throw new Error('Unknown entity type: ' + name);
}
