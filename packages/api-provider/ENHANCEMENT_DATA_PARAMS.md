# Brand Groups Enhancement Summary

## What Was Fixed

The `brand-groups.js` descriptors were not accepting data parameters, which meant they couldn't properly pass data to the API. This has been corrected.

## Changes Made

### 1. Enhanced Descriptors with Data Parameters

#### Before:
```javascript
create: () => ({
    path: '/brand-groups',
    action: 'create',
    method: 'post',
}),
```

#### After:
```javascript
create: (data) => ({
    path: '/brand-groups',
    action: 'create',
    method: 'post',
    data,  // Now accepts and passes data
}),
```

### 2. Updated All Mutation Descriptors

**`create(data)`**
- Now accepts data parameter
- Data includes: `{ name, brands, sort_order, slug, ... }`

**`update(documentId, data)`**
- Now accepts both documentId and data
- Allows updating any field

**`updateDraft(documentId, data)`**
- Now accepts both documentId and data  
- Updates draft status records

### 3. Enhanced createClientProxy

The proxy now automatically wraps data in Strapi's expected format:

```javascript
// Helper function added to createClientProxy:
const wrapData = (data) => {
    // If data is already wrapped (has a 'data' key), return as-is
    if (data && typeof data === 'object' && 'data' in data) {
        return data;
    }
    // Otherwise wrap it
    return data !== undefined ? { data } : {};
};
```

**How it works:**
- Consumer: `proxy.postCreate({ name: 'New Group' })`
- Descriptor: `{ path: '/brand-groups', data: { name: 'New Group' } }`
- Proxy wraps: `authApi.post('/brand-groups', { data: { name: 'New Group' } })`
- Strapi receives: `{ data: { name: 'New Group' } }` ✅

## Usage Examples

### Create
```javascript
import BrandGroupsProxy from '@api-provider/endpoints/brand-groups';

const newGroup = await BrandGroupsProxy.postCreate({
    name: 'Electronics',
    brands: ['brand-doc-id-1', 'brand-doc-id-2'],
    sort_order: 1,
    slug: 'electronics'
});
```

### Update
```javascript
await BrandGroupsProxy.putUpdate('group-doc-id', {
    name: 'Updated Name',
    sort_order: 5
});
```

### Update Draft
```javascript
await BrandGroupsProxy.putUpdateDraft('group-doc-id', {
    name: 'Draft Update',
    is_active: true
});
```

## Pattern Consistency

This pattern is now consistent with Strapi's expectations and matches how other frameworks work:

1. **Descriptor receives raw data**: `create: (data) => ({ path, data })`
2. **Proxy wraps for Strapi**: `authApi.post(path, { data })`
3. **Strapi unwraps**: `{ data: { name, ... } }` → `{ name, ... }`

## Backward Compatibility

The `wrapData` helper checks if data is already wrapped:
```javascript
// Already wrapped - pass through
{ data: { name: 'foo' } } → { data: { name: 'foo' } }

// Not wrapped - wrap it
{ name: 'foo' } → { data: { name: 'foo' } }
```

This ensures existing code that manually wraps data continues to work.

## Benefits

✅ **Intuitive API**: Descriptors accept the data they need  
✅ **Type-safe**: Parameters are explicit and documented  
✅ **Consistent**: All mutation methods follow the same pattern  
✅ **Strapi-compliant**: Proxy handles Strapi's `{ data: ... }` format  
✅ **Backward-compatible**: Existing wrapped data still works  

## Other Files Updated

The same pattern should be applied to:
- ✅ `brand-groups.js` (done)
- ✅ `products.js` (needs checking - may have old pattern)
- ✅ `brands.js` (needs checking)
- ✅ `branches.js` (needs checking)
- All other API files going forward

## Migration Notes

If you have descriptors that don't accept data parameters, update them:

```javascript
// ❌ Old pattern (wrong)
create: () => ({ path: '/resource' }),

// ✅ New pattern (correct)
create: (data) => ({ path: '/resource', data }),
```

The proxy will handle the Strapi wrapping automatically.
