# Pre-Deployment Audit Findings — 2026-05-15

> **Historical snapshot — 2026-05-15. Superseded; do NOT update.** The critical findings here are resolved: api-pro now enforces (hybrid + denyByDefault, no policy = 403); /me/permissions populate is correct; the return-requests descriptor is fully implemented. Kept as the pre-deploy audit trail.

Snapshot of issues found during a live endpoint sweep against the running
Strapi (`localhost:4010`) using a `rutba_app_user` JWT and the
`x-rutba-app: cms` / `x-rutba-app-role: cms_staff` claim. Companion to
[pre-deployment-test-plan.md](./pre-deployment-test-plan.md) — when these are
fixed, re-run the Tier 0 / Tier 1 sections of the plan and clear them here.

---

## Critical — api-pro is not enforcing

Three probes that should have been denied came back 200:

| Probe | Expected | Actual |
| --- | --- | --- |
| `cms_staff` → `/api/sale-orders` (sale-orders descriptor has no `cms` in `apps`) | 403 | 200 |
| `x-rutba-app-role: bogus_role` → `/api/products` | 403 | 200 |
| No `x-rutba-app` / `x-rutba-app-role` headers → `/api/products` | 400 / 403 | 200 |

Plus: `/api/api-pro/me/permissions` returns `permissions: {}` for a user that
holds 49 `app_roles`, despite
[.api-pro/seed-checkpoint.json](../pos-strapi/.api-pro/seed-checkpoint.json)
showing 1794 policies written.

**Most likely root cause: middleware ordering.** The interceptor is installed via
`strapi.server.use(...)` in
[bootstrap.js](../packages/strapi-api-pro/server/src/bootstrap.js) (line ~152).
Plugin bootstrap runs after Strapi has already registered its router, so the
interceptor sits *after* the router in the Koa stack — when `process()` reads
`ctx.state.route.handler`, it is not yet populated on the request-down phase,
and on the return phase the response has already been sent.
`parseRouteHandler(undefined)` returns `null`, the interceptor short-circuits
with `status: 'skipped'`, and every request passes. UP grants are currently the
only gatekeeper.

The `/me/permissions` empty result is most likely related: a populate failure
in
[loadPoliciesForRoles](../packages/strapi-api-pro/server/src/services/me-permissions.js#L74)
(populate of `interfaceMethod.apiInterface`) would cause every row to be
skipped by the `if (!ctUid || !action) continue` guard. Confirm by logging the
raw row count before the filter.

**Fix options**

- **A. Restore api-pro enforcement (architectural fix).** Move the interceptor
  out of plugin-bootstrap `server.use` into one of:
  - a Strapi global policy registered on every route (descriptor-driven),
  - a strapi middleware registered in
    [pos-strapi/config/middlewares.js](../pos-strapi/config/middlewares.js)
    so it runs in the correct order,
  - or attach the check via a `routes.config.policies` injection during route
    registration.

  Also debug `loadPoliciesForRoles` populate — likely related; once api-pro
  enforces, `/me/permissions` should also surface real entries.

- **B. Quick unblock for the 6 endpoints below (UI only).** Grant the missing
  UP find/findOne actions on those content-types to the `rutba_app_user` role
  via Strapi admin → Settings → Users & Permissions → Roles. This makes the
  CMS pages load but does **not** restore role isolation — `cms_staff` will
  still be able to read sale-orders, etc.

Path A is the right fix before deployment. Path B alone leaves enforcement
broken.

---

## UP-level 403 — missing grants for `rutba_app_user`

These returned the stock UP 403 (95-byte `ForbiddenError`). The api-pro
descriptors declare them for `cms_staff` / etc., but UP rejects before api-pro
is consulted:

| Endpoint | Page that breaks |
| --- | --- |
| `/api/notification-templates` | [rutba-cms/pages/notification-templates.js](../rutba-cms/pages/notification-templates.js) |
| `/api/delivery-methods` | [rutba-cms/pages/delivery-methods.js](../rutba-cms/pages/delivery-methods.js) |
| `/api/delivery-zones` | populated by the delivery-methods page |
| `/api/hr-teams` | rutba-hr |
| `/api/riders` | rutba-rider, rutba-order-management |
| `/api/sale-audit-logs` | rutba-sale (audit drawer) |

## 404 — path / route issues

| Path | Diagnosis |
| --- | --- |
| `/api/site-settings` (plural) | Wrong path. Descriptor [api/site-setting.js](../packages/api-provider/api/site-setting.js) is singular — confirm the page actually invokes the descriptor and not a hard-coded plural URL. Also, only `?status=draft` returns 200; no published row exists on this DB, so `getPublished()` 404s. |
| `/api/return-requests` | Descriptor [api/return-requests.js](../packages/api-provider/api/return-requests.js) is a stub (`todo`). No server route is registered. |
| `/api/media-library` (root) | Only sub-paths (`/folders`, `/files`, `/folders/tree`) exist. No code currently calls the root, but worth noting. |

---

## Endpoint sweep — full result

CMS role (`x-rutba-app: cms`, `x-rutba-app-role: cms_staff`), pagination
pageSize=1. Other domains (stock / sale / accounts / hr / crm / rider /
order-management / social / payroll / auth) all produced the same two
holdouts: `hr-teams` and `riders` returned 403 across every domain. Everything
else returned 200.

```
acc-accounts                     200
acc-expenses                     200
acc-invoices                     200
acc-journal-entries              200
brand-groups                     200
brands                           200
branches                         200
cash-register-transactions       200
cash-registers                   200
categories                       200
category-groups                  200
cms-footers                      200
cms-pages                        200
crm-activities                   200
crm-contacts                     200
crm-leads                        200
customers                        200
delivery-methods                 403   ← UP grant missing
delivery-zones                   403   ← UP grant missing
hr-attendances                   200
hr-departments                   200
hr-employees                     200
hr-leave-requests                200
hr-teams                         403   ← UP grant missing
notification-templates           403   ← UP grant missing
pay-payroll-runs                 200
pay-payslips                     200
pay-salary-structures            200
payments                         200
product-groups                   200
products                         200
purchase-items                   200
purchases                        200
return-requests                  404   ← descriptor stub, no server route
riders                           403   ← UP grant missing
sale-audit-logs                  403   ← UP grant missing
sale-items                       200
sale-offers                      200
sale-orders                      200
sale-return-items                200
sale-returns                     200
sales                            200
site-settings                    404   ← path/data; see above
social-accounts                  200
social-posts                     200
social-replies                   200
stock-inputs                     200
stock-items                      200
suppliers                        200
term-types                       200
terms                            200
```

## How to re-run this sweep

```bash
TOKEN=<bearer>
for ep in <list-from-above>; do
  curl -sS -o /tmp/r.txt -w "%{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    -H "x-rutba-app: cms" -H "x-rutba-app-role: cms_staff" \
    --globoff "http://localhost:4010/api/$ep?pagination[pageSize]=1"
done
```

Bodies of size 95 bytes are UP's stock `ForbiddenError`; an api-pro denial
returns an `{ "error": { "code": "API_PRO_FORBIDDEN" ... } }` body.
