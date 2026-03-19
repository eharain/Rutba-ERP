# Accounting System Architecture

## Retail ERP — Strapi-Based Accounting Module

> **Platform**: Strapi v4 · MySQL · **Pattern**: Double-entry bookkeeping · **Scope**: Multi-branch retail POS

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Accounting Principles](#2-core-accounting-principles)
3. [Module 1 — Chart of Accounts](#3-module-1--chart-of-accounts)
4. [Module 2 — General Ledger & Journal Entries](#4-module-2--general-ledger--journal-entries)
5. [Module 3 — Accounts Receivable](#5-module-3--accounts-receivable)
6. [Module 4 — Accounts Payable](#6-module-4--accounts-payable)
7. [Module 5 — Cash & Bank Accounts](#7-module-5--cash--bank-accounts)
8. [Module 6 — Tax Handling](#8-module-6--tax-handling)
9. [Module 7 — Fiscal Periods](#9-module-7--fiscal-periods)
10. [Retail Integration Workflows](#10-retail-integration-workflows)
11. [Multi-Branch & Multi-Currency](#11-multi-branch--multi-currency)
12. [Audit Trail](#12-audit-trail)
13. [Financial Reporting](#13-financial-reporting)
14. [Entity Relationship Diagram](#14-entity-relationship-diagram)
15. [New & Modified Strapi Content Types](#15-new--modified-strapi-content-types)
16. [Accounting Service Layer](#16-accounting-service-layer)
17. [Seed Data — Default Chart of Accounts](#17-seed-data--default-chart-of-accounts)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     OPERATIONAL LAYER                           │
│  POS Sale · Sale Return · Purchase · Purchase Return            │
│  Web Order · Cash Register · Stock Adjustment                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │  lifecycle hooks / service calls
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                  ACCOUNTING SERVICE LAYER                        │
│  createJournalEntry()  ·  postToLedger()  ·  validateBalance()  │
│  reversalEntry()       ·  periodCheck()   ·  currencyConvert()  │
└──────────────────────────┬──────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────┐
│ acc-journal  │  │ acc-journal  │  │ acc-account       │
│ -entry       │  │ -line        │  │ (Chart of Accts)  │
│ (header)     │  │ (debit/      │  │ running balance   │
│              │  │  credit rows)│  │ updated per post  │
└──────────────┘  └──────────────┘  └──────────────────┘
        │                                    ▲
        │         ┌──────────────────────────┘
        ▼         │
┌──────────────────────────────────────────────────────────────┐
│  SUPPORTING ENTITIES                                          │
│  acc-tax-rate · acc-fiscal-period · acc-bank-account          │
│  acc-invoice  · acc-bill  · acc-expense                       │
└──────────────────────────────────────────────────────────────┘
```

**Design Principles**:
- Operational modules (sale, purchase, etc.) **never write directly** to `acc-account` balances.
- All balance changes flow through **journal entries** via the accounting service layer.
- Every journal entry is **balanced** (total debits = total credits) — enforced by the service.
- Every journal entry is **traceable** back to a source document via `source_type` + `source_id`.

---

## 2. Core Accounting Principles

### The Accounting Equation

```
Assets = Liabilities + Equity + (Revenue − Expenses)
```

### Double-Entry Rule

Every financial event produces **at least two journal lines** that must sum to zero:

| Rule | Debit ↑ | Credit ↑ |
|------|---------|----------|
| **Asset** | Increase | Decrease |
| **Liability** | Decrease | Increase |
| **Equity** | Decrease | Increase |
| **Revenue** | Decrease | Increase |
| **Expense** | Increase | Decrease |

### Normal Balances

| Account Type | Normal Balance |
|-------------|---------------|
| Asset | Debit |
| Liability | Credit |
| Equity | Credit |
| Revenue | Credit |
| Expense | Debit |

### Immutability Rule

Journal entries, once **posted**, are **never edited or deleted**. Corrections are made by posting a **reversal entry** (same amounts, swapped debit/credit) followed by a new corrected entry.

---

## 3. Module 1 — Chart of Accounts

### Purpose

The Chart of Accounts (CoA) is the **master list** of all ledger accounts. Every financial transaction ultimately posts to one or more of these accounts. The CoA is hierarchical (parent → children) to support grouping for financial reports.

### Existing Entity: `acc-account` (enhanced)

The current `acc-account` schema is a good foundation. The enhancements add:
- `sub_type` — finer classification within the five main types
- `currency` — for multi-currency ledger accounts
- `branch` — for branch-level profit centres (optional; null = company-wide)
- `is_system` — protects auto-created accounts from deletion
- `is_active` — soft-disable without losing history
- `normal_balance` — explicitly stored for validation

### Enhanced Schema

```jsonc
// src/api/acc-account/content-types/acc-account/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_accounts",
  "info": {
    "singularName": "acc-account",
    "pluralName": "acc-accounts",
    "displayName": "Account",
    "description": "Chart of accounts — ledger accounts"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "code":         { "type": "string", "required": true, "unique": true },
    "name":         { "type": "string", "required": true },
    "account_type": {
      "type": "enumeration",
      "enum": ["Asset", "Liability", "Equity", "Revenue", "Expense"],
      "required": true
    },
    "sub_type": {
      "type": "enumeration",
      "enum": [
        "Cash",
        "Bank",
        "Accounts Receivable",
        "Inventory",
        "Fixed Asset",
        "Other Current Asset",
        "Accounts Payable",
        "Tax Payable",
        "Other Current Liability",
        "Long Term Liability",
        "Owner Equity",
        "Retained Earnings",
        "Sales Revenue",
        "Sales Returns",
        "Other Revenue",
        "Cost of Goods Sold",
        "Operating Expense",
        "Payroll Expense",
        "Tax Expense",
        "Other Expense"
      ]
    },
    "normal_balance": {
      "type": "enumeration",
      "enum": ["Debit", "Credit"],
      "required": true
    },
    "balance":     { "type": "decimal", "default": 0 },
    "description": { "type": "text" },
    "is_system":   { "type": "boolean", "default": false },
    "is_active":   { "type": "boolean", "default": true },
    "parent": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::acc-account.acc-account",
      "inversedBy": "children"
    },
    "children": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::acc-account.acc-account",
      "mappedBy": "parent"
    },
    "currency": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::currency.currency"
    },
    "branch": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::branch.branch"
    }
  }
}
```

### Key Workflows

1. **Seeding** — On first run, create the default CoA (see [Section 17](#17-seed-data--default-chart-of-accounts)).
2. **Adding accounts** — User creates a new account; code must follow the numbering scheme.
3. **Deactivating** — Set `is_active: false`; system accounts (`is_system: true`) cannot be deactivated.
4. **Balance updates** — Only the accounting service updates `balance` after posting journal lines.

---

## 4. Module 2 — General Ledger & Journal Entries

### Purpose

The General Ledger is the **complete record of all financial transactions**. It is composed of **journal entries** (headers) and their **journal lines** (the individual debit/credit postings). This is the heart of the accounting system.

### Why Split into Header + Lines?

The current `acc-journal-entry` stores `debit` and `credit` as fields on a single record with one `account` relation. This means a balanced double-entry transaction requires the caller to create multiple records and manually ensure they balance. By introducing a **header** (`acc-journal-entry`) and **line** (`acc-journal-line`) pattern:

- The header groups all lines of one transaction together.
- The service can **validate balance** (sum of debits = sum of credits) atomically before posting.
- Source document traceability lives on the header.
- The header carries the `status` (Draft → Posted → Reversed), providing a clear workflow.

### Entity: `acc-journal-entry` (redesigned as header)

```jsonc
// src/api/acc-journal-entry/content-types/acc-journal-entry/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_journal_entries",
  "info": {
    "singularName": "acc-journal-entry",
    "pluralName": "acc-journal-entries",
    "displayName": "Journal Entry",
    "description": "Header for a balanced set of journal lines"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "entry_number": { "type": "string", "required": true, "unique": true },
    "date":         { "type": "date", "required": true },
    "description":  { "type": "text" },
    "reference":    { "type": "string" },

    "source_type": {
      "type": "enumeration",
      "enum": [
        "POS Sale",
        "Sale Return",
        "Purchase Order",
        "Purchase Receipt",
        "Purchase Return",
        "Web Order",
        "Cash Register Open",
        "Cash Register Close",
        "Cash Register Transaction",
        "Inventory Adjustment",
        "Expense",
        "Invoice Payment",
        "Bill Payment",
        "Manual"
      ]
    },
    "source_id":   { "type": "integer" },
    "source_ref":  { "type": "string" },

    "status": {
      "type": "enumeration",
      "enum": ["Draft", "Posted", "Reversed"],
      "default": "Draft"
    },

    "total_debit":  { "type": "decimal", "default": 0 },
    "total_credit": { "type": "decimal", "default": 0 },

    "lines": {
      "type": "relation",
      "relation": "oneToMany",
      "target": "api::acc-journal-line.acc-journal-line",
      "mappedBy": "journal_entry"
    },

    "reversal_of": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::acc-journal-entry.acc-journal-entry"
    },

    "fiscal_period": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::acc-fiscal-period.acc-fiscal-period"
    },

    "branch": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::branch.branch"
    },

    "currency": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::currency.currency"
    },
    "exchange_rate": { "type": "decimal", "default": 1 },

    "posted_by": { "type": "string" },
    "posted_at":  { "type": "datetime" },

    "owners": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "plugin::users-permissions.user"
    }
  }
}
```

### New Entity: `acc-journal-line`

```jsonc
// src/api/acc-journal-line/content-types/acc-journal-line/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_journal_lines",
  "info": {
    "singularName": "acc-journal-line",
    "pluralName": "acc-journal-lines",
    "displayName": "Journal Line",
    "description": "Individual debit or credit line within a journal entry"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "journal_entry": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::acc-journal-entry.acc-journal-entry",
      "inversedBy": "lines"
    },
    "account": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::acc-account.acc-account"
    },
    "debit":       { "type": "decimal", "default": 0 },
    "credit":      { "type": "decimal", "default": 0 },
    "description": { "type": "string" },
    "tax_rate":    { "type": "decimal" },
    "tax_amount":  { "type": "decimal" }
  }
}
```

### Key Workflows

#### Creating a Journal Entry (Service Flow)

```
1. Caller passes: { date, description, source_type, source_id, lines: [...] }
2. Service validates:
   a. Fiscal period is open for the given date
   b. All referenced accounts exist and are active
   c. Sum of debit amounts === Sum of credit amounts (balance check)
   d. Each line has either debit > 0 OR credit > 0, never both
3. Service generates entry_number (e.g., "JE-2025-000042")
4. Service creates the header with status: "Draft"
5. Service creates all journal lines linked to the header
6. Service sets status to "Posted"
7. Service updates each referenced acc-account.balance:
   - balance += debit − credit  (for normal-debit accounts)
   - balance += credit − debit  (for normal-credit accounts)
8. Service sets posted_at = now, posted_by = current user
```

#### Reversing a Journal Entry

```
1. Create a new journal entry with reversal_of → original entry
2. Copy all lines with debit ↔ credit swapped
3. Post the reversal (updates account balances in reverse)
4. Set original entry status to "Reversed"
```

---

## 5. Module 3 — Accounts Receivable

### Purpose

Tracks money **owed to the business by customers**. In a retail POS context, most sales are paid immediately, but the system must handle:
- Credit sales (customer pays later)
- Partial payments
- Web orders paid via Stripe (may have settlement delays)

### Existing Entity: `acc-invoice` (enhanced)

The current `acc-invoice` is standalone. Enhancements link it to customers, sales, and the journal.

### Enhanced Schema

```jsonc
// src/api/acc-invoice/content-types/acc-invoice/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_invoices",
  "info": {
    "singularName": "acc-invoice",
    "pluralName": "acc-invoices",
    "displayName": "Invoice",
    "description": "Customer invoices — accounts receivable"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "invoice_number": { "type": "string", "required": true, "unique": true },
    "date":           { "type": "date", "required": true },
    "due_date":       { "type": "date" },

    "customer": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::customer.customer"
    },

    "sale": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::sale.sale"
    },
    "order": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::order.order"
    },

    "subtotal":   { "type": "decimal", "required": true },
    "tax_amount": { "type": "decimal", "default": 0 },
    "total":      { "type": "decimal", "required": true },
    "amount_paid":     { "type": "decimal", "default": 0 },
    "balance_due":     { "type": "decimal", "default": 0 },

    "status": {
      "type": "enumeration",
      "enum": ["Draft", "Sent", "Partially Paid", "Paid", "Overdue", "Cancelled"],
      "default": "Draft"
    },

    "journal_entry": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::acc-journal-entry.acc-journal-entry"
    },

    "currency": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::currency.currency"
    },

    "notes": { "type": "text" },

    "branch": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::branch.branch"
    },

    "owners": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "plugin::users-permissions.user"
    }
  }
}
```

### Journal Entry — Credit Sale Invoice Created

When an invoice is generated for a credit sale:

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1200 Accounts Receivable | 1,050 | |
| 2 | 4000 Sales Revenue | | 1,000 |
| 3 | 2100 Sales Tax Payable | | 50 |

### Journal Entry — Invoice Payment Received

When customer pays the invoice:

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1000 Cash / 1100 Bank | 1,050 | |
| 2 | 1200 Accounts Receivable | | 1,050 |

---

## 6. Module 4 — Accounts Payable

### Purpose

Tracks money the **business owes to suppliers**. Generated when purchase orders are received and supplier bills are recorded.

### New Entity: `acc-bill`

```jsonc
// src/api/acc-bill/content-types/acc-bill/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_bills",
  "info": {
    "singularName": "acc-bill",
    "pluralName": "acc-bills",
    "displayName": "Bill",
    "description": "Supplier bills — accounts payable"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "bill_number":  { "type": "string", "required": true, "unique": true },
    "supplier_ref": { "type": "string" },
    "date":         { "type": "date", "required": true },
    "due_date":     { "type": "date" },

    "supplier": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::supplier.supplier"
    },
    "purchase": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::purchase.purchase"
    },

    "subtotal":    { "type": "decimal", "required": true },
    "tax_amount":  { "type": "decimal", "default": 0 },
    "total":       { "type": "decimal", "required": true },
    "amount_paid":  { "type": "decimal", "default": 0 },
    "balance_due":  { "type": "decimal", "default": 0 },

    "status": {
      "type": "enumeration",
      "enum": ["Draft", "Received", "Partially Paid", "Paid", "Overdue", "Cancelled"],
      "default": "Draft"
    },

    "journal_entry": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::acc-journal-entry.acc-journal-entry"
    },

    "currency": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::currency.currency"
    },

    "notes": { "type": "text" },

    "branch": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::branch.branch"
    },

    "owners": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "plugin::users-permissions.user"
    }
  }
}
```

### Journal Entry — Purchase Receipt (Bill Created)

When goods are received and the supplier bill is recorded:

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1300 Inventory | 5,000 | |
| 2 | 2000 Accounts Payable | | 5,000 |

### Journal Entry — Supplier Bill Payment

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 2000 Accounts Payable | 5,000 | |
| 2 | 1100 Bank Account | | 5,000 |

---

## 7. Module 5 — Cash & Bank Accounts

### Purpose

Tracks physical cash drawers and bank accounts. Maps directly to ledger accounts of sub_type `Cash` or `Bank`.

### New Entity: `acc-bank-account`

```jsonc
// src/api/acc-bank-account/content-types/acc-bank-account/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_bank_accounts",
  "info": {
    "singularName": "acc-bank-account",
    "pluralName": "acc-bank-accounts",
    "displayName": "Bank Account",
    "description": "Bank and cash accounts linked to ledger accounts"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "name":           { "type": "string", "required": true },
    "account_number": { "type": "string" },
    "bank_name":      { "type": "string" },
    "account_type": {
      "type": "enumeration",
      "enum": ["Cash", "Checking", "Savings", "Credit Card", "Mobile Wallet"],
      "required": true
    },
    "current_balance": { "type": "decimal", "default": 0 },

    "ledger_account": {
      "type": "relation",
      "relation": "oneToOne",
      "target": "api::acc-account.acc-account"
    },

    "currency": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::currency.currency"
    },

    "branch": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::branch.branch"
    },

    "is_active": { "type": "boolean", "default": true },

    "owners": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "plugin::users-permissions.user"
    }
  }
}
```

### Relationship with Cash Register

The existing `cash-register` entity tracks POS drawer sessions (open/close). The accounting bridge works as follows:

```
cash-register (operational)
    │
    │  On Open  →  Journal Entry: Debit CashDrawer / Credit SafeCash
    │  On Close →  Journal Entry: Debit SafeCash / Credit CashDrawer
    │              + record difference (short/over) to Expense or Revenue
    │
    ▼
