# API Provider Complete Cleanup Guide

## Executive Summary

**Status**: 6 files cleaned, 46 files remaining  
**Estimated Work**: 6-8 hours for complete cleanup  
**Approach**: Batch processing with automated patterns

## What's Been Done ✅

### Infrastructure (COMPLETE)
1. **createClientProxy enhanced** with:
   - PATCH support
   - Automatic data wrapping for Strapi format
   - Query string merging for POST/PUT/PATCH with params
   - Comprehensive documentation

2. **lib/api.js enhanced** with:
   - `patch` method added to authApi
   - Full HTTP method support

### Files Cleaned (6 files)
1. ✅ **acc-accounts.js** - Removed 1 fetch method, enhanced descriptors
2. ✅ **branches.js** - Removed 8 transport methods, kept pure descriptors
3. ✅ **brands.js** - Removed 10 transport methods, enhanced with data params
4. ✅ **products.js** - Removed 20+ methods, moved orchestration to endpoints
5. ✅ **brand-groups.js** - Removed 9 methods, enhanced with data params
6. ✅ **createClientProxy** - Enhanced with auto-wrapping

### Documentation Created
- `REFACTOR_SUMMARY.md` - Architecture overview
- `QUICK_REFERENCE.md` - Developer guide with examples
- `COMPLETE_CLEANUP_STATUS.md` - Full file status tracking
- `MIGRATION_BRAND_GROUPS.md` - Migration guide
- `ENHANCEMENT_DATA_PARAMS.md` - Data parameter pattern guide
- `analyze-cleanup.js` - Automated analysis script
- `cleanup-report.json` - Detailed analysis results

## What Remains 🔧

### Files by Priority

#### 🔴 HIGH PRIORITY (12 files - 78 methods)
Core business operations - clean these first:

1. **sales.js** (403 lines, 11 methods)
   - fetchList, fetchById, fetchByStockItem, fetchByItemPrice
   - postCreate, putUpdate, putCancel, putSaveNotes
   - fetchEntities, fetchSales, fetchSaleByIdOrInvoice

2. **customers.js** (4 methods)
   - fetchList, postCreate, putUpdate, putDelete

3. **purchases.js** (7 methods)
   - fetchList, fetchById, postCreate, putUpdate, putUpdateStatus, putCancel, fetchPurchases

4. **categories.js** (13 methods)
   - fetchListDraft, fetchListPublished, fetchByIdDraft, fetchByIdPublished
   - fetchList, fetchByParent, fetchWithChildren
   - postCreate, putUpdateDraft, postPublish, postUnpublish, delById, putDelete

5. **suppliers.js** (5 methods)
   - fetchList, fetchAll, postCreate, putUpdate, putDelete

6. **stock-items.js** (440 lines, 11 methods)
   - fetchList, fetchByProduct, fetchListByProduct, fetchCheckBarcode
   - fetchByBarcode, fetchByName, fetchById
   - fetchOrphanGroups, fetchOrphanGroupItems
   - postCreate, putUpdate

7. **payments.js** (5 methods)
   - fetchList, fetchById, postCreate, putUpdate, putDelete

8. **cash-registers.js** (5 methods)
   - fetchList, fetchActive, postOpen, putClose, putUpdate

9. **sale-orders.js** (6 methods)
   - fetchList, fetchById, postCreate, putUpdate, postUpdateStatus, postAssignRider

10. **sale-items.js** (3 methods)
    - postCreate, putUpdate, putDisconnect

11. **purchase-items.js** (5 methods)
    - fetchList, fetchByPurchase, postCreate, putUpdate, putDelete

12. **product-groups.js** (9 methods)
    - fetchListDraft, fetchListPublished, fetchByIdDraft, fetchByIdPublished
    - postCreate, putUpdateDraft, postPublish, postUnpublish, delById

#### 🟡 MEDIUM PRIORITY (18 files - 93 methods)
Supporting features - clean after high priority:

13-30. acc-expenses, acc-invoices, acc-journal-entries, category-groups,
       delivery-methods, delivery-zones, stock-inputs, return-requests,
       cash-register-transactions, sale-returns, sale-return-items, sale-offers,
       hr-employees, hr-departments, hr-teams, crm-contacts, crm-leads, web-orders

#### 🟢 LOW PRIORITY (16 files - 76 methods)
Administrative - clean last:

31-46. hr-attendances, hr-leave-requests, pay-payroll-runs, pay-payslips,
       pay-salary-structures, crm-activities, cms-footers, cms-pages,
       notification-templates, rider-endpoints, riders, social-accounts,
       social-posts, social-replies, enums, media-library, terms, term-types,
       auth-admin, site-setting

## Cleanup Pattern (Apply to Each File)

### 1. Remove Transport Methods
```javascript
// ❌ REMOVE these patterns:
fetchList: (opts) => {
    const ep = XxxEndpoints.list(opts);
    return authApi.fetch(ep.path, ep.params);
},

postCreate: (data) => authApi.post('/xxx', { data }),
putUpdate: (id, data) => authApi.put(`/xxx/${id}`, { data }),
delById: (id) => authApi.del(`/xxx/${id}`),
```

