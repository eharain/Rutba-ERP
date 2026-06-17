# Accounting Module — Completion Spec

> **Status (2026-06): ✅ Largely built.** The posting wiring (§4.1–§4.4),
> ledger additions (§3), and reporting layer (§5) all shipped, and the
> `rutba-accounts` frontend (§6) covers dashboard, chart-of-accounts,
> journal-entries, invoices, expenses, and reports. The §1.2 gap table and the
> §6 page list below are updated inline; this spec is retained for design
> rationale. **Still open:** the Bills, Banking & Registers, and Tax & Periods
> frontend pages (§6), and bank reconciliation. Code: posting in
> `sale-order/services/sale-order-state-machine.js` + `sale-order.js`
> `verifyPayment`, `cash-register/controllers/cash-register.js`,
> `purchase/controllers/purchase.js` `generateBill`,
> `sale-return/.../lifecycles.js`; reports in
> `acc-journal-entry/services/reports.js` + `routes/acc-journal-entry.js`.

> **Status:** the accounting *engine* is built and working; this doc specs what
> remains to make it a usable module.
> **Read first:** [`docs/accounting-architecture.md`](../accounting-architecture.md)
> (design) and [`docs/todo/accounting-engine-implementation.md`](./accounting-engine-implementation.md)
> (detail). This document does **not** repeat them — it reconciles them with the
> *actual* build state and specifies the unfinished work: posting wiring,
> reporting layer, and the `rutba-accounts` frontend.
> **Sibling:** [`payroll-module-implementation.md`](./payroll-module-implementation.md)
> — payroll posts into this ledger; see its "Accounting Bridge" section.

---

## 1. Reality check — doc vs. build

The architecture docs describe a richer target than what is currently seeded and
wired. Build to the **actual** state below, not the doc's aspirational COA.

### 1.1 What is actually built and working

| Capability | State | Location |
|---|---|---|
| Double-entry engine (`createAndPost`, `reverse`, `reverseBySource`, balance check, fiscal-period assignment, account-balance updates) | ✅ Done | `acc-journal-entry/services/accounting.js` |
| Account resolver (`resolve(key, branchId)`, `resolvePaymentMethod`) | ✅ Done | `acc-journal-entry/services/account-resolver.js` |
| Chart of accounts, journal entry/line, fiscal period, tax rate, bank account, account mapping | ✅ Content types exist | `acc-*` |
| Default COA + mappings + current-year fiscal period seed | ✅ Done (idempotent) | `src/seed/accounting-seed.js` |
| **POS sale → GL** (revenue + tax + payment-method debit; COGS + inventory) | ✅ Wired | `sale/controllers/checkout.js` |
| **POS sale cancel → GL reversal** | ✅ Wired | `sale/controllers/cancel.js` (`reverseBySource('POS Sale', …)`) |
| AR invoice auto-posting (Draft→Sent, payment, cancel) | ✅ Wired | `acc-invoice/.../lifecycles.js` |
| AP bill auto-posting (Draft→Received, payment, cancel) | ✅ Wired | `acc-bill/.../lifecycles.js` |
| Expense auto-posting (Approved→Posted, cancel) | ✅ Wired | `acc-expense/.../lifecycles.js` |
| Immutability (posted entries cannot edit/delete, only reverse) | ✅ Enforced | journal-entry lifecycle |

### 1.2 What is NOT built (this doc's scope)

> **Update (2026-06):** gaps 1–5 are **done** — see the ✅ rows. The only
> remaining item from this table is the frontend, and even that is mostly built
> (§6): Bills, Banking & Registers, and Tax & Periods pages are the open subset.