acc-bank-account (type: Cash, branch-specific)
    │
    ▼
acc-account (sub_type: Cash)  ← balance updated via journal
```

### Journal Entry — Cash Register Opening

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1001 Cash Drawer – Branch A | 500 | |
| 2 | 1000 Cash Safe – Branch A | | 500 |

### Journal Entry — Cash Register Closing (with shortage)

Counted cash = 2,800; Expected = 3,000; Short = 200

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1000 Cash Safe – Branch A | 2,800 | |
| 2 | 5200 Cash Short/Over | 200 | |
| 3 | 1001 Cash Drawer – Branch A | | 3,000 |

---

## 8. Module 6 — Tax Handling

### Purpose

Configurable tax rates that integrate with the product catalog and branch settings. Tax amounts are calculated per sale/purchase line and tracked via dedicated tax payable/receivable ledger accounts.

### New Entity: `acc-tax-rate`

```jsonc
// src/api/acc-tax-rate/content-types/acc-tax-rate/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_tax_rates",
  "info": {
    "singularName": "acc-tax-rate",
    "pluralName": "acc-tax-rates",
    "displayName": "Tax Rate",
    "description": "Configurable tax rates for sales and purchases"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "name":       { "type": "string", "required": true },
    "code":       { "type": "string", "required": true, "unique": true },
    "rate":       { "type": "decimal", "required": true },
    "type": {
      "type": "enumeration",
      "enum": ["Inclusive", "Exclusive"],
      "default": "Exclusive"
    },
    "scope": {
      "type": "enumeration",
      "enum": ["Sales", "Purchases", "Both"],
      "default": "Both"
    },
    "sales_account": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::acc-account.acc-account"
    },
    "purchase_account": {
      "type": "relation",
      "relation": "manyToOne",
      "target": "api::acc-account.acc-account"
    },
    "is_active": { "type": "boolean", "default": true }
  }
}
```

### Tax Calculation Flow

```
Sale Line Total = quantity × price
  │
  ├─ If tax type = "Exclusive":
  │    tax_amount = total × (rate / 100)
  │    line_total = total + tax_amount
  │
  └─ If tax type = "Inclusive":
       tax_amount = total − (total / (1 + rate / 100))
       line_total = total  (price already includes tax)
