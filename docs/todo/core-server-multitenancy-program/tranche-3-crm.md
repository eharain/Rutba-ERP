# Tranche 3 — CRM (addresses / contact-tickets / crm-leads): migration sheet

Status: **ported + smoke-verified** (steps 1–4 of the playbook done against the live
dev DB; goldens, schema handover and the Caddy flip remain).

## What runs in core now

`services/core/src/modules/crm.js` (same zero-copy model as tranches 1–2 — see
tranche-1-mfg.md for the mechanism). No lifecycles, no crons in this cluster.

### Custom routes (13)

| Route | Notes |
|---|---|
| GET/POST /me/addresses · PUT/DELETE /me/addresses/:documentId · POST .../make-default | `selfAuth` (auth:false + ensureUser in Strapi); person-scoped ownership via `person.user`, soft-delete via archived_at, single-default invariant |
| POST /contact-tickets/submit · /:documentId/reply · /:documentId/sla-breach | `selfAuth`; fires notification-engine processEvent (contact.* templates live in dev DB) |
| GET /crm-leads/assignees | interceptor-gated, action `assignees`; CRM-role-holding users via nested app_roles→appDomains filter |
| GET /crm-leads · /:documentId | **core-action overrides** — `super.find/findOne` then attachAssignees projection |
| POST /crm-leads · PUT /:documentId | **overrides** — popAssignedTo pre-validation, applyAssignedTo resolves ref → CRM user or ValidationError, writes link via db.query update |

Mixed auth model: 8 routes are auth:false in Strapi → `selfAuth: true` in core
(interceptor skipped, controller's ensureUser gates). The 5 crm-lead routes are
authenticated → interceptor-gated with uid `api::crm-lead.crm-lead` + per-route
action (claims: X-Rutba-App crm / role crm_admin|crm_manager|crm_staff).

### Live seeded-drift bug fixed by module-first mounting

The addresses descriptor seeds /me/addresses with plain CRUD action names, so the
route table previously mounted a generic `find` there — listing ALL addresses
instead of the caller's own. Module routes now claim the verb+path first, so core
serves the real ported handlers. contact-ticket custom routes (never seeded) go
from 404 to served.

### New platform capability this tranche forced

- **coreHandler returns ctx.body** (rest.js): Strapi core-controller actions
  return the response envelope, and ported overrides chain on it
  (`const response = await super.find(ctx); attachAssignees(response.data)`).
- **db.query relation writes** (compat `splitWriteValues`): owner-side XtoOne
  relations given as bare id/null (query-engine dialect, crm-lead
  `{assigned_to: userId}`) become link-row replacement (delete+insert),
  lifecycle-free like Strapi's query engine. updateMany stays scalar-only.
- **Relation null-test filter semantics** (documents/query.js): Strapi LEFT-JOINs
  relation traversals, so a filter made purely of null-tests
  (`{user: {id: {$null: true}}}` — the "orphan person" idiom in
  person.ensureForUser) must also match rows with NO link row. Pure null-tests
  now emit `whereNotExists(link) OR whereExists(link ⋈ target WHERE nulls)`.
- **`strapi.plugin(name)` stub** throws an explicit compat error — ported call
  sites (notification-engine sendEmail) wrap it in try/catch; email delivery is
  a no-op in core until the email tranche.

## Verification

- `node scripts/smoke-crm.js` — 25 checks, self-cleaning and **marker-only**
  (never touches real dev rows — the dev DB holds real provisional persons):
  ensureForUser orphan promotion + idempotency, address CRUD + default-flip +
  soft-delete fallback, ticket submit/reply/sla-breach + notification rows,
  assignees projection (no secret columns), lead create/assign/unassign/invalid-
  assignee 400.
- smoke-http deny-probe now excludes selfAuth module GET paths (its old probe,
  /me/addresses, is parity-correct 200 now).
- All prior suites green (documents, writes, platform, http, mfg, hr); contract
  sweep vs live services/strapi 113/113 byte-identical.

## Remaining for this tranche

Same shape as tranches 1–2: goldens on the fixture DB, baseline migration via
`scripts/schema-diff.js --filter <module>`, Caddy flip for the /me/addresses,
contact-ticket and crm-lead prefixes, bake.
