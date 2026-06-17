# Payroll Module — Implementation Spec

> **Status (2026-06): ✅ Built.** The payroll engine ships in
> `pos-strapi/src/api/pay-payroll-run/services/pay-payroll-run.js`
> (`processRun` / `previewRun` / `cancelRun` / `markPayslipPaid`) and handles
> salaried, piece-rate, hybrid, and daily-wage workers in one run, with
> unpaid-leave proration, adjustments (advances/loans/bonuses/penalties), and GL
> accrual-on-process + payout-on-pay. Statutory deductions shipped **generalized**
> as the configurable `pay-deduction-rule` engine (`_computeStatutory` /
> `_slabAmount`). `rutba-payroll` (:4008) has all pages (structures, employee
> profiles, runs, payslips, adjustments, deduction-rules). This spec is retained
> for design rationale; §1 and §10 are updated inline. **Still open:** §7.3
> production-labour capitalization (waits on mfg→GL wiring).
> **Read first:** [`accounting-completion-spec.md`](./accounting-completion-spec.md)
> (the ledger payroll posts into) and
> [`docs/accounting-architecture.md`](../accounting-architecture.md) (engine).
> Payroll consumes HR data (`hr-employee`, attendance, leave) and manufacturing
> piece-rate (`mfg-task`), and posts to the accounting GL.

---

## 1. Current state — the honest baseline

> **⚠️ This section is the pre-build baseline (kept for context). It is now
> superseded — see the 2026-06 update immediately below.** The "scaffolding
> only / zero business logic" framing no longer holds: the engine, postings,
> endpoints, and frontend are built.

> **Update (2026-06): ✅ Built.** The engine lives in
> `pos-strapi/src/api/pay-payroll-run/services/pay-payroll-run.js` and replaces
> the core-service stub: `processRun` (compute payslips for the period across
> salaried / piece-rate / hybrid / daily-wage, apply unpaid-leave proration and
> adjustments, lock contributing `mfg-task`s, post the GL accrual), `previewRun`
> (compute without persisting), `cancelRun` (reverse GL, unlock tasks, restore
> adjustment balances), and `markPayslipPaid` (post the payout JE). The GL bridge
> posts `source_type: 'Payroll Run'` (accrual) and `'Payroll Payment'` (payout),
> idempotent via `findBySource` and reversible via `reverseBySource`. Statutory
> deductions are built **generalized** (see §10) via the `pay-deduction-rule`
> content type + `_computeStatutory` / `_slabAmount` (flat / percent / slab,
> employee + employer portions, no jurisdiction hardcoded). Per-employee pay
> setup lives on `pay-employee-profile` (behind the wall, per §4.1).
>
> **Deviation:** payslip earning/deduction breakdown shipped as a **Strapi
> component `pay.payslip-line`** (`src/components/pay/payslip-line.json`), not as
> the standalone `pay-payslip-line` content type §4.1 proposed. Same fields,
> embedded on `pay-payslip`.
>
> `rutba-payroll` (:4008) has all pages: `salary-structures`,
> `employee-profiles`, `payroll-runs`, `payslips`, `adjustments`,
> `deduction-rules`. **Still open:** §7.3 production-labour capitalization
> (interim model — all labour expensed to `6300` — is in place; the switch waits
> on manufacturing posting `labor_cost` to the GL).

The table below records the *original* skeletal state (pre-2026-06 build):