```

### Tax in Journal Entries

Tax amounts are always posted to the tax payable/receivable account as a **separate journal line**:

**Sales tax** (collected from customer):
- Debit: Cash/AR → full amount including tax
- Credit: Revenue → net amount
- Credit: Sales Tax Payable (2100) → tax amount

**Purchase tax** (paid to supplier, reclaimable):
- Debit: Inventory/Expense → net amount
- Debit: Purchase Tax Receivable (1400) → tax amount
- Credit: AP/Cash/Bank → full amount including tax

---

## 9. Module 7 — Fiscal Periods

### Purpose

Controls which date ranges accept journal postings. Prevents posting to closed periods and supports year-end closing procedures.

### New Entity: `acc-fiscal-period`

```jsonc
// src/api/acc-fiscal-period/content-types/acc-fiscal-period/schema.json
{
  "kind": "collectionType",
  "collectionName": "acc_fiscal_periods",
  "info": {
    "singularName": "acc-fiscal-period",
    "pluralName": "acc-fiscal-periods",
    "displayName": "Fiscal Period",
    "description": "Fiscal year periods that control journal posting"
  },
  "options": { "draftAndPublish": false },
  "attributes": {
    "name":       { "type": "string", "required": true },
    "start_date": { "type": "date", "required": true },
    "end_date":   { "type": "date", "required": true },
    "status": {
      "type": "enumeration",
      "enum": ["Open", "Closed", "Locked"],
      "default": "Open"
    },
    "fiscal_year": { "type": "string" },
    "owners": {
      "type": "relation",
      "relation": "manyToMany",
      "target": "plugin::users-permissions.user"
    }
  }
}
```

### Key Rules

1. **Posting guard** — The accounting service checks that the journal entry date falls within an **Open** period before allowing a post.
2. **Period close** — Closing a period sets status to `Closed`. No new entries can be posted.
3. **Lock** — After audit, periods are `Locked`. Even reversals are blocked.
4. **Year-end** — A special journal entry closes Revenue and Expense accounts to Retained Earnings.

---

## 10. Retail Integration Workflows

This is the critical section: how each operational event automatically generates accounting entries.

---

### 10.1 POS Sale (Cash Sale — Paid Immediately)

**Trigger**: `checkout.js` → after payment is recorded and sale status = Completed

**Journal Entry** (source_type: "POS Sale", source_id: sale.id):

| Line | Account | Debit | Credit | Notes |
|------|---------|-------|--------|-------|
| 1 | 1001 Cash Drawer | 1,050 | | Cash received |
| 2 | 4000 Sales Revenue | | 1,000 | Net sale |
| 3 | 2100 Sales Tax Payable | | 50 | Tax collected |

If payment is split (e.g., 500 cash + 550 card):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1001 Cash Drawer | 500 | |
| 2 | 1100 Bank (Card) | 550 | |
| 3 | 4000 Sales Revenue | | 1,000 |
| 4 | 2100 Sales Tax Payable | | 50 |

**Also records COGS** (Cost of Goods Sold):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 5000 Cost of Goods Sold | 600 | |
| 2 | 1300 Inventory | | 600 |

> COGS is calculated as `sum(stock_item.cost_price)` for all stock items attached to the sale items.

---

### 10.2 POS Sale Return (Full Refund)

**Trigger**: Sale return created with refund_status = "Refunded"

**Journal Entry** (source_type: "Sale Return", source_id: sale_return.id):

| Line | Account | Debit | Credit | Notes |
|------|---------|-------|--------|-------|
| 1 | 4100 Sales Returns & Allowances | 1,000 | | Contra-revenue |
| 2 | 2100 Sales Tax Payable | 50 | | Tax reversal |
| 3 | 1001 Cash Drawer | | 1,050 | Cash refunded |

**Inventory reversal** (if items returned to stock):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1300 Inventory | 600 | |
| 2 | 5000 Cost of Goods Sold | | 600 |

---

### 10.3 POS Exchange Return

**Trigger**: Sale return with type = "Exchange"

This is a compound event: a return + a new sale. Two journal entries are created:
1. The return entry (same as 10.2 above)
2. The new sale entry (same as 10.1 above)

If the exchange has a price difference, the difference is handled in the new sale's payment.

---

### 10.4 Purchase Order → Purchase Receipt

**Trigger**: Purchase status changes to "Received" or "Partially Received"

**Journal Entry** (source_type: "Purchase Receipt", source_id: purchase.id):

| Line | Account | Debit | Credit | Notes |
|------|---------|-------|--------|-------|
| 1 | 1300 Inventory | 5,000 | | Stock value |
| 2 | 2000 Accounts Payable | | 5,000 | Owed to supplier |

> Inventory amount = `sum(purchase_item.unit_price × received_quantity)` for all received items.

---

### 10.5 Purchase Payment

**Trigger**: Payment made against a supplier bill

**Journal Entry** (source_type: "Bill Payment"):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 2000 Accounts Payable | 5,000 | |
| 2 | 1100 Bank Account | | 5,000 |

---

### 10.6 Purchase Return

**Trigger**: Purchase return created

**Journal Entry** (source_type: "Purchase Return", source_id: purchase_return.id):

| Line | Account | Debit | Credit | Notes |
|------|---------|-------|--------|-------|
| 1 | 2000 Accounts Payable | 1,500 | | Reduce liability |
| 2 | 1300 Inventory | | 1,500 | Stock returned |

---

### 10.7 Web Order (Stripe Payment)

**Trigger**: Stripe webhook confirms payment_status = "paid"

**Journal Entry** (source_type: "Web Order", source_id: order.id):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1100 Bank (Stripe) | 2,100 | |
| 2 | 4000 Sales Revenue | | 2,000 |
| 3 | 2100 Sales Tax Payable | | 100 |

**COGS entry** is created separately, same pattern as POS Sale.

---

### 10.8 Inventory Adjustment

**Trigger**: Manual stock adjustment (damage, loss, count correction)

**Stock Write-Off (Damaged/Lost)**:

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 5100 Inventory Write-Off | 200 | |
| 2 | 1300 Inventory | | 200 |

**Stock Count Increase (Found extra stock)**:

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1300 Inventory | 150 | |
| 2 | 4200 Inventory Adjustment Gain | | 150 |

---

### 10.9 Cash Register Opening

**Trigger**: Cash register opened with `opening_cash` amount

**Journal Entry** (source_type: "Cash Register Open", source_id: cash_register.id):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1001 Cash Drawer – Branch | 500 | |
| 2 | 1000 Cash Safe – Branch | | 500 |

---

### 10.10 Cash Register Closing

**Trigger**: Cash register closed, `counted_cash` recorded

**Journal Entry** (source_type: "Cash Register Close", source_id: cash_register.id):

If counted = expected (no discrepancy):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1000 Cash Safe – Branch | 3,000 | |
| 2 | 1001 Cash Drawer – Branch | | 3,000 |

If counted < expected (shortage = 200):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1000 Cash Safe – Branch | 2,800 | |
| 2 | 5200 Cash Short/Over | 200 | |
| 3 | 1001 Cash Drawer – Branch | | 3,000 |

If counted > expected (overage = 100):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1000 Cash Safe – Branch | 3,100 | |
| 2 | 4300 Cash Short/Over (gain) | | 100 |
| 3 | 1001 Cash Drawer – Branch | | 3,000 |

---

### 10.11 Business Expense Recording

**Trigger**: `acc-expense` created

**Journal Entry** (source_type: "Expense", source_id: expense.id):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 5xxx (expense account from expense.account) | 300 | |
| 2 | 1001 Cash / 1100 Bank | | 300 |

---

### 10.12 Cash Register Transaction (Drop/TopUp)

**Trigger**: `cash-register-transaction` created

**Cash Drop** (moving cash from drawer to safe):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1000 Cash Safe | 1,000 | |
| 2 | 1001 Cash Drawer | | 1,000 |

**Cash Top-Up** (adding cash to drawer):

| Line | Account | Debit | Credit |
|------|---------|-------|--------|
| 1 | 1001 Cash Drawer | 500 | |
| 2 | 1000 Cash Safe | | 500 |

---

## 11. Multi-Branch & Multi-Currency

### Multi-Branch Strategy

Each branch can have its own set of **branch-level accounts** (cash drawers, registers) while sharing **company-wide accounts** (bank accounts, AP, AR, equity).

```
acc-account:
  ├── 1000 Cash Safe           (branch: null → company-wide)
  ├── 1001 Cash Drawer - HQ    (branch: 1)
  ├── 1001 Cash Drawer - Mall   (branch: 2)
  ├── 1100 Bank Account        (branch: null → company-wide)
  ├── 1300 Inventory - HQ      (branch: 1)
  └── 1300 Inventory - Mall     (branch: 2)
