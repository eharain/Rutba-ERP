# Brand Groups API Migration Guide

## What Changed

The `api/brand-groups.js` file has been cleaned to contain only pure endpoint descriptors. All transport-executing methods have been removed.

## Migration Patterns

### ❌ Old Pattern (Direct authApi calls - NO LONGER WORKS)

```javascript
import { BrandGroupsEndpoints } from '@api-provider/api/brand-groups';

// ❌ These methods no longer exist:
const drafts = await BrandGroupsEndpoints.fetchListDraft();
const published = await BrandGroupsEndpoints.fetchListPublished();
const item = await BrandGroupsEndpoints.fetchByIdDraft(docId);
const created = await BrandGroupsEndpoints.postCreate(data);
await BrandGroupsEndpoints.putUpdateDraft(docId, data);
await BrandGroupsEndpoints.postPublish(docId);
await BrandGroupsEndpoints.delById(docId);
```

### ✅ New Pattern (Use Proxy)

```javascript
import BrandGroupsProxy from '@api-provider/endpoints/brand-groups';
// or
import { BrandGroupsEndpointsProxy } from '@api-provider/endpoints/brand-groups';

// ✅ List operations
const drafts = await BrandGroupsProxy.listDraft();
const published = await BrandGroupsProxy.listPublished();
const all = await BrandGroupsProxy.list({ filters: { is_active: true } });

// ✅ Get by ID
const draftItem = await BrandGroupsProxy.byIdDraft(docId);
const publishedItem = await BrandGroupsProxy.byIdPublished(docId);
const item = await BrandGroupsProxy.byId(docId, { populate: ['brands'] });

// ✅ Create (method name inference: post* → POST)
const created = await BrandGroupsProxy.postCreate({ 
    name: 'New Group',
    brands: ['brand-doc-id-1', 'brand-doc-id-2'],
    sort_order: 1
});

// ✅ Update (method name inference: put* → PUT)
await BrandGroupsProxy.putUpdate(docId, { 
    name: 'Updated Name',
    sort_order: 2
});

await BrandGroupsProxy.putUpdateDraft(docId, { 
    name: 'Updated Draft',
    is_active: true
});

// ✅ Publish/Unpublish (method name inference: post* → POST)
await BrandGroupsProxy.postPublish(docId);
await BrandGroupsProxy.postUnpublish(docId);

// ✅ Delete (method name inference: del* → DELETE)
await BrandGroupsProxy.delProduct(docId);
```

## Method Name Mapping

| Old Method | New Proxy Method | HTTP Method |
|-----------|-----------------|-------------|
| `fetchListDraft()` | `listDraft()` | GET |
| `fetchListPublished()` | `listPublished()` | GET |
| `fetchByIdDraft(id)` | `byIdDraft(id)` | GET |
| `fetchByIdPublished(id)` | `byIdPublished(id)` | GET |
| `postCreate(data)` | `postCreate(data)` | POST |
| `putUpdateDraft(id, data)` | `putUpdateDraft(id, data)` | PUT |
| `postPublish(id)` | `postPublish(id)` | POST |
| `postUnpublish(id)` | `postUnpublish(id)` | POST |
| `delById(id)` | `delProduct(id)` | DELETE |

## Enhanced Descriptors

The following pure descriptors are now available with enhanced options:

### `listDraft({ sort?, populate?, pagination? })`
```javascript
const drafts = await BrandGroupsProxy.listDraft({
    sort: ['name:asc'],
    populate: ['brands', 'logo'],
    pagination: { page: 1, pageSize: 20 }
});
```

### `listPublished({ pageSize?, sort?, populate? })`
```javascript
const published = await BrandGroupsProxy.listPublished({
    pageSize: 100,
    sort: ['sort_order:asc'],
    populate: ['brands']
});
```

### `list({ sort?, populate?, pagination?, filters? })`
New method for listing with any status:
```javascript
const all = await BrandGroupsProxy.list({
    filters: { is_active: true },
    sort: ['name:asc'],
    pagination: { page: 1, pageSize: 50 }
});
```

### `byId(documentId, { populate?, status? })`
New method for getting by ID with any status:
```javascript
const item = await BrandGroupsProxy.byId(docId, {
    status: 'draft',
    populate: ['brands', 'logo']
});
```

### `update(documentId)`
New method for updating (any status):
```javascript
await BrandGroupsProxy.putUpdate(docId, { 
    name: 'Updated Name',
    sort_order: 5 
});
```

## Search & Replace Guide

Use your IDE's find-and-replace to update imports and method calls:

### 1. Update Imports
```javascript
// Find:
import { BrandGroupsEndpoints } from '@api-provider/api/brand-groups';

// Replace with:
import BrandGroupsProxy from '@api-provider/endpoints/brand-groups';
```

### 2. Update Method Calls
```javascript
// Find:
BrandGroupsEndpoints.fetchListDraft
// Replace with:
BrandGroupsProxy.listDraft

// Find:
BrandGroupsEndpoints.fetchListPublished
// Replace with:
BrandGroupsProxy.listPublished

// Find:
BrandGroupsEndpoints.fetchByIdDraft
// Replace with:
BrandGroupsProxy.byIdDraft

// Find:
BrandGroupsEndpoints.fetchByIdPublished
// Replace with:
BrandGroupsProxy.byIdPublished

// Find:
BrandGroupsEndpoints.postCreate
// Replace with:
BrandGroupsProxy.postCreate

// Find:
BrandGroupsEndpoints.putUpdateDraft
// Replace with:
BrandGroupsProxy.putUpdateDraft

// Find:
BrandGroupsEndpoints.postPublish
// Replace with:
BrandGroupsProxy.postPublish

// Find:
BrandGroupsEndpoints.postUnpublish
// Replace with:
BrandGroupsProxy.postUnpublish

// Find:
BrandGroupsEndpoints.delById
// Replace with:
BrandGroupsProxy.delProduct
```

## Benefits of New Pattern

✅ **Transport-agnostic**: Contract files don't depend on HTTP implementation  
✅ **Consistent**: All endpoints follow the same proxy pattern  
✅ **Flexible**: Easy to swap transport layers (REST → GraphQL)  
✅ **Testable**: Pure descriptors can be tested without mocking HTTP  
✅ **Type-safe**: Proxy methods maintain full TypeScript support  
✅ **Enhanced**: New options and methods available  

## Need Help?

- Check `QUICK_REFERENCE.md` for comprehensive proxy usage examples
- See `REFACTOR_SUMMARY.md` for architectural overview
- Review cleaned files: `brands.js`, `products.js`, `branches.js` for patterns