| Gap | Impact | State |
|---|---|---|
| **Web / COD `sale-order` does not post** | All e-commerce revenue, COGS, and COD cash are missing from the ledger. | ✅ **DONE** — `sale-order/services/sale-order-state-machine.js` posts Web Order revenue/COGS on DELIVERED (+ reversal on cancel/refund); `verifyPayment` in `sale-order/controllers/sale-order.js` posts the COD settlement (`Web Order Payment`). |
| **Cash register open/close/variance/drops do not post** | Float movements, banking, and short/over are invisible to the GL. | ✅ **DONE** — `cash-register/controllers/cash-register.js` posts `Cash Register Open` / `Cash Register Close` incl. counted-vs-expected short/over variance. |
| **Purchase → bill is manual** | No auto-generation of `acc-bill` when a `purchase` is received; payables depend on someone hand-keying a bill. | ✅ **DONE** — `purchase/controllers/purchase.js` `generateBill` creates an `acc-bill` from the received purchase and sets it Received so the existing lifecycle posts AP. |
| **POS sale-return does not post** | Refunds/exchanges don't reverse revenue/COGS. (Architecture doc §10.2–10.3 designed it; not wired.) | ✅ **DONE** — `sale-return/content-types/sale-return/lifecycles.js` posts `source_type: 'Sale Return'` (idempotent via `findBySource`). |
| **No reporting endpoints** | Trial balance, P&L, balance sheet, cash flow, AR/AP aging — none exist as APIs. | ✅ **DONE** — `acc-journal-entry/services/reports.js` + `routes/acc-journal-entry.js` expose `reports/{trial-balance,income-statement,balance-sheet,cash-flow,ar-aging,ap-aging}`. |
| **No frontend** | `rutba-accounts` (:4007) is an empty skeleton. | ⏳ **Mostly built** — dashboard, chart-of-accounts, journal-entries, invoices, expenses, reports shipped (§6). Open: Bills, Banking & Registers, Tax & Periods. |

### 1.3 Discrepancies to be aware of (build differs from the docs)

These will trip up an implementer who follows the architecture/engine docs literally:

1. **`createAndPost` line shape.** The engine doc shows `lines: [{ account_id, … }]`
   and `branch_id`/`currency_id`. The **actual** `accounting.js` uses
   `lines: [{ account, debit, credit, description, tax_rate, tax_amount }]` and
   top-level `branch`, `currency` (Strapi ids). **`resolver.resolve()` returns an
   account `id`** (not the object the engine doc implies). Correct usage:

   ```js
   const accounting = strapi.service('api::acc-journal-entry.accounting');
   const resolver   = strapi.service('api::acc-journal-entry.account-resolver');
   const revenueAcc = await resolver.resolve('SALES_REVENUE', branchId); // -> id
   await accounting.createAndPost({
     date, description, source_type: 'Web Order', source_id, source_ref,
     branch: branchId, posted_by,
     lines: [
       { account: arAcc,      debit: total },
       { account: revenueAcc, credit: subtotal },
       { account: taxAcc,     credit: taxAmount },
     ],
   });
   ```

2. **Actual seeded COA is leaner** than the doc's. The seeded accounts/mappings
   are listed in §3. Several accounts the docs reference (Cash Short/Over, COD
   clearing, shipping revenue, web-sales revenue, store credit, gift-card
   liability, etc.) are **not seeded**. Add only what a wired flow needs (§3).

3. **Aspirational tables not built / not needed.** The engine doc's
   `acc_account_balances` snapshot table, `acc_stock_valuation_layers`, and MySQL
   triggers do **not** exist and are **not** required — reporting derives directly
   from `acc-journal-line` (§5). Do not build them unless a perf problem proves the need.

4. **`source_type` enum already covers everything in this doc.** It includes
   `Web Order`, `Sale Return`, `Cash Register Open/Close/Transaction`,
   `Purchase Receipt`, `Purchase Return`, `Inventory Adjustment`. **No enum change
   is needed for accounting completion.** (Payroll adds its own — see the payroll spec.)

---

## 2. Cross-cutting rules (apply to every new posting & endpoint)

- **Never hand-build journal entries.** Always go through
  `accounting.createAndPost` / `accounting.reverse*` and `account-resolver`.
- **Idempotency.** Before posting for a document, call
  `accounting.findBySource(source_type, source_id)`; skip if a Posted entry
  already exists. State-machine transitions and webhooks can fire more than once.
- **Best-effort, never block the operation.** Mirror `checkout.js`: wrap posting
  in `try/catch`, log on failure, do not unwind the sale/order. A missing mapping
  must not break checkout or delivery. Failed posts are reconcilable later.
- **Branch context.** Pass the originating branch id so branch-specific mappings
  resolve. `sale-order` is single-branch via its relation; POS `sale.branches` is
  manyToMany (use `[0]`).
- **api-pro conformance** (for reporting + any new endpoint): add a descriptor in
  `packages/api-provider/api/`, give it `meta.uid` + `apps: ['accounts']` +
  `approle`, register custom actions in `up-permissions-seed.js` `CUSTOM_ACTIONS`,
  and ensure the method name starts with a whitelisted verb (`list`/`find`/
  `report`/`recompute`/…). Hybrid + deny-by-default ⇒ **no policy = 403**.

---

## 3. Ledger additions required