| Piece | State |
|---|---|
| `pay-salary-structure` | Content type only: `name`, `base_salary`, `description`. No components, no frequency. |
| `pay-payroll-run` | Content type only: `period_start`, `period_end`, `status` (Draft/Processed/Cancelled), `total_gross/deductions/net`, `payslips`. **Routes = `createCoreRouter`, controller = `createCoreController`, service = `createCoreService`.** No `process`/`cancel`. No branch, no workflow, no journal link. |
| `pay-payslip` | Content type only: `period` (string), `gross`, `deductions`, `net_pay`, `status` (Pending/Paid), `employee`, `payroll_run`, `tasks` (← `mfg-task`). No line breakdown, no payment fields, no journal link. |
| `pay-adjustment` | Content type only: `type` (advance/loan/penalty/bonus/incentive/deduction), `amount`, `balance`, `recovery_per_period`, `status`, `reason`, `effective_date`, `employee`, `payslip`, `payroll_run`. Not consumed by any logic. |
| `mfg-task` (piece-rate source) | **Fully working**: `piece_rate` + `amount` snapshotted on approval, `status`, `approved_at`, `payroll_locked`, `employee`, `worker`, `payslip`. `resolvePieceRate` in `mfg-task-state-machine.js`. |
| `hr-employee` | `salary_structure` relation exists. **No** compensation, bank, pay-type, or statutory fields on the employee. `user` ↔ UP user (`inversedBy: hr_employee`). |
| api-provider descriptors (`pay-*`) | Stubs (e.g. `pay-payroll-runs.js` exports only `list`, `meta: { domains:['payroll'] }`, **no `meta.uid`, no roles**). |
| `rutba-payroll` (:4008) | Empty Next.js skeleton. |
| `6300 Payroll Expense` ledger account | Seeded (sub_type "Payroll Expense"). **No `PAYROLL_EXPENSE` mapping key, no Salaries Payable account.** |

---

## 2. Goals & scope

Build payroll end-to-end:
1. **Compute** payslips for a period across **salaried**, **piece-rate
   (manufacturing)**, **hybrid**, and **daily-wage** workers — one unified run.
2. Apply **unpaid leave**, **adjustments** (advances/loans/bonuses/penalties),
   and **statutory deductions**.
3. **Post** to the accounting GL (accrual on process, settlement on payout).
4. Expose **api-pro-conformant** endpoints and the **`rutba-payroll`** frontend.
5. Preserve the **salary-data privacy wall**: sensitive comp lives in `pay-*`
   entities behind a `payroll` role, **not** on `hr-employee` (which `rutba-hr`
   reads broadly).

Out of scope (note as dependencies): full manufacturing-accounting GL wiring (WIP
→ finished goods → COGS) — see the capitalization decision in §7.

---

## 3. Identity & the privacy wall

- **An employee is one `hr-employee`.** A manufacturing worker is the *same*
  person: `mfg-worker-profile.employee` is `oneToOne → hr-employee`. Payroll keys
  everything off `hr-employee`.
- **Resolve employee from the logged-in user** via `user.hr_employee` (the
  `inversedBy` on `hr-employee.user`) for self-service ("my payslips").
- **Keep compensation OFF `hr-employee`.** Because `rutba-hr` (and its broad
  roles) read employee records, putting salary/bank there would leak it. Instead,
  per-employee pay data lives on a new **`pay-employee-profile`** (§4.1) gated by
  the `payroll` role + `apps: ['payroll']`. The only HR↔pay link is the existing
  `hr-employee.salary_structure` (a grade reference, not an amount the HR app needs
  to surface) — consider moving even that read behind the wall in the HR app UI.

Roles: **`payroll_admin`** (everything), **`payroll_manager`** (create/preview/
approve/process runs, not config), **employee** (self-service read of own
payslips, surfaced in `rutba-hr`/portal, *not* in the payroll admin app).

---

## 4. Data model

### 4.1 New content types

**`pay-employee-profile`** — per-employee pay setup (behind the wall).

