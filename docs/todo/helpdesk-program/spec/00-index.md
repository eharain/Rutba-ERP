# Rutba Helpdesk — Specification Index

> Complete implementation specification for the **Helpdesk module** of Rutba ERP, written
> against the **Rutba Core** architecture. Forty section documents, each standalone and
> independently implementable.

Authored: 2026-08-08. Supersedes the Strapi-oriented framing in
[../00-overview-and-roadmap.md](../00-overview-and-roadmap.md), which remains valid for its
**as-is survey** of what exists today. Where the two disagree, this spec set wins.

---

## Architectural position

Rutba Core is the primary backend. Helpdesk is a **Core business module**: domain models,
domain services, configurable workflows, domain events, and a REST API — not a set of CMS
collections.

**Helpdesk is the first Core-native module.** Every module in
[rutba-core/src/modules/](../../../../rutba-core/src/modules/) today (`hr`, `crm`, `mfg`,
`inventory`, `sale-stock`, `catalog`, `cms-social`, `marketplace`, `auth`, `uploads`) is a
*strangler* port — it `posRequire()`s pos-strapi controllers zero-copy and registers their
routes. Helpdesk has no legacy controller to port, so it is built directly as:

```
rutba-core/src/domain/helpdesk/        ← domain services (the module's real logic)
    ticket.service.js                  TicketService
    sla.service.js                     SLAService
    knowledge.service.js               KnowledgeService
    automation.service.js              AutomationService
    routing.service.js                 AssignmentService
    catalog.service.js                 ServiceCatalogService
    portal.service.js                  PortalService (requester-facing read model)
rutba-core/src/modules/helpdesk.js     ← route registration + event subscriptions only
```

`modules/helpdesk.js` stays thin: it maps HTTP to service calls and wires subscriptions. All
behaviour lives in services, so the same logic is reachable from an event handler, a cron
sweep, an AI action or a future GraphQL/gRPC surface without going through HTTP.

### What Core provides today (verified 2026-08-08)

| Capability | Where | State |
|---|---|---|
| HTTP + routing | `src/http/server.js`, `rest.js` | Koa + `@koa/router`; Strapi REST envelope `{ data, meta }` / `{ data: null, error }` |
| Auth | `src/http/auth.js` | UP JWT (verify-only; pos-strapi still issues) + admin API tokens; `optional:true` = selfAuth parity with `auth:false` |
| Authorization | `src/compat/strapi.js` + `packages/strapi-api-pro` | api-pro interceptor: context → permission-engine → policy-resolver, run through the compat object |
| Data access | `src/documents/` | `documents()` shim over knex; Strapi filter dialect, populate, D&P semantics |
| Transactions | `src/documents/` | `withTransaction()` via AsyncLocalStorage — ambient, every shim query joins automatically |
| Document middleware | `useDocumentMiddleware()` | The interception seam for cross-cutting concerns |
| Lifecycle adapter | `src/modules/lifecycles.js` | Runs pos-strapi lifecycle files as document middleware |
| Scheduler | `src/platform/cron.js` | `registerCron(name, rule, fn)`, gated by `RUTBA_CORE_CRONS=1` + selective kill-switch |
| Email | `src/platform/email.js` | — |
| Uploads | `src/platform/upload.js`, `src/http/uploads.js` | — |
| Schema registry | `src/schema/` | Loads pos-strapi `schema.json` files; derives table/column naming; `validate-schema` must exit clean |

### What Core does NOT yet provide — Helpdesk's platform prerequisites

These are **shared platform capabilities**, not helpdesk features. Each is specified in this
set because Helpdesk is their first consumer, but each belongs to Core and must be usable by
every module.

| # | Capability | Status | Spec |
|---|---|---|---|
| **P1** | **Domain event bus** — `platform/events.js` | ❌ **Missing.** `strapi.eventHub` is a bare `EventEmitter` compat stub with no persistence, no replay, no subscriber registry | [28-event-system.md](28-event-system.md) |
| **P2** | **Workflow service** — promote `pos-strapi/src/utils/workflow-engine.js` to `platform/workflow.js` | 🟡 Exists as a pos-strapi util, consumed zero-copy by the Core HR module | [09-ticket-workflows.md](09-ticket-workflows.md) |
| **P3** | **Notification service** | 🟡 Exists as the pos-strapi `notification-engine` service; needs a Core-native facade | [15-notifications.md](15-notifications.md) |
| **P4** | **Audit service** | 🟡 `work-item-activity` + `logActivity()` are generic and close; need immutability + actor/IP/reason | [30-audit-logging.md](30-audit-logging.md) |
| **P5** | **Search** | ❌ Missing | [26-search-and-filtering.md](26-search-and-filtering.md) |
| **P6** | **AI service seam** | ❌ Missing | [22-ai-features.md](22-ai-features.md) |
| **P7** | **Core-owned SQL migrations** | ❌ Missing. Program ground rule: `schema.json` stays pos-strapi-owned until a module hands its tables over | [37-database-and-domain-model.md](37-database-and-domain-model.md) |

