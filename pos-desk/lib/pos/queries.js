import qs from 'qs';

export const buildQueries = (searchText, page = 1, rowsPerPage = 5, statusFilter = null) => {

    const queries =
    {
        products: {
            search_filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { barcode: { $eq: searchText } },
                    { sku: { $eq: searchText } },
                    { suppliers: { $or: [{ name: { $containsi: searchText } }, { phone: { $containsi: searchText } }] } },
                ]
            },
            query: {
                populate: [
                    'categories',
                    'brands',
                    'suppliers',
                    'logo',
                    'gallery',
                    'items'
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },

        purchases: {
            search_filters: {
                $or: [
                    { suppliers: { $or: [{ name: { $containsi: searchText } }, { phone: { $containsi: searchText } }] } },
                    { orderId: { $eq: searchText } },
                ]
            },
            query: {

                populate: {
                    suppliers: true,
                    receipts: true,
                    gallery: true,
                    items: {
                        populate: {
                            product:true
                            }
                    }
                },
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        sales: {
            search_filters: {
                $or: [
                    { customer: { $or: [{ name: { $containsi: searchText } }, { phone: { $containsi: searchText } }] } },
                    { invoice_no: { $eq: searchText } },
                ]
            },
            query: {
                populate: [
                    'customer',
                    'logo',
                    'gallery',
                    { 'items': { populate: ['product'] } }
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        'stock-items': {
            search_filters: {
                $or: [
                    { barcode: { $containsi: searchText } },
                    { sku: { $containsi: searchText } },
                    { product: {name: { $containsi: searchText } }},
                    { purchase_item: { purchase: { orderId: { $containsi: searchText } } } }
                ],
                status: statusFilter
            },
            query: {

                populate: {
                    product: true,
                    purchase_item: {
                        populate: {
                            purchase: true
                        }
                    }
                },
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        branches: {
            search_filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { code: { $eq: searchText } }
                ]
            },
            query: {

                populate: [
                    'logo',
                    'gallery',
                    'currency',
                    { categories: { populate: ['logo', 'gallery'] } }
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        categories: {
            search_filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { code: { $eq: searchText } }
                ]
            },
            query: {

                populate: [
                    'logo',
                    'gallery',
                    { parent: { populate: ['logo', 'gallery'] } }
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        term_types: {
            search_filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { code: { $eq: searchText } }
                ]
            },
            query: {

                populate: [
                    'logo',
                    'gallery',
                    { terms: { populate: ['logo', 'gallery'] } }
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        terms: {
            search_filters: {
                $or: [
                    { name: { $containsi: searchText } },
                    { code: { $eq: searchText } }
                ]
            },
            query: {

                populate: [
                    'logo',
                    'gallery',
                    { term_type: { populate: ['logo', 'gallery'] } }
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        }
    }


    return __standeriseQuery(queries, !searchText || searchText.trim().length === 0)

}

export function buildItemQueries(searchText,page = 1, rowsPerPage = 5) {
    const queries = {

        "purchase-items": {

            query: {
                populate: [
                    'product',
                    'purchase',
                    'items'
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },

        "sale-return-items": {
            query: {
                populate: [
                    'product',
                    'sale',
                    'items'
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        "purchase-return-items": {
            query: {
                populate: [
                    'product',
                    'purchase',
                    'items'
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        'sale-items': {
            query: {
                populate: [
                    'product',
                    'sale',
                    'items'
                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        },
        "stock-item": {
            query: {
                populate: [
                    'product',
                    'purchase_item',
                    'sale_item',
                    'purchase_return_item',
                    'sale_return_item',

                ],
                pagination: { page, pageSize: rowsPerPage }
            }
        }
    }

    return __standeriseQuery(queries, !searchText || searchText.trim().length === 0);
    
}


export function QueryUrl(q, documentId) {
    return (documentId ? `/${q.entity}/${documentId}?` : `/${q.entity}?`) + qs.stringify(q.query, { encodeValuesOnly: true });
}

export function __standeriseQuery(queries, hasNoSearch) {
    Object.entries(queries).forEach(([entity, q]) => {
        if (hasNoSearch) {
            delete q.search_filters;
        } else {
            q.query.filters = q.search_filters;
        }
        q.entity = entity;
        q.url = QueryUrl(q);
    });
    return queries;
}

export function urlAndRelations(entity, documentId, searchText, page = 1, rowsPerPage = 100) {
    const query = buildQueries(searchText, page, rowsPerPage)[entity] ?? buildItemQueries(searchText, page, rowsPerPage)[entity];

    return { url: QueryUrl(query, documentId), relations: queryRelationsFromPopulate(query), query };
}

export function queryRelationsFromPopulate(q) {
    const relations = new Set();
    const extractRelations = (item) => {
        if (typeof item === 'string') {
            relations.add(item);
        } else if (typeof item === 'object' && item !== null) {
            relations.add(...Object.keys(item));
        }
    };

    if (q && q.query && q.query.populate) {
        const populate = q.query.populate;
        if( Array.isArray(populate)) {
            populate.forEach(item => extractRelations(item));
        } else if (typeof populate === 'object') {
            Object.keys(populate).forEach(key => extractRelations(key));
        }
        //populate.forEach(item => extractRelations(item));
    }
    return Array.from(relations);
}
