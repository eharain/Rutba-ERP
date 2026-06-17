# Pre-Deployment Test Plan — Rutba ERP

Living checklist used to gate a release. Organized by risk tier; higher tiers
block deployment. Each item lists what to verify and the signal that says it's
broken.

Context for the current state of the system is in
[pre-deployment-findings-2026-05-15.md](./pre-deployment-findings-2026-05-15.md)
— Tier 0 items below were not passing at that snapshot and must be re-verified
once fixed.

---

## Tier 0 — Security / Authorization (blockers)

1. **api-pro interceptor enforcement** — confirm `denyByDefault` actually blocks.
   Test matrix:
   - User claims a role they don't hold → 403 with `API_PRO_FORBIDDEN`
   - Role's domain doesn't include the resource's `apps` (e.g. `cms_staff` →
     `/api/sale-orders`) → 403
   - Missing `x-rutba-app` / `x-rutba-app-role` headers on a protected route →
     400 / 403
   - Valid claim with a real policy → 200
2. **Per-policy scope injection** — for descriptors with `scope: { staff: 'owner' }`,
   the staff user only sees their own rows; admin / manager see all.
3. **UP permission surface for `rutba_app_user`** — enumerate every content-type
   referenced by an api-provider descriptor; confirm find/findOne are reachable
   for the standard claim. As of the last snapshot the following returned 403
   and must be re-verified: notification-templates, delivery-methods,
   delivery-zones, hr-teams, riders, sale-audit-logs.
4. **`/me/permissions` correctness** — for a user with N app_roles, response
   includes policies for each granted (content-type × action). Was returning
   `permissions: {}` — must surface real entries before any client-side gate
   can rely on it.
5. **JWT lifecycle** — access token expiry, refresh token rotation, idle
   timeout, session revocation on logout, behavior under concurrent tabs.
6. **Public / anonymous routes** — every `api/web/*.js` descriptor (storefront)
   reachable without auth; every non-web route refuses anonymous calls.
7. **Mutations gated correctly** — create / update / delete on resources where
   `approle: ['admin','manager']` rejects `staff` claims even when find is
   allowed.

## Tier 1 — Data integrity

8. **Sale order state machine**
   ([pos-strapi/src/api/sale-order/services/sale-order-state-machine.js](../pos-strapi/src/api/sale-order/services/sale-order-state-machine.js))
   — every legal transition works; every illegal transition rejected;
   idempotent on duplicate transitions.
9. **Stock item lifecycle hooks**
   ([pos-strapi/src/api/stock-item/content-types/stock-item/lifecycles.js](../pos-strapi/src/api/stock-item/content-types/stock-item/lifecycles.js))
   — quantities update atomically on sale, return, transfer, adjustment;
   concurrent sales of the last unit do not oversell.
10. **Cash register open / close** — opening balance, transactions, closing
    balance reconciliation; only one register open per user/branch at a time.
11. **Payments → invoices → ledger** — record-payment posts to accounting;
    partial payments; overpayments; refunds.
12. **Product publish / unpublish + variants** — variant linkage survives
    publish cycles; archived variants do not appear in POS.
13. **Returns** (sale-return + sale-return-item, purchase-return +
    purchase-return-item) — stock reversal, refund accounting, no double-return
    of the same line.
14. **Notification engine**
    ([pos-strapi/src/api/notification/services/notification-engine.js](../pos-strapi/src/api/notification/services/notification-engine.js))
    — events fire once per trigger; dedup window honored; channels (email/sms)
    actually send.
15. **Site-setting singleton** — published row exists on fresh DB; draft →
    publish flow does not 404. At last snapshot `/api/site-setting` without
    `?status=draft` returned 404.

## Tier 2 — Per-app smoke flows

For each app, walk the golden path end-to-end as the corresponding domain role
— typically `*_staff` (e.g. `hr_staff`), but use the app's actual claim where it
differs: `ess_employee` / `ess_manager` for rutba-ess, and exercise the `hr_*`
manager/admin claims where approval steps require them.

16. **pos-sale** — login → open register → add items → apply discount →
    checkout (cash + card) → receipt → close register.
17. **pos-stock** — list products → edit product → manage variants →
    stock-input (purchase) → stock-item search → catalogue import.
