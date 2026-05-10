# API Provider Quick Reference

## For Consumers

### Using the Proxy (Recommended)

```javascript
import ProductsEndpointsProxy from '@api-provider/endpoints/products';

// Simple list
const products = await ProductsEndpointsProxy.list(1, 20, { status: 'published' });

// Search
const results = await ProductsEndpointsProxy.search('laptop', 1, 10);

// Get by ID
const product = await ProductsEndpointsProxy.byId('abc123');

// Create
const newProduct = await ProductsEndpointsProxy.postCreate({ name: 'New Product', price: 100 });

// Update
const updated = await ProductsEndpointsProxy.putUpdate('abc123', { name: 'Updated Name' });

// Delete
await ProductsEndpointsProxy.delProduct('abc123');

// Publish/Unpublish
await ProductsEndpointsProxy.postPublish('abc123');
await ProductsEndpointsProxy.postUnpublish('abc123');
```

### Using Orchestration Helpers

```javascript
import { 
    loadProduct, 
    saveProduct, 
    fetchProducts, 
    createProduct 
} from '@api-provider/endpoints/products';

// Load a product with data extraction
const product = await loadProduct('abc123');

// Save (create or update) with validation
const saved = await saveProduct('abc123', formData);

// Filtered fetch with search support
const results = await fetchProducts(
    { searchText: 'laptop', brands: ['dell'], status: 'published' },
    1,  // page
    20, // pageSize
    'name:asc'
);

// Create new draft with ownership
const newProduct = await createProduct();
```

## For Endpoint Authors

### Creating a New Endpoint Contract

```javascript
// packages/api-provider/api/orders.js
export const OrdersEndpoints = {

    meta: {
        uid: 'api::order.order',
        domains: ['sales', 'order'],
        roles: ['admin', 'manager', 'staff']
    },

    // ✅ Pure descriptor - returns { path, params?, data? }
    list: (page = 1, pageSize = 20, filters = {}) => ({
        path: '/orders',
        params: {
            pagination: { page, pageSize },
            populate: { customer: true, items: true },
            ...(filters.status ? { filters: { status: filters.status } } : {}),
        },
    }),

    // ✅ Pure descriptor with documentId parameter
    byId: (documentId) => ({
        path: `/orders/${documentId}`,
        params: {
            populate: { customer: true, items: true, payments: true },
        },
    }),

    // ✅ Pure descriptor for create (body provided by caller)
    create: () => ({
        path: '/orders',
    }),

    // ✅ Pure descriptor for update
    update: (documentId) => ({
        path: `/orders/${documentId}`,
    }),

    // ✅ Pure descriptor for delete
    del: (documentId) => ({
        path: `/orders/${documentId}`,
    }),

    // ✅ Custom action descriptor
    markShipped: (documentId) => ({
        path: `/orders/${documentId}/ship`,
        method: 'post',  // Explicit method override
    }),
};

// ❌ DO NOT add transport execution here
// ❌ DO NOT import authApi
// ❌ DO NOT use async unless returning descriptors
```

### Creating the Proxy Export

```javascript
// packages/api-provider/endpoints/orders.js
import { authApi } from '@/lib/api.js';
import { createClientProxy } from '@/providers/createClientProxy.js';
import { OrdersEndpoints } from '@/api/orders.js';

// Default proxy export
export default createClientProxy(OrdersEndpoints, authApi);

// Named proxy export
export const OrdersEndpointsProxy = createClientProxy(OrdersEndpoints, authApi);

// Optional: reusable proxy instance for helpers
const proxy = createClientProxy(OrdersEndpoints, authApi);

/**
 * Optional: Orchestration helper that coordinates multiple endpoints
 */
export async function placeOrder(orderData, paymentData) {
    // Create order
    const order = await proxy.postCreate(orderData);

    // Process payment
    const payment = await PaymentsProxy.postCreate({
        order: order.data.documentId,
        ...paymentData
    });

    // Mark as paid
    await proxy.postMarkShipped(order.data.documentId);

    return { order, payment };
}
```

## Method Naming Conventions

### Automatic HTTP Method Inference

| Method Name Prefix | HTTP Method | Example |
|-------------------|-------------|---------|
| `fetch*`, `list*`, `by*`, `search*`, `get*` | GET | `fetchList`, `listAll`, `byId`, `searchProducts`, `getStats` |
| `post*` | POST | `postCreate`, `postPublish`, `postShip` |
| `put*` | PUT | `putUpdate`, `putReplace` |
| `patch*` | PATCH | `patchPartial` |
| `del*`, `delete*` | DELETE | `delProduct`, `deleteById` |

### Explicit Method Override

```javascript
// Use explicit method when name doesn't match convention
customAction: (id) => ({
    path: `/products/${id}/custom`,
    method: 'post',  // Override name-based inference
})
```

## Common Patterns

### List with Pagination

```javascript
list: (page = 1, pageSize = 20) => ({
    path: '/products',
    params: {
        pagination: { page, pageSize },
        sort: ['name:asc'],
        populate: { categories: true, brands: true },
    },
})
```

