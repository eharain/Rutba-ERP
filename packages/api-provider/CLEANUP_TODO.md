# API Files Requiring Cleanup

## Files Containing authApi (Transport Execution)

The following 49 API files contain direct `authApi` calls and need to be cleaned:

1. acc-expenses.js
2. acc-invoices.js
3. acc-journal-entries.js
4. auth-admin.js
5. ~~brand-groups.js~~ ✅ DONE
6. cash-registers.js
7. cash-register-transactions.js
8. categories.js
9. category-groups.js
10. cms-footers.js
11. cms-pages.js
12. crm-activities.js
13. crm-contacts.js
14. crm-leads.js
15. customers.js
16. delivery-methods.js
17. delivery-zones.js
18. enums.js
19. hr-attendances.js
20. hr-departments.js
21. hr-employees.js
22. hr-leave-requests.js
23. hr-teams.js
24. media-library.js
25. notification-templates.js
26. payments.js
27. pay-payroll-runs.js
28. pay-payslips.js
29. pay-salary-structures.js
30. product-groups.js
31. purchase-items.js
32. purchases.js
33. return-requests.js
34. rider-endpoints.js
35. riders.js
36. sale-items.js
37. sale-offers.js
38. sale-orders.js
39. sale-return-items.js
40. sale-returns.js
41. sales.js
42. site-setting.js
43. social-accounts.js
44. social-posts.js
45. social-replies.js
46. stock-inputs.js
47. stock-items.js
48. suppliers.js
49. terms.js
50. term-types.js
51. web-orders.js

## Already Cleaned ✅

1. **acc-accounts.js** ✅
2. **branches.js** ✅
3. **brands.js** ✅
4. **products.js** ✅
5. **brand-groups.js** ✅ (just completed)

## Cleanup Pattern

For each file:
1. Remove methods with `authApi.*` calls (fetchList, postCreate, putUpdate, etc.)
2. Remove `Object.assign` blocks with transport wrappers
3. Remove imports of `dataNode`, `getBranch`, `getUser` if only used in removed methods
4. Keep pure descriptors only
5. Add proper JSDoc comments
6. Ensure corresponding `/endpoints/*.js` file exists with proxy exports

## Common Methods to Remove

- `fetchList`, `fetchAll`, `fetchById`, `fetchByIdDraft`, `fetchByIdPublished`
- `postCreate`, `putUpdate`, `putUpdateDraft`, `putDelete`
- `postPublish`, `postUnpublish`, `delById`
- Any method that calls `authApi.fetch`, `authApi.get`, `authApi.post`, `authApi.put`, `authApi.del`
- Orchestration helpers (save*, load*, create*, search* async functions)

## Common Patterns to Keep

- Pure descriptors: `list()`, `byId()`, `create()`, `update()`, `del()`, `publish()`, `unpublish()`
- Metadata: `meta` object with uid, domains, roles
- Query builders that return `{ path, params, method? }`

## Automation Strategy

Given the large number of files, we should:
1. Create a Node.js script to parse and clean files automatically
2. Identify common patterns programmatically
3. Generate clean versions
4. Manual review for edge cases
5. Verify endpoints files exist

## Priority Order

### High Priority (Core business logic)
1. ✅ products.js (DONE)
2. ✅ brands.js (DONE)
3. ✅ branches.js (DONE)
4. sales.js
5. customers.js
6. purchases.js

### Medium Priority (Supporting entities)
7. categories.js
8. suppliers.js
9. stock-items.js
10. payments.js

### Lower Priority (Secondary features)
11-51. Remaining files

## Next Steps

1. Focus on high-priority files first
2. Use the established pattern from products/brands/branches
3. Ensure endpoints layer is properly set up
4. Test after each batch
