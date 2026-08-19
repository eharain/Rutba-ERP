# Portal Alignment — ERP × rutba.io

<!-- verify-docs: external plan/** specs/** -->
<!-- `plan/…` and `specs/…` below are paths inside the Rutba-Portal repo
     (D:\Rutba\Rutba-Portal), not this one — all four verified present there on
     2026-08-20. Without this marker verify-docs reads them as four broken
     links and fails the whole run, which is how a validator stops being a gate
     anyone trusts. -->

**Source of truth:** the Rutba-Portal repo (`D:\Rutba\Rutba-Portal`) — `plan/11-product-integrations.md` (ERP workstream E1–E6 + coherence rules), `specs/GLOBAL-AUTH.md` (identity & tokens), `specs/SERVICE-SUITES.md` (suites, entitlement keys), `specs/TENANCY-DATA-ARCHITECTURE.md` (per-org instances, Tenant Catalog). This document translates those into this repo's own terms. When they disagree, the portal specs win; fix the disagreement in the same PR that touches both repos.

## Division of ownership

| The portal owns (ERP must not rebuild) | The ERP owns |
|---|---|
| Identity, login, sessions, MFA (`auth.rutba.io`) | Business domains: stock, sales, orders, HR, finance, manufacturing |
| Licensing & entitlements (License Service) | Module UX and domain workflows |
| Billing & subscriptions | Per-org database schema and migrations |
| Tenant provisioning & the Tenant Catalog | ERP Core packages (parties, catalog, posting, interactions) |
| Cross-product support desk (portal Support) | Domain-level background jobs (see Workers) |

## Packages (`packages/*`)

1. **`packages/shared` grows the ERP Core** (portal task E1): `parties` (customers/suppliers — one record all modules reference), `catalog` (items/UoM/pricing), `posting` (journal-entry contract; export-queue fallback when `erp.gl` unlicensed), `interactions` (activity-on-records: calls/emails/chats/meetings/posts logged against parties/orders/tickets). Module apps import these — no private copies of customers or items anywhere.
2. **Consume the platform client packages** (published from Rutba-Portal, plan 00): `@rutba/portal-auth` (JWT/JWKS verification + claims mapping), `@rutba/license-client` (validate/heartbeat, entitlement schema, last-known-good cache), `@rutba/usage-reporter` (idempotent usage events). Until they're published, implement behind the same interfaces so the swap is mechanical.
3. **npm scope rule:** `@rutba/*` is platform-owned (portal repo publishes it). ERP-internal packages stay workspace-internal or use a distinct scope.
4. `packages/strapi-api-pro`, `packages/strapi-provider-upload-media`: media uploads route to the Rutba Media FileServer per-org namespace (portal Media integration), not private storage drivers.

## Authentication (portal task E3)

- **`apps/admin/auth` stops being an identity provider.** It becomes the OIDC client shell against `auth.rutba.io` (authorization code + PKCE, `org_hint` from the instance's subdomain). No local passwords, no local sessions beyond the OIDC session handling.
- API routes accept **gateway internal assertions** (`@rutba/portal-auth` middleware): identity = `{sub, org_id, roles, entitlements, req_id}`. The client's edge token never reaches the instance.
- **Roles come from token claims** — the portal membership registry is the source; ERP's internal permission checks map from claim roles (e.g. `hr:admin`, `stock:viewer`), never from a local role table.
- **SCIM sync up** (portal task, `GLOBAL-AUTH.md` §5): the HR module (`apps/people/hr`) pushes membership/role changes to central auth; identity webhooks (`identity.suspended` etc.) come down. Central owns email/credentials/MFA; this repo owns roles and org attributes.

## Module ↔ entitlement map (portal task E2)

Each workspace app gates its navigation, routes, and APIs on its entitlement key (one image, runtime activation — modules are never separately deployed):

| Workspace app | Entitlement | Workspace app | Entitlement |
|---|---|---|---|
| `apps/inventory/stock` | `erp.stock` | `apps/people/hr` | `erp.hr` |
| `apps/inventory/control` | `erp.warehousing` | `apps/people/ess` | `erp.ess` |
| `apps/inventory/manufacturing` | `erp.mrp` | `apps/finance/payroll` | `erp.payroll` |
| `apps/sales/pos` | `erp.pos` | `apps/finance/accounts` | `erp.gl`, `erp.ap-ar` |
| `apps/sales/orders` | `erp.orders` | `apps/content/storefront` | `erp.storefront` |
| `apps/sales/rider` | `erp.delivery` | `apps/content/cms` | `erp.cms` |
| `apps/sales/crm` | `erp.crm` | `apps/content/campaigns` | `erp.campaigns` |
| `apps/sales/portal` | `erp.leads`/`erp.quotes` | `apps/content/social` | `erp.social` (see below) |
| `apps/sales/helpdesk` | `erp.helpdesk` (see below) | | |

**Special cases — align, don't duplicate:**
- **`apps/content/social` + `services/strapi` social types → retire the *publishing* backend; extract the *creative* capability (portal task E6).** The Social Relay is the sole social engine; `erp.social` becomes a UI over the published `@rutba/relay-sdk` against the org's Relay tenant. Migrate social-accounts → Relay connections (re-auth), scheduled posts → Relay posts. **The video/image editors and managed creative libraries (video templates, audio tracks, `packages/video`) are promoted — not discarded — to their own repo `D:\Rutba\Rutba-Studio`** (`social.studio` add-on to the Relay), which reads this repo's Core catalog via API for data-driven creatives and stores masters on the Media FileServer.
- **`apps/content/mail`** — mailboxes are the Wave-2 `comm.mail` product (Mailcow + first-party client, portal direction Aug 2026). This app must not grow into a mail server or an independent mail client; near-term it may only *send* via Rutba MTA. Flag any further work here against the portal Wave-2 plan first.
- **`apps/sales/helpdesk` — RESOLVED (Aug 2026): a full ERP module (`erp.helpdesk`) for an org's own customer-service needs — and Rutba's own support desk runs as an org-zero instance of it.** The portal keeps only a thin facade (Rutba-Portal plan 07): portal customers' tickets arrive via a service account, with each portal org mapped to a customer *party* in the org-zero instance. This raises the module's bar — it is Rutba's production desk, so it must be **API-first**: service-account ticket intake (create/thread/attachments against a party), SLA timers, agent assignment, knowledge base with a published/draft distinction and public-read API, and CSAT. Domain logic (SLA, escalation, assignment) lives here, never in the portal facade.
- **`apps/sales/marketplace`, `apps/admin/console`, `apps/admin/seed`** — instance-internal; console must not duplicate portal Super Console functions (org admin, licensing, billing views live in the portal).

## Workers & background jobs

Rule: **a worker belongs to the product that owns the domain.** ERP workers (`packages/sync`, Strapi crons, any queue consumers) run ERP domain jobs only — stock recalculation, payroll runs, report generation, data sync.

- **No social publish/schedule workers in the ERP** — creating or scheduling posts is one SDK call to the Relay; the Relay's BullMQ workers own delivery, retries, and pacing. (The current `apps/content/social`/Strapi publish workers retire with E6.)
- **No email dispatch workers** — sends go through Rutba MTA's API; MTA owns queuing, suppression, retries.
- **No cross-product queues** — never share Redis/queue instances with the Relay, MTA, or the portal; integration happens over their public APIs, webhooks, and the portal event envelope, not shared infrastructure.
- Adopt the portal's job conventions as they publish (idempotency keys, transactional outbox, event envelope from Rutba-Portal plan 00) so patterns match even though runtimes stay separate.

## Other integrations

- **Instance packaging (portal task E4):** container configured exclusively from environment/Tenant-Catalog references; migrations on boot; `/health` + version endpoint; stateless outside the per-org database — nothing that breaks provision/suspend/migrate.
- **License (E5):** validate on boot + hourly via `@rutba/license-client`; grace → read-only, revoked → lock; seat counts and metered usage via `@rutba/usage-reporter`.
- **Interactions:** modules render timelines from Core `interactions`; portal-side events (campaign sends, Relay `post.published`, support tickets) arrive as interactions against parties/records.
- **Attachments/media:** Media FileServer per-org namespace now; migrate to Drive refs when Wave-2 Drive ships.

## Sequencing (mirrors Rutba-Portal `plan/11`)

| Portal phase | This repo delivers |
|---|---|
| C (Control Plane) | E3 portal auth + E4 instance packaging — **blocking for the portal's provisioning demo** |
| D (Commerce) | E1 Core extraction + E2 entitlement gating (blocks selling module bundles) |
| E (Operations) | E5 usage/license polish · E6 rutba-social retirement (+ `erp.social` over Relay SDK) |

## Do-not-build list

Own login/identity · own licensing or billing · own tenant management · a social engine · a mail server · a cross-product support desk · cross-product shared queues · direct writes to another product's database.
