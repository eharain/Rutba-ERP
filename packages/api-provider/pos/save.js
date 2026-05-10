import { getBranch, prepareForPut } from '../utils.js';
import { SaleItemsEndpoints, PurchasesEndpoints, PurchaseItemsEndpoints, ProductsEndpoints, StockItemsEndpoints } from '../endpoints/index.js';

const unwrap = (res) => res?.data ?? res;

export async function saveSaleItems(saleId, items = []) {
    const promises = items.map(async (i) => {
        const result = await SaleItemsEndpoints.create({
            items: [i.documentId],
            quantity: i.quantity,
            price: i.price,
            product: i.product?.documentId ?? i.product,
            sale: saleId,
        });
        await StockItemsEndpoints.update(i.documentId, { status: 'Sold' });
        return unwrap(result);
    });
    return Promise.all(promises);
}

export async function savePurchaseItems(id, items = []) {
    const payload = {
        items: items.map((i) => ({
            stock_item: i.stock_item?.id ?? i.stock_item,
            quantity: i.quantity,
            price: i.price,
        })),
    };
    const res = await PurchasesEndpoints.update(id, payload);
    return unwrap(res);
}

export async function saveProductItems(id, items = []) {
    const payload = {
        items: items.map((i) => ({
            stock_item: i.stock_item?.id ?? i.stock_item,
            quantity: i.quantity,
            price: i.price,
        })),
    };
    const res = await ProductsEndpoints.update(id, payload);
    return unwrap(res);
}

export async function saveProduct(id, formData) {
    const isUpdate = id && id !== 'new';
    const numericProps = ['offer_price', 'selling_price', 'tax_rate', 'stock_quantity', 'reorder_level', 'bundle_units'];
    const converted = { ...formData };
    numericProps.forEach((prop) => {
        if (converted[prop] !== undefined && converted[prop] !== '') {
            const num = Number(converted[prop]);
            if (!Number.isNaN(num)) converted[prop] = num;
        }
    });

    const data = typeof id === 'string' && /[a-zA-Z]/.test(id) ? converted : { ...converted, id };
    const res = isUpdate ? await ProductsEndpoints.update(id, data) : await ProductsEndpoints.create(data);
    return unwrap(res);
}

export async function savePurchase(idx, purchase) {
    const payload = { ...purchase };
    if (Array.isArray(payload.items)) {
        const savedItems = [];
        for (const item of payload.items) {
            const saved = await savePurchaseItem(item);
            savedItems.push(saved);
        }
        payload.items = { connect: savedItems.map((i) => i.documentId).filter(Boolean) };
    }

    const isExisting = Number(payload.id) > 0 || !!payload.documentId;
    const res = isExisting
        ? await PurchasesEndpoints.update(payload.documentId, prepareForPut(payload, []))
        : await PurchasesEndpoints.create(prepareForPut(payload, []));
    return unwrap(res);
}

export async function savePurchaseItem(item) {
    if (item?.id > -1 && item?.documentId) {
        const res = await PurchaseItemsEndpoints.update(item.documentId, prepareForPut(item, []));
        return unwrap(res);
    }
    const res = await PurchaseItemsEndpoints.create(prepareForPut(item, []));
    return unwrap(res);
}

/**
 * Generate and persist stock items for a received purchase item.
 */
export async function generateStockItems(purchase, purchaseItem, quantity, branchOverride) {
    const qty = Math.max(0, Number(quantity || 0));
    if (!qty) return [];

    const branch = branchOverride || getBranch();
    const product = purchaseItem?.product;
    const productId = product?.documentId || product?.id || product;
    const purchaseItemId = purchaseItem?.documentId || purchaseItem?.id;

    const stockItems = [];
    for (let i = 0; i < qty; i++) {
        let sku = product?.sku;
        let barcode = product?.barcode;

        if (!sku) sku = (product?.id ?? '').toString(22).toUpperCase();

        sku = `${sku}-${Date.now().toString(22)}-${i.toString(22)}`.toUpperCase();
        barcode = barcode ? `${barcode}-${i.toString(22)}`.toUpperCase() : undefined;

        const stockItem = {
            sku,
            barcode,
            status: 'Received',
            cost_price: purchaseItem?.unit_price,
            selling_price: product?.selling_price,
            offer_price: product?.offer_price,
            product: productId,
            purchase_item: purchaseItemId,
            ...(branch?.documentId || branch?.id ? { branch: branch.documentId || branch.id } : {}),
        };

        const response = await StockItemsEndpoints.create(stockItem);
        stockItems.push(unwrap(response));
    }

    return stockItems;
}

export async function searchStockItems(searchTerm, page = 1, rowsPerPage = 100, statusFilter = null, branch = null, productDocumentId = null, sort = null, showArchived = false) {
    const response = await StockItemsEndpoints.list(page, rowsPerPage, {
        statusFilter,
        branchDocId: branch,
        productDocId: productDocumentId,
        showArchived,
        sort,
        searchTerm,
    });
    return { data: response?.data ?? [], meta: response?.meta ?? {} };
}

export { prepareForPut };