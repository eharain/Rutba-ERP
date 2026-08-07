# 32 — Configuration

[← 31 Settings](31-settings.md) · [Index](00-index.md) · Next: [33 Multi-Branch Support](33-multi-branch-support.md)

---

## 32.1 Purpose

The business vocabulary of the desk — desks, statuses, priorities, categories, tags, templates,
queues, number formats. This is what a tenant admin changes as the business changes, **without a
release** (NFR-6, BR-I1).

## 32.2 The configurability contract

> If adding a desk, a request type, a status label, a routing rule, an SLA target, an
> automation rule, a macro or a notification template requires a deployment, the design has
> failed.

Two things remain code, deliberately:

| Stays in code | Why |
|---|---|
| **Canonical statuses** (7) | Side effects, reporting, SLA and integrations key on them ([08](08-ticket-lifecycle.md)) |
| **Business rules** (`RULE-*`) | Invariants are not preferences |

Everything a tenant sees is configuration over those.

## 32.3 Ticket number format

`ticket_no_format`, default `HD-{YYYY}-{SEQ:6}` → `HD-2026-000123`.

Tokens: `{PREFIX}` · `{YYYY}` `{YY}` `{MM}` `{DD}` · `{DESK}` (desk key, uppercased) ·
`{BRANCH}` · `{SEQ:n}` (zero-padded sequence).

**Rules.** Uniqueness is per tenant. The sequence is allocated from a counter whose scope is
declared (`global` | `per_year` | `per_desk`) — a `{SEQ}` that resets must have a resetting
component in the format, or the validator refuses it. Numbers are never reused, including after
cancellation or merge. Format changes apply to **new tickets only**; existing numbers are
immutable.

Allocation must be safe under concurrency — two simultaneous submissions must not collide. Use a
database sequence or a row-locked counter, never a `SELECT MAX(...) + 1`.

## 32.4 Desks

The primary generality mechanism ([07 §7.5](07-data-model.md)). Seeded: Customer Support · IT ·
HR · Facilities · Field Service · Warranty/RMA · Maintenance.

Each configures: key, name, description, visibility mode, default priority, default assignee/
team, workflow, SLA policy, business calendar, anonymous intake, resolution-note requirement,
line-manager grant, accepted requester kinds, reopen window, auto-close days, CSAT, inbound email
alias, branches, and the legacy `category` map.

**Deactivating a desk with open tickets requires nominating a target desk** — configuration
changes must not strand work.

## 32.5 Statuses and stages

Canonical statuses are fixed. What a tenant configures:

- **Stage labels** — the agent-facing name ("Awaiting Parts From Supplier").
- **`requester_label`** — the plain-language portal text ("We're chasing this up for you").
- **Colour and icon**.
- **Which canonical status a stage maps to** — the mechanism that keeps side effects correct.
- **Transitions**, with role gates, guards and required fields.

Adding `waiting_for_courier` mapping to canonical `waiting` requires no code, pauses the SLA
clock automatically, and renders sensible customer-facing text — because those behaviours key on
the canonical status and the stage metadata, not on a hardcoded enum
([09](09-ticket-workflows.md)).

## 32.6 Priorities

Default `low | normal | high | urgent`. Configurable: display label, colour, sequence, SLA target
per priority, agent-adjustable band (which priorities an agent may set without a manager),
default per desk.

Adding a fifth priority is possible but requires an SLA target for it on every policy — enforced
on save, because a priority without a target silently produces tickets with no promise (RULE-7).

## 32.7 Categories and tags

`category` on the ticket is **deprecated** in favour of desks, retained for legacy callers and
back-filled via each desk's `category_map` (F13).

**Tags** are the flexible classification: free-form or restricted to a controlled list per desk,
colour-coded, with optional auto-tagging rules and AI suggestions. Reportable, mergeable,
renameable (a rename updates every ticket, audited).