18. **rutba-cms** — list / edit each: products, categories, brands,
    brand-groups, category-groups, product-groups, sale-offers, cms-pages,
    cms-footers, delivery-methods, notification-templates, site-settings,
    media library.
19. **rutba-crm** — leads → activities → contacts; convert lead.
20. **rutba-hr** — employees, teams, departments, attendance entry, leave
    request submit + approve.
20a. **rutba-ess** (Employee Self-Service, `ess_employee` / `ess_manager`) —
    view own profile + attendance, submit a leave request, view own payslips;
    `ess_manager` sees the approvals queue and approves/rejects a report's leave.
21. **rutba-payroll** — employee profile → salary structure → configurable
    deduction rules (statutory engine) → adjustment entry → payroll run →
    payslip generate; verify the run posts into the accounting ledger.
21a. **rutba-manufacturing** — create BOM → release work order → split into
    bundles → record piece-rate tasks/operations → material issue from lot →
    QC inspection → complete WO (finished stock-items + labor/material cost
    roll-up).
22. **rutba-accounts** — chart of accounts, invoice, bill, expense, journal
    entry; AP and AR flows; double-entry journal posting balances and lands in
    the correct fiscal period; per-branch currency resolves on posted entries.
23. **rutba-order-management** — incoming order → assign rider → status
    updates → delivered.
24. **rutba-rider** — order list, accept, status update, proof of delivery.
25. **rutba-social** — accounts, posts, replies.
26. **rutba-web** (storefront, anonymous) — home, category page, product page,
    add-to-cart, guest checkout.
27. **rutba-web-user** (authenticated customer portal) — login, order history,
    profile, return request.
28. **pos-auth** — login, logout, password reset, role switching
    (RoleSwitcher when user holds multiple roles for one app).

## Tier 3 — Cross-cutting client behavior

29. **RoleSwitcher** — user with multiple roles in same app: switching role
    updates `x-rutba-app-role` header on subsequent requests; list pages
    re-fetch with new scope.
30. **Draft / publish toggle** on list pages — switching tabs hits the right
    endpoint variant (`listDraft` vs `listPublished`).
31. **File upload** — single file, multi-file, large file (near 250 MB limit),
    wrong MIME, replace existing.
32. **Pagination + sort + filter + populate** — query string serialization (the
    `[0]` bracket syntax is in play) works against Strapi 5;
    `pagination[pageSize]` honored.
33. **Error display** — server 4xx/5xx surface a user-readable message, not a
    blank screen.
34. **Loading + empty states** — every list page renders something on
    `data: []`.

## Tier 4 — Operational

35. **Fresh DB boot** — bootstrap seeds run, site-setting singleton created,
    api-pro seeder writes ~1794 policies, no failed lifecycle hooks in logs.
36. **Re-boot (warm DB)** — seeder fingerprint short-circuit fires; boot
    completes within target time; no duplicate row writes.
37. **Background seed pipeline** — set in
    [pos-strapi/src/index.js:109](../pos-strapi/src/index.js#L109) —
    does not interfere with live traffic during initial boot.
38. **CORS** — every frontend app's origin reaches Strapi; preflight passes;
    the `X-Rutba-App` / `X-Rutba-App-Role` / `X-Rutba-App-Admin` headers are
    not stripped.
39. **Email delivery** — nodemailer config in plugins.js delivers via the
    configured SMTP; notification templates render correctly.
40. **Backup / restore** — DB dump of `pos_db`, restore to a fresh
    instance, all apps still functional. The `api_pro_*` tables survive the
    round-trip.
41. **Logs** — no `[api-pro] interceptor error` lines, no unhandled rejection
    traces, no `failed to load app_roles` warnings.

## Tier 5 — Performance sanity

42. List pages with realistic data (a few thousand products, etc.) — first
    paint under acceptable threshold; pagination does not load full table.
43. Login + `/me/permissions` round-trip — one fast call; the permissions cache
    (TTL 30 s) hits on the second login.
44. Heavy populate queries (`populate=*` on products with images / variants) —
    do not time out, do not silently truncate.

---

## How to record results

For each release, copy this file into `docs/test-runs/YYYY-MM-DD-<release>.md`
and check off items inline. Failing items get a one-line note linking to the
bug ticket or PR that fixes them.