### 2. Enhance Pure Descriptors
```javascript
// ✅ KEEP and enhance:
create: (data) => ({
    path: '/xxx',
    action: 'create',
    method: 'post',
    data,  // Accept data parameter
}),

update: (documentId, data) => ({
    path: `/xxx/${documentId}`,
    action: 'update',
    method: 'put',
    data,  // Accept data parameter
}),
```

### 3. Add/Verify Meta
```javascript
meta: {
    uid: 'api::xxx.xxx',
    domains: ['domain1', 'domain2'],
    roles: ['admin', 'manager', 'staff']
},
```

### 4. Remove Object.assign Blocks
```javascript
// ❌ REMOVE:
Object.assign(XxxEndpoints, {
    postCreate: (data) => authApi.post(...),
    // ...
});
```

### 5. Clean Imports
```javascript
// Remove if only used in removed methods:
import { dataNode } from '../pos/search.js';  // If unused, remove
import { getUser, getBranch } from '../utils.js';  // If unused, remove
```

## Automated Cleanup Steps

### For Each File:

1. **Read the file**
```bash
code packages/api-provider/api/sales.js
```

2. **Identify transport methods** (use analyze-cleanup.js output)

3. **Remove methods** that match these patterns:
   - `fetch*: (...) => { ... authApi.fetch ... }`
   - `post*: (data) => authApi.post(...)`
   - `put*: (...) => authApi.put(...)`
   - `del*: (...) => authApi.del(...)`

4. **Enhance remaining descriptors**:
   - Add `data` parameter to `create(data)`
   - Add `data` parameter to `update(documentId, data)`
   - Add `data` parameter to `updateDraft(documentId, data)`

5. **Add JSDoc** if missing

6. **Verify meta object** exists with correct uid, domains, roles

7. **Remove unused imports**

8. **Save and verify** no syntax errors

## Quick Checklist Per File

- [ ] Remove all `fetch*` methods calling authApi
- [ ] Remove all `post*` methods calling authApi
- [ ] Remove all `put*` methods calling authApi
- [ ] Remove all `del*` methods calling authApi
- [ ] Remove `Object.assign` blocks
- [ ] Enhance `create` to accept `data` parameter
- [ ] Enhance `update` to accept `documentId, data` parameters
- [ ] Enhance `updateDraft` to accept `documentId, data` parameters
- [ ] Add/verify `meta` object
- [ ] Add JSDoc comments
- [ ] Remove unused imports (dataNode, getUser, getBranch)
- [ ] File compiles without errors
- [ ] Corresponding `/endpoints/*.js` has proxy export

## Testing After Each Batch

```bash
# Check for compilation errors
cd packages/api-provider
npm run build  # or tsc if TypeScript

# Run tests if available
npm test

# Check specific file
node -c api/sales.js
```

## Migration Guide for Consumers

After cleanup, consumers must update imports:

```javascript
// ❌ OLD (will break):
import { SalesEndpoints } from '@api-provider/api/sales';
const sales = await SalesEndpoints.fetchList(page, pageSize);

// ✅ NEW (correct):
import SalesProxy from '@api-provider/endpoints/sales';
const sales = await SalesProxy.list(page, pageSize);
```

## Estimated Timeline

- **High Priority (12 files)**: 2-3 hours
- **Medium Priority (18 files)**: 2-3 hours
- **Low Priority (16 files)**: 2-3 hours
- **Testing & Documentation**: 1 hour
- **Total**: 7-10 hours

## Next Immediate Actions

### Option A: Continue Manual Cleanup
1. Start with `sales.js` (most complex, 403 lines, 11 methods)
2. Then `customers.js` (simpler, 4 methods)
3. Continue through high priority list

### Option B: Batch Script Approach
1. Create a Node.js script to automate repetitive removals
2. Manual review and enhancement of each file
3. Faster but requires careful review

### Option C: Incremental Approach
1. Clean 2-3 files per session
2. Test after each session
3. Lower risk, easier to track

## Recommendation

**Start with Option A + C**: Manually clean sales.js (complex), customers.js and suppliers.js (simpler), then reassess. This gives you:
- Experience with complex cases
- Pattern recognition
- Confidence in the approach
- Basis for automation if needed

## Files Ready for Immediate Use

These 6 files are production-ready now:
- `acc-accounts.js`
- `branches.js`
- `brands.js`
- `products.js`
- `brand-groups.js`

Consumers can start migrating to use these via their proxies immediately.

## Support Resources

- **Architecture**: See `REFACTOR_SUMMARY.md`
- **Usage Examples**: See `QUICK_REFERENCE.md`
- **Analysis Data**: See `cleanup-report.json`
- **Pattern Reference**: This file

---

**Status Last Updated**: [Current Date]  
**Progress**: 6/52 files complete (11.5%)  
**Next Target**: sales.js, customers.js, suppliers.js
