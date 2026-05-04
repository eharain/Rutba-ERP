
import { prepareForPut } from '../utils';
import { dataNode } from './search';
import { SaleItemsEndpoints, PurchasesEndpoints, PurchaseItemsEndpoints, ProductsEndpoints, StockItemsEndpoints } from '../endpoints/index.js';


// Save changes to sale items
export async function saveSaleItems(id, items) {
    const promises = items.map(async (i) => {
        const results = await SaleItemsEndpoints.postCreate({
            items: [i.documentId],
            quantity: i.quantity,
            price: i.price,
            product: i.product.documentId,
            sale: id
        });
        await StockItemsEndpoints.putUpdate(i.documentId, { status: 'Sold' });
        return results;
    }).flat(2);

    return await Promise.all(promises);
}


// Save changes to purchase items
export async function savePurchaseItems(id, items) {
    return PurchasesEndpoints.putUpdate(id, {
        items: items.map((i) => ({
            stock_item: i.stock_item.id,
            quantity: i.quantity,
            price: i.price,
        })),
    });
}

//saveProductItems
export async function saveProductItems(id, items) {
    return ProductsEndpoints.putUpdate(id, {
        items: items.map((i) => ({
            stock_item: i.stock_item.id,
            quantity: i.quantity,
            price: i.price,
        })),
    });
}
//prepareForPut()
export async function saveProduct(id, formData) {
    const isUpdate = id && id !== 'new';

    const numericProps = [
        'offer_price',
        'selling_price',
        'tax_rate',
        'stock_quantity',
        'reorder_level',
        'bundle_units',
    ];

    const convertedFormData = { ...formData };
    numericProps.forEach(prop => {
        if (convertedFormData[prop] !== undefined && convertedFormData[prop] !== '') {
            const num = Number(convertedFormData[prop]);
            if (!isNaN(num)) {
                convertedFormData[prop] = num;
            }
        }
    });

    const data = typeof id == 'string' && containsAlphabet(id)
        ? { ...convertedFormData }
        : { ...convertedFormData, id };

    return isUpdate
        ? ProductsEndpoints.putUpdate(id, data)
        : ProductsEndpoints.postCreate(data);
}
function containsAlphabet(str) {
    const regex = /[a-zA-Z]/; // Matches any uppercase or lowercase letter
    return regex.test(str);
}




export async function savePurchase(idx, purchase) {
    const items = purchase.items;
    const saveItems = [];
    if (!Array.isArray(purchase.suppliers)) {
        purchase.suppliers = [];
    }
    for (const item of items) {
        if (Array.isArray(item.product.suppliers)) {
            purchase.suppliers.push(...item.product.suppliers);
        }

        const saveItem = await savePurchaseItem(item);
        saveItems.push(saveItem);

    }

    const purchaseData = { ...purchase }

    purchaseData.items = { connect: saveItems.map(i => i.documentId) };

    const isExisting = purchaseData.id > 0;

    if (isExisting) {
        const res = await PurchasesEndpoints.putUpdate(purchaseData.documentId, prepareForPut(purchaseData, []));
        return dataNode(res);
    } else {
        const res = await PurchasesEndpoints.postCreate(prepareForPut(purchaseData, []));
        return dataNode(res);
    }
}



/**
* Save a single purchase item, using PUT if documentId exists, otherwise POST.
* @param {Object} item - The purchase item to save.
* @returns {Promise<Object>} The saved item response.
*/
export async function savePurchaseItem(item) {
    if (item.id > -1) {
        const res = await PurchaseItemsEndpoints.putUpdate(item.documentId, prepareForPut(item, []));
        return dataNode(res);
    } else {
        const res = await PurchaseItemsEndpoints.postCreate(prepareForPut(item, []));
        return dataNode(res);
    }
}