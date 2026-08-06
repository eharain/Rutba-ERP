# HR — Org chart + reporting-line authority

_Status: planned. Follows the HRMS build (phases 0–15, shipped)._

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

## Things worth deciding before building

- **Matrix reporting.** `reports_to` is a single manyToOne, so it models one
  line. Dotted-line/secondary managers need either a second field or a join
  content-type. Worth confirming this is out of scope before (1), because it
  changes the walk.
- **Delegation during absence.** The workflow engine already has
  `delegate_to_role` (phase 8). If a manager is on leave, does their authority
  pass down the reporting line automatically or only via explicit delegation?
- **Grievances stay out of this.** They deliberately have no manager scope — a
  grievance is frequently about the reporting manager. Whatever happens to
  `managedReportDocIds`, the grievance queue must remain HR-claim only.
- **Chart depth vs payload.** A 500-person org returned as one tree is a large
  response. Default to a bounded depth with lazy expansion rather than shipping
  the whole graph and filtering client-side.