> **P1 and P7 are the two decisions that must be made before any code is written.** Everything
> else can be sequenced. See [Open decisions](#open-decisions) below.

---

## Standing decisions (carried into every section)

1. **Extend the existing ticket recording, do not replace it.** The `contact_tickets` table
   and its live rows are the Ticket aggregate's storage. Columns are added; nothing is dropped.
   The public storefront flow (`submit`/`reply`/`sla-breach`) and the HR/ESS internal flow keep
   working unchanged throughout. Logical rename to "Helpdesk Ticket" is presentation-only.
2. **General, not vertical.** Desks are configured data, not enum branches. A ticket can be
   *about* any entity via `subject_entity_uid` + `subject_document_id`.
3. **The lifecycle is configurable and reusable.** Ticket states are canonical; the *stages*
   between them are defined per desk in the existing workflow engine, which validates
   transitions and maps each stage to a canonical status so side effects can never be bypassed
   by a custom stage. This is a platform capability shared with HR leave, manufacturing work
   orders and sale orders — Helpdesk configures it, it does not fork it.
4. **Services over controllers.** Business logic lives in `src/domain/helpdesk/*.service.js`.
   Routes, event handlers and crons are all thin callers.
5. **Events over direct calls** for cross-module reactions. Helpdesk subscribes to other
   modules' events; other modules never import `TicketService`.
6. **Every mutation is audited.** No exceptions, including automation and AI actions.
7. **Least privilege by default.** Every action is permission-checked at the service layer,
   not only at the route.

---

## Cross-cutting conventions

Repeated here once so the section documents need not restate them:

- **Descriptors are the source of truth.** Every route gets an entry in
  `packages/api-provider/api/` with an explicit `method:` and per-method `scope`. A missing
  `method:` silently becomes a GET. A verb outside the api-pro whitelist makes the seeder skip
  the action, surfacing as a 403.
- **Custom-route `action` must equal the handler name** (api-pro matching convention).
- **`apps` is the caller**, not the target.
- **Re-seed after adding actions**: `npm run seed -- --only=api-provider,up-permissions`.
  Seeding does not run at boot; new actions 403 until it does.
- **Never hardcode enum lists in frontends** — `EnumSelect` against `/enums/:name/:field`.
  Desks, priorities and statuses come from the API.
- **Ownership relations are always `owners`** (plural manyToMany).
- **Reference data ships as migrations**, not `src/seed/data` JSON.
- **Additive only on live data.** `contact_tickets` holds real rows on dev and live.
- **Response envelope** matches Core's existing REST layer exactly: `{ data, meta }` on
  success, `{ data: null, error: { status, name, message, details? } }` on failure.

---

## The forty sections

### Part I — Why and what
| # | Section |
|---|---|
| 01 | [Vision & Objectives](01-vision-and-objectives.md) |
| 02 | [Business Requirements](02-business-requirements.md) |
| 03 | [Functional Requirements](03-functional-requirements.md) |
| 04 | [User Roles & Permissions](04-user-roles-and-permissions.md) |

### Part II — Structure
| # | Section |
|---|---|
| 05 | [Information Architecture](05-information-architecture.md) |
| 06 | [Navigation & Menus](06-navigation-and-menus.md) |
| 07 | [Data Model](07-data-model.md) |

### Part III — The engines
| # | Section |
|---|---|
| 08 | [Ticket Lifecycle](08-ticket-lifecycle.md) |
| 09 | [Ticket Workflows](09-ticket-workflows.md) |
| 10 | [Service Catalog](10-service-catalog.md) |
| 11 | [Knowledge Base](11-knowledge-base.md) |
| 12 | [SLA Engine](12-sla-engine.md) |
| 13 | [Automation Engine](13-automation-engine.md) |
| 14 | [Assignment & Routing](14-assignment-and-routing.md) |
| 15 | [Notifications](15-notifications.md) |

### Part IV — The surfaces
| # | Section |
|---|---|
| 16 | [Customer Portal](16-customer-portal.md) |
| 17 | [Employee Portal](17-employee-portal.md) |
| 18 | [Agent Workspace](18-agent-workspace.md) |
| 19 | [Manager Workspace](19-manager-workspace.md) |
| 20 | [Dashboards](20-dashboards.md) |
| 21 | [Reports & Analytics](21-reports-and-analytics.md) |

### Part V — Intelligence and collaboration
| # | Section |
|---|---|
| 22 | [AI Features](22-ai-features.md) |
| 23 | [Approval Workflows](23-approval-workflows.md) |
| 24 | [Internal Collaboration](24-internal-collaboration.md) |
| 25 | [File Management](25-file-management.md) |
| 26 | [Search & Filtering](26-search-and-filtering.md) |

### Part VI — Platform contracts
| # | Section |
|---|---|
| 27 | [API Specification](27-api-specification.md) |
| 28 | [Event System](28-event-system.md) |
| 29 | [Permission Matrix](29-permission-matrix.md) |
| 30 | [Audit Logging](30-audit-logging.md) |
| 31 | [Settings](31-settings.md) |
| 32 | [Configuration](32-configuration.md) |

### Part VII — Scale and quality
| # | Section |
|---|---|
| 33 | [Multi-Branch Support](33-multi-branch-support.md) |
| 34 | [Multi-Tenant Considerations](34-multi-tenant-considerations.md) |
| 35 | [Performance Requirements](35-performance-requirements.md) |
| 36 | [Security Requirements](36-security-requirements.md) |
| 37 | [Database & Domain Model](37-database-and-domain-model.md) |
| 38 | [UI/UX Specifications](38-ui-ux-specifications.md) |
| 39 | [Mobile Requirements](39-mobile-requirements.md) |
| 40 | [Future Roadmap](40-future-roadmap.md) |

Plus the pre-existing epic: [Remote Support](../epic-5-remote-support.md).

---

## Suggested build order

The forty sections are a *specification* structure, not a build order. Build in this sequence:

| Wave | Contents | Gate |
|---|---|---|
| **W0 — Platform** | P1 event bus, P2 workflow service promotion, P7 migration story | Other modules can emit and subscribe; Helpdesk can own tables |
| **W1 — Domain core** | §07 data model, §08 lifecycle, §09 workflows, §12 SLA, §27 API, §28 events, §30 audit | A ticket can be created, threaded, assigned, transitioned and SLA-tracked via API |
| **W2 — Agent surface** | §18, §06, §26, §24, §25, §29 | Agents work tickets in `rutba-helpdesk` (:4019) |
| **W3 — Requester surfaces** | §16, §17, §10, §15 | Requesters file and track their own tickets across channels |
| **W4 — Scale-out** | §13, §14, §11, §23, §19, §20, §21 | The desk runs without manual triage |
| **W5 — Intelligence** | §22, §39, remote support epic | Differentiation |

---

## Open decisions

These block or reshape implementation and need an explicit answer.

| # | Decision | Recommendation |
|---|---|---|
| D1 | **Event bus: in-process, DB-outbox, or broker?** | **DB-backed outbox + in-process dispatch.** Survives restart, replayable, no new infrastructure. Broker only if/when Core runs multi-instance. See §28 |
| D2 | **Does Helpdesk own its tables via Core SQL migrations, or stay in pos-strapi `schema.json`?** | **Core-owned migrations for new tables**; keep `contact_tickets` in `schema.json` until the whole module flips. Consequence: new tables are invisible to Strapi admin — acceptable, since Helpdesk has its own app | 
| D3 | **Keep the `contact-ticket` UID?** | **Yes.** Renaming touches pos-strapi, Core, descriptors, generated clients and notification templates for zero functional gain |
| D4 | **Remote-control provider** | MeshCentral first, Guacamole second — see the remote-support epic |
| D5 | **AI provider** | Claude via the Anthropic API; see §22 for the seam that keeps it swappable |
| D6 | **Does Helpdesk ship before or after the Core cutover?** | Build Core-native from day one; run against Core with pos-strapi still serving legacy routes. Helpdesk should never gain a Strapi controller |
