# HR — Org chart + reporting-line authority

_Status: shipped through step 4 (commit 366a6b8), plus the three open decisions
below resolved. Remaining: the cutover itself, which is gated on data._

Two deliverables that share one data model:

1. **An org chart**, rendered two ways — **team structure** and **reporting line**.
2. **Moving approval authority onto the reporting line**, so the person an
   employee reports to is the person who approves their time off and writes
   their appraisal.

(2) is the substantive part. (1) is largely presentation on top of it.

---

## Where things actually stand

Both graphs already exist in the schema, but only one of them does any work.

| Graph | Shape | Used for authority today? |
|---|---|---|
| **Team** | `hr-team.team_manager` + `members`, nested via `parent_team`/`child_teams` | **Yes — all of it** |
| **Reporting line** | `hr-employee.reports_to` / `direct_reports` (self-relation) | **No — never read** |

`reports_to` was added during phase 0 of the HRMS build. Grepping the backend
for it returns exactly one hit, and that hit is a comment. It is, today, a field
HR can fill in that changes nothing.

Everything that asks "whose records may this person act on?" goes through a
single function:

```
managedReportDocIds(strapi, employeeDocId)   // pos-strapi/src/utils/hr-access.js
```

which finds the teams the employee manages, walks `child_teams` down (bounded
BFS), and returns the members and sub-managers of those teams.

**That single indirection is the good news.** Roughly a dozen call sites depend
on report scope — leave, attendance, payslips, bonuses, loans, advances, expense
claims, tickets, appraisals, training completion, compliance — and every one of
them asks `managedReportDocIds`. Switching the authority source is one function,
not a dozen migrations.

---

## The decision this forces

"The reporting line is what provides appraisals and time-off approvals" is a
change of behaviour, not a description of current behaviour. Three ways to land
it, in increasing order of disruption:

**A. Reporting line only.** `managedReportDocIds` walks `reports_to` and ignores
teams entirely. Cleanest model, and matches how people describe their org. Risk:
any employee whose `reports_to` is blank has *no* approver, so their requests
silently strand in a queue nobody can see. Requires a complete backfill before
cutover, and a guard that surfaces unassigned employees rather than failing quiet.

**B. Union of both (recommended transition).** Authority = reports-to descendants
∪ team-managed members. Nothing that works today stops working, and the reporting
line starts granting authority the moment HR fills it in. Lets the backfill happen
gradually instead of as a big-bang migration. Cost: two graph walks per scope
check (both are already cached-per-request shaped, so this is cheap), and a period
where the org chart shows a richer picture than either graph alone.

**C. Per-concern split.** Reporting line drives appraisals and time off; the team
graph keeps driving the operational queues (tickets, attendance). Most faithful to
how organisations actually behave — your line manager signs your leave, your team
lead triages your tickets — but it means two scope functions and two mental models,
and every future approval flow has to pick a side.

**Recommendation: B now, A later.** Ship the union, backfill `reports_to`, add a
report that lists employees with no reporting line, and only collapse to A once
that report is empty. C is worth revisiting if the two graphs turn out to diverge
a lot in practice — that divergence is itself the signal.

---

## Build order

**1. Reporting-line resolution + backfill**
- Add `reportingLineDocIds(strapi, employeeDocId)` beside `managedReportDocIds`:
  walks `direct_reports` transitively, same bounded-depth + cycle-guard shape the
  team walk already uses (an org chart with a loop in it must not hang a request).
- Switch `managedReportDocIds` to return the union (option B). One change, every
  call site inherits it.
- Backfill `reports_to` from the team graph where it is unambiguous — an employee
  in exactly one team gets that team's manager. Ambiguous cases are left blank and
  listed for HR rather than guessed at.
- An "employees with no reporting line" view in rutba-hr, so the gap is visible.

**2. Org chart API**
- `GET /hr-employees/org-chart?view=reporting|team[&root=<documentId>&depth=n]`
- Returns a nested tree of `{documentId, name, designation, department, children}`.
  Depth-bounded and role-scoped: HR sees from the root down, a manager sees their
  own subtree, an employee sees their own chain upward plus peers.
- One endpoint, `view` switches the edge it follows — the node shape is identical,
  so the frontend renders one component either way.

**3. Org chart UI**
- A chart page in rutba-hr with a **Reporting line / Team structure** toggle;
  collapsible nodes, search-to-focus, deep-linkable root.
- Read-only first. Drag-to-reparent is a natural follow-on but it rewrites
  approval authority as a side effect, so it needs a confirmation step that says
  so in plain language.
- A compact read-only version in rutba-ess ("where I sit"), rooted on the caller.

**4. Appraisal routing**
- `hr-appraisal.reviewer` is currently free-set. Default it to the employee's
  `reports_to` at cycle creation, keeping it overridable for skip-level and
  matrix reviews.