Tags are where uncontrolled vocabulary grows. Offer a periodic "unused and near-duplicate tags"
cleanup report rather than pretending it will not happen.

## 32.8 Resolution codes

Structured reasons a ticket ended, per desk: key, name, `counts_as_resolved`, `requires_note`,
active. Seeded examples: `answered`, `fixed`, `replacement_sent`, `refund_issued`,
`no_fault_found`, `duplicate`, `no_response_from_customer`, `out_of_scope`, `known_issue`.

Resolution codes turn "why do tickets close?" from an unreadable free-text field into a report
([21](21-reports-and-analytics.md)) — one of the cheapest high-value pieces of configuration in
the module.

## 32.9 Queues and saved views

Named filter + sort + column sets. Private by default; a manager may share to a team. Seeded:
My Open · Unassigned · Breaching Soon · Awaiting Customer · High Priority · Aged Over 7 Days ·
Awaiting Approval.

## 32.10 Templates and macros

**Notification templates** — per event × channel × locale, with a restricted variable namespace
per audience ([15 §15.5](15-notifications.md)).
**Reply templates / macros** — message text plus optional field changes and a transition, scoped
per desk, permission-bounded to the executing agent.
**Ticket templates** — prefill for common agent-created tickets.

All support the same variable syntax and validate variables on save against the audience's
namespace.

## 32.11 Custom fields

Beyond catalog-item fields ([10](10-service-catalog.md)), a desk may define ticket-level custom
fields: key, label, type, required, options, visibility (agent / requester / both), searchable,
reportable, conditional display.

**Constraint:** custom fields are stored in `custom_fields` json with a **declared schema per
desk**, and unknown keys are rejected ([10 §10.6](10-service-catalog.md)). Without the declared
schema the column becomes an untyped dumping ground that nothing can validate, index or report
on — the failure mode every system with a "custom data" blob eventually reaches.

## 32.12 Configuration management

- **Audited** — every change, with before/after, in the configuration change log.
- **Versioned** — workflows and catalog items are versioned; in-flight work pins its version.
- **Validated** — referential integrity checked on save; impact shown before applying.
- **Exportable** — a configuration profile (desks, workflows, SLA policies, catalog, templates,
  automation) can be exported and imported to provision a new tenant or promote dev → live.
- **Seeded via migrations**, not `src/seed/data` JSON, per the standing convention.
- **Environment-aware** — importing a profile never carries secrets or channel credentials.

## 32.13 API

| Method | Path |
|---|---|
| GET/POST/PATCH | `/api/helpdesk/desks` · `/priorities` · `/statuses` · `/tags` · `/resolution-codes` · `/queues` · `/macros` · `/templates` · `/custom-fields` |
| GET | `/api/helpdesk/config/export` |
| POST | `/api/helpdesk/config/import` (dry-run first, then apply) |
| GET | `/api/helpdesk/config/changelog` |
| GET | `/enums/:name/:field` | Existing endpoint — frontends read enums here, never hardcode |

`config/import` must support **dry-run**: report what would change, what would conflict and what
would be created, before anything is written.

## 32.14 Permissions

`config.read` (manager+, scoped) · `config.manage` (admin) · `config.export` / `config.import`
(admin) · `config.changelog.read` (admin, manager for their desks).

---

## Acceptance criteria for this section

- [ ] A new desk, request type, stage, priority, tag, macro, template, routing rule and
      automation rule can each be added with zero code changes — demonstrated end to end.
- [ ] Ticket-number allocation is collision-free under concurrent load.
- [ ] A `{SEQ}` that resets is refused without a resetting component in the format.
- [ ] Priorities cannot be added without SLA targets on every policy.
- [ ] Unknown `custom_fields` keys are rejected against the desk's declared schema.
- [ ] Config import supports dry-run and excludes secrets.
- [ ] Every configuration change is audited with before/after.
- [ ] No frontend contains a hardcoded status, priority, desk or category list.