```

**Rules**:
- Journal entries carry a `branch` relation for the originating branch.
- Branch-level reports filter by `journal_entry.branch`.
- Consolidated reports aggregate across all branches.
- Per the project guidelines, branch relations to sales, sale_returns, and purchase_returns remain **manyToMany** (plural "branches").

### Multi-Currency Strategy

```
Transaction in foreign currency
    │
    ▼
acc-journal-entry.currency   = foreign currency
acc-journal-entry.exchange_rate = rate at transaction date
    │
    ▼
acc-journal-line amounts     = stored in BASE currency (converted)
    │
    ▼
acc-account.balance          = always in base currency
```

**Key Points**:
- All ledger balances are stored in the **base currency** (the branch's configured currency).
- The journal entry header stores the original transaction currency and the exchange rate used.
- Multi-currency accounts (like a USD bank account in a GBP company) track the foreign amount on the `acc-bank-account` entity, while the ledger amount is the base-currency equivalent.
- Exchange rate gains/losses are posted to a dedicated account (4400 Exchange Gain / 5300 Exchange Loss) when rates fluctuate between invoice creation and payment.

---

## 12. Audit Trail

Every accounting entity inherits Strapi's built-in `createdAt`, `updatedAt`, `createdBy`, `updatedBy` fields. Additional audit measures:

### Immutability

- **Posted journal entries** cannot be updated or deleted. Only reversals are allowed.
- The `status` field on `acc-journal-entry` enforces this: once `Posted`, the service rejects any `update` call.
- The `posted_by` and `posted_at` fields record who approved the posting and when.

### Source Traceability

Every journal entry carries:
- `source_type` — which operational module generated it
- `source_id` — the Strapi entity ID of the source document
- `source_ref` — human-readable reference (e.g., invoice_no, return_no, orderId)

This allows full drill-down from any ledger balance → journal lines → source document.

### Lifecycle Hook Protection

```javascript
// src/api/acc-journal-entry/content-types/acc-journal-entry/lifecycles.js
module.exports = {
  async beforeUpdate(event) {
    const { where } = event.params;
    const existing = await strapi.entityService.findOne(
      'api::acc-journal-entry.acc-journal-entry',
      where.id
    );
    if (existing && existing.status === 'Posted') {
      // Only allow status change to 'Reversed' by the accounting service
      const newStatus = event.params.data?.status;
      if (newStatus !== 'Reversed') {
        throw new Error('Posted journal entries cannot be modified. Create a reversal instead.');
      }
    }
  },
  async beforeDelete(event) {
    const { where } = event.params;
    const existing = await strapi.entityService.findOne(
      'api::acc-journal-entry.acc-journal-entry',
      where.id
    );
    if (existing && existing.status !== 'Draft') {
      throw new Error('Only draft journal entries can be deleted.');
    }
  },
};
```

---

## 13. Financial Reporting

All reports are derived from querying `acc-journal-line` joined with `acc-account` and `acc-journal-entry`. No separate reporting tables are needed.

### 13.1 Trial Balance

```
For each acc-account where is_active = true:
  total_debit  = SUM(journal_line.debit)  WHERE journal_entry.status = 'Posted'
                                           AND journal_entry.date BETWEEN period.start AND period.end
  total_credit = SUM(journal_line.credit) same filters

  balance = total_debit - total_credit

