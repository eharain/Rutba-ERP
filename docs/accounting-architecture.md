# Accounting System Architecture

## Retail ERP — Strapi-Based Accounting Module

> **Platform**: Strapi 5.45 · MySQL · **Pattern**: Double-entry bookkeeping · **Scope**: Multi-branch retail POS

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Core Accounting Principles](#2-core-accounting-principles)
3. [Module 1 — Chart of Accounts](#3-module-1--chart-of-accounts)
3.5. [Account Resolution Layer (Account Mappings)](#35-account-resolution-layer-account-mappings)
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
│  accounting:       createAndPost() · reverse() · reverseBySource()│
│                    findBySource()  · updateAccountBalances()      │
│  account-resolver: resolve(key, branch) · resolvePaymentMethod() │
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
│  acc-account-mapping · acc-fiscal-period · acc-bank-account   │
│  acc-invoice · acc-bill · acc-expense · acc-tax-rate (scaffold)│
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

## 3.5. Account Resolution Layer (Account Mappings)

### Purpose

Posters (checkout, returns, cash register, payroll, etc.) **never hardcode account codes**. Instead they reference a stable **semantic key** (e.g. `SALES_REVENUE`, `INVENTORY`, `COGS`, `CASH_DRAWER`) and an **account-resolver** service maps that key to a concrete `acc-account` id — optionally overridden per branch. This decouples the integration code from the chart-of-accounts numbering scheme, so re-coding an account or running branch-specific cost centres requires no code change, only a mapping edit.

### Entity: `acc-account-mapping`

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
    "key":         { "type": "string", "required": true, "unique": true },
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

### Service: `account-resolver`

```
src/api/acc-journal-entry/services/account-resolver.js
```

```javascript
const resolver = strapi.service('api::acc-journal-entry.account-resolver');

// resolve(key, branchId) → acc-account id
const revenueAccountId = await resolver.resolve('SALES_REVENUE', branchId);

// resolvePaymentMethod(method, branchId) → acc-account id
const cashAccountId = await resolver.resolvePaymentMethod('Cash', branchId);
```

**Resolution order** (for `resolve(key, branchId)`):

1. **Branch-specific mapping** — a row matching `key` + the given `branch`.
2. **Global mapping** — a row matching `key` with no branch set.
3. **Last-resort** — any row matching `key` (ignoring branch).
4. **Throw** if no mapping exists, or if the mapped account is inactive — with a message pointing the operator at the *Acc Account Mapping* admin screen.

**`resolvePaymentMethod(method, branchId)`** translates a `payment_method` enum to a mapping key, then defers to `resolve(...)`:

| `payment_method` | Mapping key |
|------------------|-------------|
| `Cash` | `CASH_DRAWER` |
| `Card` | `CARD_CLEARING` |
| `Bank` | `BANK_PRIMARY` |
| `Mobile Wallet` | `MOBILE_WALLET` |
| `Exchange Return` | `EXCHANGE_CLEARING` |

The full set of seeded keys is listed in [Section 17](#17-seed-data--default-chart-of-accounts).

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
        "Web Order Payment",
        "Payroll Run",
        "Payroll Payment",
        "Production Labor",
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
1. Caller passes: { date, description, source_type, source_id, lines: [{ account, debit, credit, description }] }
2. Service validates:
   a. At least TWO lines are present
   b. Every line references an account
   c. Debit and credit amounts are non-negative
   d. Each line has either a debit OR a credit, never both, never neither
   e. Sum of debit amounts === Sum of credit amounts (balance check, compared in cents)
3. Service looks up the open fiscal period for the date (BEST-EFFORT — see Module 7):
   - If found, the entry is stamped with fiscal_period
   - If none, the entry is still created; posting is NEVER blocked
4. Service resolves currency: caller-supplied, else derived from branch.currency (best-effort)
5. Service generates entry_number (e.g., "JE-000042")
6. Service creates the header (status "Posted" when autoPost = true, else "Draft")
7. Service creates all journal lines linked to the header
8. When posted, service updates each referenced acc-account.balance:
   - balance += debit − credit  (for normal-debit accounts)
   - balance += credit − debit  (for normal-credit accounts)
9. posted_by / posted_at are set on the header when autoPost = true
```

> **Note on validation scope**: the engine validates line-level structure and balance, but it does **not** verify that each referenced account exists or is active before posting (account lookups during balance update simply skip a missing account). Account existence/active checks live in the **account-resolver** ([Section 3.5](#35-account-resolution-layer-account-mappings)), which is the path posters use to obtain account ids.

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
      "target": "api::sale-order.sale-order"
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

> **Status — SCAFFOLDED, NOT WIRED.** `acc-tax-rate` is a bare Strapi CRUD scaffold (its controller, route, and service are the default `createCore*` factories with no custom logic) and **no poster references it**. In the live posting flow, tax is taken from the **source document** (e.g. `sale.tax`) and credited to the account mapped to the `TAX_PAYABLE` key — the configurable tax-rate / tax-account fields below are not consulted. The rest of this section describes the intended design for the rate engine, not current behavior.

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

> **Implementation status — best-effort, NOT enforced.** As built, `createAndPost` calls `findOpenPeriod(date)` and, *if* an Open period is found, stamps the entry's `fiscal_period`. If none is found it logs nothing and **still posts** the entry (with `fiscal_period` left null). There is **no guard** that blocks posting into a missing, `Closed`, or `Locked` period, and there is no automated year-end close. The rules below are the intended design; treat the enforcement parts as aspirational until added.

1. **Posting guard** *(aspirational)* — The intent is for the service to require the entry date to fall within an **Open** period before posting. Currently the period is only used as a best-effort stamp.
2. **Period close** *(aspirational)* — Closing a period would set status to `Closed` and reject new entries. Today, setting `Closed` simply makes `findOpenPeriod` return null for those dates, so entries post without a `fiscal_period` rather than being rejected.
3. **Lock** *(aspirational)* — `Locked` is intended to block even reversals after audit; not currently enforced.
4. **Year-end** *(aspirational)* — A closing entry would roll Revenue and Expense into Retained Earnings. (Note: the balance-sheet report folds period income into equity on the fly, so a formal close is not required for reporting.)

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

> **Status — BUILT.** The reports below are implemented in `src/api/acc-journal-entry/services/reports.js` (`trialBalance`, `incomeStatement`, `balanceSheet`, `cashFlow`, `arAging`, `apAging`) and exposed over HTTP as literal report routes off the journal-entry router:
>
> ```
> GET /acc-journal-entries/reports/trial-balance?from=&to=&branch=
> GET /acc-journal-entries/reports/income-statement?from=&to=&branch=
> GET /acc-journal-entries/reports/balance-sheet?asOf=&branch=
> GET /acc-journal-entries/reports/cash-flow?from=&to=&branch=
> GET /acc-journal-entries/reports/ar-aging?asOf=
> GET /acc-journal-entries/reports/ap-aging?asOf=
> ```
>
> Access is gated in the controller: the caller must be authenticated **and** an accountant (role `admin`, or an `admin`-level permission role in the `accounts` or `auth` domain). The **`rutba-accounts`** frontend app (`d:/Rutba/ERP/rutba-accounts`) is the consumer of these endpoints.

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
| `acc-account-mapping` | **New** | Semantic key → ledger account, branch-overridable (drives the account-resolver — see [Section 3.5](#35-account-resolution-layer-account-mappings)) |
| `acc-tax-rate` | **New (scaffold only)** | Configurable tax-rate schema with ledger-account links — **not wired into any poster** (see [Module 6](#8-module-6--tax-handling)) |
| `acc-fiscal-period` | **New** | Period control for journal posting (best-effort stamp; does not block — see [Module 7](#9-module-7--fiscal-periods)) |

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

The service is a Strapi factory (`module.exports = ({ strapi }) => ({ ... })`). Key signatures:

```javascript
// src/api/acc-journal-entry/services/accounting.js
'use strict';

module.exports = ({ strapi }) => ({
  /**
   * Create and (by default) post a balanced journal entry.
   *
   * @param {object} opts
   * @param {Date|string} [opts.date]          - Entry date (defaults to now)
   * @param {string}      [opts.description]
   * @param {string}      [opts.reference]
   * @param {string}      [opts.source_type]   - Enum value (default "Manual")
   * @param {number}      [opts.source_id]
   * @param {string}      [opts.source_ref]
   * @param {Array}       opts.lines           - [{ account, debit, credit, description, tax_rate?, tax_amount? }]
   *                                             NOTE: `account` is an acc-account ID (not `account_id`)
   * @param {number}      [opts.branch]        - branch ID (not `branch_id`)
   * @param {number}      [opts.currency]      - currency ID; if omitted, derived from branch.currency
   * @param {number}      [opts.exchange_rate] - default 1
   * @param {string}      [opts.posted_by]     - user identifier (the checkout passes ctx.state.user.email)
   * @param {boolean}     [opts.autoPost]      - immediately post (default true)
   * @returns {object} The created journal-entry header
   */
  async createAndPost(opts) {
    // Enforces: lines.length >= 2; every line has an account; non-negative amounts;
    // each line has debit XOR credit; total debits === total credits (compared in cents).
    // Looks up an open fiscal period BEST-EFFORT (stamps fiscal_period if found, never blocks).
    // Resolves currency from branch.currency when not supplied. Creates header + lines;
    // when autoPost, sets status "Posted" + posted_by/posted_at and updates account balances.
    // ...
  },

  // Reverse a single posted entry: swaps debit↔credit, posts the reversal,
  // links reversal_of, and marks the original "Reversed".
  async reverse(entryId, { posted_by = '', description = '' } = {}) { /* ... */ },

  // Find ALL Posted entries for a source document.
  async findBySource(source_type, source_id) { /* ... */ },

  // Reverse ALL Posted entries for a source document (used when a sale/order is voided).
  async reverseBySource(source_type, source_id, { posted_by = '' } = {}) { /* ... */ },

  // Update running acc-account.balance for a set of lines (normal-balance aware).
  async updateAccountBalances(lines) { /* ... */ },

  // Find the open fiscal period covering a date (null if none).
  async findOpenPeriod(date) { /* ... */ },

  // Sequential, prefix-padded entry number, e.g. "JE-000042".
  async generateEntryNumber(prefix = 'JE') { /* ... */ },
});
```

**Contract notes:**
- Lines are shaped `{ account, debit, credit, description }` — `account` (and the header's `branch` / `currency`) are **entity ids**, not `account_id` / `branch_id` / `currency_id`.
- The engine enforces a **minimum of two lines** and **balanced debits == credits** (compared in cents to avoid float drift). It does **not** throw on a missing/closed fiscal period — see item 4 / Module 7.
- `reverse` / `reverseBySource` are the supported correction path; `findBySource(source_type, source_id)` returns the Posted entries for a source doc.

### Integration Example — Checkout Hook

Posters obtain account ids from the **account-resolver** ([Section 3.5](#35-account-resolution-layer-account-mappings)) by semantic key, then call `createAndPost` with lines shaped `{ account, debit, credit, description }`. This mirrors the real `src/api/sale/controllers/checkout.js`:

```javascript
// In src/api/sale/controllers/checkout.js — after the sale is marked paid

try {
  const accounting = strapi.service('api::acc-journal-entry.accounting');
  const resolver   = strapi.service('api::acc-journal-entry.account-resolver');

  // sale.branches is manyToMany — use the first branch as the posting branch
  const branchId = sale.branches?.length ? sale.branches[0].id : null;

  // --- Revenue entry: debit each payment method, credit revenue (+ tax) ---
  const revenueLines = [];

  for (const p of payments) {
    const amt = Number(p.amount || 0);
    if (amt <= 0) continue;
    const paymentAccountId = await resolver.resolvePaymentMethod(p.payment_method || 'Cash', branchId);
    revenueLines.push({ account: paymentAccountId, debit: amt, credit: 0,
                        description: `Payment – ${p.payment_method || 'Cash'}` });
  }

  const taxAmount  = Number(sale.tax || 0);
  const netRevenue = Number(sale.total || 0) - taxAmount;
  const revenueAccountId = await resolver.resolve('SALES_REVENUE', branchId);
  if (netRevenue > 0) {
    revenueLines.push({ account: revenueAccountId, debit: 0, credit: netRevenue,
                        description: 'Sales revenue' });
  }

  if (taxAmount > 0) {
    const taxAccountId = await resolver.resolve('TAX_PAYABLE', branchId);
    revenueLines.push({ account: taxAccountId, debit: 0, credit: taxAmount,
                        description: 'Tax collected' });
  }

  if (revenueLines.length >= 2) {
    await accounting.createAndPost({
      date: sale.sale_date || new Date(),
      description: `POS Sale ${sale.invoice_no}`,
      source_type: 'POS Sale',
      source_id: sale.id,
      source_ref: sale.invoice_no,
      lines: revenueLines,
      branch: branchId,
      posted_by: ctx.state?.user?.email || '',
    });
  }

  // --- COGS entry: debit COGS, credit Inventory for total cost of sold items ---
  let totalCost = 0;
  for (const item of sale.items) {
    for (const stock of item.items) totalCost += Number(stock.cost_price || 0);
  }

  if (totalCost > 0) {
    const cogsAccountId      = await resolver.resolve('COGS', branchId);
    const inventoryAccountId = await resolver.resolve('INVENTORY', branchId);
    await accounting.createAndPost({
      date: sale.sale_date || new Date(),
      description: `COGS for Sale ${sale.invoice_no}`,
      source_type: 'POS Sale',
      source_id: sale.id,
      source_ref: sale.invoice_no,
      lines: [
        { account: cogsAccountId,      debit: totalCost, credit: 0, description: 'Cost of goods sold' },
        { account: inventoryAccountId, debit: 0, credit: totalCost, description: 'Inventory relieved' },
      ],
      branch: branchId,
      posted_by: ctx.state?.user?.email || '',
    });
  }
} catch (accountingError) {
  // Sale is already committed; accounting failures are logged, not thrown,
  // so an unconfigured mapping can be reconciled later.
  strapi.log.error(`Accounting entries failed for sale ${sale.id}: ${accountingError.message}`);
}
```

---

## 17. Seed Data — Default Chart of Accounts

Source: `src/seed/accounting-seed.js` — idempotent (skips any account/mapping whose `code`/`key` already exists). Run via `node src/seed/accounting-seed.js`, or call `seedAccounting(strapi)` from the bootstrap lifecycle.

### Seeded Accounts

```
Code  | Name                          | Type      | Sub Type                    | Normal | is_system
------|-------------------------------|-----------|-----------------------------|--------|----------
1000  | Cash Drawer                   | Asset     | Cash                        | Debit  | true
1010  | Cash Safe                     | Asset     | Cash                        | Debit  | true
1100  | Bank – Primary                | Asset     | Bank                        | Debit  | true
1110  | Card Clearing                 | Asset     | Bank                        | Debit  | true
1120  | Mobile Wallet                 | Asset     | Bank                        | Debit  | true
1200  | Accounts Receivable           | Asset     | Accounts Receivable         | Debit  | true
1300  | Inventory                     | Asset     | Inventory                   | Debit  | true
1400  | Exchange Clearing             | Asset     | Other Current Asset         | Debit  | true
1210  | COD / Rider Float             | Asset     | Other Current Asset         | Debit  | true
1220  | Employee Advances             | Asset     | Other Current Asset         | Debit  | true
1310  | Work-in-Process – Labor       | Asset     | Inventory                   | Debit  | true
------|-------------------------------|-----------|-----------------------------|--------|----------
2000  | Accounts Payable              | Liability | Accounts Payable            | Credit | true
2100  | Tax Payable                   | Liability | Tax Payable                 | Credit | true
2200  | Customer Deposits             | Liability | Other Current Liability     | Credit | true
2300  | Salaries & Wages Payable      | Liability | Other Current Liability     | Credit | true
2310  | Statutory Deductions Payable  | Liability | Other Current Liability     | Credit | true
------|-------------------------------|-----------|-----------------------------|--------|----------
3000  | Owner Equity                  | Equity    | Owner Equity                | Credit | true
3100  | Retained Earnings             | Equity    | Retained Earnings           | Credit | true
------|-------------------------------|-----------|-----------------------------|--------|----------
4000  | Sales Revenue                 | Revenue   | Sales Revenue               | Credit | true
4100  | Sales Returns                 | Revenue   | Sales Returns               | Debit  | true
4200  | Other Revenue                 | Revenue   | Other Revenue               | Credit | true
4300  | Shipping Revenue              | Revenue   | Other Revenue               | Credit | true
------|-------------------------------|-----------|-----------------------------|--------|----------
5000  | Cost of Goods Sold            | Expense   | Cost of Goods Sold          | Debit  | true
6000  | Operating Expenses            | Expense   | Operating Expense           | Debit  | true
6100  | Rent Expense                  | Expense   | Operating Expense           | Debit  | false
6200  | Utilities Expense             | Expense   | Operating Expense           | Debit  | false
6300  | Payroll Expense               | Expense   | Payroll Expense             | Debit  | false
6400  | Tax Expense                   | Expense   | Tax Expense                 | Debit  | false
6700  | Cash Short/Over               | Expense   | Operating Expense           | Debit  | true
```

> Note the actual numbering differs from earlier drafts: **Cash Drawer is `1000` and Cash Safe is `1010`** (not the reverse), operating-type expenses live in the **`6xxx`** range (Operating Expenses `6000`, Payroll `6300`, Cash Short/Over `6700`), and there is **no seeded `5100`/`5200`/`5300` write-off / cash-short / exchange-loss account**. The cash short *and* over case both post to a single `6700 Cash Short/Over` account. Several workflow examples earlier in this doc still use illustrative codes (e.g. `5200`, `4300 gain`); treat the seed file above as the source of truth.

### Seeded Account Mappings (key → code)

These rows back the **account-resolver** ([Section 3.5](#35-account-resolution-layer-account-mappings)). Posters reference the **key**; the seed wires it to the **code** above.

```
Key                  | Code | Notes
---------------------|------|---------------------------------------------
CASH_DRAWER          | 1000 | POS cash drawer
CASH_SAFE            | 1010 | Cash safe / vault
BANK_PRIMARY         | 1100 | Primary bank account
CARD_CLEARING        | 1110 | Card payment clearing
MOBILE_WALLET        | 1120 | Mobile wallet clearing
EXCHANGE_CLEARING    | 1400 | Exchange return clearing
ACCOUNTS_RECEIVABLE  | 1200 | Customer receivables
INVENTORY            | 1300 | Inventory asset
ACCOUNTS_PAYABLE     | 2000 | Supplier payables
TAX_PAYABLE          | 2100 | Tax payable (collected)
CUSTOMER_DEPOSITS    | 2200 | Customer advance deposits
SALES_REVENUE        | 4000 | Product sales revenue
SALES_RETURNS        | 4100 | Sales returns and allowances
COGS                 | 5000 | Cost of goods sold
OPERATING_EXPENSES   | 6000 | General operating expenses
COD_CLEARING         | 1210 | COD cash collected by rider, not yet deposited
SHIPPING_REVENUE     | 4300 | Delivery charged to customer (web orders)
CASH_SHORT_OVER      | 6700 | Cash register count variance (short/over)
PAYROLL_EXPENSE      | 6300 | Salaries and wages expense
SALARY_PAYABLE       | 2300 | Net pay owed to employees
WAGES_PAYABLE        | 2300 | Production wages payable (shares Salaries & Wages Payable)
STATUTORY_PAYABLE    | 2310 | Tax / EOBI / PF withheld, owed to authorities
EMPLOYEE_ADVANCES    | 1220 | Advances / loans recoverable from employees
WIP_LABOR            | 1310 | Capitalized production labor (target model)
```

### Default Fiscal Period

The seed also creates one **Open** fiscal period for the current calendar year if none exists: `name "FY <year>"`, `start_date <year>-01-01`, `end_date <year>-12-31`, `status "Open"`, `fiscal_year "<year>"`.

For multi-branch setups, branch-specific accounts can be created per branch (branch relation set) and wired with **branch-scoped account-mapping rows** so the resolver picks them over the global default.

---

## Summary

| Concern | Solution |
|---------|----------|
| **Double-entry** | Header + Lines model; service enforces ≥2 lines and debit = credit |
| **Account resolution** | Posters reference semantic keys; `acc-account-mapping` + account-resolver map key (+ branch) → ledger account |
| **Traceability** | `source_type` + `source_id` + `source_ref` on every journal entry |
| **Immutability** | Lifecycle hooks prevent edit/delete of posted entries |
| **Auto-posting** | Accounting service called from checkout, returns, purchase receipt, cash register, payroll hooks |
| **Multi-branch** | Branch relation on accounts + journal entries; branch-scoped mappings; branch-level and consolidated reporting |
| **Multi-currency** | Currency + exchange_rate on journal entry (currency derived from branch when unset); balances stored in base currency |
| **Tax** | Tax taken from the source document and credited via the `TAX_PAYABLE` mapping; `acc-tax-rate` is a scaffold, not wired |
| **Audit** | Strapi built-in timestamps + `posted_by`/`posted_at` + immutability rules |
| **Periods** | `acc-fiscal-period` — best-effort stamp only; posting is not blocked on missing/closed periods; no automated year-end close |
| **Reporting** | Built: Trial Balance, P&L, Balance Sheet, Cash Flow, AR/AP Aging at `GET /acc-journal-entries/reports/*`; consumed by `rutba-accounts` |
