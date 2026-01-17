
import qs from 'qs';
import { authApi } from '../api';
import { prepareForPut } from '../utils';
import { dataNode } from './search';
import { urlAndRelations } from './queries';


// Save changes to sale items
export async function saveSaleItems(id, items) {
    const promises = items.map(async (i) => {
        [await authApi.post(`/sale-items`, {
            data: {
                items: [i.id],
                quantity: i.quantity,
                price: i.price,
                product: i.product.id,
                sale: id
            }
        }),
        await authApi.put(`/stock-items/${i.documentId}`, {
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

    return await authApi.put(`/purchases/${id}`, {
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
    return await authApi.put(`/products/${id}`, {
        data: {
            items: items.map((i) => ({
                stock_item: i.stock_item.id,
                quantity: i.quantity,
                price: i.price,
            })),
        },
    });
}

export async function saveProduct(id, formData) {
    const url = id && id !== 'new' ? `/products/${id}` : '/products';
    const method = id && id !== 'new' ? 'PUT' : 'POST';
    /**the relations like category,brand, users, term-types , terms should be added as connect and disconnect paramter */
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

    const response = (method === 'PUT')
        ? await authApi.put(url, { data })
        : authApi.post(url, { data });
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

    const { url, relations } = urlAndRelations('purchases', purchaseData.id >-1 ? purchaseData.documentId : null, null, 1, 1);

    if (purchaseData.id > 0) {
        const res = await authApi.put(url, { data: prepareForPut(purchaseData, relations) });
        return dataNode(res);
    } else {
        const res = await authApi.post(url, { data: prepareForPut(purchaseData, relations) });
        return dataNode(res);
    }
}



/**
* Save a single purchase item, using PUT if documentId exists, otherwise POST.
* @param {Object} item - The purchase item to save.
* @returns {Promise<Object>} The saved item response.
*/
export async function savePurchaseItem(item) {
    const { url, relations } = urlAndRelations('purchase-items', item.id>-1 ? item.documentId : null, null, 1, 1);

    if (item.id>-1) {
        const res = await authApi.put(url, { data: prepareForPut(item, relations) });
        return dataNode(res);//?.data?.data ?? res?.data ?? res;
    } else {
        const res = await authApi.post(url, { data: prepareForPut(item, relations) });
        return dataNode(res);//?.data?.data ?? res?.data ?? res;
    }
}