Display:
  Account Code | Account Name | Debit Balance | Credit Balance
  -----------------------------------------------------------
  1000         | Cash Safe    | 15,000        |
  2000         | Accounts Payable |           | 8,000
  ...
  TOTALS                      | 50,000        | 50,000  ← must match
```

### 13.2 Income Statement (Profit & Loss)

```
Revenue     = SUM(credit - debit) for accounts WHERE account_type = 'Revenue'
COGS        = SUM(debit - credit) for accounts WHERE sub_type = 'Cost of Goods Sold'
Gross Profit = Revenue - COGS

Expenses    = SUM(debit - credit) for accounts WHERE account_type = 'Expense' AND sub_type != 'Cost of Goods Sold'
Net Profit  = Gross Profit - Expenses
```

### 13.3 Balance Sheet

```
Assets      = SUM(debit - credit) for accounts WHERE account_type = 'Asset'
Liabilities = SUM(credit - debit) for accounts WHERE account_type = 'Liability'
Equity      = SUM(credit - debit) for accounts WHERE account_type = 'Equity'

Verify: Assets = Liabilities + Equity
```

### 13.4 Cash Flow Statement

Query journal lines where the account sub_type is `Cash` or `Bank`:

```
Operating:   Lines linked to POS Sale, Sale Return, Expense source_types
Investing:   Lines linked to Fixed Asset purchases
Financing:   Lines linked to Owner Equity, Loan source_types
```

### 13.5 Accounts Receivable Aging

```
For each acc-invoice WHERE status IN ('Sent', 'Partially Paid', 'Overdue'):
  age = today - due_date
  Bucket: Current (0-30) | 31-60 | 61-90 | 90+
