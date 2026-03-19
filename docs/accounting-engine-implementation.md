# Accounting Engine — Detailed Implementation Guide

## Retail ERP · Strapi v4 · Node.js / MySQL

> Continues from `docs/accounting-architecture.md`. Does not repeat the architecture.
> Focuses on implementation detail: schemas, engine logic, integration code, edge cases.

---

## Table of Contents

- [Section 1 — Chart of Accounts Design](#section-1--chart-of-accounts-design)
- [Section 2 — General Ledger Engine](#section-2--general-ledger-engine)
- [Section 3 — POS Accounting Integration](#section-3--pos-accounting-integration)
- [Section 4 — Inventory Accounting](#section-4--inventory-accounting)
- [Section 5 — Cash Register Accounting](#section-5--cash-register-accounting)
- [Section 6 — Purchase Accounting](#section-6--purchase-accounting)
- [Section 7 — Sales Orders & Web Orders](#section-7--sales-orders--web-orders)
- [Section 8 — Financial Reports](#section-8--financial-reports)
- [Section 9 — Database Schema](#section-9--database-schema)
- [Section 10 — Automation Rules](#section-10--automation-rules)
- [Section 11 — Edge Cases](#section-11--edge-cases)
- [Section 12 — Best Practices](#section-12--best-practices)

---

# Section 1 — Chart of Accounts Design

## 1.1 Account Hierarchy for Retail Clothing

The Chart of Accounts (CoA) uses a **four-level hierarchy** with a numeric block
numbering strategy. The first digit identifies the category, the second digit
identifies the sub-category, and the remaining digits identify the specific
account.

```
Level 0  (Category)    →  1xxx Assets, 2xxx Liabilities, 3xxx Equity, …
Level 1  (Sub-category) →  10xx Cash, 11xx Bank, 12xx Receivable, 13xx Inventory …
Level 2  (Detail)       →  1001 Cash Drawer – Downtown, 1002 Cash Drawer – Mall …
Level 3  (Optional)     →  Used when a branch-specific split is needed under detail
```

### Numbering Blocks

| Range | Category | Purpose |
|-------|----------|---------|
| **1000–1999** | **Assets** | Everything the business owns |
| 1000–1099 | Cash | Physical cash — safes, drawers |
| 1100–1199 | Bank | Checking, savings, card settlement, Stripe |
| 1200–1299 | Receivables | Accounts receivable, employee advances |
| 1300–1399 | Inventory | Merchandise, goods in transit, consignment |
| 1400–1499 | Other Current | Tax receivable, prepaid expenses, deposits |
| 1500–1599 | Fixed Assets | Fixtures, equipment, vehicles |
| 1600–1699 | Accumulated Depreciation | Contra-assets for fixed assets |
| **2000–2999** | **Liabilities** | Everything the business owes |
| 2000–2099 | Accounts Payable | Supplier obligations |
| 2100–2199 | Tax Payable | Sales tax, VAT, income tax withholding |
| 2200–2299 | Accrued Liabilities | Wages payable, accrued rent |
| 2300–2399 | Deferred Revenue | Gift cards, store credits, customer deposits |
| 2400–2499 | Customer Credits | Store credit balances from returns |
| 2500–2599 | Long-Term Liabilities | Loans, leases |
| **3000–3999** | **Equity** | Owner's investment and retained earnings |
| 3000–3099 | Owner Equity | Capital contributions |
| 3100–3199 | Retained Earnings | Accumulated profits |
| 3200–3299 | Drawings | Owner withdrawals |
| **4000–4999** | **Revenue** | Income from operations |
| 4000–4099 | Sales Revenue | Product sales — POS and web |
| 4100–4199 | Sales Returns & Allowances | Contra-revenue for returns |
| 4200–4299 | Discounts Given | Contra-revenue for discounts |
| 4300–4399 | Other Revenue | Cash over, FX gain, misc income |
| 4400–4499 | Shipping Revenue | Shipping charged on web orders |
| **5000–5999** | **Cost of Goods Sold** | Direct cost of merchandise sold |
| 5000–5099 | COGS — General | Standard COGS |
| 5100–5199 | Inventory Write-Off | Damaged, lost, expired |
| 5200–5299 | Inventory Adjustment | Count corrections |
| 5300–5399 | Freight In | Inbound shipping on purchases |
| **6000–6999** | **Operating Expenses** | Running the business |
| 6000–6099 | Rent & Occupancy | Store rent, common area maintenance |
| 6100–6199 | Payroll | Salaries, wages, benefits |
| 6200–6299 | Utilities | Electric, water, internet |
| 6300–6399 | Marketing & Advertising | Ads, sponsorships |
| 6400–6499 | Office & Supplies | Office supplies, POS paper |
| 6500–6599 | Depreciation | Monthly depreciation expense |
| 6600–6699 | Bank & Payment Fees | Card processing fees, Stripe fees |
| 6700–6799 | Cash Short/Over | Register discrepancies |
| 6800–6899 | Insurance | Business insurance |
| 6900–6999 | Miscellaneous | Catch-all for uncategorised expenses |
| **7000–7999** | **Other Expense** | Non-operational expenses |
| 7000–7099 | Interest Expense | Loan interest |
| 7100–7199 | FX Loss | Foreign exchange losses |

## 1.2 Full Retail Clothing Chart of Accounts

```
Code  | Name                              | Type      | Sub Type                | Normal  | System
──────|───────────────────────────────────|───────────|─────────────────────────|─────────|───────
1000  | Cash Safe                         | Asset     | Cash                    | Debit   | Yes
1001  | Cash Drawer                       | Asset     | Cash                    | Debit   | Yes
1002  | Petty Cash                        | Asset     | Cash                    | Debit   | Yes
1100  | Primary Bank Account              | Asset     | Bank                    | Debit   | Yes
1101  | Card Settlement Account           | Asset     | Bank                    | Debit   | Yes
1102  | Stripe Settlement Account         | Asset     | Bank                    | Debit   | Yes
1103  | Mobile Wallet Account             | Asset     | Bank                    | Debit   | Yes
1200  | Accounts Receivable               | Asset     | Accounts Receivable     | Debit   | Yes
1201  | Employee Advances                 | Asset     | Other Current Asset     | Debit   | No
1300  | Inventory — Merchandise           | Asset     | Inventory               | Debit   | Yes
1301  | Inventory — In Transit            | Asset     | Inventory               | Debit   | Yes
1302  | Inventory — Consignment           | Asset     | Inventory               | Debit   | No
1400  | Purchase Tax Receivable (Input VAT)| Asset    | Other Current Asset     | Debit   | Yes
1401  | Prepaid Expenses                  | Asset     | Other Current Asset     | Debit   | No
1500  | Store Fixtures & Fittings         | Asset     | Fixed Asset             | Debit   | No
1501  | POS Hardware & Equipment          | Asset     | Fixed Asset             | Debit   | No
1600  | Accumulated Depreciation          | Asset     | Fixed Asset             | Credit  | No
──────|───────────────────────────────────|───────────|─────────────────────────|─────────|───────
2000  | Accounts Payable                  | Liability | Accounts Payable        | Credit  | Yes
2100  | Sales Tax Payable (Output VAT)    | Liability | Tax Payable             | Credit  | Yes
2101  | Withholding Tax Payable           | Liability | Tax Payable             | Credit  | No
2200  | Wages & Salaries Payable          | Liability | Other Current Liability | Credit  | No
2201  | Accrued Rent                      | Liability | Other Current Liability | Credit  | No
2300  | Deferred Revenue — Gift Cards     | Liability | Other Current Liability | Credit  | Yes
2301  | Deferred Revenue — Deposits       | Liability | Other Current Liability | Credit  | No
2400  | Customer Store Credits            | Liability | Other Current Liability | Credit  | Yes
2500  | Bank Loan                         | Liability | Long Term Liability     | Credit  | No
──────|───────────────────────────────────|───────────|─────────────────────────|─────────|───────
3000  | Owner's Equity / Share Capital    | Equity    | Owner Equity            | Credit  | Yes
3100  | Retained Earnings                 | Equity    | Retained Earnings       | Credit  | Yes
3200  | Owner Drawings                    | Equity    | Owner Equity            | Debit   | No
──────|───────────────────────────────────|───────────|─────────────────────────|─────────|───────
4000  | Sales Revenue                     | Revenue   | Sales Revenue           | Credit  | Yes
4001  | Web Sales Revenue                 | Revenue   | Sales Revenue           | Credit  | Yes
4100  | Sales Returns & Allowances        | Revenue   | Sales Returns           | Credit  | Yes
4200  | Sales Discounts                   | Revenue   | Sales Returns           | Credit  | Yes
4300  | Cash Over                         | Revenue   | Other Revenue           | Credit  | Yes
4301  | Inventory Adjustment Gain         | Revenue   | Other Revenue           | Credit  | Yes
4400  | Shipping Revenue                  | Revenue   | Other Revenue           | Credit  | No
4500  | Exchange Rate Gain                | Revenue   | Other Revenue           | Credit  | Yes
──────|───────────────────────────────────|───────────|─────────────────────────|─────────|───────
5000  | Cost of Goods Sold                | Expense   | Cost of Goods Sold      | Debit   | Yes
5100  | Inventory Write-Off               | Expense   | Cost of Goods Sold      | Debit   | Yes
5200  | Inventory Shrinkage               | Expense   | Cost of Goods Sold      | Debit   | Yes
5300  | Freight In / Shipping Cost        | Expense   | Cost of Goods Sold      | Debit   | Yes
──────|───────────────────────────────────|───────────|─────────────────────────|─────────|───────
6000  | Rent Expense                      | Expense   | Operating Expense       | Debit   | No
6100  | Payroll Expense                   | Expense   | Payroll Expense         | Debit   | No
6200  | Utilities Expense                 | Expense   | Operating Expense       | Debit   | No
6300  | Marketing Expense                 | Expense   | Operating Expense       | Debit   | No
6400  | Office Supplies                   | Expense   | Operating Expense       | Debit   | No
6500  | Depreciation Expense              | Expense   | Operating Expense       | Debit   | No
6600  | Card Processing Fees              | Expense   | Operating Expense       | Debit   | Yes
6601  | Stripe Fees                       | Expense   | Operating Expense       | Debit   | Yes
6700  | Cash Short                        | Expense   | Operating Expense       | Debit   | Yes
6800  | Insurance Expense                 | Expense   | Operating Expense       | Debit   | No
6900  | Miscellaneous Expense             | Expense   | Operating Expense       | Debit   | No
──────|───────────────────────────────────|───────────|─────────────────────────|─────────|───────
7000  | Interest Expense                  | Expense   | Other Expense           | Debit   | No
7100  | Exchange Rate Loss                | Expense   | Other Expense           | Debit   | Yes
```

## 1.3 Default ERP Account Mappings

The system stores a mapping table that the accounting engine uses to resolve
which ledger account to post to for each operational event. This avoids
hard-coding account codes in business logic.

```
Mapping Key                    → Default Account Code  → Purpose
──────────────────────────────────────────────────────────────────
CASH_SAFE                      → 1000                  → Cash moved to/from safe
CASH_DRAWER                    → 1001                  → POS register cash
PETTY_CASH                     → 1002                  → Petty cash fund
BANK_PRIMARY                   → 1100                  → Main bank account
BANK_CARD_SETTLEMENT           → 1101                  → Card processor settlement
BANK_STRIPE                    → 1102                  → Stripe settlement
BANK_MOBILE_WALLET             → 1103                  → Mobile wallet (JazzCash etc.)
ACCOUNTS_RECEIVABLE            → 1200                  → Customer credit balances
INVENTORY                      → 1300                  → Merchandise on hand
INVENTORY_IN_TRANSIT           → 1301                  → Goods shipped not yet received
PURCHASE_TAX_RECEIVABLE        → 1400                  → Input VAT / purchase tax
ACCOUNTS_PAYABLE               → 2000                  → Supplier obligations
SALES_TAX_PAYABLE              → 2100                  → Output VAT / sales tax
GIFT_CARD_LIABILITY            → 2300                  → Unredeemed gift cards
CUSTOMER_STORE_CREDIT          → 2400                  → Store credit balances
RETAINED_EARNINGS              → 3100                  → Year-end close target
SALES_REVENUE                  → 4000                  → POS product revenue
WEB_SALES_REVENUE              → 4001                  → Web/e-commerce revenue
SALES_RETURNS                  → 4100                  → Returns contra-revenue
SALES_DISCOUNTS                → 4200                  → Line/order discounts
CASH_OVER                      → 4300                  → Register over
INVENTORY_GAIN                 → 4301                  → Count surplus
SHIPPING_REVENUE               → 4400                  → Shipping charged to customer
FX_GAIN                        → 4500                  → Exchange rate gain
COGS                           → 5000                  → Cost of goods sold
INVENTORY_WRITEOFF             → 5100                  → Damaged / expired
INVENTORY_SHRINKAGE            → 5200                  → Theft / unexplained loss
FREIGHT_IN                     → 5300                  → Inbound shipping
CARD_PROCESSING_FEE            → 6600                  → Visa/MC processing fees
STRIPE_FEE                     → 6601                  → Stripe platform fees
CASH_SHORT                     → 6700                  → Register short
FX_LOSS                        → 7100                  → Exchange rate loss
```

### Implementation: `acc-account-mapping` entity

```jsonc
// src/api/acc-account-mapping/content-types/acc-account-mapping/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_account_mappings",
  "info": {
    "singularName": "acc-account-mapping",
    "pluralName": "acc-account-mappings",
    "displayName": "Account Mapping",
    "description": "Maps operational events to ledger accounts"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "key": {
      "type": "string",
      "required": true,
      "unique": true
    },
    "account": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::acc-account.acc-account"
    },
    "description": { "type": "string" },
    "branch": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::branch.branch"
    }
  }
}
```

### Account Resolution Logic

```javascript
// src/api/acc-journal-entry/services/account-resolver.js
'use strict';

/**
 * Resolves a mapping key to an account ID.
 *
 * Resolution order:
 *   1. Branch-specific mapping  (key + branch_id match)
 *   2. Global mapping           (key match, branch = null)
 *   3. Throw — configuration error
 */
module.exports = {
  async resolve(key, branchId = null) {
    // Try branch-specific first
    if (branchId) {
      const branchMapping = await strapi.db
        .query('api::acc-account-mapping.acc-account-mapping')
        .findOne({
          where: { key, branch: branchId },
          populate: ['account'],
        });
      if (branchMapping?.account) return branchMapping.account;
    }

    // Fall back to global
    const globalMapping = await strapi.db
      .query('api::acc-account-mapping.acc-account-mapping')
      .findOne({
        where: { key, branch: null },
        populate: ['account'],
      });
    if (globalMapping?.account) return globalMapping.account;

    throw new Error(
      `Account mapping not found for key="${key}" branch=${branchId || 'global'}`
    );
  },

  /**
   * Resolve the payment-method to an account.
   * Maps the payment.payment_method enum to a mapping key.
   */
  async resolvePaymentMethod(method, branchId = null) {
    const methodKeyMap = {
      Cash:             'CASH_DRAWER',
      Card:             'BANK_CARD_SETTLEMENT',
      Bank:             'BANK_PRIMARY',
      'Mobile Wallet':  'BANK_MOBILE_WALLET',
      'Exchange Return': 'SALES_RETURNS',       // net zero — handled by return JE
    };
    const key = methodKeyMap[method] || 'CASH_DRAWER';
    return this.resolve(key, branchId);
  },
};
```

## 1.4 Account Schema (Final Strapi Content Type)

Already defined in the architecture document. Key points for implementation:

- **`code`**: string, unique, required — the numbering scheme above
- **`parent`**: self-referencing manyToOne — enables tree queries for reports
- **`balance`**: running total — updated ONLY by the accounting service after posting
- **`is_system`**: boolean — seeded accounts cannot be deleted or deactivated
- **`branch`**: nullable manyToOne to `branch` — null means company-wide

When creating a new branch, the system automatically creates branch-specific
copies of certain accounts (Cash Drawer, Inventory) with the branch relation set.

---

# Section 2 — General Ledger Engine

## 2.1 Core Tables

The ledger is composed of five interrelated tables. Their Strapi content type
schemas are defined in the architecture doc. This section explains the
**MySQL physical schema** that Strapi generates, with added indexes and
constraints.

### Table: `acc_accounts` (Chart of Accounts)

```sql
CREATE TABLE acc_accounts (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  document_id     VARCHAR(255) UNIQUE,        -- Strapi v5 document ID
  code            VARCHAR(20)  NOT NULL UNIQUE,
  name            VARCHAR(255) NOT NULL,
  account_type    VARCHAR(20)  NOT NULL,       -- Asset|Liability|Equity|Revenue|Expense
  sub_type        VARCHAR(40),
  normal_balance  VARCHAR(10)  NOT NULL,       -- Debit|Credit
  balance         DECIMAL(18,4) DEFAULT 0,     -- running balance
  description     TEXT,
  is_system       TINYINT(1) DEFAULT 0,
  is_active       TINYINT(1) DEFAULT 1,
  parent_id       INT,
  currency_id     INT,
  branch_id       INT,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by_id   INT,
  updated_by_id   INT,
  FOREIGN KEY (parent_id)   REFERENCES acc_accounts(id),
  FOREIGN KEY (currency_id) REFERENCES currencies(id),
  FOREIGN KEY (branch_id)   REFERENCES branches(id)
);

CREATE INDEX idx_acc_accounts_type      ON acc_accounts(account_type);
CREATE INDEX idx_acc_accounts_sub_type  ON acc_accounts(sub_type);
CREATE INDEX idx_acc_accounts_branch    ON acc_accounts(branch_id);
CREATE INDEX idx_acc_accounts_parent    ON acc_accounts(parent_id);
CREATE INDEX idx_acc_accounts_active    ON acc_accounts(is_active);
```

### Table: `acc_journal_entries` (Header)

```sql
CREATE TABLE acc_journal_entries (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  document_id     VARCHAR(255) UNIQUE,
  entry_number    VARCHAR(30)  NOT NULL UNIQUE,
  date            DATE         NOT NULL,
  description     TEXT,
  reference       VARCHAR(255),

  source_type     VARCHAR(40),                 -- POS Sale, Sale Return, etc.
  source_id       INT,                         -- ID of source entity
  source_ref      VARCHAR(255),                -- Human-readable ref

  status          VARCHAR(20)  DEFAULT 'Draft', -- Draft|Posted|Reversed
  total_debit     DECIMAL(18,4) DEFAULT 0,
  total_credit    DECIMAL(18,4) DEFAULT 0,

  reversal_of_id  INT,
  fiscal_period_id INT,
  branch_id       INT,
  currency_id     INT,
  exchange_rate   DECIMAL(18,8) DEFAULT 1,

  posted_by       VARCHAR(255),
  posted_at       DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by_id   INT,
  updated_by_id   INT,
  FOREIGN KEY (reversal_of_id)  REFERENCES acc_journal_entries(id),
  FOREIGN KEY (fiscal_period_id) REFERENCES acc_fiscal_periods(id),
  FOREIGN KEY (branch_id)       REFERENCES branches(id),
  FOREIGN KEY (currency_id)     REFERENCES currencies(id)
);

CREATE INDEX idx_je_date        ON acc_journal_entries(date);
CREATE INDEX idx_je_status      ON acc_journal_entries(status);
CREATE INDEX idx_je_source      ON acc_journal_entries(source_type, source_id);
CREATE INDEX idx_je_branch      ON acc_journal_entries(branch_id);
CREATE INDEX idx_je_period      ON acc_journal_entries(fiscal_period_id);
CREATE INDEX idx_je_entry_num   ON acc_journal_entries(entry_number);
```

### Table: `acc_journal_lines` (Detail Lines)

```sql
CREATE TABLE acc_journal_lines (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  document_id     VARCHAR(255) UNIQUE,
  journal_entry_id INT NOT NULL,
  account_id      INT NOT NULL,
  debit           DECIMAL(18,4) DEFAULT 0,
  credit          DECIMAL(18,4) DEFAULT 0,
  description     VARCHAR(500),
  tax_rate        DECIMAL(8,4),
  tax_amount      DECIMAL(18,4),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (journal_entry_id) REFERENCES acc_journal_entries(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id)       REFERENCES acc_accounts(id),
  -- MySQL 8.0.16+ supports CHECK constraints
  CONSTRAINT chk_one_sided CHECK (
    (debit > 0 AND credit = 0) OR
    (debit = 0 AND credit > 0)
  )
);

CREATE INDEX idx_jl_entry   ON acc_journal_lines(journal_entry_id);
CREATE INDEX idx_jl_account ON acc_journal_lines(account_id);
```

### Table: `acc_fiscal_periods`

```sql
CREATE TABLE acc_fiscal_periods (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  document_id VARCHAR(255) UNIQUE,
  name        VARCHAR(100) NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  status      VARCHAR(20) DEFAULT 'Open',    -- Open|Closed|Locked
  fiscal_year VARCHAR(10),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- MySQL 8.0.16+ supports CHECK constraints
  CONSTRAINT chk_date_range CHECK (end_date >= start_date)
);

CREATE UNIQUE INDEX idx_fp_no_overlap
  ON acc_fiscal_periods(start_date, end_date);
```

### Table: `acc_account_balances` (Period Snapshots)

This is a **new table** not in the architecture doc. It stores per-account
per-period balance snapshots for fast reporting without re-aggregating every
journal line.

```sql
CREATE TABLE acc_account_balances (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  account_id      INT NOT NULL,
  fiscal_period_id INT NOT NULL,
  branch_id       INT,
  opening_balance DECIMAL(18,4) DEFAULT 0,
  period_debit    DECIMAL(18,4) DEFAULT 0,
  period_credit   DECIMAL(18,4) DEFAULT 0,
  closing_balance DECIMAL(18,4) DEFAULT 0,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  UNIQUE KEY uq_account_period_branch (account_id, fiscal_period_id, branch_id),
  FOREIGN KEY (account_id)       REFERENCES acc_accounts(id),
  FOREIGN KEY (fiscal_period_id) REFERENCES acc_fiscal_periods(id),
  FOREIGN KEY (branch_id)        REFERENCES branches(id)
);

CREATE INDEX idx_ab_account ON acc_account_balances(account_id);
CREATE INDEX idx_ab_period  ON acc_account_balances(fiscal_period_id);
CREATE INDEX idx_ab_branch  ON acc_account_balances(branch_id);
```

## 2.2 Balanced Entry Guarantee

The engine guarantees balance through **three layers**:

### Layer 1 — Service Validation (Application)

```javascript
// Inside accounting.createAndPost()
const totalDebit  = lines.reduce((s, l) => s + round4(l.debit  || 0), 0);
const totalCredit = lines.reduce((s, l) => s + round4(l.credit || 0), 0);

// Use epsilon comparison for floating-point safety
if (Math.abs(totalDebit - totalCredit) > 0.0001) {
  throw new Error(`Unbalanced: Dr ${totalDebit} ≠ Cr ${totalCredit}`);
}
```

### Layer 2 — Database Trigger (MySQL)

```sql
DELIMITER //

CREATE TRIGGER trg_check_journal_balance
  BEFORE UPDATE ON acc_journal_entries
  FOR EACH ROW
BEGIN
  DECLARE total_dr DECIMAL(18,4);
  DECLARE total_cr DECIMAL(18,4);

  -- Only check when the entry moves to 'Posted'
  IF NEW.status = 'Posted' AND (OLD.status IS NULL OR OLD.status != 'Posted') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO total_dr, total_cr
      FROM acc_journal_lines
      WHERE journal_entry_id = NEW.id;

    IF ABS(total_dr - total_cr) > 0.0001 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Journal entry is not balanced';
    END IF;

    IF total_dr = 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Journal entry has no lines';
    END IF;
  END IF;
END //

DELIMITER ;
```

### Layer 3 — Reconciliation Query (Audit)

Run periodically to verify the ledger is intact:

```sql
-- All posted entries must be balanced
SELECT je.id, je.entry_number,
       SUM(jl.debit) AS total_dr,
       SUM(jl.credit) AS total_cr,
       SUM(jl.debit) - SUM(jl.credit) AS diff
  FROM acc_journal_entries je
  JOIN acc_journal_lines jl ON jl.journal_entry_id = je.id
 WHERE je.status = 'Posted'
 GROUP BY je.id, je.entry_number
HAVING ABS(SUM(jl.debit) - SUM(jl.credit)) > 0.0001;
-- Expected: zero rows
```

## 2.3 Source Document Linking

Every journal entry carries three fields that create an unbreakable audit chain:

| Field | Purpose | Example |
|-------|---------|---------|
| `source_type` | Which module created it | `"POS Sale"` |
| `source_id` | The Strapi entity ID | `4527` |
| `source_ref` | Human-readable reference | `"INV-2025-003841"` |

**Bi-directional navigation**:
- **Forward**: From a sale → find its journal entries by querying `WHERE source_type = 'POS Sale' AND source_id = 4527`
- **Backward**: From a journal entry → load the source document using `source_type` to determine which Strapi API to query

```javascript
// Helper to load the source document from a journal entry
async function loadSourceDocument(entry) {
  const typeToApi = {
    'POS Sale':                  'api::sale.sale',
    'Sale Return':               'api::sale-return.sale-return',
    'Purchase Receipt':          'api::purchase.purchase',
    'Purchase Return':           'api::purchase-return.purchase-return',
    'Web Order':                 'api::order.order',
    'Cash Register Open':        'api::cash-register.cash-register',
    'Cash Register Close':       'api::cash-register.cash-register',
    'Cash Register Transaction': 'api::cash-register-transaction.cash-register-transaction',
    'Expense':                   'api::acc-expense.acc-expense',
    'Invoice Payment':           'api::acc-invoice.acc-invoice',
    'Bill Payment':              'api::acc-bill.acc-bill',
  };
  const api = typeToApi[entry.source_type];
  if (!api || !entry.source_id) return null;
  return strapi.entityService.findOne(api, entry.source_id);
}
```

## 2.4 Multi-Branch Ledger

Journal entries and accounts both carry an optional `branch_id`.

**Posting rules**:
- When an operational event happens at Branch A, the journal entry gets `branch_id = A`.
- The account resolver first looks for a branch-specific account (e.g., "Cash Drawer – Branch A"), then falls back to the global account.
- Consolidated reports sum across all branches. Branch P&L reports filter by `journal_entry.branch_id`.

**Inter-branch transfers** (e.g., stock transfer from Branch A → Branch B) create two journal entries:
1. At Branch A: Credit Inventory-A
2. At Branch B: Debit Inventory-B
Both entries reference each other via the `reference` field.

## 2.5 Multi-Currency

All `acc_journal_lines.debit` and `acc_journal_lines.credit` values are stored
in the **base currency**. The conversion happens at entry creation time.

```javascript
// In the accounting service, before creating lines:
for (const line of lines) {
  line.debit  = round4(Number(line.debit  || 0) * exchangeRate);
  line.credit = round4(Number(line.credit || 0) * exchangeRate);
}
```

The header stores:
- `currency_id` — the transaction's original currency
- `exchange_rate` — the rate used (foreign → base)

**Realised FX gain/loss** is recorded when a foreign-currency invoice/bill is
settled at a different rate than when it was created. The difference is posted to
4500 (FX Gain) or 7100 (FX Loss).

## 2.6 Period Locking

```javascript
// In the accounting service, before posting:
async findOpenPeriod(date) {
  const periods = await strapi.entityService.findMany(
    'api::acc-fiscal-period.acc-fiscal-period',
    {
      filters: {
        status: 'Open',
        start_date: { $lte: date },
        end_date:   { $gte: date },
      },
      limit: 1,
    }
  );
  if (!periods.length) {
    throw new Error(`No open fiscal period for ${date}. Cannot post.`);
  }
  return periods[0];
}
```

**Period lifecycle**:
1. **Open** — Entries can be posted and reversed.
2. **Closed** — No new posts. A Closed period can be re-opened by an admin if needed (e.g., late adjustment).
3. **Locked** — Permanent. No changes possible. Applied after external audit.

**Year-End Close** procedure:
1. For every Revenue and Expense account, calculate net balance for the fiscal year.
2. Create a closing journal entry that zeroes each Revenue/Expense account and posts the net to Retained Earnings (3100).
3. Close all periods for the year.
4. Create opening balance entries for the new year (carrying forward Asset, Liability, Equity balances).

---

# Section 3 — POS Accounting Integration

Every POS scenario below uses **perpetual inventory accounting**: COGS is
recorded at the time of sale, not at period end.

The accounting service is called from the `checkout.js` controller (for sales)
and from sale-return lifecycle hooks (for returns).

## 3.1 Normal Cash Sale

**Scenario**: Customer buys a shirt for 2,000. No discount, no tax. Pays cash.
Shirt cost price = 1,200.

**Revenue Entry** (JE-1):

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1001 Cash Drawer | 2,000 | | Cash received |
| 2 | 4000 Sales Revenue | | 2,000 | Shirt sale |

**COGS Entry** (JE-2):

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 5000 COGS | 1,200 | | Cost of shirt sold |
| 2 | 1300 Inventory | | 1,200 | Reduce stock value |

**Why two separate journal entries?** Because revenue recognition and inventory
movement are two distinct accounting events. They share the same `source_type`
and `source_id` but have different `entry_number`s. This makes it easier to
reverse one without the other in edge cases.

## 3.2 Sale with Discount

**Scenario**: Sale total before discount = 5,000. Line discount = 500.
Customer pays 4,500 cash. Tax = 0. COGS = 3,000.

**Revenue Entry**:

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1001 Cash Drawer | 4,500 | | Cash received |
| 2 | 4200 Sales Discounts | 500 | | Line discount given |
| 3 | 4000 Sales Revenue | | 5,000 | Gross sale |

**COGS Entry**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5000 COGS | 3,000 | |
| 2 | 1300 Inventory | | 3,000 |

> **Note**: Sales Discounts (4200) is a **contra-revenue** account. It has a
> normal Debit balance (it reduces revenue). It is debited when a discount is
> given.

### Alternative: Net Method

If the business prefers to record revenue net of discount:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1001 Cash Drawer | 4,500 | |
| 2 | 4000 Sales Revenue | | 4,500 |

The net method is simpler but loses visibility into discount amounts on the P&L.
**Recommendation**: Use the gross method with contra-revenue for better analytics.

## 3.3 Sale with Tax

**Scenario**: Sale subtotal = 10,000. Tax rate = 5% (exclusive). Tax = 500.
Total = 10,500. Paid by card. COGS = 6,000.

**Revenue Entry**:

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1101 Card Settlement | 10,500 | | Card payment |
| 2 | 4000 Sales Revenue | | 10,000 | Net sale |
| 3 | 2100 Sales Tax Payable | | 500 | Tax collected for govt |

**COGS Entry**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5000 COGS | 6,000 | |
| 2 | 1300 Inventory | | 6,000 |

### Tax Calculation in Code

```javascript
// src/api/acc-journal-entry/services/tax-calculator.js
'use strict';

module.exports = {
  /**
   * Calculate tax for a line amount.
   * @param {number} amount    — line total (before or after tax)
   * @param {number} rate      — tax rate as percentage (e.g., 5 for 5%)
   * @param {string} type      — "Exclusive" or "Inclusive"
   * @returns {{ net: number, tax: number, gross: number }}
   */
  calculate(amount, rate, type = 'Exclusive') {
    amount = Number(amount);
    rate   = Number(rate);

    if (!rate || rate === 0) {
      return { net: amount, tax: 0, gross: amount };
    }

    if (type === 'Inclusive') {
      // Price already includes tax
      const net = round4(amount / (1 + rate / 100));
      const tax = round4(amount - net);
      return { net, tax, gross: amount };
    }

    // Exclusive — tax is added on top
    const tax   = round4(amount * rate / 100);
    const gross = round4(amount + tax);
    return { net: amount, tax, gross };
  },
};

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
```

## 3.4 Mixed Payment (Cash + Card)

**Scenario**: Total = 8,000. Customer pays 3,000 cash + 5,000 card.
No tax, no discount. COGS = 4,800.

**Revenue Entry**:

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1001 Cash Drawer | 3,000 | | Cash portion |
| 2 | 1101 Card Settlement | 5,000 | | Card portion |
| 3 | 4000 Sales Revenue | | 8,000 | Total sale |

**COGS Entry**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5000 COGS | 4,800 | |
| 2 | 1300 Inventory | | 4,800 |

### Building Lines from Payments Array

```javascript
// The checkout controller already has the payments array.
// Each payment becomes one debit line.

async function buildPaymentDebitLines(payments, branchId) {
  const resolver = strapi.service('api::acc-journal-entry.account-resolver');
  const lines = [];

  for (const p of payments) {
    const amount = Number(p.amount || 0);
    if (amount === 0) continue;

    const account = await resolver.resolvePaymentMethod(p.payment_method, branchId);
    lines.push({
      account_id:  account.id,
      debit:       amount,
      credit:      0,
      description: `${p.payment_method} payment`,
    });
  }
  return lines;
}
```

## 3.5 Sales Return with Cash Refund

**Scenario**: Original sale was 3,000 (no tax). Customer returns all items.
Refund via cash. Original COGS = 1,800. Items returned to stock.

**Return Revenue Entry**:

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 4100 Sales Returns | 3,000 | | Contra-revenue |
| 2 | 1001 Cash Drawer | | 3,000 | Cash refunded |

**COGS Reversal Entry**:

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1300 Inventory | 1,800 | | Stock returned to shelf |
| 2 | 5000 COGS | | 1,800 | Reverse COGS |

### With Tax

If original sale had tax of 150 (5% on 3,000):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 4100 Sales Returns | 3,000 | |
| 2 | 2100 Sales Tax Payable | 150 | |
| 3 | 1001 Cash Drawer | | 3,150 |

## 3.6 Sales Return with Store Credit

**Scenario**: Same as above, but refund is issued as store credit instead of cash.

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 4100 Sales Returns | 3,000 | | Contra-revenue |
| 2 | 2400 Customer Store Credits | | 3,000 | Credit owed to customer |

> Store credits (2400) is a **liability** — the business owes the customer.
> When the customer uses the store credit on a future purchase, the liability is
> reduced.

**When customer redeems store credit on a new sale**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2400 Customer Store Credits | 3,000 | |
| 2 | 4000 Sales Revenue | | 3,000 |

## 3.7 Product Exchange

**Scenario**: Customer returns Shirt A (price 2,000, cost 1,200) and takes
Shirt B (price 2,500, cost 1,500). Pays the 500 difference in cash.

This is modelled as two operations in the system:
1. A `sale-return` with `type: "Exchange"` for Shirt A
2. A new `sale` linked via `exchange_sale` for Shirt B

**Journal entries** (4 total):

**JE-1: Return of Shirt A (revenue side)**

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 4100 Sales Returns | 2,000 | |
| 2 | 2400 Customer Store Credits | | 2,000 |

**JE-2: Return of Shirt A (COGS reversal)**

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1300 Inventory | 1,200 | |
| 2 | 5000 COGS | | 1,200 |

**JE-3: Sale of Shirt B (revenue side)**

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2400 Customer Store Credits | 2,000 | | Exchange credit used |
| 2 | 1001 Cash Drawer | 500 | | Difference paid in cash |
| 3 | 4000 Sales Revenue | | 2,500 | |

**JE-4: Sale of Shirt B (COGS)**

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5000 COGS | 1,500 | |
| 2 | 1300 Inventory | | 1,500 |

## 3.8 Gift Card Redemption

Gift cards are a **deferred revenue liability**. When sold, no revenue is
recognised — only when redeemed.

**Gift card purchase by customer (customer buys a gift card for 5,000)**:

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1001 Cash Drawer | 5,000 | | Cash received |
| 2 | 2300 Deferred Revenue — Gift Cards | | 5,000 | Liability until redeemed |

**Gift card redemption (customer uses 5,000 gift card to buy goods)**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2300 Deferred Revenue — Gift Cards | 5,000 | |
| 2 | 4000 Sales Revenue | | 5,000 |

**Partial redemption**: Same pattern, just for the partial amount. The remaining
balance stays in 2300.

## 3.9 Loyalty Points Redemption

Loyalty points represent a **deferred revenue obligation**. When a customer
earns points, the business sets aside a portion of revenue. When redeemed, that
deferred amount is recognised.

**When points are earned (on a 10,000 sale, 2% accrual = 200 points value)**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 4000 Sales Revenue | 200 | | Reduce current revenue |
| 2 | 2300 Deferred Revenue — Loyalty | | 200 | Set aside for future redemption |

> This is recorded as part of the sale journal entry with an extra line pair.

**When points are redeemed (customer uses 200 worth of points)**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2300 Deferred Revenue — Loyalty | 200 | | Reduce liability |
| 2 | 4000 Sales Revenue | | 200 | Recognise revenue |

> From an accounting perspective, loyalty redemption is a **payment method**.
> The debit line replaces a cash/card debit line in the sale journal entry.

## 3.10 COGS — Automatic Recording (Perpetual Method)

Under perpetual inventory, COGS is recorded **at the moment of sale**, not at
period end. This is critical for real-time P&L accuracy.

### COGS Calculation

```javascript
/**
 * Calculate total COGS for a sale by summing cost_price of all
 * stock items attached to sale items.
 *
 * @param {object} sale — sale entity with items → items (stock items) populated
 * @returns {number} totalCost
 */
function calculateSaleCOGS(sale) {
  let totalCost = 0;
  for (const saleItem of (sale.items || [])) {
    for (const stockItem of (saleItem.items || [])) {
      totalCost += Number(stockItem.cost_price || 0);
    }
  }
  return totalCost;
}
```

**Why use stock_item.cost_price instead of product.cost_price?**

Because each stock item may have been purchased at a different price (different
purchase orders, different exchange rates). Using `stock_item.cost_price`
provides **actual cost** traceability per unit, which is essential for accurate
COGS and supports both FIFO and weighted average valuation.

---

# Section 4 — Inventory Accounting

## 4.1 Perpetual vs Periodic

This system uses **perpetual inventory accounting**:

| Event | Perpetual (our system) | Periodic (not used) |
|-------|----------------------|-------------------|
| Purchase received | Dr Inventory, Cr AP | Dr Purchases, Cr AP |
| Sale | Dr COGS, Cr Inventory | No entry |
| Period end | No entry needed | Dr COGS, Cr Inventory (count-based) |

Perpetual gives real-time inventory valuation and COGS on every transaction.

## 4.2 Inventory Purchases (Goods Receipt)

**Trigger**: Purchase status changes to "Received" or "Partially Received"

The COGS basis is set at this moment — each `stock_item.cost_price` is set
from the `purchase_item.unit_price`.

**Journal Entry** (source_type: "Purchase Receipt"):

| # | Account | Debit | Credit | Calculation |
|---|---------|-------|--------|-------------|
| 1 | 1300 Inventory | 25,000 | | SUM(unit_price × received_qty) |
| 2 | 2000 Accounts Payable | | 25,000 | Amount owed to supplier |

**If the purchase includes tax (e.g., 5% input VAT)**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1300 Inventory | 25,000 | |
| 2 | 1400 Purchase Tax Receivable | 1,250 | |
| 3 | 2000 Accounts Payable | | 26,250 |

**Goods In Transit**: If using a two-step receipt (shipped → received), the
first step debits 1301 (In Transit) and credits AP. The second step transfers
from 1301 to 1300.

## 4.3 Purchase Returns

**Trigger**: `purchase-return` created

**Journal Entry** (source_type: "Purchase Return"):

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 2000 Accounts Payable | 3,000 | | Reduce what we owe |
| 2 | 1300 Inventory | | 3,000 | Remove returned stock value |

The stock items associated with the return have their `status` changed to
`ReturnedToSupplier` and their `cost_price` is used for the journal amount.

## 4.4 Inventory Adjustments

### Damaged Goods

**Trigger**: Stock item status changed to `Damaged`

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5100 Inventory Write-Off | 800 | |
| 2 | 1300 Inventory | | 800 |

### Lost / Stolen (Shrinkage)

**Trigger**: Stock item status changed to `Lost`

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5200 Inventory Shrinkage | 500 | |
| 2 | 1300 Inventory | | 500 |

### Stock Count Adjustment — Surplus

**Trigger**: Physical count finds more inventory than system records

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1300 Inventory | 300 | |
| 2 | 4301 Inventory Adjustment Gain | | 300 |

### Stock Count Adjustment — Deficit

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5200 Inventory Shrinkage | 400 | |
| 2 | 1300 Inventory | | 400 |

## 4.5 Stock Transfers Between Branches

**Trigger**: Stock item moved from Branch A → Branch B

**At Branch A** (source_type: "Inventory Adjustment"):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1301 Inventory In Transit | 1,000 | |
| 2 | 1300 Inventory – Branch A | | 1,000 |

**At Branch B** (when goods arrive):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1300 Inventory – Branch B | 1,000 | |
| 2 | 1301 Inventory In Transit | | 1,000 |

Using the transit account prevents "double counting" during shipment.

## 4.6 Inventory Valuation Methods

### FIFO (First In, First Out)

Each stock item already carries its own `cost_price` from its purchase receipt.
When items are sold, the system sells the **oldest items first** (items with the
earliest `createdAt` date). COGS is calculated from the actual `cost_price` of
each specific stock item sold.

This is **inherently supported** by the existing `stock_item` design — the
per-unit cost tracking IS the FIFO layer.

```javascript
// FIFO is implicit: stock items are selected oldest-first
// The sale-item → stock-item link determines which specific units were sold
// COGS = sum of those specific stock_items' cost_price values
```

### Weighted Average Cost (WAC)

WAC recalculates the average cost on every purchase receipt:

```javascript
/**
 * Recalculate weighted average cost for a product after receiving new stock.
 *
 * @param {number} productId
 * @param {number} newQty       — quantity just received
 * @param {number} newUnitCost  — unit cost of new receipt
 */
async function recalculateWAC(productId, newQty, newUnitCost) {
  // Get all InStock items for this product
  const existingItems = await strapi.db
    .query('api::stock-item.stock-item')
    .findMany({
      where: {
        product: productId,
        status: 'InStock',
      },
    });

  const existingQty   = existingItems.length;
  const existingValue = existingItems.reduce(
    (sum, item) => sum + Number(item.cost_price || 0), 0
  );

  const totalQty   = existingQty + newQty;
  const totalValue  = existingValue + (newQty * newUnitCost);
  const newAvgCost  = totalQty > 0 ? round4(totalValue / totalQty) : 0;

  // Update all existing InStock items to the new average cost
  for (const item of existingItems) {
    await strapi.entityService.update(
      'api::stock-item.stock-item',
      item.id,
      { data: { cost_price: newAvgCost } }
    );
  }

  return newAvgCost;
}
```

**Recommendation**: Use **FIFO** by default (it is the natural behavior of the
stock_item per-unit cost model). Switch to WAC only if the business requires it
and is willing to accept the cost-rewrite overhead on each purchase.

## 4.7 Stock Valuation Layer

For audit purposes, the system maintains a valuation snapshot:

```sql
CREATE TABLE acc_stock_valuation_layers (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  product_id        INT NOT NULL,
  stock_item_id     INT,
  branch_id         INT,
  quantity          INT NOT NULL,
  unit_cost         DECIMAL(18,4) NOT NULL,
  total_value       DECIMAL(18,4) NOT NULL,
  remaining_qty     INT NOT NULL,               -- units not yet sold
  remaining_value   DECIMAL(18,4) NOT NULL,
  source_type       VARCHAR(40),                -- "Purchase Receipt", "Return", etc.
  source_id         INT,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id)    REFERENCES products(id),
  FOREIGN KEY (stock_item_id) REFERENCES stock_items(id),
  FOREIGN KEY (branch_id)     REFERENCES branches(id)
);

CREATE INDEX idx_svl_product   ON acc_stock_valuation_layers(product_id);
CREATE INDEX idx_svl_branch    ON acc_stock_valuation_layers(branch_id);
-- MySQL does not support partial indexes; index the full column instead
CREATE INDEX idx_svl_remaining ON acc_stock_valuation_layers(remaining_qty);
```

A new layer is created on each purchase receipt. When stock is sold, the
`remaining_qty` and `remaining_value` are decremented on the oldest layer
(FIFO) or spread proportionally (WAC).

---

# Section 5 — Cash Register Accounting

## 5.1 Register Session Lifecycle

```
┌──────────┐     ┌──────────┐     ┌────────────┐     ┌──────────┐
│  OPEN    │────►│  ACTIVE  │────►│  CLOSING   │────►│  CLOSED  │
│  (float) │     │  (sales, │     │  (counting)│     │  (final) │
│          │     │  refunds,│     │            │     │          │
│          │     │  drops)  │     │            │     │          │
└──────────┘     └──────────┘     └────────────┘     └──────────┘
     │                │                  │                  │
     ▼                ▼                  │                  ▼
  JE: Open       JE per sale/         (no JE)          JE: Close
                 refund/drop                           + Short/Over
```

## 5.2 Register Opening

**Trigger**: Cash register created with `status: "Open"` or `"Active"` and
`opening_cash > 0`

**Journal Entry** (source_type: "Cash Register Open"):

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1001 Cash Drawer – Branch | 500 | | Float placed in drawer |
| 2 | 1000 Cash Safe – Branch | | 500 | Cash taken from safe |

```javascript
// Integration point: cash-register lifecycle or controller
async function onRegisterOpen(register) {
  if (!register.opening_cash || register.opening_cash <= 0) return;

  const accounting = strapi.service('api::acc-journal-entry.accounting');
  const resolver   = strapi.service('api::acc-journal-entry.account-resolver');
  const branchId   = register.branch?.id || null;

  const drawer = await resolver.resolve('CASH_DRAWER', branchId);
  const safe   = await resolver.resolve('CASH_SAFE', branchId);

  await accounting.createAndPost({
    date:        new Date().toISOString().split('T')[0],
    description: `Register opened – Desk ${register.desk_name || register.desk_id}`,
    source_type: 'Cash Register Open',
    source_id:   register.id,
    source_ref:  `REG-${register.id}`,
    branch_id:   branchId,
    lines: [
      { account_id: drawer.id, debit: register.opening_cash, credit: 0, description: 'Opening float' },
      { account_id: safe.id,   debit: 0, credit: register.opening_cash, description: 'From safe' },
    ],
  });
}
```

## 5.3 Cash Sales During Session

Each checkout that includes a Cash payment debits the 1001 Cash Drawer account
(see Section 3). The register itself does not create additional journal entries
for individual sales — the sale checkout does.

## 5.4 Cash Refunds During Session

When a sale return has `refund_method: "Cash"`, the return journal entry credits
1001 Cash Drawer (see Section 3.5). This reduces the register's cash balance in
the ledger.

## 5.5 Cash Paid Out (Drawer Expense)

**Trigger**: `cash-register-transaction` with `type: "Expense"`

Example: Cashier pays 150 for parking from the drawer.

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 6900 Miscellaneous Expense | 150 | |
| 2 | 1001 Cash Drawer | | 150 |

## 5.6 Cash Drop (To Safe)

**Trigger**: `cash-register-transaction` with `type: "CashDrop"`

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1000 Cash Safe | 2,000 | |
| 2 | 1001 Cash Drawer | | 2,000 |

## 5.7 Register Closing

**Trigger**: Cash register `status` changes to `"Closed"`

The closing flow:

```
1. Calculate expected_cash:
     opening_cash
   + SUM(cash payments from sales)
   − SUM(cash refunds)
   − SUM(cash drops)
   − SUM(cash paid-out expenses)
   + SUM(cash top-ups)
   = expected_cash

2. Compare with counted_cash (entered by cashier)

3. difference = counted_cash - expected_cash
     positive → overage (post to 4300 Cash Over)
     negative → shortage (post to 6700 Cash Short)
     zero     → balanced

4. Create closing journal entry
```

### Closing — No Difference

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1000 Cash Safe | 3,500 | |
| 2 | 1001 Cash Drawer | | 3,500 |

### Closing — Cash Short (counted 3,300, expected 3,500)

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1000 Cash Safe | 3,300 | |
| 2 | 6700 Cash Short | 200 | |
| 3 | 1001 Cash Drawer | | 3,500 |

### Closing — Cash Over (counted 3,600, expected 3,500)

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1000 Cash Safe | 3,600 | |
| 2 | 4300 Cash Over | | 100 |
| 3 | 1001 Cash Drawer | | 3,500 |

## 5.8 Register Reconciliation

The reconciliation report compares the **ledger balance** of the Cash Drawer
account with the **physical count** and the **system-calculated expected cash**.

```javascript
async function reconcileRegister(registerId) {
  const register = await strapi.entityService.findOne(
    'api::cash-register.cash-register',
    registerId,
    { populate: { sales: { populate: { payments: true } }, transactions: true } }
  );

  // Calculate expected from payments
  let cashIn = Number(register.opening_cash || 0);
  let cashOut = 0;

  for (const sale of (register.sales || [])) {
    for (const payment of (sale.payments || [])) {
      if (payment.payment_method === 'Cash') {
        cashIn += Number(payment.amount || 0);
      }
    }
  }

  for (const txn of (register.transactions || [])) {
    const amt = Number(txn.amount || 0);
    if (txn.type === 'CashDrop' || txn.type === 'Expense') {
      cashOut += Math.abs(amt);
    } else if (txn.type === 'CashTopUp') {
      cashIn += Math.abs(amt);
    } else if (txn.type === 'Refund') {
      cashOut += Math.abs(amt);
    }
  }

  const expectedCash = cashIn - cashOut;
  const countedCash  = Number(register.counted_cash || 0);
  const difference   = countedCash - expectedCash;

  return {
    opening_cash: register.opening_cash,
    total_cash_in: cashIn,
    total_cash_out: cashOut,
    expected_cash: expectedCash,
    counted_cash: countedCash,
    difference,
    status: difference === 0 ? 'Balanced'
          : difference > 0   ? 'Over'
          :                    'Short',
  };
}
```

---

# Section 6 — Purchase Accounting

## 6.1 Purchase Order Creation

**No journal entry**. A PO is a commitment, not a financial event. Accounting
begins when goods are received or an invoice is posted.

The PO can be tracked off-ledger in a **purchase commitments** note for
disclosure purposes, but it does not affect the general ledger.

## 6.2 Goods Receipt (Receiving Inventory)

**Trigger**: Purchase status changes to `"Received"` or `"Partially Received"`

At this point, the business has physical possession of inventory. Under
perpetual accounting, this is the event that debits Inventory.

**Journal Entry** (source_type: "Purchase Receipt"):

| # | Account | Debit | Credit | Calculation |
|---|---------|-------|--------|-------------|
| 1 | 1300 Inventory | 50,000 | | SUM(unit_price × received_qty) |
| 2 | 2000 Accounts Payable | | 50,000 | Liability to supplier |

```javascript
async function onPurchaseReceived(purchase) {
  const accounting = strapi.service('api::acc-journal-entry.accounting');
  const resolver   = strapi.service('api::acc-journal-entry.account-resolver');

  // Load items with received quantities
  const fullPurchase = await strapi.entityService.findOne(
    'api::purchase.purchase', purchase.id,
    { populate: { items: true, suppliers: true } }
  );

  let totalInventoryValue = 0;
  for (const item of fullPurchase.items) {
    totalInventoryValue += Number(item.unit_price || 0) * Number(item.received_quantity || 0);
  }

  if (totalInventoryValue <= 0) return;

  const inventoryAcct = await resolver.resolve('INVENTORY');
  const apAcct        = await resolver.resolve('ACCOUNTS_PAYABLE');

  await accounting.createAndPost({
    date:        new Date().toISOString().split('T')[0],
    description: `Goods received – PO ${fullPurchase.orderId}`,
    source_type: 'Purchase Receipt',
    source_id:   fullPurchase.id,
    source_ref:  fullPurchase.orderId,
    lines: [
      { account_id: inventoryAcct.id, debit: totalInventoryValue, credit: 0,
        description: 'Inventory received' },
      { account_id: apAcct.id, debit: 0, credit: totalInventoryValue,
        description: `Payable – ${fullPurchase.suppliers?.[0]?.name || 'Supplier'}` },
    ],
  });
}
```

## 6.3 Supplier Invoice (Bill Posting)

In many retail workflows, the **supplier invoice** arrives separately from the
goods. The `acc-bill` entity records this.

**If the goods receipt was already posted** (Section 6.2), the bill just records
the document — no additional journal entry is needed (AP was already credited).

**If goods receipt and invoice happen simultaneously**, one journal entry covers
both (as shown in 6.2).

**If there is a price variance** between the PO and the actual invoice:

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1300 Inventory | 200 | | Price increase adjustment |
| 2 | 2000 Accounts Payable | | 200 | Additional amount owed |

Or if the invoice is less than the receipt:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2000 Accounts Payable | 100 | |
| 2 | 1300 Inventory | | 100 |

## 6.4 Supplier Payment

**Trigger**: Payment made against an `acc-bill`

**Journal Entry** (source_type: "Bill Payment"):

**Bank transfer**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2000 Accounts Payable | 50,000 | |
| 2 | 1100 Primary Bank Account | | 50,000 |

**Cash payment**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2000 Accounts Payable | 50,000 | |
| 2 | 1000 Cash Safe | | 50,000 |

**Partial payment** (paying 30,000 of a 50,000 bill):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2000 Accounts Payable | 30,000 | |
| 2 | 1100 Primary Bank Account | | 30,000 |

The `acc-bill.amount_paid` is updated to 30,000 and `balance_due` to 20,000.
Status changes to "Partially Paid".

## 6.5 Purchase Return

**Trigger**: `purchase-return` created

**Journal Entry** (source_type: "Purchase Return"):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2000 Accounts Payable | 8,000 | |
| 2 | 1300 Inventory | | 8,000 |

This reduces both the liability to the supplier and the inventory asset.

If a tax refund is applicable:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2000 Accounts Payable | 8,000 | |
| 2 | 1300 Inventory | | 7,619 |
| 3 | 1400 Purchase Tax Receivable | | 381 |

## 6.6 Supplier Credit Note

A credit note from the supplier **without** returning goods (e.g., price
reduction after the fact):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2000 Accounts Payable | 500 | |
| 2 | 1300 Inventory | | 500 |

This is recorded as an adjustment to the `acc-bill` and linked via a journal
entry with `source_type: "Purchase Return"` and a reference to the credit note
number.

## 6.7 Inventory Receipt vs. Invoice Posting — The Difference

| Aspect | Goods Receipt | Invoice Posting |
|--------|--------------|-----------------|
| **What happens** | Goods physically arrive | Supplier's bill is recorded |
| **Accounting** | Dr Inventory, Cr AP (accrued) | Matches against accrued AP; adjusts for price variance |
| **Timing** | When goods are counted in | When bill arrives (may be days later) |
| **Document** | Delivery note / packing slip | Supplier invoice |
| **In this system** | Purchase status → Received | acc-bill created and linked to purchase |

In **simple retail** (small clothing shops), these often happen together — the
supplier delivers goods with an invoice. In that case, a single journal entry
covers both.

For **larger operations** with delayed billing, the two-step approach ensures
inventory is valued correctly from the moment of receipt, even before the final
invoice arrives.

---

# Section 7 — Sales Orders & Web Orders

## 7.1 Sales Order Creation

Like purchase orders, a sales order is a **commitment**, not a financial event.
No journal entry is created at this stage.

**Exception**: If a customer deposit is collected at order time:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1001 Cash / 1100 Bank | 2,000 | |
| 2 | 2301 Deferred Revenue — Deposits | | 2,000 |

## 7.2 Order Fulfillment / Shipment

When items are picked and shipped/handed to the customer:

**Revenue recognition**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1200 Accounts Receivable | 10,000 | |
| 2 | 4000 Sales Revenue | | 9,500 |
| 3 | 2100 Sales Tax Payable | | 500 |

**If deposit was collected** (reversing deferred revenue):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 2301 Deferred Revenue — Deposits | 2,000 | |
| 2 | 1200 Accounts Receivable | | 2,000 |

This reduces the AR balance by the deposit amount.

**COGS**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5000 COGS | 6,000 | |
| 2 | 1300 Inventory | | 6,000 |

## 7.3 Web Order — Stripe Payment

**Trigger**: Stripe webhook confirms `checkout.session.completed` with
`payment_status: "paid"`

The existing `order` entity has `stripe_id`, `stripe_response_webhook`, and
`total` fields.

**Journal Entry** (source_type: "Web Order"):

| # | Account | Debit | Credit | Description |
|---|---------|-------|--------|-------------|
| 1 | 1102 Stripe Settlement | 5,250 | | Amount Stripe will settle |
| 2 | 4001 Web Sales Revenue | | 5,000 | Net sale |
| 3 | 2100 Sales Tax Payable | | 250 | Tax |

**Stripe processing fee** (recorded when settlement lands or immediately if
known):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 6601 Stripe Fees | 160 | |
| 2 | 1102 Stripe Settlement | | 160 |

**When Stripe deposits to bank** (payout):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1100 Primary Bank Account | 5,090 | |
| 2 | 1102 Stripe Settlement | | 5,090 |

**COGS** entry is created the same way as POS sales.

## 7.4 Web Order Refund

**Trigger**: Refund processed via Stripe

**Journal Entry**:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 4100 Sales Returns | 5,000 | |
| 2 | 2100 Sales Tax Payable | 250 | |
| 3 | 1102 Stripe Settlement | | 5,250 |

**COGS reversal** (if items returned to stock):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1300 Inventory | 3,000 | |
| 2 | 5000 COGS | | 3,000 |

**Stripe refund fee** (Stripe keeps the original processing fee):

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 6601 Stripe Fees | 160 | |
| 2 | 1102 Stripe Settlement | | 160 |

> Note: Some Stripe plans return the fee on refund. Adjust accordingly.

## 7.5 Web Order ↔ POS Integration

Web orders and POS sales share the same:
- Revenue account (4000 POS / 4001 Web — or just 4000 if not distinguishing)
- COGS account (5000)
- Inventory account (1300)
- Tax account (2100)

They differ in:
- **Payment account**: POS uses 1001 (Cash) or 1101 (Card); Web uses 1102 (Stripe)
- **Fee structure**: Web orders incur Stripe fees (6601)
- **Timing**: POS is instant; Web has a settlement delay

The accounting engine treats them identically via the `source_type` field. The
account resolver maps payment methods to the appropriate bank/cash account.

---

# Section 8 — Financial Reports

All reports query `acc_journal_lines` joined with `acc_journal_entries` and
`acc_accounts`. The `acc_account_balances` snapshot table provides cached
period-level totals for performance.

## 8.1 Trial Balance

```sql
SELECT
  a.code,
  a.name,
  a.account_type,
  COALESCE(SUM(jl.debit), 0)  AS total_debit,
  COALESCE(SUM(jl.credit), 0) AS total_credit,
  CASE
    WHEN a.normal_balance = 'Debit'
      THEN COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)
    ELSE
      COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0)
  END AS balance
FROM acc_accounts a
LEFT JOIN acc_journal_lines jl ON jl.account_id = a.id
LEFT JOIN acc_journal_entries je ON je.id = jl.journal_entry_id
  AND je.status = 'Posted'
  AND je.date BETWEEN :start_date AND :end_date
WHERE a.is_active = TRUE
GROUP BY a.id, a.code, a.name, a.account_type, a.normal_balance
ORDER BY a.code;

-- Validation: SUM(total_debit) must equal SUM(total_credit) across all rows
```

## 8.2 Profit & Loss (Income Statement)

```sql
-- Revenue
SELECT
  a.code, a.name,
  COALESCE(SUM(jl.credit), 0) - COALESCE(SUM(jl.debit), 0) AS amount
FROM acc_accounts a
JOIN acc_journal_lines jl ON jl.account_id = a.id
JOIN acc_journal_entries je ON je.id = jl.journal_entry_id
  AND je.status = 'Posted'
  AND je.date BETWEEN :start_date AND :end_date
WHERE a.account_type = 'Revenue'
GROUP BY a.id, a.code, a.name
ORDER BY a.code;

-- COGS
SELECT
  a.code, a.name,
  COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS amount
FROM acc_accounts a
JOIN acc_journal_lines jl ON jl.account_id = a.id
JOIN acc_journal_entries je ON je.id = jl.journal_entry_id
  AND je.status = 'Posted'
  AND je.date BETWEEN :start_date AND :end_date
WHERE a.sub_type = 'Cost of Goods Sold'
GROUP BY a.id, a.code, a.name
ORDER BY a.code;

-- Operating Expenses (excluding COGS)
SELECT
  a.code, a.name,
  COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS amount
FROM acc_accounts a
JOIN acc_journal_lines jl ON jl.account_id = a.id
JOIN acc_journal_entries je ON je.id = jl.journal_entry_id
  AND je.status = 'Posted'
  AND je.date BETWEEN :start_date AND :end_date
WHERE a.account_type = 'Expense'
  AND a.sub_type != 'Cost of Goods Sold'
GROUP BY a.id, a.code, a.name
ORDER BY a.code;

-- Summary:
-- Gross Profit = Total Revenue - Total COGS
-- Net Profit   = Gross Profit - Total Operating Expenses
```

## 8.3 Balance Sheet

```sql
-- Assets
SELECT a.code, a.name,
  COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0) AS balance
FROM acc_accounts a
JOIN acc_journal_lines jl ON jl.account_id = a.id
JOIN acc_journal_entries je ON je.id = jl.journal_entry_id
  AND je.status = 'Posted'
  AND je.date <= :as_of_date
WHERE a.account_type = 'Asset'
GROUP BY a.id, a.code, a.name
HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.001
ORDER BY a.code;

-- Liabilities (same query, account_type = 'Liability', credit - debit)
-- Equity (same query, account_type = 'Equity', credit - debit)

-- Validation: Total Assets = Total Liabilities + Total Equity
```

## 8.4 Cash Flow Statement

```sql
-- Operating Activities (Cash accounts, linked to sales/expenses/AP/AR)
SELECT
  je.source_type,
  SUM(jl.debit) - SUM(jl.credit) AS net_cash_flow
FROM acc_journal_lines jl
JOIN acc_journal_entries je ON je.id = jl.journal_entry_id
  AND je.status = 'Posted'
  AND je.date BETWEEN :start_date AND :end_date
JOIN acc_accounts a ON a.id = jl.account_id
WHERE a.sub_type IN ('Cash', 'Bank')
  AND je.source_type IN (
    'POS Sale', 'Sale Return', 'Web Order',
    'Expense', 'Bill Payment', 'Invoice Payment',
    'Cash Register Open', 'Cash Register Close',
    'Cash Register Transaction'
  )
GROUP BY je.source_type
ORDER BY net_cash_flow DESC;

-- Investing Activities (Fixed assets)
-- Financing Activities (Equity, loans)
```

## 8.5 Inventory Valuation Report

```sql
SELECT
  p.name AS product_name,
  p.sku,
  COUNT(si.id) AS qty_on_hand,
  SUM(si.cost_price) AS total_cost_value,
  AVG(si.cost_price) AS avg_unit_cost,
  p.selling_price,
  COUNT(si.id) * p.selling_price AS total_retail_value
FROM stock_items si
JOIN products p ON p.id = si.product_id
WHERE si.status = 'InStock'
  AND si.archived = FALSE
GROUP BY p.id, p.name, p.sku, p.selling_price
ORDER BY total_cost_value DESC;
```

**Cross-check with ledger**: The sum of `total_cost_value` should equal the
`acc_accounts.balance` for account 1300 (Inventory).

## 8.6 Sales Performance Report

```sql
-- Daily sales summary
SELECT
  je.date,
  je.branch_id,
  COUNT(DISTINCT je.source_id) AS num_transactions,
  SUM(CASE WHEN jl.account_id IN (SELECT id FROM acc_accounts WHERE code = '4000')
    THEN jl.credit - jl.debit ELSE 0 END) AS gross_revenue,
  SUM(CASE WHEN jl.account_id IN (SELECT id FROM acc_accounts WHERE code = '4200')
    THEN jl.debit ELSE 0 END) AS total_discounts,
  SUM(CASE WHEN jl.account_id IN (SELECT id FROM acc_accounts WHERE code = '5000')
    THEN jl.debit - jl.credit ELSE 0 END) AS cogs
FROM acc_journal_entries je
JOIN acc_journal_lines jl ON jl.journal_entry_id = je.id
WHERE je.status = 'Posted'
  AND je.source_type IN ('POS Sale', 'Web Order')
  AND je.date BETWEEN :start_date AND :end_date
GROUP BY je.date, je.branch_id
ORDER BY je.date DESC;
```

---

# Section 9 — Database Schema

## 9.1 Complete Entity List

Below is the full schema for all accounting and operationally linked tables.
This covers the Strapi content type schemas (which generate the MySQL
tables) plus custom tables for performance.

### Accounting Content Types (Strapi-managed)

| Table | API ID | Purpose |
|-------|--------|---------|
| `acc_accounts` | `api::acc-account.acc-account` | Chart of Accounts |
| `acc_journal_entries` | `api::acc-journal-entry.acc-journal-entry` | Journal entry header |
| `acc_journal_lines` | `api::acc-journal-line.acc-journal-line` | Journal entry detail |
| `acc_invoices` | `api::acc-invoice.acc-invoice` | Customer invoices (AR) |
| `acc_bills` | `api::acc-bill.acc-bill` | Supplier bills (AP) |
| `acc_expenses` | `api::acc-expense.acc-expense` | Business expenses |
| `acc_bank_accounts` | `api::acc-bank-account.acc-bank-account` | Cash/bank account register |
| `acc_tax_rates` | `api::acc-tax-rate.acc-tax-rate` | Tax configuration |
| `acc_fiscal_periods` | `api::acc-fiscal-period.acc-fiscal-period` | Period control |
| `acc_account_mappings` | `api::acc-account-mapping.acc-account-mapping` | Event → account mapping |

### Custom MySQL Tables (migration-managed)

| Table | Purpose |
|-------|---------|
| `acc_account_balances` | Period balance snapshots |
| `acc_stock_valuation_layers` | FIFO / WAC cost layers |

### Operational Tables (existing, not modified)

| Table | API ID |
|-------|--------|
| `sales` | `api::sale.sale` |
| `sale_items` | `api::sale-item.sale-item` |
| `sale_returns` | `api::sale-return.sale-return` |
| `sale_return_items` | `api::sale-return-item.sale-return-item` |
| `purchases` | `api::purchase.purchase` |
| `purchase_items` | `api::purchase-item.purchase-item` |
| `purchase_returns` | `api::purchase-return.purchase-return` |
| `purchase_return_items` | `api::purchase-return-item.purchase-return-item` |
| `payments` | `api::payment.payment` |
| `cash_registers` | `api::cash-register.cash-register` |
| `cash_register_transactions` | `api::cash-register-transaction.cash-register-transaction` |
| `orders` | `api::order.order` |
| `stock_items` | `api::stock-item.stock-item` |
| `products` | `api::product.product` |
| `customers` | `api::customer.customer` |
| `suppliers` | `api::supplier.supplier` |
| `branches` | `api::branch.branch` |
| `currencies` | `api::currency.currency` |

## 9.2 Key Relationships

```
acc_journal_entries  1 ──── M  acc_journal_lines
acc_journal_lines    M ──── 1  acc_accounts
acc_journal_entries  M ──── 1  acc_fiscal_periods
acc_journal_entries  M ──── 1  branches
acc_journal_entries  M ──── 1  currencies
acc_journal_entries  1 ──── 1  acc_journal_entries (reversal_of)
acc_accounts         M ──── 1  acc_accounts (parent)
acc_accounts         M ──── 1  branches
acc_accounts         M ──── 1  currencies
acc_invoices         M ──── 1  customers
acc_invoices         1 ──── 1  sales
acc_invoices         1 ──── 1  orders
acc_invoices         1 ──── 1  acc_journal_entries
acc_bills            M ──── 1  suppliers
acc_bills            1 ──── 1  purchases
acc_bills            1 ──── 1  acc_journal_entries
acc_bank_accounts    1 ──── 1  acc_accounts (ledger_account)
acc_bank_accounts    M ──── 1  branches
acc_tax_rates        M ──── 1  acc_accounts (sales_account)
acc_tax_rates        M ──── 1  acc_accounts (purchase_account)
acc_account_mappings M ──── 1  acc_accounts
acc_account_mappings M ──── 1  branches
acc_expenses         M ──── 1  acc_accounts
```

## 9.3 Indexes

Critical indexes for query performance:

```sql
-- Journal entry lookups
CREATE INDEX idx_je_date_status ON acc_journal_entries(date, status);
CREATE INDEX idx_je_source_lookup ON acc_journal_entries(source_type, source_id);
CREATE INDEX idx_je_branch_date ON acc_journal_entries(branch_id, date);

-- Journal line aggregation (reporting)
CREATE INDEX idx_jl_account_entry ON acc_journal_lines(account_id, journal_entry_id);

-- Account lookups
CREATE INDEX idx_acc_code ON acc_accounts(code);
CREATE INDEX idx_acc_type_active ON acc_accounts(account_type, is_active);

-- Period lookups
CREATE INDEX idx_fp_date_range ON acc_fiscal_periods(start_date, end_date, status);

-- Balance snapshots
CREATE INDEX idx_ab_period_branch ON acc_account_balances(fiscal_period_id, branch_id);

-- Stock valuation (MySQL does not support partial indexes; index the full column)
CREATE INDEX idx_svl_remaining ON acc_stock_valuation_layers(remaining_qty);

-- Mapping resolution
CREATE INDEX idx_mapping_key_branch ON acc_account_mappings(key, branch_id);
```

---

# Section 10 — Automation Rules

## 10.1 Automatic Journal Entry Creation

Every operational event triggers accounting entries automatically. The triggers
are implemented as **Strapi lifecycle hooks** or **controller post-actions**.

| Trigger Event | Hook Location | Journal Created |
|---------------|---------------|-----------------|
| Sale checkout completes | `sale/controllers/checkout.js` | Revenue + COGS |
| Sale cancelled | `sale/controllers/cancel.js` | Reversal of revenue + COGS |
| Sale return created | `sale-return` lifecycle `afterCreate` | Return + COGS reversal |
| Purchase received | `purchase` lifecycle `afterUpdate` (status → Received) | Inventory + AP |
| Purchase return created | `purchase-return` lifecycle `afterCreate` | AP reduction + Inventory reduction |
| Cash register opened | `cash-register` lifecycle `afterCreate` | Cash Drawer / Safe |
| Cash register closed | `cash-register` lifecycle `afterUpdate` (status → Closed) | Safe / Drawer + Short/Over |
| Register transaction | `cash-register-transaction` lifecycle `afterCreate` | Varies by type |
| Expense created | `acc-expense` lifecycle `afterCreate` | Expense / Cash or Bank |
| Invoice payment received | `acc-invoice` service | Cash or Bank / AR |
| Bill payment made | `acc-bill` service | AP / Bank |
| Web order paid (Stripe) | Stripe webhook handler | Stripe Settlement / Revenue |
| Stock item damaged/lost | `stock-item` lifecycle `afterUpdate` (status change) | Write-off / Inventory |

## 10.2 Stock Valuation Updates

Valuation layers are updated in these events:

```javascript
// After purchase receipt — create new valuation layer
async function createValuationLayer(purchaseItem, branchId) {
  const receivedQty = purchaseItem.received_quantity;
  const unitCost    = purchaseItem.unit_price;
  const totalValue  = receivedQty * unitCost;

  await strapi.db.query('acc_stock_valuation_layers').create({
    data: {
      product_id:     purchaseItem.product,
      branch_id:      branchId,
      quantity:        receivedQty,
      unit_cost:       unitCost,
      total_value:     totalValue,
      remaining_qty:   receivedQty,
      remaining_value: totalValue,
      source_type:    'Purchase Receipt',
      source_id:       purchaseItem.purchase,
    },
  });
}

// After sale — consume from oldest layer (FIFO)
async function consumeValuationLayers(productId, branchId, qty) {
  let remaining = qty;
  const layers = await strapi.db.query('acc_stock_valuation_layers').findMany({
    where: {
      product_id: productId,
      branch_id:  branchId,
      remaining_qty: { $gt: 0 },
    },
    orderBy: { created_at: 'asc' }, // FIFO
  });

  let totalCostConsumed = 0;

  for (const layer of layers) {
    if (remaining <= 0) break;

    const consume = Math.min(remaining, layer.remaining_qty);
    const costConsumed = consume * layer.unit_cost;

    await strapi.db.query('acc_stock_valuation_layers').update({
      where: { id: layer.id },
      data: {
        remaining_qty:   layer.remaining_qty - consume,
        remaining_value: layer.remaining_value - costConsumed,
      },
    });

    totalCostConsumed += costConsumed;
    remaining -= consume;
  }

  return totalCostConsumed;
}
```

## 10.3 Tax Calculation Automation

Tax is calculated per sale line using the branch's `tax_rate` or the product's
`tax_rate`, resolved through the `acc-tax-rate` entity.

```javascript
async function calculateSaleTax(saleItems, branchId) {
  // Determine applicable tax rate
  const branch = await strapi.entityService.findOne(
    'api::branch.branch', branchId
  );
  const defaultRate = Number(branch?.tax_rate || 0);

  let totalTax = 0;
  for (const item of saleItems) {
    const productRate = item.product?.tax_rate;
    const rate = productRate != null ? Number(productRate) : defaultRate;
    const lineTotal = Number(item.subtotal || item.total || 0);
    const { tax } = taxCalculator.calculate(lineTotal, rate, 'Exclusive');
    totalTax += tax;
  }
  return totalTax;
}
```

## 10.4 Daily Financial Summary (Scheduled)

A daily cron job creates a summary snapshot:

```javascript
// src/api/acc-journal-entry/services/daily-summary.js
module.exports = {
  async generateDailySummary(date) {
    const entries = await strapi.db.query('api::acc-journal-entry.acc-journal-entry')
      .findMany({
        where: { date, status: 'Posted' },
        populate: ['lines', 'lines.account', 'branch'],
      });

    const summary = {
      date,
      total_entries: entries.length,
      total_debit:   0,
      total_credit:  0,
      by_source_type: {},
      by_branch:      {},
    };

    for (const entry of entries) {
      summary.total_debit  += Number(entry.total_debit);
      summary.total_credit += Number(entry.total_credit);

      const st = entry.source_type || 'Manual';
      if (!summary.by_source_type[st]) summary.by_source_type[st] = { count: 0, amount: 0 };
      summary.by_source_type[st].count++;
      summary.by_source_type[st].amount += Number(entry.total_debit);

      const branch = entry.branch?.name || 'Unassigned';
      if (!summary.by_branch[branch]) summary.by_branch[branch] = { count: 0, amount: 0 };
      summary.by_branch[branch].count++;
      summary.by_branch[branch].amount += Number(entry.total_debit);
    }

    // Verify balance
    summary.is_balanced = Math.abs(summary.total_debit - summary.total_credit) < 0.01;

    return summary;
  },
};
```

## 10.5 Period Close Automation

```javascript
async function closePeriod(periodId) {
  const period = await strapi.entityService.findOne(
    'api::acc-fiscal-period.acc-fiscal-period', periodId
  );
  if (!period) throw new Error('Period not found');
  if (period.status !== 'Open') throw new Error('Period is not open');

  // 1. Snapshot all account balances for this period
  const accounts = await strapi.entityService.findMany(
    'api::acc-account.acc-account',
    { filters: { is_active: true }, limit: -1 }
  );

  for (const account of accounts) {
    const lines = await strapi.db.query('api::acc-journal-line.acc-journal-line')
      .findMany({
        where: {
          account: account.id,
          journal_entry: {
            status: 'Posted',
            date: {
              $gte: period.start_date,
              $lte: period.end_date,
            },
          },
        },
      });

    const periodDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const periodCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);

    // Upsert balance snapshot
    await strapi.db.query('acc_account_balances').create({
      data: {
        account_id:      account.id,
        fiscal_period_id: periodId,
        period_debit:    periodDebit,
        period_credit:   periodCredit,
        closing_balance: account.balance,
      },
    });
  }

  // 2. Close the period
  await strapi.entityService.update(
    'api::acc-fiscal-period.acc-fiscal-period',
    periodId,
    { data: { status: 'Closed' } }
  );
}
```

### Year-End Close

```javascript
async function yearEndClose(fiscalYear) {
  const accounting = strapi.service('api::acc-journal-entry.accounting');
  const resolver   = strapi.service('api::acc-journal-entry.account-resolver');

  // Get all revenue and expense accounts
  const revenueAccounts = await strapi.entityService.findMany(
    'api::acc-account.acc-account',
    { filters: { account_type: 'Revenue', is_active: true }, limit: -1 }
  );
  const expenseAccounts = await strapi.entityService.findMany(
    'api::acc-account.acc-account',
    { filters: { account_type: 'Expense', is_active: true }, limit: -1 }
  );

  const retainedEarnings = await resolver.resolve('RETAINED_EARNINGS');
  const lines = [];
  let netIncome = 0;

  // Close revenue accounts (credit balance → debit to zero)
  for (const acct of revenueAccounts) {
    const bal = Number(acct.balance);
    if (Math.abs(bal) < 0.01) continue;
    lines.push({
      account_id:  acct.id,
      debit:       bal > 0 ? bal : 0,
      credit:      bal < 0 ? Math.abs(bal) : 0,
      description: `Close ${acct.code} ${acct.name}`,
    });
    netIncome += bal;
  }

  // Close expense accounts (debit balance → credit to zero)
  for (const acct of expenseAccounts) {
    const bal = Number(acct.balance);
    if (Math.abs(bal) < 0.01) continue;
    lines.push({
      account_id:  acct.id,
      debit:       bal < 0 ? Math.abs(bal) : 0,
      credit:      bal > 0 ? bal : 0,
      description: `Close ${acct.code} ${acct.name}`,
    });
    netIncome -= bal;
  }

  // Transfer net income to retained earnings
  lines.push({
    account_id:  retainedEarnings.id,
    debit:       netIncome < 0 ? Math.abs(netIncome) : 0,
    credit:      netIncome > 0 ? netIncome : 0,
    description: `Net income for ${fiscalYear}`,
  });

  await accounting.createAndPost({
    date:        `${fiscalYear}-12-31`,
    description: `Year-end close for FY ${fiscalYear}`,
    source_type: 'Manual',
    source_ref:  `YEC-${fiscalYear}`,
    lines,
  });
}
```

---

# Section 11 — Edge Cases

## 11.1 Negative Inventory

**Scenario**: A sale is processed but the system has no stock items to attach
(overselling).

**Handling**:
- The operational layer should **prevent this** by checking stock availability
  before checkout (the existing `checkout.js` validates quantity matches).
- If it happens despite checks (race condition):
  1. The sale still posts with COGS = 0 (no stock items → no cost_price to sum).
  2. A **negative inventory alert** is raised.
  3. When stock arrives (purchase receipt), the COGS is retroactively recorded
     via a manual adjustment journal entry.
- The inventory account balance should **never go negative**. A reconciliation
  check runs daily to flag this.

## 11.2 Partial Returns

**Scenario**: Customer bought 5 shirts, returns 2.

- A `sale-return` is created with 2 `sale-return-items`.
- Only the 2 returned stock items are marked as `Returned`.
- Journal entries use the returned items' actual cost prices:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 4100 Sales Returns | 4,000 | | 2 shirts × 2,000 selling price |
| 2 | 1001 Cash Drawer | | 4,000 | |

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1300 Inventory | 2,400 | | 2 shirts × 1,200 cost |
| 2 | 5000 COGS | | 2,400 | |

The original sale is updated: `return_status: "PartiallyReturned"`.

## 11.3 Partial Payments

**Scenario**: Customer owes 10,000, pays 6,000 now.

- Payment of 6,000 is recorded. Sale status: `"Partial"`.
- Journal entry debits Cash 6,000, credits Sales Revenue 6,000.
- Remaining 4,000 stays as an **implicit receivable** (tracked on the sale's
  `payment_status`).
- If a formal `acc-invoice` is created, the `balance_due` field shows 4,000.
- When the remaining 4,000 is collected later:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1001 Cash | 4,000 | |
| 2 | 1200 Accounts Receivable | | 4,000 |

## 11.4 Cancelled Transactions

**Scenario**: A sale is cancelled before completion (the existing `cancel.js`
flow).

**Accounting treatment**:
- If the sale was **never checked out** (status: Draft, no journal entries
  exist), no accounting action is needed.
- If the sale was **checked out but then cancelled**:
  1. **Reverse the revenue journal entry** by calling `accounting.reverse()`.
  2. **Reverse the COGS journal entry** by calling `accounting.reverse()`.
  3. Stock items are restored to InStock (already handled by `cancel.js`).

```javascript
// Addition to cancel.js — after restoring stock and before marking cancelled
const journalEntries = await strapi.entityService.findMany(
  'api::acc-journal-entry.acc-journal-entry',
  {
    filters: {
      source_type: 'POS Sale',
      source_id: sale.id,
      status: 'Posted',
    },
  }
);

const accountingService = strapi.service('api::acc-journal-entry.accounting');
for (const je of journalEntries) {
  await accountingService.reverse(je.id, { user });
}
```

## 11.5 Backdated Transactions

**Scenario**: An expense from last week needs to be recorded today with last
week's date.

**Rules**:
1. The fiscal period for the backdated date must be **Open**.
2. If the period is **Closed**, an admin must re-open it first.
3. If the period is **Locked**, the entry is **rejected** — post to the
   current period instead with a note.
4. Backdated entries use the specified date (not today) for all journal lines.
5. The `acc_account_balances` snapshot for the affected period is recalculated.

**Implementation**: The `createAndPost` service already validates the period.
Backdating just means passing a past date:

```javascript
await accountingService.createAndPost({
  date: '2025-06-15', // backdated
  description: 'Late expense recording — electricity bill',
  source_type: 'Expense',
  // ... lines
});
// Succeeds if the June 2025 period is Open; fails if Closed or Locked
```

## 11.6 Cash Register Differences

Handled in Section 5.7. Additional considerations:

- **Materiality threshold**: Differences under a configurable amount (e.g., 10)
  can be auto-posted to 6700/4300. Larger differences require manager approval.
- **Pattern detection**: If the same cashier consistently shows shortages, the
  system flags this for review.
- **Investigation hold**: A register can be placed in a "Pending Investigation"
  state where the closing JE is not posted until the discrepancy is explained.

## 11.7 Stock Corrections (Count Adjustments)

**Scenario**: Physical count shows 47 units of a product, but the system shows 50.

1. Create an inventory adjustment entry for the 3-unit deficit.
2. Identify which 3 stock items to write off (oldest first, or ones in
   questionable state).
3. Mark those stock items as `Lost`.
4. Journal entry:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 5200 Inventory Shrinkage | 3,600 | | 3 × 1,200 cost |
| 2 | 1300 Inventory | | 3,600 | |

For a **surplus** (count shows more than system):
1. Determine if there is a data entry error in receipts or if items were
   genuinely missed.
2. Create new stock items with estimated cost_price (from last purchase price).
3. Journal entry:

| # | Account | Debit | Credit |
|---|---------|-------|--------|
| 1 | 1300 Inventory | 1,200 | |
| 2 | 4301 Inventory Adjustment Gain | | 1,200 |

## 11.8 Multiple Currencies on a Single Sale

**Scenario**: Customer pays partially in USD and partially in local currency.

- Each payment is recorded in its original currency with the exchange rate.
- The journal entry converts all amounts to base currency using the payment-time
  rate.
- If rates differ from the invoice rate, an FX gain/loss line is added.

## 11.9 Rounding Differences

When tax or discount calculations produce fractions:

```javascript
function round4(n) { return Math.round(n * 10000) / 10000; }
function round2(n) { return Math.round(n * 100) / 100; }
```

- Journal line amounts use 4-decimal precision internally.
- Display and invoice amounts use 2-decimal precision.
- If rounding causes a 0.01 imbalance in a journal entry, add a rounding
  adjustment line to 6900 (Miscellaneous Expense) or 4300 (Other Revenue).

---

# Section 12 — Best Practices

## 12.1 Financial Accuracy

1. **Never bypass the accounting service**. All balance changes must go through
   `createAndPost()`. No direct updates to `acc_accounts.balance`.

2. **Use DECIMAL(18,4) for all money fields**. Never use `float` or `double`.

3. **Run the balance verification query daily**:
   ```sql
   SELECT SUM(debit) - SUM(credit) AS imbalance
   FROM acc_journal_lines jl
   JOIN acc_journal_entries je ON je.id = jl.journal_entry_id
   WHERE je.status = 'Posted';
   -- Must be 0.0000
   ```

4. **Cross-check inventory**: Compare `SUM(stock_item.cost_price WHERE status = 'InStock')`
   against `acc_accounts.balance WHERE code = '1300'`. Flag any discrepancy.

5. **Cross-check cash**: Compare register reconciliation totals against the
   Cash Drawer ledger balance.

6. **One truth for balances**: The `acc_accounts.balance` field is the
   **authoritative** balance. It is always equal to the net of all posted
   journal lines for that account. If they ever diverge, the journal lines are
   the source of truth and the balance must be recomputed.

## 12.2 Audit Logging

1. **Strapi audit fields**: Every entity has `createdAt`, `updatedAt`,
   `createdBy`, `updatedBy`. These are automatically maintained.

2. **Journal entry immutability**: Once `status = 'Posted'`, the lifecycle hook
   blocks all updates except setting status to `'Reversed'`.

3. **Source traceability**: Every journal entry links to its source document.
   This creates a complete audit chain:
   ```
   Ledger Balance → Journal Entry → Journal Lines → Source Document
   ```

4. **User attribution**: `posted_by` records who approved each entry.
   `owners` provides multi-tenant access control.

5. **No hard deletes**: Draft entries can be deleted. All other entries are
   soft-handled via status changes (Reversed, Cancelled).

6. **Change log for sensitive entities**: Consider a Strapi plugin or custom
   middleware that logs all changes to `acc_accounts`, `acc_journal_entries`,
   and `acc_fiscal_periods` to a separate audit log table.

## 12.3 Fraud Prevention

1. **Separation of duties**:
   - Cashiers can process sales but cannot close registers alone.
   - Only managers can void/cancel completed sales.
   - Only admins can create manual journal entries.
   - Only admins can re-open closed fiscal periods.

2. **Cash register controls**:
   - Register opening requires an authenticated user.
   - Cash drops require dual confirmation (cashier + manager) for amounts above
     a threshold.
   - Register closing requires physical cash count entry.

3. **Discount controls**:
   - Discounts above a percentage threshold require manager approval.
   - All discounts are recorded as separate contra-revenue entries for
     visibility.

4. **Void/cancel controls**:
   - Cancelled transactions leave a full audit trail (the original JE +
     reversal JE are both preserved).
   - The `cancel.js` controller already requires admin role.

5. **Reconciliation requirements**:
   - Daily register reconciliation is mandatory.
   - Weekly trial balance review.
   - Monthly bank reconciliation.

## 12.4 Performance Optimization

1. **Indexes**: All foreign keys and commonly filtered columns are indexed
   (see Section 9.3).

2. **Account balance caching**: The `acc_accounts.balance` field avoids
   re-aggregating all journal lines for every balance query. It is updated
   incrementally on each post.

3. **Period balance snapshots**: `acc_account_balances` stores per-period
   totals. Reports for past periods query this table instead of scanning all
   journal lines.

4. **Pagination**: Journal line queries for reports should paginate. For large
   retailers with thousands of daily transactions, use Strapi's built-in
   pagination or raw SQL with `LIMIT/OFFSET`.

5. **Batch posting**: For high-volume POS environments, consider batching
   journal entries (e.g., one summary entry per register per shift) instead of
   one per sale. This reduces the number of journal entries from thousands to
   tens per day. Trade-off: less granular traceability.

6. **Archive strategy**: After a fiscal year is locked, journal lines older
   than 2+ years can be archived to a separate table or cold storage. The
   period balance snapshots preserve the summary data.

7. **Read replicas**: For reporting queries, use a MySQL read replica to
   avoid impacting the transactional database.

8. **Summary tables** for common reports (MySQL does not support materialized
   views; use a regular summary table refreshed via a scheduled event or cron):
   ```sql
   -- Summary table (replace materialized view)
   CREATE TABLE mv_daily_sales_summary (
     date         DATE NOT NULL,
     branch_id    INT,
     entry_count  INT DEFAULT 0,
     total_debit  DECIMAL(18,4) DEFAULT 0,
     total_credit DECIMAL(18,4) DEFAULT 0,
     refreshed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
     UNIQUE KEY uq_date_branch (date, branch_id)
   );

   -- Refresh nightly via MySQL scheduled event or Node.js cron
   REPLACE INTO mv_daily_sales_summary (date, branch_id, entry_count, total_debit, total_credit, refreshed_at)
   SELECT
     je.date,
     je.branch_id,
     COUNT(DISTINCT je.id) AS entry_count,
     SUM(jl.debit) AS total_debit,
     SUM(jl.credit) AS total_credit,
     NOW()
   FROM acc_journal_entries je
   JOIN acc_journal_lines jl ON jl.journal_entry_id = je.id
   WHERE je.status = 'Posted'
   GROUP BY je.date, je.branch_id;
   ```

---

## Implementation Roadmap

| Phase | Scope | Priority |
|-------|-------|----------|
| **1** | Enhanced `acc-account` schema + seed CoA + `acc-account-mapping` | 🔴 Critical |
| **2** | `acc-journal-line` entity + redesigned `acc-journal-entry` header | 🔴 Critical |
| **3** | Accounting service (`createAndPost`, `reverse`, `findOpenPeriod`) | 🔴 Critical |
| **4** | `acc-fiscal-period` entity + period validation | 🔴 Critical |
| **5** | POS Sale integration (checkout.js hook) | 🔴 Critical |
| **6** | Sale Return integration (lifecycle hook) | 🔴 Critical |
| **7** | Cash Register open/close integration | 🟡 High |
| **8** | Purchase Receipt integration | 🟡 High |
| **9** | `acc-tax-rate` entity + tax calculation service | 🟡 High |
| **10** | `acc-bill` entity + purchase payment flow | 🟡 High |
| **11** | Enhanced `acc-invoice` + payment tracking | 🟡 High |
| **12** | `acc-bank-account` entity + bank reconciliation | 🟢 Medium |
| **13** | Web order (Stripe) integration | 🟢 Medium |
| **14** | Stock valuation layers | 🟢 Medium |
| **15** | `acc_account_balances` snapshots + period close automation | 🟢 Medium |
| **16** | Financial reports (Trial Balance, P&L, Balance Sheet) | 🟢 Medium |
| **17** | Daily summary cron job | 🔵 Low |
| **18** | Summary tables + performance optimization | 🔵 Low |
| **19** | Gift card / loyalty point accounting | 🔵 Low |
| **20** | Year-end close automation | 🔵 Low |
