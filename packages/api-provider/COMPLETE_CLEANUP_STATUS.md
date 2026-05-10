# Complete API Provider Cleanup Status

## Summary
- **Total API files**: 62
- **Already clean**: 11 files
- **Need cleaning**: 46 files
- **Special cases**: 5 files (helpers, utilities, index)

## ✅ Already Clean (11 files)
1. acc-accounts.js ✅
2. app-context.js ✅
3. auth.js ✅
4. branches.js ✅
5. brand-groups.js ✅
6. brands.js ✅
7. index.js ✅
8. media-utils.js ✅
9. products.js ✅
10. stock-helpers.js ✅
11. upload.js ✅
12. web.js ✅

## 🔧 Need Cleaning (46 files)

### Accounting Domain (3 files)
1. acc-expenses.js
2. acc-invoices.js
3. acc-journal-entries.js

### Authentication/Admin (1 file)
4. auth-admin.js

### Sales/POS Domain (7 files)
5. cash-register-transactions.js
6. cash-registers.js
7. sale-items.js
8. sale-offers.js
9. sale-orders.js
10. sale-returns.js
11. sale-return-items.js
12. sales.js

### Product/Catalog Domain (3 files)
13. categories.js
14. category-groups.js
15. product-groups.js

### CMS Domain (2 files)
16. cms-footers.js
17. cms-pages.js

### CRM Domain (3 files)
18. crm-activities.js
19. crm-contacts.js
20. crm-leads.js

### Customer/Delivery (3 files)
21. customers.js
22. delivery-methods.js
23. delivery-zones.js

### HR/Payroll Domain (7 files)
24. hr-attendances.js
25. hr-departments.js
26. hr-employees.js
27. hr-leave-requests.js
28. hr-teams.js
29. pay-payroll-runs.js
30. pay-payslips.js
31. pay-salary-structures.js

### Inventory/Stock Domain (4 files)
32. stock-inputs.js
33. stock-items.js
34. purchase-items.js
35. purchases.js

### Support/Misc (6 files)
36. enums.js
37. media-library.js
38. notification-templates.js
39. payments.js
40. return-requests.js
41. suppliers.js
42. terms.js
43. term-types.js

### Delivery/Riders (2 files)
44. rider-endpoints.js
45. riders.js

### Social/Marketing (3 files)
46. social-accounts.js
47. social-posts.js
48. social-replies.js

### Web Orders (1 file)
49. web-orders.js

## Cleanup Priority

### 🔴 HIGH PRIORITY (Core Business - 12 files)
Critical for day-to-day operations:
1. sales.js
2. customers.js
3. purchases.js
4. categories.js
5. suppliers.js
6. stock-items.js
7. payments.js
8. cash-registers.js
9. sale-orders.js
10. sale-items.js
11. purchase-items.js
12. product-groups.js

### 🟡 MEDIUM PRIORITY (Supporting Features - 18 files)
Important but not critical:
13. acc-expenses.js
14. acc-invoices.js
15. acc-journal-entries.js
16. category-groups.js
17. delivery-methods.js
18. delivery-zones.js
19. stock-inputs.js
20. return-requests.js
21. cash-register-transactions.js
22. sale-returns.js
23. sale-return-items.js
24. sale-offers.js
25. hr-employees.js
26. hr-departments.js
27. hr-teams.js
28. crm-contacts.js
29. crm-leads.js
30. web-orders.js

### 🟢 LOW PRIORITY (Administrative/Secondary - 16 files)
Can be cleaned later:
31. hr-attendances.js
32. hr-leave-requests.js
33. pay-payroll-runs.js
34. pay-payslips.js
35. pay-salary-structures.js
36. crm-activities.js
37. cms-footers.js
38. cms-pages.js
39. notification-templates.js
40. rider-endpoints.js
41. riders.js
42. social-accounts.js
43. social-posts.js
44. social-replies.js
45. enums.js
46. media-library.js
47. terms.js
48. term-types.js
49. auth-admin.js

## Cleanup Strategy

### Batch 1: Core Sales & Inventory (12 files)
Start with the most critical business operations.

### Batch 2: Accounting & Supporting (18 files)
Follow with financial and supporting features.

### Batch 3: HR, CRM, and Admin (16 files)
Complete with administrative and secondary features.

## Common Patterns to Remove

All files will need removal of:
- `fetch*` methods (fetchList, fetchById, fetchAll, etc.)
- `post*` direct calls (postCreate with authApi.post)
- `put*` direct calls (putUpdate, putUpdateDraft with authApi.put)
- `del*` direct calls (delById, putDelete with authApi.del)
- Transport wrappers using authApi/api directly
- Orchestration helpers (should move to /endpoints)

## Estimated Work

- **Per file average**: 5-10 minutes
- **Total estimated time**: 4-8 hours
- **Approach**: Batch processing with automated patterns

## Next Steps

1. Create batch cleanup script
2. Process HIGH PRIORITY files first
3. Test each batch before continuing
4. Update CLEANUP_TODO.md after each batch
5. Create migration guides for breaking changes