```

### 13.6 Accounts Payable Aging

Same logic applied to `acc-bill`.

### 13.7 Branch Profit Report

Filter all journal entries by `branch` and compute Income Statement per branch.

---

## 14. Entity Relationship Diagram

```
┌─────────────────┐       ┌─────────────────────┐       ┌──────────────┐
│  acc-fiscal-     │       │  acc-journal-entry   │       │  acc-journal- │
│  period          │◄──────│  (header)            │──────►│  line         │
│                  │  1:M  │                      │ 1:M   │              │
│  name            │       │  entry_number        │       │  debit       │
│  start_date      │       │  date                │       │  credit      │
│  end_date        │       │  description         │       │  description │
│  status          │       │  source_type/id/ref  │       │  tax_amount  │
│  fiscal_year     │       │  status              │       │              │
└─────────────────┘       │  total_debit/credit  │       │  account ──────►┌──────────────┐
                           │  branch ─────────────┼──►    │              │  │ acc-account   │
                           │  currency            │       └──────────────┘  │              │
                           │  exchange_rate       │                         │  code        │
                           │  posted_by/at        │                         │  name        │
                           └──────────┬───────────┘                         │  account_type│
                                      │                                     │  sub_type    │
                     ┌────────────────┼────────────────┐                    │  balance     │
                     ▼                ▼                ▼                    │  parent ──┐  │
              ┌──────────┐    ┌──────────┐    ┌──────────┐                 │  children◄┘  │
              │acc-invoice│    │ acc-bill  │    │acc-expense│                │  currency    │
              │          │    │          │    │          │                 │  branch      │
              │ customer │    │ supplier │    │ account  │                 └──────────────┘
              │ sale     │    │ purchase │    │ amount   │                        ▲
              │ order    │    │          │    │          │                        │
              │ balance_ │    │ balance_ │    └──────────┘                 ┌──────────────┐
              │   due    │    │   due    │                                 │acc-bank-     │
              └──────────┘    └──────────┘                                 │ account      │
                                                                           │              │
              ┌──────────┐    ┌──────────┐    ┌──────────┐                 │ ledger_acct──┘
              │  sale    │    │ purchase │    │cash-     │                 │ bank_name    │
              │          │    │          │    │register  │                 │ balance      │
              │ (POS)    │    │ (PO)     │    │          │                 └──────────────┘
              └──────────┘    └──────────┘    └──────────┘
                                                                           ┌──────────────┐
              ┌──────────┐    ┌──────────┐    ┌──────────┐                 │acc-tax-rate  │
              │sale-     │    │purchase- │    │  order   │                 │              │
              │return    │    │return    │    │  (web)   │                 │ rate         │
              └──────────┘    └──────────┘    └──────────┘                 │ type         │
                                                                           │ sales_acct   │
                                                                           │ purchase_acct│
                                                                           └──────────────┘
```

---

## 15. New & Modified Strapi Content Types

### Summary of Changes

| Entity | Status | Action |
|--------|--------|--------|
| `acc-account` | **Existing** | Add `sub_type`, `normal_balance`, `is_system`, `is_active`, `children`, `currency`, `branch` |
| `acc-journal-entry` | **Existing** | Redesign as header: replace `debit`/`credit`/`account` with `lines`, add `entry_number`, `source_type`, `source_id`, `source_ref`, `status`, `total_debit`, `total_credit`, `reversal_of`, `fiscal_period`, `branch`, `currency`, `exchange_rate`, `posted_by`, `posted_at` |
| `acc-journal-line` | **New** | Journal line with `journal_entry`, `account`, `debit`, `credit`, `description`, `tax_rate`, `tax_amount` |
| `acc-invoice` | **Existing** | Add `customer`, `sale`, `order`, `subtotal`, `tax_amount`, `amount_paid`, `balance_due`, `journal_entry`, `currency`, `branch`; add "Partially Paid" status; remove `customer_name` (use relation) |
| `acc-expense` | **Existing** | Add `journal_entry`, `branch`, `status` relations |
| `acc-bill` | **New** | Supplier bill (AP) with `supplier`, `purchase`, `journal_entry`, `currency`, `branch` |
| `acc-bank-account` | **New** | Bank/cash account linking to ledger account |
| `acc-tax-rate` | **New** | Configurable tax rates with ledger account links |
| `acc-fiscal-period` | **New** | Period control for journal posting |

### Entities NOT Modified

The operational entities (`sale`, `sale-return`, `purchase`, `purchase-return`, `cash-register`, `order`, `stock-item`, `payment`, etc.) are **not modified**. The accounting layer reads from them but does not add columns to them. This keeps the accounting module **decoupled** — it can be deployed independently without migrating operational tables.

The only integration point is the **accounting service** called from lifecycle hooks or controller logic in the operational modules.

---

## 16. Accounting Service Layer

### Location

```
src/api/acc-journal-entry/services/accounting.js
```

### Core API

```javascript
// src/api/acc-journal-entry/services/accounting.js
'use strict';

