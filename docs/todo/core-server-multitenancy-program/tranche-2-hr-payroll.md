# Tranche 2 — HR / payroll / work-item collaboration: migration sheet

Status: **ported + smoke-verified** (steps 1–4 of the playbook done against the live
dev DB; goldens, schema handover and the Caddy flip remain).

## What runs in core now

`services/core/src/modules/hr.js` (same zero-copy model as tranche 1 — see
tranche-1-mfg.md for the mechanism).

### Custom routes (18)

| Route | Notes |
|---|---|
| GET /hr-leave-requests/my-requests · team-queue | literal paths, mount before :documentId |
| POST /hr-leave-requests/:documentId/approve · reject · cancel | two-axis authority (HR claim org-wide, line manager via hr-team graph) |
| POST /hr-leave-requests | **core-action override** — self-service employee defaulting |
| GET /hr-teams/app-role-options | team-assignment UI options from api-pro domains |
| POST /hr-teams · PUT /hr-teams/:documentId | **overrides** — slug derivation + app_roles sanitization + team-management gate |
| POST /pay-payroll-runs/:documentId/preview · process · cancel | payroll engine service (634-line pay-payroll-run service, ported as-is) |
| GET /pay-payslips/my-payslips · POST /pay-payslips/:documentId/mark-paid | self-service + payout JE |
| POST /pay-statutory-remittances/:documentId/process | GL posting via accounting services |
| POST /work-item-comments | **override** — author stamp + audit-trail mirror |
| POST /work-item-activities/assign · /work-item-watches/toggle | `selfAuth` (auth:false + ensureUser in Strapi) |

Auth model differs from mfg: everything except assign/toggle is an AUTHENTICATED
Strapi route, so core gates it through the api-pro interceptor with the route's
uid + action (policy matching is per interface uid × action — claims must match the
descriptor's apps/approle, e.g. comments accept manufacturing/order-management
claims, not hr).

### New platform capability this tranche forced

- **createCoreController factory support**: ported controllers that override core
  actions call `super.create(ctx)` / `super.update(ctx)`. `instantiateController`
  (compat) gives the custom-methods object the default REST handlers as its
  PROTOTYPE (src/http/rest.js, shared with the route table), so `super.*`
  dispatches to exactly what the seeded route runs.
- Controller return values assign to ctx.body (Strapi semantics) — several
  work-item handlers `return { data }`.
- populate `where` → shim `filters` mapping in the db.query adapter (query-engine
  populate dialect).
- `$eqi`/`$nei` filter operators (employee email fallback lookups).
- HR team-role provider registered via `strapi.apiPro.registerRoleProvider` —
  /me/permissions parity with services/strapi's bootstrap wiring.

### Lifecycles registered

hr-leave-request (total_days derivation), plus — because the generic assign
endpoint writes them — the thin sale-order (status-notification, no-ops for
assignee-only updates) and return-request (return_ref stamp) lifecycles.
Tranche 7 inherits these.

### Crons

None (services/strapi schedules no hr/pay tasks).

## Verification

- `node scripts/smoke-hr.js` — 22 checks, self-cleaning: total_days lifecycle,
  approve → idempotent re-approve → cancel → reject-after-cancel 400, create
  override, app-role-options, payroll-preview 403 parity (manager gate reads the
  phantom `permission_roles` relation → super-admin-only in BOTH servers),
  watch toggle pair, comment author stamp + audit, assign allowlist.
- All prior suites green; contract sweep 113/113.

## Remaining for this tranche

Same shape as tranche 1: goldens on the fixture DB, baseline migration via
`scripts/schema-diff.js --filter <module>`, Caddy flip for the hr-*/pay-*/
work-item-* prefixes, bake.