> **Status (2026-06): ✅ Seeded.** Accounts `1210`/`4300`/`6700` and mappings
> `COD_CLEARING`/`SHIPPING_REVENUE`/`CASH_SHORT_OVER` are all present in
> `src/seed/accounting-seed.js` (`DEFAULT_ACCOUNTS` + `DEFAULT_MAPPINGS`), along
> with the payroll additions from the payroll spec (`1220`/`2300`/`2310` +
> `PAYROLL_EXPENSE`/`SALARY_PAYABLE`/`STATUTORY_PAYABLE`/`EMPLOYEE_ADVANCES`).

Add to `src/seed/accounting-seed.js` (`DEFAULT_ACCOUNTS` + `DEFAULT_MAPPINGS`).
Seed is idempotent, so appending is safe. Codes chosen to avoid collision with
the current seed.

### 3.1 New accounts

| Code | Name | Type | Sub-type | Normal | For |
|---|---|---|---|---|---|
| `1210` | COD / Rider Float | Asset | Other Current Asset | Debit | COD cash collected, not yet deposited |
| `4300` | Shipping Revenue | Revenue | Other Revenue | Credit | Delivery charged to customer on web orders |
| `6700` | Cash Short/Over | Expense | Operating Expense | Debit | Register count variance (carries credit balance when net over) |

> Optional channel separation (not required): `4001 Web Sales Revenue`. Default is
> to reuse `4000 Sales Revenue` and distinguish channel via `source_type`/branch.

### 3.2 New mappings

| Key | → Code | Used by |
|---|---|---|
| `COD_CLEARING` | `1210` | Web/COD order collection & deposit |
| `SHIPPING_REVENUE` | `4300` | Web order delivery charge |
| `CASH_SHORT_OVER` | `6700` | Cash register close variance |

> `SALES_REVENUE`, `TAX_PAYABLE`, `COGS`, `INVENTORY`, `ACCOUNTS_RECEIVABLE`,
> `CASH_DRAWER`, `CASH_SAFE`, `BANK_PRIMARY`, `CARD_CLEARING`, `MOBILE_WALLET`,
> `SALES_RETURNS`, `ACCOUNTS_PAYABLE` already seeded — reuse them.

### 3.3 Payment-method mapping for web orders

`resolver.resolvePaymentMethod` maps the POS `payment` enum
(`Cash`/`Card`/`Bank`/`Mobile Wallet`). **`sale-order.payment_method` uses a
different, lowercase enum** (`cod`/`card`/`bank_transfer`/`mobile_wallet`/
`online_gateway`). Add a small translation in the order posting helper:

| `sale-order.payment_method` | Resolver key |
|---|---|
| `cod` | `COD_CLEARING` (until deposited) |
| `card` / `online_gateway` | `CARD_CLEARING` |
| `bank_transfer` | `BANK_PRIMARY` |
| `mobile_wallet` | `MOBILE_WALLET` |

---

## 4. Posting wiring (the work)

### 4.1 Web / COD order → GL  *(highest priority)*

**Where:** `sale-order/services/sale-order-state-machine.js` → inside
`executeTransition`, after the order update lands and after the existing stock
walk (same chokepoint that already owns side effects). Gate every post on
`statusChanged` and on `findBySource` idempotency.

**Revenue basis = accrual on delivery** (consistent with POS). Recognize revenue
+ COGS when the order is fulfilled, not when the cart is created.

**On `DELIVERED`** — recognize revenue, tax, shipping, and COGS:

Revenue JE (`source_type: 'Web Order'`, `source_id: order.id`, `source_ref: order.orderId`):

| Account | Debit | Credit | Notes |
|---|---|---|---|
| `1210 COD / Rider Float` *(COD)* **or** `1110/1100/1120` *(prepaid)* | total | | debit account by `payment_method` (§3.3) |
| `4000 Sales Revenue` | | subtotal | |
| `4300 Shipping Revenue` | | delivery_cost | omit if free shipping |
| `2100 Tax Payable` | | tax | if any |

> For **prepaid** orders (card/online/bank/wallet) the cash/bank account is
> debited directly here (payment already settled). For **COD**, debit
> `1210 COD / Rider Float` — the cash is owed-in-hand by the rider until deposited.

COGS JE (same source), mirroring `checkout.js`:

| Account | Debit | Credit |
|---|---|---|
| `5000 COGS` | Σ stock_item.cost_price | |
| `1300 Inventory` | | Σ stock_item.cost_price |