| Field | Type | Notes |
|---|---|---|
| `employee` | relation oneToOne → `hr-employee` | the link |
| `pay_type` | enum `monthly_salary` \| `piece_rate` \| `hybrid` \| `daily_wage` \| `contractor` | drives computation |
| `base_salary_override` | decimal | optional; else use `salary_structure.base_salary` |
| `daily_rate` | decimal | for `daily_wage` / unpaid-leave proration |
| `bank_account_title` | string | |
| `bank_account_number` | string | |
| `iban` | string | |
| `bank_name` | string | |
| `tax_id` | string | NTN/CNIC for withholding |
| `statutory_no` | string | EOBI / PF / SESSI registration |
| `is_active` | boolean | default true |
| `branch` | relation manyToOne → `branch` | optional cost-center |
| `owners` | manyToMany → user | ownership per layered auth model |

**`pay-payslip-line`** — earning/deduction breakdown (printable, auditable).

| Field | Type | Notes |
|---|---|---|
| `payslip` | relation manyToOne → `pay-payslip` (`inversedBy: lines`) | |
| `kind` | enum `earning` \| `deduction` | sign |
| `category` | enum `base` \| `allowance` \| `overtime` \| `piece_rate` \| `bonus` \| `incentive` \| `unpaid_leave` \| `tax` \| `eobi` \| `provident_fund` \| `advance_recovery` \| `penalty` \| `other` | drives GL account selection in the bridge (§7) |
| `label` | string | human label |
| `amount` | decimal | always positive; `kind` carries the sign |
| `meta` | json | e.g. `{ days, rate, taskCount }` |

### 4.2 Enrichments to existing content types

**`pay-salary-structure`** — add:
- `pay_frequency` enum `Monthly` \| `Biweekly` \| `Weekly` \| `Daily` (default `Monthly`)
- `components` — repeatable component `pay.salary-component`:
  `{ name, kind: earning|deduction, calc: fixed|percent_of_base, value }`

**`pay-payroll-run`** — add:
- `branch` relation → `branch` (optional; null = all-branch run)
- `stage_key` string (workflow engine, like leave/orders)
- `processed_at` datetime, `processed_by` string
- `journal_entry` oneToOne → `acc-journal-entry` (the accrual JE)
- `notes` text
- keep `status` enum but extend: `Draft` → `Approved` → `Processed` → `Paid` → `Cancelled`
  (Approved/Paid optional; Paid = all payslips paid)

**`pay-payslip`** — add:
- `lines` oneToMany → `pay-payslip-line`
- `paid_at` datetime, `payment_method` enum (`Cash`/`Bank`/`Mobile Wallet`),
  `bank_reference` string
- `journal_entry` oneToOne → `acc-journal-entry` (the payout JE)
- `branch` relation → `branch`
- (keep `tasks`, `gross`, `deductions`, `net_pay`, `status`, `employee`, `payroll_run`)

**`hr-employee`** — **no change** (preserve the wall).

---

## 5. The payroll engine

Add custom service methods on `pay-payroll-run` (replace the core-service stub),
custom routes + controller actions, and a workflow option.

### 5.1 `processRun(runDocumentId, { user })`