module.exports = {
  /**
   * Create and post a balanced journal entry.
   *
   * @param {object} params
   * @param {string} params.date         - Entry date (YYYY-MM-DD)
   * @param {string} params.description  - Human-readable description
   * @param {string} params.source_type  - Enum: "POS Sale", "Sale Return", etc.
   * @param {number} params.source_id    - ID of the source entity
   * @param {string} params.source_ref   - e.g., invoice_no, return_no
   * @param {number} [params.branch_id]  - Branch ID
   * @param {number} [params.currency_id]     - Currency ID (null = base currency)
   * @param {number} [params.exchange_rate]   - Rate to base (default 1)
   * @param {Array}  params.lines        - Array of { account_id, debit, credit, description }
   * @param {object} [params.user]       - The acting user
   * @returns {object} The created journal entry with lines
   */
  async createAndPost({ date, description, source_type, source_id, source_ref,
                        branch_id, currency_id, exchange_rate = 1, lines, user }) {

    // 1. Validate fiscal period is open
    const period = await this.findOpenPeriod(date);
    if (!period) {
      throw new Error(`No open fiscal period for date ${date}`);
    }

    // 2. Validate balance
    const totalDebit  = lines.reduce((s, l) => s + Number(l.debit  || 0), 0);
    const totalCredit = lines.reduce((s, l) => s + Number(l.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.001) {
      throw new Error(
        `Journal entry is not balanced: debit=${totalDebit}, credit=${totalCredit}`
      );
    }

    // 3. Validate each line
    for (const line of lines) {
      if ((line.debit > 0 && line.credit > 0) || (line.debit === 0 && line.credit === 0)) {
        throw new Error('Each line must have either debit > 0 or credit > 0, not both or neither.');
      }
      const account = await strapi.entityService.findOne(
        'api::acc-account.acc-account', line.account_id
      );
      if (!account) throw new Error(`Account ${line.account_id} not found`);
      if (!account.is_active) throw new Error(`Account ${account.code} is inactive`);
    }

    // 4. Generate entry number
    const entryNumber = await this.generateEntryNumber(date);

    // 5. Create header
    const entry = await strapi.entityService.create(
      'api::acc-journal-entry.acc-journal-entry',
      {
        data: {
          entry_number: entryNumber,
          date,
          description,
          source_type,
          source_id,
          source_ref,
          status: 'Draft',
          total_debit: totalDebit,
          total_credit: totalCredit,
          fiscal_period: period.id,
          ...(branch_id   ? { branch: branch_id }   : {}),
          ...(currency_id ? { currency: currency_id } : {}),
          exchange_rate,
        },
      }
    );

    // 6. Create lines
    for (const line of lines) {
      await strapi.entityService.create(
        'api::acc-journal-line.acc-journal-line',
        {
          data: {
            journal_entry: entry.id,
            account: line.account_id,
            debit:  Number(line.debit  || 0),
            credit: Number(line.credit || 0),
            description: line.description || '',
            tax_rate:   line.tax_rate   || null,
            tax_amount: line.tax_amount || null,
          },
        }
      );
    }

    // 7. Update account balances
    for (const line of lines) {
      const account = await strapi.entityService.findOne(
        'api::acc-account.acc-account', line.account_id
      );
      const delta = account.normal_balance === 'Debit'
        ? Number(line.debit || 0) - Number(line.credit || 0)
        : Number(line.credit || 0) - Number(line.debit || 0);

      await strapi.entityService.update(
        'api::acc-account.acc-account',
        line.account_id,
        { data: { balance: Number(account.balance) + delta } }
      );
    }

    // 8. Mark as posted
    const posted = await strapi.entityService.update(
      'api::acc-journal-entry.acc-journal-entry',
      entry.id,
      {
        data: {
          status: 'Posted',
          posted_by: user?.username || 'system',
          posted_at: new Date(),
        },
      }
    );

    return posted;
  },

  /**
   * Reverse a posted journal entry.
   */
  async reverse(entryId, { user } = {}) {
    const original = await strapi.entityService.findOne(
      'api::acc-journal-entry.acc-journal-entry',
      entryId,
      { populate: { lines: { populate: { account: true } } } }
    );
    if (!original) throw new Error('Journal entry not found');
    if (original.status !== 'Posted') throw new Error('Only posted entries can be reversed');

    const reversalLines = original.lines.map((l) => ({
      account_id:  l.account.id,
      debit:       l.credit,  // swap
      credit:      l.debit,   // swap
      description: `Reversal: ${l.description || ''}`,
    }));

    const reversal = await this.createAndPost({
      date:          new Date().toISOString().split('T')[0],
      description:   `Reversal of ${original.entry_number}`,
      source_type:   original.source_type,
      source_id:     original.source_id,
      source_ref:    original.source_ref,
      branch_id:     original.branch?.id,
      currency_id:   original.currency?.id,
      exchange_rate:  original.exchange_rate,
      lines:         reversalLines,
      user,
    });

    // Link reversal and mark original as reversed
    await strapi.entityService.update(
      'api::acc-journal-entry.acc-journal-entry',
      reversal.id,
      { data: { reversal_of: original.id } }
    );
    await strapi.entityService.update(
      'api::acc-journal-entry.acc-journal-entry',
      original.id,
      { data: { status: 'Reversed' } }
    );

    return reversal;
  },

  /**
   * Find the open fiscal period for a given date.
   */
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
    return periods[0] || null;
  },

  /**
   * Generate a sequential entry number for the year.
   */
  async generateEntryNumber(date) {
    const year = new Date(date).getFullYear();
    const prefix = `JE-${year}-`;
    const existing = await strapi.entityService.findMany(
      'api::acc-journal-entry.acc-journal-entry',
      {
        filters: { entry_number: { $startsWith: prefix } },
        sort: { entry_number: 'desc' },
        limit: 1,
      }
    );
    const lastNum = existing[0]
      ? parseInt(existing[0].entry_number.replace(prefix, ''), 10)
      : 0;
    return `${prefix}${String(lastNum + 1).padStart(6, '0')}`;
  },
};
```

### Integration Example — Checkout Hook

```javascript
// In src/api/sale/controllers/checkout.js — after step 5 (mark sale paid)

// 6. Create accounting entries
const accountingService = strapi.service('api::acc-journal-entry.accounting');

// Determine debit accounts per payment method
const paymentAccountMap = {
  'Cash':            { code: '1001' }, // Cash Drawer
  'Card':            { code: '1100' }, // Bank (Card)
  'Bank':            { code: '1100' }, // Bank
  'Mobile Wallet':   { code: '1100' }, // Bank
};

