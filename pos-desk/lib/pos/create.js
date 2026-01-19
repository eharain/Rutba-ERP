import qs from 'qs';
import { authApi } from '../api';
import { generateNextInvoiceNumber, generateNextPONumber, getBranch, getUser } from '../utils';

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
            users: {
                connect: [user.id],
                disconnect: [],
            }
        };
    } else if (name === 'purchases' || name === 'purchase') {

        data = {
            orderId: generateNextPONumber(),
            order_date: new Date().toISOString(),
            total: 0,
            users: {
                connect: [user.id],
                disconnect: [],
            },
        };
    } else if (name === 'product' || name === 'products') {

        data = {
            cost_price: 0,
            selling_price: 0,
            reorder_level: 1,
            is_active: false,
            branches: {
                connect: [branch.id],
                disconnect: [],
            },

            users: {
                connect: [user.id],
                disconnect: [],
            },
        };
    }
    const res = await authApi.post(`/${namePlural}`, { data });
    const rdata = res?.data || {};
    const id = rdata.orderId ?? rdata.invoice_no ?? rdata.documentId ?? rdata.id;
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
            product: purchaseItem.product.documentId || purchaseItem.product.id,
            purchase_item: purchaseItem.documentId || purchaseItem.id,
            branch: purchase.branch?.documentId || purchase.branch?.id
        };

        try {
            const response = await authApi.post('/stock-items', { data: stockItem });
            stockItems.push(response.data);
        } catch (error) {
            console.error('Error creating stock item:', error);
        }
    }

    return stockItems;
}