```
1. Load run; require status ∈ {Draft, Approved} (else 409). Period = [period_start, period_end].
2. Idempotency: if accounting.findBySource('Payroll Run', run.id) returns a Posted
   entry, abort ("already processed").
3. Select employees: hr-employee.status = 'Active', joined ≤ period_end, with a
   pay-employee-profile (is_active) OR a salary_structure. Filter by run.branch if set.
4. For each employee → build payslip:
   a. pay_type from profile (default: salary_structure present ⇒ monthly_salary).
   b. BASE earnings:
      • monthly_salary: base = override ?? salary_structure.base_salary,
        pro-rated by active calendar days in period (joining/termination mid-period).
      • piece_rate: base = Σ mfg-task.amount WHERE employee = e
        AND status = 'Approved' AND approved_at ∈ period AND payroll_locked = false.
      • hybrid: salary base + piece-rate sum.
      • daily_wage: daily_rate × present-day count from hr-attendance (status Present/Late) in period.
   c. ALLOWANCES/DEDUCTIONS from salary_structure.components (fixed or percent_of_base).
   d. UNPAID LEAVE (salaried/hybrid only): approved hr-leave-request with
      leave_type='Unpaid' overlapping period ⇒ deduct (base / working_days_in_period × unpaid_days).
   e. STATUTORY (Phase 2; Phase 1 may be zero/flat): tax/EOBI/PF per config → deductions.
   f. ADJUSTMENTS: pay-adjustment WHERE employee = e AND status ∈ {Pending, PartiallyApplied}
      AND effective_date ≤ period_end:
        • bonus/incentive ⇒ earning line (+gross)
        • penalty/deduction ⇒ deduction line
        • advance/loan ⇒ recover min(recovery_per_period, balance); reduce balance;
          status → PartiallyApplied/Applied; deduction line 'advance_recovery'.
   g. gross = Σ earning lines; deductions = Σ deduction lines; net = gross − deductions.
   h. Create pay-payslip {period: label, gross, deductions, net_pay, status:'Pending',
      employee, payroll_run, branch}. Create pay-payslip-line rows.
   i. LOCK piece-rate tasks: for each contributing mfg-task set payslip = payslip.id,
      payroll_locked = true. (This is what prevents a second run double-paying them.)
   j. Link applied adjustments to the payslip.
5. Roll up run.total_gross / total_deductions / total_net; set processed_at/by;
   status → 'Processed'.
6. ACCOUNTING ACCRUAL: post the run JE (§7). Store run.journal_entry.
7. Return run with payslips populated.
```

**Rounding:** compute in minor units (paisa) or round each line to 2 dp; ensure
Σlines == gross/deductions exactly (carry rounding remainder onto the base line).

### 5.2 `cancelRun(runDocumentId, { user })`

```
1. Require status ∈ {Draft, Approved, Processed}. If ANY payslip.status = 'Paid' ⇒
   409 ("reverse payslip payments first").
2. If Processed: accounting.reverseBySource('Payroll Run', run.id).
3. Unlock tasks: payroll_locked = false, payslip = null for all linked mfg-tasks.
4. Restore adjustment balances + status for adjustments applied by this run.
5. Delete payslips + their lines (or mark void).
6. status → 'Cancelled'.
```

### 5.3 `markPayslipPaid(payslipId, { method, bank_account, date, user })`

```
1. Require payslip.status = 'Pending' and parent run status = 'Processed'.
2. Set status='Paid', paid_at, payment_method, bank_reference.
3. ACCOUNTING PAYOUT: post payout JE (§7). Store payslip.journal_entry.
4. If all payslips in run are Paid ⇒ run.status = 'Paid'.
```

Also: **`previewRun`** (compute without persisting — drives the wizard preview),
**`recomputePayslip`** (re-run one employee before payment).

---

## 6. HR & manufacturing integration

- **Leave:** `hr-leave-request` already has `leave_type: 'Unpaid'` and `total_days`.
  Engine step 4d consumes approved unpaid leave. Paid leave types ⇒ no deduction.
- **Attendance:** `hr-attendance` (`status`, `check_in/out`) feeds `daily_wage`
  present-day counts and (Phase 2) overtime from hours.
- **Piece-rate:** the `mfg-task → pay-payslip` link + `payroll_locked` flag are the
  contract. Engine reads **Approved, unlocked** tasks in the period; locking them
  on payslip creation is the idempotency guarantee. **Do not recompute
  `piece_rate`/`amount`** — they're snapshotted at approval; payroll only sums them.
- **Worker = employee:** sum tasks by `mfg-task.employee` (not `worker`), so a
  person's salary and piece-rate land on one payslip (hybrid).

---

## 7. Accounting bridge (the link to the GL)

### 7.1 Ledger additions

Append to `src/seed/accounting-seed.js` (idempotent). Codes avoid collision with
the current seed and the accounting-completion additions (`1210`,`4300`,`6700`).

**Accounts:**