- Warn (don't block) when a reviewer isn't in the employee's reporting chain —
  legitimate cases exist, silent mismatches shouldn't.

---

## Things worth deciding before building — resolved

### Matrix reporting — BUILT, as a join content-type

`api::hr-reporting-line` (`employee`, `manager`, `kind`, `grants_authority`,
`valid_from`, `valid_to`, `note`). The primary line stays on
`hr-employee.reports_to`; this table carries the additional lines a single
manyToOne cannot express.

A second `dotted_reports_to` field was rejected: it buys exactly one dotted line
with nowhere to record what it is for or when it applies. The dated join row
also means a line can lapse on its own rather than needing someone to remember
to delete it.

`grants_authority` is the field that does the real work, and it **defaults to
false**. A dotted line is documentation unless someone deliberately says
otherwise: recording that a person advises a team must not silently hand them
the ability to approve its leave, and a permission whose column defaults to
`true` gets granted by whoever forgets to send the field. Only rows with
`grants_authority` set AND a currently-valid window are unioned into
`reportingLineDocIds`; the rest render on the chart, marked "advisory", and
change no permission.

`reportingLineDocIds` walks both edge kinds in ONE BFS rather than two passes.
A mixed chain (solid → dotted → solid) then resolves in a single walk, and the
shared visited-set catches a cycle that only exists across both edge types —
which a per-edge guard would miss.

### Delegation during absence — NOT BUILT, deliberately

Note first that `delegate_to_role` does not solve this and was never going to:
it is a **role key**, not a person (`workflow-engine.js`,
`transitionAllowsApprover` compares `actorRoleKey === delegate`). It expresses
"anyone holding role X may also act", never "Ali covers for Sara this week".

Automatic cascade off approved leave was rejected on two grounds beyond
visibility:

- **Direction.** Cascading *down* the reporting line hands authority to the
  absent manager's own reports, who would then approve each other's leave. If
  absence authority moves at all it should go up or sideways, never down.
- **Cost.** Deriving it would put a per-approver leave query on the hot path
  that all ~14 approval call sites share.

Nothing is broken today: an HR claim is org-wide, so an absent manager's queue
is already coverable. If this ever becomes real friction, the shape is an
explicit dated `hr-delegation` row (same pattern as `hr-reporting-line`, which
is why that one is dated), with approvals stamped "by Ali on behalf of Sara".

### The cutover gate — READ `total`, NOT `uncovered`

`GET /hr-employees/without-reporting-line` returns both. Only one is the gate,
and picking the wrong one causes exactly the outage this whole design avoids:

| field | means | use |
|---|---|---|
| `uncovered` | neither graph reaches them — nobody can approve **today** | fix immediately; live outage |
| `total` | everyone with a blank `reports_to` | **the gate** |
| `cutover_ready` | `total === 0` | the flag to branch on |

Everyone in the list who is not `uncovered` is reachable **only** because the
team half of the union is still carrying them. Drop that half while `total > 0`
and every one of them loses their approver at once. `uncovered === 0` says
nothing about whether the cutover is safe.

Employees flagged `is_org_root` are excluded from both counts. The top of an org
reports to nobody, and counting them would leave the gate permanently
unsatisfiable — the union would then become permanent by accident rather than by
decision. They are reported separately in `meta.org_roots` so the exclusion is
visible and a mistaken flag is easy to spot.

**When `cutover_ready` is true**, `managedReportDocIds` collapses to
`reportingLineDocIds` alone — delete the `teamManagedDocIds` half of the union
in `pos-strapi/src/utils/hr-access.js`. Nothing else changes; all ~14 call sites
inherit it.

### Drag-to-reparent — BUILT, with a confirmation that names names

`PUT /hr-employees/:id/reporting-line`, defaulting to a dry run that returns the
authority impact. The drop does not write — it asks the server what the change
would do and shows it: who gains the ability to approve, who loses it, and how
many people travel with the dragged node (dragging a director moves their whole
department). Only the reporting view is draggable; dragging in the team view
would have to mean "change team membership", and one control doing both is a
trap.

Server-side it rejects a re-parent under the dragged node's own descendant —
that would detach the subtree into a free-floating ring. The cycle guards
elsewhere stop that hanging a request; they do not make the result meaningful.

### Still true

- **Grievances stay out of this.** They deliberately have no manager scope — a
  grievance is frequently about the reporting manager. Whatever happens to
  `managedReportDocIds`, the grievance queue remains HR-claim only. There is now
  a regression test asserting `hr-grievance` imports no manager-scope helper
  (`pos-strapi/tests/hr-reporting-graph.test.js`).
- **Chart depth vs payload.** A 500-person org returned as one tree is a large
  response. Default to a bounded depth with lazy expansion rather than shipping
  the whole graph and filtering client-side.
