# 09 — Ticket Workflows

[← 08 Ticket Lifecycle](08-ticket-lifecycle.md) · [Index](00-index.md) · Next: [10 Service Catalog](10-service-catalog.md)

---

## 9.1 Purpose

How the configurable workflow engine is used by Helpdesk, and what must change in the engine to
serve it — as a **shared platform capability**, not a helpdesk fork.

## 9.2 The existing engine

`services/strapi/src/utils/workflow-engine.js` with the `api::workflow` entity:

- A `Workflow` targets an `entity_uid`, is `is_active` / `is_default`, and holds repeatable
  `stages` and `transitions` components.
- Stages carry `key`, `label`, `sequence`, `maps_to_status`.
- `resolveTargetStage` accepts a stage key **or** a canonical status name.
- 30-second per-process cache with `invalidate()` from the content-type lifecycle. *Known
  limitation: in a clustered deployment other instances pick up an edit within the TTL.*
- **Falls back to the caller's hardcoded transition map when no active workflow exists** — so
  adopting it is a no-op until a workflow row is defined. This is why it is safe to ship the
  default lifecycle as code and let tenants opt into configuration.
- `sweepOverdueStages()` powers `workflowSlaSweep`, registered every 15 minutes and **dormant
  unless `RUTBA_CORE_CRONS=1`**.

Its first real consumer is `hr-leave-request`; the Core HR module registers the sweep
zero-copy. Helpdesk is the second consumer and the first Core-native one.

## 9.3 Required platform work (P2)

| # | Change | Why |
|---|---|---|
| W1 | **Promote to `services/core/src/platform/workflow.js`** | Core is the primary backend; a platform capability must not live in a strangled app's utils folder |
| W2 | **Role gating on transitions** — `allowed_roles` per transition | Helpdesk needs "only a manager may cancel". Currently transitions have no role concept |
| W3 | **Required-field guards** — `requires: []` | "Resolution note mandatory" must be engine-enforced, not re-implemented per module |
| W4 | **Guard expressions** — declarative conditions | "Cannot resolve while an approval is pending" |
| W5 | **Stage metadata** — `requester_label`, `is_paused`, `colour`, `icon` | Drives the portal's plain-language status and SLA pausing without code branching on stage keys |
| W6 | **Transition hooks** — named side effects resolved from a module registry | Lets Helpdesk register `notify_requester` without the engine importing helpdesk code |
| W7 | **Cluster-safe cache invalidation** | The 30s TTL is a known gap; a workflow edit should propagate promptly. Pub/sub on the event bus (P1) or a version column check |
| W8 | **Workflow versioning** | Editing a live workflow must not orphan in-flight tickets on stages that no longer exist |

W2–W5 are *additive* component fields with safe defaults, so existing HR/mfg workflows keep
working untouched. W8 is the one with real design weight — see §9.6.

## 9.4 How Helpdesk binds a workflow

1. Each **Desk** references a `Workflow` (nullable → the seeded default applies).
2. A **ServiceCatalogItem** may override its desk's workflow.
3. On creation the resolved workflow is **pinned** to the ticket (`ticket.workflow`,
   `ticket.stage_key`) — the ticket does not re-resolve later, so reconfiguring a desk cannot
   silently change a ticket in flight.
4. `TicketService.transition(actor, ticket, targetStageKey, payload)`:
   - loads the pinned workflow;
   - validates the transition exists from the current stage;
   - checks `allowed_roles` against the actor's claims;
   - evaluates `guards`;
   - validates `requires` against the payload;
   - resolves the target's `maps_to_status`;
   - runs canonical side effects (§08.6) inside the ambient transaction;
   - writes the audit row;
   - emits events **after commit**.

## 9.5 Worked examples

### Refund request (Customer Support)

```
submitted → validate → finance_approval → inventory_check → manager_approval → refund_issued → resolved
```

| Stage | maps_to_status | Actor | Notes |
|---|---|---|---|
| `submitted` | `open` | requester | |
| `validate` | `in_progress` | agent | Confirms order + payment via the linked subject entity |
| `finance_approval` | `waiting` | `helpdesk_approver` in finance | Approval step (§23) |
| `inventory_check` | `in_progress` | inventory staff | Goods returned? Links the return record |
| `manager_approval` | `waiting` | manager | Threshold-conditional — skipped below a configured amount |
| `refund_issued` | `in_progress` | finance | The money movement itself stays in Accounts; the ticket records and links it |
| `resolved` | `resolved` | agent | Resolution code `refund_issued` |

> The ticket **orchestrates and evidences**; it does not move money. The refund is executed by
> the accounts module and referenced here. A helpdesk that writes journal entries is a
> helpdesk that will one day write the wrong one.

### IT incident

```
new → triaged → diagnosing → awaiting_parts | remote_session → fixed → resolved
```
`awaiting_parts` maps to `waiting` (clock pauses); `remote_session` maps to `in_progress` and
gates on the remote-support policy.

### HR grievance (restricted desk)

```
received → hr_review → investigation → outcome_drafted → outcome_delivered → closed
```
Every stage restricted to `hr_*` roles; desk `visibility_mode: restricted`; no line-manager
grant; internal notes on this desk are additionally hidden from non-assigned agents.

### Employee onboarding request (catalog, parallel)

```
submitted → manager_approval → [it_setup ‖ hr_paperwork ‖ facilities_desk] → complete
```
Parallel branches are modelled as **child tickets** linked to the parent, not as parallel
stages — the engine is a state machine, and a state machine with genuine concurrency becomes
unreadable. The parent stays `waiting` until all children resolve. See [23](23-approval-workflows.md).

## 9.6 Workflow versioning (W8)

Editing a live workflow risks orphaning tickets on a removed stage.

**Rules.**
1. Workflows are versioned; a ticket pins `workflow_id` + `workflow_version`.
2. Editing a workflow with in-flight tickets creates a **new version**; existing tickets stay on
   theirs until they reach a terminal status.
3. Removing a stage that in-flight tickets occupy is refused, with a count and a link to them.
4. An explicit, audited **migrate** action moves in-flight tickets from stage A to stage B.
5. Deactivating a workflow blocks new bindings but never strands existing tickets.

## 9.7 Authoring UI

Under `/settings/workflows` in the agent app: stage list with drag-ordering and canonical-status
mapping; a transition matrix (from × to) with role, guard and required-field editors; a
validation panel; and a **preview** that renders the graph and simulates a path.

**Validation on save:** at least one initial stage; every stage reachable; at least one terminal
stage reachable from every stage (no dead ends); every `maps_to_status` valid; no duplicate
keys; role references resolve.

## 9.8 Testing

- Round-trip every seeded workflow through every legal path.
- Property test: from any reachable stage, a terminal stage is reachable.
- Assert no transition can set a status directly (RULE-4).
- Assert an unknown custom stage mapping to `waiting` pauses SLA with zero code change.
- Regression: HR leave and mfg work orders behave identically after W1–W8 land.

---

## Acceptance criteria for this section

- [ ] W1–W8 delivered as platform changes with HR/mfg regression suites green.
- [ ] A tenant can add a stage, a transition and a role gate with no deployment.
- [ ] In-flight tickets survive a workflow edit (versioning proven by test).
- [ ] Every worked example above is expressible in configuration alone.
- [ ] The authoring UI rejects unreachable stages and dead ends.
