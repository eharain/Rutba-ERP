# 34 — Multi-Tenant Considerations

[← 33 Multi-Branch Support](33-multi-branch-support.md) · [Index](00-index.md) · Next: [35 Performance Requirements](35-performance-requirements.md)

---

## 34.1 Purpose

Make Helpdesk safe and sane under the SaaS multi-tenancy work (roadmap H2), without pre-building
a tenancy model the platform has not yet chosen.

## 34.2 Position

Multi-tenancy is a **platform** concern owned by the core-server + multitenancy program, not
something Helpdesk invents. This section states what Helpdesk must do so that it does not have
to be rewritten when tenancy lands, and what it must never assume.

**Today** rutba.pk is tenant #1 and the deployment is effectively single-tenant. The rule that
follows from that is not "ignore tenancy" but "never write code that makes tenancy harder".

## 34.3 Design rules Helpdesk follows now

| # | Rule | Why |
|---|---|---|
| T1 | **No global uniqueness assumptions.** `desk.key`, `ticket_no`, `catalog_item.key`, tag names, workflow names are unique **per tenant**, never globally | A globally-unique constraint is the hardest thing to unpick later |
| T2 | **No cross-tenant reference is representable.** Merge, link, participant, watcher and subject links are all validated same-tenant | RULE-14's "never merge across tenants" must be structurally impossible, not merely checked |
| T3 | **Tenant is resolved from the request context, never from a parameter.** No endpoint accepts a tenant id | A tenant-id parameter is an IDOR waiting to happen |
| T4 | **Every query is tenant-scoped at the lowest layer available** — repository or ORM filter, not per-call-site | One forgotten call site is a breach |
| T5 | **No shared mutable state keyed only by entity id** — caches, rate limiters and counters key by tenant + entity | The api-pro claim cache and the workflow cache are existing per-process caches; helpdesk additions must be tenant-keyed |
| T6 | **Configuration and seed data are per tenant.** Desks, workflows, SLA policies, catalog items and templates seed per tenant, never once globally | |
| T7 | **Sequences are per tenant** | Ticket numbers must not leak another tenant's volume |
| T8 | **Files are tenant-partitioned** with tenant-scoped signed URLs | |
| T9 | **AI grounding and embeddings are tenant-isolated**; no cross-tenant retrieval, no training on tenant data ([22 §22.8](22-ai-features.md)) | The most sensitive isolation boundary in the module |
| T10 | **Events carry `tenant_id`** and subscribers filter on it ([28 §28.4](28-event-system.md)) | |

## 34.4 What Helpdesk must not decide

Left to the platform program: whether isolation is row-level, schema-per-tenant or
database-per-tenant; how a tenant is resolved (subdomain, header, token claim); tenant
provisioning and lifecycle; billing and metering; cross-tenant admin tooling.

Helpdesk consumes whatever the platform provides through a **`TenantContext`** available in the
ambient request context — the same way `withTransaction()` already provides an ambient
transaction via AsyncLocalStorage. Domain services read the tenant from context; they never
receive it as an argument that a caller could get wrong.

## 34.5 Per-tenant customisation

Already delivered by [32 Configuration](32-configuration.md), which is why the configurability
contract matters for the SaaS story: desks, workflows, SLA policies, catalog, statuses labels,
priorities, tags, templates, macros, automation rules, branding and locale are all data.

A tenant that needs a code change to run their desk is a tenant that cannot be onboarded
self-serve — which is precisely the H2 exit gate.

## 34.6 Provisioning

A new tenant is provisioned from a **configuration profile** ([32 §32.12](32-configuration.md)):
default desks, the default workflow, default SLA policies and calendars, a starter catalog,
notification templates, and seeded resolution codes. Secrets and channel credentials are never
in a profile.

Industry starter packs (retail, pharmacy, restaurant, apparel) can ship as alternative profiles,
riding the existing industry-onboarding-pack seeding work.

## 34.7 Noisy-neighbour protection

Per-tenant limits: API rate limits, AI cost ceiling, automation actions per minute, export
concurrency, attachment storage, search query rate, event-dispatch fair scheduling.

One tenant's automation storm, bulk import or AI usage must not degrade another's desk. Without
per-tenant limits, the first tenant to misconfigure an automation rule becomes everyone's outage.

## 34.8 Data residency and deletion

Residency requirements vary by market (PK, UK, EU on the roadmap). Helpdesk stores no data
outside the platform's chosen store, and the AI seam must support a per-tenant provider region
or disablement where residency requires it.

**Tenant deletion** removes tenant data on the platform's schedule. Audit retention
([30 §30.9](30-audit-logging.md)) may legitimately exceed ticket retention; whether audit
survives tenant deletion is a **platform and legal decision**, not a helpdesk one — flag it,
do not decide it here.

## 34.9 Testing

Every scoping test runs with **two tenants populated**, not one. A single-tenant test suite
cannot detect a missing tenant filter — the query returns the right rows because there are no
wrong rows to return. Specifically: cross-tenant read, write, merge, link, search, export,
event delivery, AI retrieval and file access each have an explicit negative test.

## 34.10 Migration path

1. **Now:** build to T1–T10. Single-tenant deployment, tenant-safe code.
2. **Platform lands tenancy:** Helpdesk adopts `TenantContext`; scoping moves to the shared
   repository layer.
3. **Verify:** run the two-tenant suite; audit every raw query for a tenant filter.
4. **Onboard tenant #2** from a configuration profile with no code change — the real test.

---

## Acceptance criteria for this section

- [ ] No unique constraint is global where it should be per tenant.
- [ ] No endpoint accepts a tenant identifier.
- [ ] Every cache, limiter and counter is tenant-keyed.
- [ ] Cross-tenant references are structurally impossible, not merely validated.
- [ ] Two-tenant test suite exists and covers read, write, search, export, events, AI and files.
- [ ] A second tenant can be provisioned from a profile with zero code changes.
- [ ] Per-tenant limits prevent noisy-neighbour degradation.
- [ ] Audit-vs-tenant-deletion question escalated to the platform program, not answered here.