> COGS basis = the `cost_price` of the specific stock-items attached to the order
> lines (`products.items[].stock_item`), which the state machine already
> populates. Walk them the same way `transitionAttachedStockItems` does.

**On COD deposit/verification** — when `payment_verification_status` flips to
`verified` (rider cash banked), settle the float:

| Account | Debit | Credit |
|---|---|---|
| `1000 Cash Drawer` or `1100 Bank` | paid_amount | |
| `1210 COD / Rider Float` | | paid_amount |

> Hook the existing record-payment / verify endpoints. If the business banks COD
> straight to bank, debit `1100`; if it lands in a POS drawer, debit `1000`.

**On `CANCELLED` / `REFUNDED`** — reverse:
`accounting.reverseBySource('Web Order', order.id, { posted_by })`. (Stock restock
is already handled by the state machine; this only reverses the books.) For a
post-delivery return routed through `return-request`, post a Sale-Return-style
reversal keyed to the return document so partial returns are exact.

### 4.2 POS sale-return → GL

**Where:** `sale-return` lifecycle or the return controller, on
`refund_status: 'Refunded'`/`'Credited'`. Follows architecture doc §10.2–10.3
exactly. `source_type: 'Sale Return'`.

Return revenue JE:

| Account | Debit | Credit |
|---|---|---|
| `4100 Sales Returns` | subtotal | |
| `2100 Tax Payable` | tax | |
| refund account (`CASH_DRAWER`/`CARD_CLEARING`/… by `refund_method`) | | total |

COGS reversal (if restocked):

| Account | Debit | Credit |
|---|---|---|
| `1300 Inventory` | cost | |
| `5000 COGS` | | cost |

- **Exchange** (`type: 'Exchange'`): post the return (above) **and** the new sale
  via the existing checkout posting path — two linked source documents.
- **Store credit / exchange-return** refunds credit `2200 Customer Deposits`
  (already seeded) instead of cash. (No dedicated store-credit liability is
  seeded; reuse `2200` or add one if the business wants separation.)

### 4.3 Cash register → GL

POS sales already debit the drawer per-sale (via `checkout.js`), so **do not
double-post** per-sale here. Only the float and reconciliation events post:

| Event | Trigger | JE |
|---|---|---|
| Open | register Open w/ `opening_cash` | Dr `1000 Cash Drawer` / Cr `1010 Cash Safe` (`Cash Register Open`) |
| Cash drop | `cash-register-transaction` `CashDrop` | Dr `1010 Cash Safe` / Cr `1000 Cash Drawer` (`Cash Register Transaction`) |
| Cash top-up | `CashTopUp` | Dr `1000` / Cr `1010` |
| Drawer expense | `Expense` | Dr expense acct / Cr `1000` (`Cash Register Transaction`) |
| Close (balanced) | register Closed | Dr `1010 Cash Safe` / Cr `1000 Cash Drawer` for counted amount |
| Close (short) | `difference < 0` | Dr `1010` (counted) + Dr `6700 Cash Short/Over` (short) / Cr `1000` (expected) |
| Close (over) | `difference > 0` | Dr `1010` (counted) / Cr `1000` (expected) + Cr `6700 Cash Short/Over` (over) |

> The register's `expected_cash`/`counted_cash`/`difference`/`short_cash` are
> already computed by `cash-register/controllers/cash-register.js` — reuse them;
> don't recompute. Refunds during the session post via §4.2, not here.

### 4.4 Purchase → bill auto-generation

`acc-bill` already auto-posts AP on `Draft→Received`. The gap is creating the
bill from a received purchase. Add a **"Generate Bill"** controller action (or a
lifecycle on `purchase` status → `Received`/`Partially Received`) that creates an
`acc-bill` linked to the purchase, with `subtotal`/`tax_amount`/`total` from
received quantities × unit price, then sets it `Received` so the existing lifecycle
posts `Dr 1300 Inventory / Cr 2000 AP`. Purchase returns → `Dr 2000 AP / Cr 1300
Inventory` (`source_type: 'Purchase Return'`).

> Decide: auto-create-on-receipt vs. an explicit accountant action. **Recommend
> explicit action** (supplier invoices often differ from PO totals; the accountant
> reconciles before the bill posts).

---

## 5. Reporting layer

Derived entirely from `acc-journal-line` ⋈ `acc-account` ⋈ `acc-journal-entry`
(no snapshot tables). Implement as a read-only service +
controller/routes/descriptor on `acc-journal-entry` (or a new `acc-report`
pseudo-resource).