| Code | Name | Type | Sub-type | Normal |
|---|---|---|---|---|
| `1220` | Employee Advances | Asset | Other Current Asset | Debit |
| `1310` | Work-in-Process — Labor | Asset | Inventory | Debit |
| `2300` | Salaries & Wages Payable | Liability | Other Current Liability | Credit |
| `2310` | Statutory Deductions Payable | Liability | Other Current Liability | Credit |

(`6300 Payroll Expense` already seeded.)

**Mappings:**

| Key | → Code |
|---|---|
| `PAYROLL_EXPENSE` | `6300` |
| `SALARY_PAYABLE` | `2300` |
| `WAGES_PAYABLE` | `2300` *(or split to a dedicated code)* |
| `STATUTORY_PAYABLE` | `2310` |
| `EMPLOYEE_ADVANCES` | `1220` |
| `WIP_LABOR` | `1310` *(target model only)* |

**`source_type` enum** — add to `acc-journal-entry/content-types/.../schema.json`:
`"Payroll Run"`, `"Payroll Payment"`, `"Production Labor"`.

### 7.2 The journal entries

**Accrual — on `processRun`** (`source_type: 'Payroll Run'`, `source_id: run.id`):

| Account | Debit | Credit |
|---|---|---|
| `6300 Payroll Expense` | total gross *(period labor — see model below)* | |
| `2300 Salaries & Wages Payable` | | total net |
| `2310 Statutory Deductions Payable` | | Σ statutory deductions |
| `1220 Employee Advances` | | Σ advance/loan recoveries |

> Bonuses/penalties net into the expense/payable amounts. The bridge builds lines
> by walking `pay-payslip-line.category` → mapping key, so the entry is exact.

**Payout — on `markPayslipPaid`** (`source_type: 'Payroll Payment'`, `source_id: payslip.id`):

| Account | Debit | Credit |
|---|---|---|
| `2300 Salaries & Wages Payable` | net_pay | |
| `1000 Cash Drawer` / `1100 Bank` / `1120 Mobile Wallet` | | net_pay |

### 7.3 The production-labor capitalization decision  *(important)*

> **Status (2026-06): ⏳ OPEN — interim model in place.** The engine ships on the
> **interim** model below: it expenses *all* labor (salaried + piece-rate) to
> `6300 Payroll Expense`. This is still correct because manufacturing does **not**
> yet post `labor_cost` to the GL. The **target** (capitalize production labor via
> `1310 WIP-Labor`) remains unbuilt and must be flipped *in the same change* that
> wires manufacturing COGS.

Manufacturing rolls `mfg-task.amount` into `mfg-work-order.labor_cost` → finished
-goods cost → COGS at sale. So production (piece-rate) labor is destined to be
expensed **through COGS**. If payroll *also* debits `6300 Payroll Expense` for the
same wages, it is **double-counted**.

**Two models — pick per A-3 below:**

- **Interim (recommended now): expense all labor via payroll.** Debit `6300
  Payroll Expense` for the full gross (salaried *and* piece-rate). **This is
  correct today** because manufacturing does **not** post `labor_cost` to the GL —
  there is no COGS path competing with it. Simplest; ship the engine on this.