### Search with Filters

```javascript
search: (searchText, filters = {}) => ({
    path: '/products',
    params: {
        filters: {
            $or: [
                { name: { $containsi: searchText } },
                { sku: { $eq: searchText } },
            ],
            ...(filters.category ? { category: { documentId: filters.category } } : {}),
        },
        pagination: { page: 1, pageSize: 20 },
    },
})
```

### Get by ID with Populate

```javascript
byId: (documentId) => ({
    path: `/products/${documentId}`,
    params: {
        populate: {
            categories: true,
            brands: true,
            suppliers: true,
            logo: true,
        },
    },
})
```

### Draft/Published Variants

```javascript
byIdDraft: (documentId) => ({
    path: `/products/${documentId}`,
    params: { status: 'draft' },
}),

byIdPublished: (documentId) => ({
    path: `/products/${documentId}`,
    params: { status: 'published' },
})
```

### Custom Actions

```javascript
publish: (documentId) => ({
    path: `/products/${documentId}/publish`,
    method: 'post',
}),

unpublish: (documentId) => ({
    path: `/products/${documentId}/unpublish`,
    method: 'post',
})
```

## Special Features

### getAll Provider (Pagination across all pages)

```javascript
// In descriptor:
listAll: () => ({
    path: '/products',
    params: { pagination: { page: 1, pageSize: 100 } },
    provider: { getAll: true },  // Will paginate automatically
})

// Usage:
const allProducts = await ProductsProxy.listAll();
// Returns flat array of all items across all pages
```

### Query String Merging (POST/PUT/PATCH/DELETE with params)

```javascript
// Descriptor with both params and data:
updateWithFilter: (documentId) => ({
    path: `/products/${documentId}`,
    params: { locale: 'en', status: 'draft' },  // Will become ?locale=en&status=draft
    data: { name: 'Updated Name' },  // Body payload
})
```

## Anti-Patterns (DO NOT DO)

### ❌ Transport in Contract File

```javascript
// ❌ WRONG - api/products.js
export const ProductsEndpoints = {
    byId: (documentId) => ({
        path: `/products/${documentId}`,
        params: { populate: {...} }
    }),

    // ❌ DO NOT execute transport here
    fetchById: (documentId) => {
        const ep = ProductsEndpoints.byId(documentId);
        return authApi.fetch(ep.path, ep.params);
    }
};
```

### ❌ Business Logic in Contract File

```javascript
// ❌ WRONG - api/products.js
export const ProductsEndpoints = {
    // ❌ DO NOT add orchestration logic here
    saveProduct: async (id, formData) => {
        const isUpdate = id && id !== 'new';
        // validation, transformation, multiple calls...
        return isUpdate ? putUpdate(id, data) : postCreate(data);
    }
};
```

### ❌ Importing Transport in Contract File

```javascript
// ❌ WRONG - api/products.js
import { authApi } from '../lib/api.js';  // ❌ NO!
import axios from 'axios';  // ❌ NO!
```

## Correct Patterns (DO THIS)

### ✅ Pure Descriptors Only

```javascript
// ✅ CORRECT - api/products.js
export const ProductsEndpoints = {
    byId: (documentId) => ({
        path: `/products/${documentId}`,
        params: { populate: {...} }
    }),
};
```

### ✅ Orchestration in Endpoints Layer

```javascript
// ✅ CORRECT - endpoints/products.js
import { createClientProxy } from '@/providers/createClientProxy.js';
import { ProductsEndpoints } from '@/api/products.js';

const proxy = createClientProxy(ProductsEndpoints, authApi);

export async function saveProduct(id, formData) {
    const isUpdate = id && id !== 'new';
    // validation, transformation, orchestration...
    return isUpdate 
        ? proxy.putUpdate(id, data) 
        : proxy.postCreate(data);
}
```

### ✅ Proxy Usage in Consumers

```javascript
// ✅ CORRECT - app code
import ProductsProxy from '@api-provider/endpoints/products';

async function loadProductPage(id) {
    const product = await ProductsProxy.byId(id);
    // use product...
}
```

## Troubleshooting

### Method not executing?

Check method name prefix:
- `list*`, `fetch*`, `by*`, `search*` → GET
- `post*` → POST
- `put*` → PUT
- `patch*` → PATCH
- `del*`, `delete*` → DELETE

Or add explicit `method: 'post'` to descriptor.

### Query params not sent for POST/PUT?

Use the `params` field in descriptor - they'll be merged into query string:

```javascript
create: () => ({
    path: '/products',
    params: { locale: 'en' },  // Will become ?locale=en
    // data: { ... } goes in body
})
```

### Undefined authApi error?

Make sure you're:
1. Using the proxy from `/endpoints/*.js`, not `/api/*.js`
2. Not importing `authApi` in `/api/*.js` files

### Method prefix doesn't match convention?

Use explicit method override:

```javascript
customEndpoint: (id) => ({
    path: `/products/${id}/action`,
    method: 'post',  // Override inference
})
```