| Report | Definition | Params |
|---|---|---|
| **Trial Balance** | per active account: Σdebit, Σcredit over period (Posted only); totals must net to 0 | `from`, `to`, `branch?` |
| **Income Statement (P&L)** | Revenue = Σ(credit−debit) where type=Revenue; COGS = Σ(debit−credit) where sub_type=COGS; Expenses = Σ(debit−credit) where type=Expense & sub_type≠COGS; Net = Rev−COGS−Exp | `from`, `to`, `branch?` |
| **Balance Sheet** | Assets=Σ(debit−credit) type=Asset; Liab=Σ(credit−debit) type=Liability; Equity=Σ(credit−debit) type=Equity (+ period net profit) | `asOf`, `branch?` |
| **Cash Flow** | journal lines touching sub_type Cash/Bank, grouped by `source_type` into Operating/Investing/Financing | `from`, `to`, `branch?` |
| **AR Aging** | open `acc-invoice` (Sent/Partially Paid/Overdue) bucketed by `today − due_date`: 0–30 / 31–60 / 61–90 / 90+ | `asOf` |
| **AP Aging** | same over `acc-bill` | `asOf` |

Suggested endpoints (descriptor methods named with whitelisted verbs):
`/acc-reports/trial-balance`, `/income-statement`, `/balance-sheet`,
`/cash-flow`, `/ar-aging`, `/ap-aging` — all GET, `apps: ['accounts']`,
`approle: ['admin','accountant']`.

---

## 6. Frontend — `rutba-accounts` (:4007)

Two-app topology (privilege wall around payroll): this app holds **accounting
only**; payroll lives in `rutba-payroll`. The shared surface between them is the
ledger — an accountant *sees* payroll's journal entries here (drill-down) but
cannot open the payroll app.

Reuse the standard app shell + `RoleSwitcher` convention. Build money/account/
period components once (shared location) since `rutba-payroll` needs the same.

> **Status (2026-06):** ✅ pages exist in `rutba-accounts/pages/`; ⏳ pages are
> the remaining frontend work.

| Page | Purpose | State |
|---|---|---|
| Dashboard | Cash position, P&L snapshot, AR/AP aging tiles, recent journal entries | ✅ `pages/index.js` |
| Chart of Accounts | Tree view, balances, activate/deactivate (system accounts locked) | ✅ `pages/chart-of-accounts.js` |
| Journal Explorer | Filter by date/source_type/account/branch; drill JE → lines → source document | ✅ `pages/journal-entries.js` |
| Invoices (AR) | List, detail, **record payment**, status workflow | ✅ `pages/invoices.js` |
| Bills (AP) | List, detail, **generate from purchase**, **record payment** | ⏳ open |
| Expenses | Create/approve/post expenses | ✅ `pages/expenses.js` |
| Banking & Registers | Bank/cash accounts, register reconciliation view (expected vs counted, variance) | ⏳ open |
| Tax & Periods | Tax rates; fiscal period open/close/lock | ⏳ open |
| Reports | Trial Balance, P&L, Balance Sheet, Cash Flow, AR/AP Aging — date/branch filters, print/export | ✅ `pages/reports.js` |

Consume existing generated clients (`acc-accounts`, `acc-invoices`,
`acc-bills`/`acc-expenses` once descriptors are fleshed out) + the new report
endpoints. Print via the client-side React + `window.print()` pattern (same as
SaleInvoicePrint).

---

## 7. Suggested phasing

1. **Web/COD order posting** (§4.1) + ledger additions (§3) — completes the
   single biggest revenue gap.
2. **Sale-return + cash-register posting** (§4.2, §4.3) — closes the cash loop.
3. **Reporting layer** (§5) — makes the ledger legible.
4. **`rutba-accounts` frontend** (§6) — ship the module.
5. **Purchase→bill** (§4.4) — payables automation.

Payroll posting into this ledger is specified separately in
[`payroll-module-implementation.md`](./payroll-module-implementation.md).

---

## 8. Open decisions

| # | Decision | Recommended default |
|---|---|---|
| A1 | Web revenue basis: accrual on delivery vs cash on collection | **Accrual on delivery** (matches POS) |
| A2 | Purchase→bill: auto-on-receipt vs explicit accountant action | **Explicit action** (reconcile to supplier invoice first) |
| A3 | Channel revenue separation: reuse `4000` vs add `4001 Web Sales` | **Reuse `4000`**, split via source_type/branch |
| A4 | Store-credit refunds: reuse `2200 Customer Deposits` vs new liability acct | **Reuse `2200`** unless reporting needs the split |