// Build journal lines
const journalLines = [];

// Debit lines — one per payment
for (const p of allPayments) {
  const accCode = paymentAccountMap[p.payment_method]?.code || '1001';
  const account = await strapi.db.query('api::acc-account.acc-account')
    .findOne({ where: { code: accCode } });
  journalLines.push({
    account_id: account.id,
    debit: Number(p.amount),
    credit: 0,
    description: `Payment: ${p.payment_method}`,
  });
}

// Credit line — sales revenue (net of tax)
const revenueAccount = await strapi.db.query('api::acc-account.acc-account')
  .findOne({ where: { code: '4000' } });
journalLines.push({
  account_id: revenueAccount.id,
  debit: 0,
  credit: Number(sale.subtotal || sale.total),
  description: 'Sales revenue',
});

// Credit line — tax (if any)
if (sale.tax && sale.tax > 0) {
  const taxAccount = await strapi.db.query('api::acc-account.acc-account')
    .findOne({ where: { code: '2100' } });
  journalLines.push({
    account_id: taxAccount.id,
    debit: 0,
    credit: Number(sale.tax),
    description: 'Sales tax collected',
  });
}

await accountingService.createAndPost({
  date: new Date().toISOString().split('T')[0],
  description: `POS Sale ${sale.invoice_no}`,
  source_type: 'POS Sale',
  source_id: sale.id,
  source_ref: sale.invoice_no,
  branch_id: sale.branches?.[0]?.id,
  lines: journalLines,
  user: ctx.state.user,
});

// COGS entry
const cogsLines = [];
let totalCost = 0;
for (const item of sale.items) {
  for (const stock of item.items) {
    totalCost += Number(stock.cost_price || 0);
  }
}
if (totalCost > 0) {
  const cogsAccount = await strapi.db.query('api::acc-account.acc-account')
    .findOne({ where: { code: '5000' } });
  const inventoryAccount = await strapi.db.query('api::acc-account.acc-account')
    .findOne({ where: { code: '1300' } });
  cogsLines.push(
    { account_id: cogsAccount.id,      debit: totalCost, credit: 0, description: 'COGS' },
    { account_id: inventoryAccount.id,  debit: 0, credit: totalCost, description: 'Inventory reduction' }
  );
  await accountingService.createAndPost({
    date: new Date().toISOString().split('T')[0],
    description: `COGS for Sale ${sale.invoice_no}`,
    source_type: 'POS Sale',
    source_id: sale.id,
    source_ref: sale.invoice_no,
    branch_id: sale.branches?.[0]?.id,
    lines: cogsLines,
    user: ctx.state.user,
  });
}
```

---

## 17. Seed Data — Default Chart of Accounts

```
Code  | Name                          | Type      | Sub Type              | Normal
------|-------------------------------|-----------|----------------------|-------
1000  | Cash Safe                     | Asset     | Cash                 | Debit
1001  | Cash Drawer                   | Asset     | Cash                 | Debit
1100  | Bank Account                  | Asset     | Bank                 | Debit
1200  | Accounts Receivable           | Asset     | Accounts Receivable  | Debit
1300  | Inventory                     | Asset     | Inventory            | Debit
1400  | Purchase Tax Receivable       | Asset     | Other Current Asset  | Debit
1500  | Fixed Assets                  | Asset     | Fixed Asset          | Debit
------|-------------------------------|-----------|----------------------|-------
2000  | Accounts Payable              | Liability | Accounts Payable     | Credit
2100  | Sales Tax Payable             | Liability | Tax Payable          | Credit
2200  | Other Current Liabilities     | Liability | Other Current Liab.  | Credit
2500  | Long Term Loans               | Liability | Long Term Liability  | Credit
------|-------------------------------|-----------|----------------------|-------
3000  | Owner's Equity                | Equity    | Owner Equity         | Credit
3100  | Retained Earnings             | Equity    | Retained Earnings    | Credit
------|-------------------------------|-----------|----------------------|-------
4000  | Sales Revenue                 | Revenue   | Sales Revenue        | Credit
4100  | Sales Returns & Allowances    | Revenue   | Sales Returns        | Credit
4200  | Inventory Adjustment Gain     | Revenue   | Other Revenue        | Credit
4300  | Cash Over                     | Revenue   | Other Revenue        | Credit
4400  | Exchange Rate Gain            | Revenue   | Other Revenue        | Credit
------|-------------------------------|-----------|----------------------|-------
5000  | Cost of Goods Sold            | Expense   | Cost of Goods Sold   | Debit
5100  | Inventory Write-Off           | Expense   | Operating Expense    | Debit
5200  | Cash Short                    | Expense   | Operating Expense    | Debit
5300  | Exchange Rate Loss            | Expense   | Operating Expense    | Debit
5400  | Rent Expense                  | Expense   | Operating Expense    | Debit
5500  | Utilities Expense             | Expense   | Operating Expense    | Debit
5600  | Payroll Expense               | Expense   | Payroll Expense      | Debit
5700  | General & Admin Expense       | Expense   | Operating Expense    | Debit
5800  | Tax Expense                   | Expense   | Tax Expense          | Debit
```

All seeded accounts should have `is_system: true` to prevent accidental deletion.

For multi-branch setups, branch-specific accounts (Cash Drawer, Inventory) are created per branch with the branch relation set and a suffix in the name (e.g., "Cash Drawer – Mall Branch").

---

## Summary

| Concern | Solution |
|---------|----------|
| **Double-entry** | Header + Lines model; service enforces debit = credit |
| **Traceability** | `source_type` + `source_id` + `source_ref` on every journal entry |
| **Immutability** | Lifecycle hooks prevent edit/delete of posted entries |
| **Auto-posting** | Accounting service called from checkout, returns, purchase receipt, cash register hooks |
| **Multi-branch** | Branch relation on accounts + journal entries; branch-level and consolidated reporting |
| **Multi-currency** | Currency + exchange_rate on journal entry; balances stored in base currency |
| **Tax** | Configurable `acc-tax-rate` entity; tax amounts as separate journal lines |
| **Audit** | Strapi built-in timestamps + `posted_by`/`posted_at` + immutability rules |
| **Periods** | `acc-fiscal-period` controls posting windows; year-end close procedure |
| **Reporting** | Derived from journal lines: Trial Balance, P&L, Balance Sheet, Aging |
