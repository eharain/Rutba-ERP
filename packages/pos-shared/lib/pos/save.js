
import { authApi } from '../api';
import { prepareForPut } from '../utils';
import { dataNode } from './search';
import { SaleItemsEndpoints, PurchasesEndpoints, PurchaseItemsEndpoints, ProductsEndpoints, StockItemsEndpoints } from '../endpoints/index.js';


// Save changes to sale items
export async function saveSaleItems(id, items) {
    const promises = items.map(async (i) => {
        const siEp = SaleItemsEndpoints.create();
        const stockEp = StockItemsEndpoints.update(i.documentId);
        [await authApi.post(siEp.path, {
            data: {
                items: [i.documentId],
                quantity: i.quantity,
                price: i.price,
                product: i.product.documentId,
                sale: id
            }
        }),
        await authApi.put(stockEp.path, {
            data: {
                status: 'Sold'
            }
        })
        ]
    }).flat(2);

    return await Promise.all(promises);
}


// Save changes to purchase items
export async function savePurchaseItems(id, items) {

    const ep = PurchasesEndpoints.update(id);
    return await authApi.put(ep.path, {
        data: {
            items: items.map((i) => ({
                stock_item: i.stock_item.id,
                quantity: i.quantity,
                price: i.price,
            })),
        },
    });
}

//saveProductItems
export async function saveProductItems(id, items) {
    const ep = ProductsEndpoints.update(id);
    return await authApi.put(ep.path, {
        data: {
            items: items.map((i) => ({
                stock_item: i.stock_item.id,
                quantity: i.quantity,
                price: i.price,
            })),
        },
    });
}
//prepareForPut()
export async function saveProduct(id, formData) {
    const isUpdate = id && id !== 'new';
    const ep = isUpdate ? ProductsEndpoints.update(id) : ProductsEndpoints.create();

    ;
    /**the relations like category, brand, owners, term-types, terms should be added as connect and disconnect paramter */
    // List of numeric properties to convert
    const numericProps = [
        'offer_price',
        'selling_price',
        'tax_rate',
        'stock_quantity',
        'reorder_level',
        'bundle_units',
        //'category',
        //'brand'
    ];

    // Convert numeric properties to numbers if present
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

    const response = isUpdate
        ? await authApi.put(ep.path, { data })
        : authApi.post(ep.path, { data });
    return response;
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
    const ep = isExisting
        ? PurchasesEndpoints.update(purchaseData.documentId)
        : PurchasesEndpoints.create();

    if (isExisting) {
        const res = await authApi.put(ep.path, { data: prepareForPut(purchaseData, []) });
        return dataNode(res);
    } else {
        const res = await authApi.post(ep.path, { data: prepareForPut(purchaseData, []) });
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
        const ep = PurchaseItemsEndpoints.update(item.documentId);
        const res = await authApi.put(ep.path, { data: prepareForPut(item, []) });
        return dataNode(res);
    } else {
        const ep = PurchaseItemsEndpoints.create();
        const res = await authApi.post(ep.path, { data: prepareForPut(item, []) });
        return dataNode(res);
    }
}