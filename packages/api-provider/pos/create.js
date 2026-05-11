// Each entity-specific create function lives in its endpoint file.
// This orchestrator delegates by name for backward compatibility.
import { SalesEndpoints, PurchasesEndpoints, StockItemsEndpoints } from '../endpoints/index.js';
import { generateNextInvoiceNumber, generateNextPONumber, getBranch, getUser } from '../utils.js';

const callCreate = (endpoints, payload) => {
    const fn = endpoints?.postCreate ?? endpoints?.create;
    if (typeof fn !== 'function') throw new Error('Create endpoint is not available');
    return fn(payload);
};

export async function createSale() {
    const user = getUser();
    const branch = getBranch();
    const res = await callCreate(SalesEndpoints, {
        invoice_no: generateNextInvoiceNumber?.(),
        sale_date: new Date().toISOString(),
        total: 0,
        subtotal: 0,
        status: 'Draft',
        payment_status: 'Unpaid',
        return_status: 'None',
        ...(user?.documentId ? { owners: { connect: [user.documentId] } } : {}),
        ...(branch?.documentId ? { branches: { connect: [branch.documentId] } } : {}),
    });
    const data = res?.data ?? res;
    return { data, id: data?.documentId ?? data?.id, nameSingular: 'sale', namePlural: 'sales' };
}

export async function createPurchase() {
    const user = getUser();
    const branch = getBranch();
    const res = await callCreate(PurchasesEndpoints, {
        orderId: generateNextPONumber?.(),
        order_date: new Date().toISOString(),
        total: 0,
        status: 'Draft',
        ...(user?.documentId ? { owners: { connect: [user.documentId] } } : {}),
        ...(branch?.documentId ? { branches: { connect: [branch.documentId] } } : {}),
    });
    const data = res?.data ?? res;
    return { data, id: data?.documentId ?? data?.id, nameSingular: 'purchase', namePlural: 'purchases' };
}


export async function generateStockItems(purchase, item, quantity) {
    const qty = Math.max(0, Number(quantity || 0));
    if (!qty) return [];
    const branch = getBranch();
    const productDocId = item?.product?.documentId ?? item?.product;
    const purchaseDocId = purchase?.documentId ?? purchase?.id;
    const purchaseItemDocId = item?.documentId ?? item?.id;

    const created = [];
    for (let i = 0; i < qty; i++) {
        const stock = await callCreate(StockItemsEndpoints, {
            name: item?.product?.name,
            status: 'Received',
            product: productDocId,
            purchase: purchaseDocId,
            purchase_item: purchaseItemDocId,
            selling_price: Number(item?.price ?? item?.unit_price ?? 0),
            cost_price: Number(item?.unit_price ?? item?.price ?? 0),
            ...(branch?.documentId ? { branch: branch.documentId } : {}),
        });
        created.push(stock?.data ?? stock);
    }
    return created;
}