- **Target (adopt with manufacturing-GL wiring): capitalize production labor.**
  At `mfg-task` **approval**, post `Dr 1310 WIP-Labor / Cr 2300 Wages Payable`
  (`source_type: 'Production Labor'`). The payroll run then does **not** expense
  piece-rate wages (they're in WIP→COGS); it only ensures the payable stands, and
  payout settles `2300`. Salaried/office staff still hit `6300` directly.

**Design so the switch is cheap:** the bridge selects the debit account from
`pay-payslip-line.category` + employee `pay_type`. Moving from interim → target =
changing that selection (piece_rate lines → WIP instead of Payroll Expense) +
turning on the task-approval accrual. **No schema or engine rewrite.** Document
clearly that interim is only safe until manufacturing starts posting `labor_cost`
to the GL — flip to target *in the same change* that wires manufacturing COGS.

### 7.4 Idempotency & reversal

Same rules as the accounting spec: `findBySource` before posting; wrap in
try/catch and log (don't fail the run on a missing mapping); reverse via
`reverseBySource('Payroll Run' | 'Payroll Payment', id)` on cancel/void.

---

## 8. API surface & api-pro conformance

Flesh out routes + controller + descriptors. **Gotchas (from prior modules):**

1. **Descriptor `meta.uid` is mandatory** for the api-pro seeder to mint policies.
   The current stubs lack it — every payroll call will 403 until added. Each
   descriptor needs `meta: { uid: 'api::…', domains:['payroll'], roles:[…] }` and
   per-method `apps: ['payroll']` + `approle: […]`.
2. **Verb whitelist.** The seeder only mints a policy for methods whose name
   starts with a whitelisted verb (`list`/`find`/`recompute`/`sync`/…). **`process`
   and `cancel` are not standard** — either extend the api-pro verb whitelist to
   include `process`/`cancel`/`approve`/`pay`/`preview`, or alias the methods to an
   allowed verb. Verify against the api-pro seeder before naming. (See
   `feedback_api_pro_descriptor_verb_whitelist`.)
3. **Custom action name = controller handler name = route trailing segment.**

**Endpoints:**

| Method | Path | Action | Roles |
|---|---|---|---|
| GET | `/pay-payroll-runs` | find | admin, payroll_admin, payroll_manager |
| GET | `/pay-payroll-runs/:id` | findOne | ″ |
| POST | `/pay-payroll-runs` | create | payroll_admin, payroll_manager |
| POST | `/pay-payroll-runs/:id/preview` | preview | ″ |
| POST | `/pay-payroll-runs/:id/process` | process | ″ |
| POST | `/pay-payroll-runs/:id/cancel` | cancel | payroll_admin |
| GET | `/pay-payslips` | find | admin, payroll_* |
| GET | `/pay-payslips/my-payslips` | myPayslips | any authenticated (self) |
| POST | `/pay-payslips/:id/mark-paid` | markPaid | payroll_admin |
| CRUD | `/pay-salary-structures`, `/pay-employee-profiles`, `/pay-adjustments` | … | payroll_admin |

**`up-permissions-seed.js` `CUSTOM_ACTIONS`** — add:
```js
'api::pay-payroll-run.pay-payroll-run': ['preview','process','cancel'],
'api::pay-payslip.pay-payslip':         ['myPayslips','markPaid'],
```

**Example descriptor** (`packages/api-provider/api/pay-payroll-runs.js`, replacing the stub):
```js
import { listParams, byIdParams } from './__param_builders.js';

export const PayPayrollRunsEndpoints = {
  meta: { uid: 'api::pay-payroll-run.pay-payroll-run', domains: ['payroll'],
          roles: ['admin','payroll_admin','payroll_manager'] },

  list:   (o = {}) => ({ path:'/pay-payroll-runs', action:'find', method:'get',
            apps:['payroll'], approle:['admin','payroll_admin','payroll_manager'],
            params: listParams(o, { sort:['period_start:desc'], populate:['payslips'] }) }),
  byId:   (id, o = {}) => ({ path:`/pay-payroll-runs/${id}`, action:'findOne', method:'get',
            apps:['payroll'], approle:['admin','payroll_admin','payroll_manager'],
            params: byIdParams(o) }),
  create: (data) => ({ path:'/pay-payroll-runs', action:'create', method:'post',
            apps:['payroll'], approle:['payroll_admin','payroll_manager'], data }),
  process:(id, extra={}) => ({ path:`/pay-payroll-runs/${id}/process`, action:'process',
            method:'post', apps:['payroll'], approle:['payroll_admin','payroll_manager'], data:extra }),
  cancel: (id, extra={}) => ({ path:`/pay-payroll-runs/${id}/cancel`, action:'cancel',
            method:'post', apps:['payroll'], approle:['payroll_admin'], data:extra }),
};
```
Run the api-provider scaffolder after editing descriptors to regenerate clients.

**Workflow option:** route `Draft → Approved → Processed → Paid` through the
definable workflow engine (`api::workflow.workflow`, `entity_uid` =
`api::pay-payroll-run.pay-payroll-run`), same pattern as leave/orders — stages map
to canonical statuses; the engine validates transitions, side effects (posting)
fire on the status change.

---

## 9. Frontend — `rutba-payroll` (:4008)

Reuse the shared app shell + `RoleSwitcher`; reuse the money/period components
built for `rutba-accounts`. **Admin payroll stays in this app** (behind the wall);
**employee self-service "my payslips"** is surfaced in `rutba-hr` or the user
portal via `/pay-payslips/my-payslips`, not here.

| Page | Purpose |
|---|---|
| Dashboard | This-period totals, pending payslips, upcoming runs, advances outstanding |
| Salary Structures | CRUD grades + components |
| Employee Pay Profiles | Assign `pay_type`, bank, statutory; per-employee setup |
| Payroll Runs | List + **wizard**: pick period/branch → **preview** computed payslips → **approve** → **process** (posts accrual) → payslip grid |
| Payslip Detail | Line breakdown (earnings/deductions), **print** (React + `window.print()`), **mark paid** (posts payout) |
| Adjustments | Advances/loans/bonuses/penalties; recovery schedule + balance tracking |
| Reports | Payroll register (per run), statutory deductions report, **bank transfer file** (CSV/IBFT) for net pay |

Consume the (fleshed-out) generated clients. The payroll run wizard's "preview"
calls `previewRun` so the user sees numbers before anything posts.

---

## 10. Phasing

> **Status (2026-06):** Phases 1–5 ✅ done. Phase 6 (target capitalization) is
> the only open phase — it ships with manufacturing-GL wiring.

1. ✅ **Schema enrichments** (§4): `pay-employee-profile`, payslip lines (shipped
   as the `pay.payslip-line` **component**, not a content type), salary-structure
   components, run/payslip fields.
2. ✅ **Engine, interim accrual** (§5 + §7.2 interim): `process`/`cancel`/`preview`/
   `markPaid`, task locking, leave + adjustments. Posts all labor to `6300`.
3. ✅ **API + permissions** (§8): descriptors with `meta.uid`, verb-whitelist fix,
   CUSTOM_ACTIONS, scaffolded clients.
4. ✅ **`rutba-payroll` frontend** (§9): structures, profiles, run wizard, payslip print.
5. ✅ **Statutory deductions** (tax/EOBI/PF) + reports + bank transfer file —
   shipped **generalized** as the configurable `pay-deduction-rule` engine
   (`_computeStatutory` / `_slabAmount`: flat / percent / slab, employee +
   employer, no jurisdiction hardcoded), so EOBI/PF/income-tax are data, not code.
6. ⏳ **Target capitalization model** (§7.3) — *together with* manufacturing-GL wiring.

---

## 11. Open decisions

| # | Decision | Recommended default |
|---|---|---|
| P1 | Payroll cadence | **One monthly run** handling salaried + piece-rate together |
| P2 | Production-labor accounting | **Interim (expense to `6300`) now**; switch to capitalization (§7.3) when manufacturing posts to the GL |
| P3 | Comp data location | **`pay-employee-profile`** (behind the wall), not on `hr-employee` |
| P4 | Statutory deductions in v1 | ~~Defer to Phase 5~~ → ✅ **shipped** (Phase 5) as the generalized `pay-deduction-rule` engine (flat/percent/slab, employee+employer) |
| P5 | Self-service payslips surface | **`rutba-hr`/portal** via `my-payslips`, keep admin payroll in `rutba-payroll` |
