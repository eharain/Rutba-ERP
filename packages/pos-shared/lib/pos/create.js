import { authApi } from '../api';
import { generateNextInvoiceNumber, generateNextPONumber, getBranch, getUser } from '../utils';
import { SalesEndpoints, PurchasesEndpoints, ProductsEndpoints, StockItemsEndpoints } from '../endpoints/index.js';

// Create a new sale or purchase entity
export async function createNewEntity(name) {
    let data = {};
    let nameSinglar = name.endsWith('s') ? name.slice(0, -1) : name;
    let namePlural = name.endsWith('s') ? name : name + 's';
    const user = getUser();
    const branch = getBranch();
    if (name === 'sales' || name === 'sale') {
        data = {
            invoice_no: generateNextInvoiceNumber(),
            sale_date: new Date().toISOString(),
            total: 0,
            owners: {
                connect: [user.documentId],
            }
        };
    } else if (name === 'purchases' || name === 'purchase') {

        data = {
            orderId: generateNextPONumber(),
            order_date: new Date().toISOString(),
            total: 0,
            owners: {
                connect: [user.documentId],
            },
        };
    } else if (name === 'product' || name === 'products') {

        data = {
            cost_price: 0,
            selling_price: 0,
            reorder_level: 1,
            is_active: false,
            branches: {
                connect: [branch.documentId],
            },

            owners: {
                connect: [user.documentId],
            },
        };
    }
    const ep = name === 'sales' || name === 'sale' ? SalesEndpoints.create()
        : name === 'purchases' || name === 'purchase' ? PurchasesEndpoints.create()
        : ProductsEndpoints.create();
    const res = await authApi.post(ep.path, { data });
    const rdata = res?.data || {};
    const id = /*rdata.orderId ?? rdata.invoice_no ??*/ rdata.documentId ?? rdata.id;
    return { data: rdata, id, nameSinglar, namePlural };
}



export async function generateStockItems(purchase, purchaseItem, quantity) {
    const stockItems = [];

    const product = purchaseItem.product;

    for (let i = 0; i < quantity; i++) {
        let sku = purchaseItem.product.sku;
        let barcode = purchaseItem.product.barcode;
        if (!sku) {
            sku = product.id.toString(22).toUpperCase();
        }
       

        sku = `${sku}-${Date.now().toString(22)}-${i.toString(22)}`.toUpperCase();

        barcode = barcode ? `${barcode}-${i.toString(22)}`.toUpperCase() : undefined;


        const stockItem = {
            sku,
            barcode,
            status: 'Received',
            cost_price: purchaseItem.unit_price,
            selling_price: purchaseItem.product.selling_price,
            offer_price: purchaseItem.product.offer_price,
            product: purchaseItem.product.documentId || purchaseItem.product.id,
            purchase_item: purchaseItem.documentId || purchaseItem.id,
            branch: getBranch()?.documentId || getBranch()?.id
        };

        try {
            const siEp = StockItemsEndpoints.create();
            const response = await authApi.post(siEp.path, { data: stockItem });
            stockItems.push(response.data);
        } catch (error) {
            console.error('Error creating stock item:', error);
        }
    }

    return stockItems;
}