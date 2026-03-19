'use strict';

/**
 * Accounting Seed Data
 *
 * Run via:  node src/seed/accounting-seed.js
 *
 * Or call `seedAccounting(strapi)` from your Strapi bootstrap lifecycle.
 *
 * This seeds the default Chart of Accounts and Account Mappings
 * needed for the accounting engine to function.  It is idempotent —
 * it skips any account/mapping whose code/key already exists.
 */

/* ------------------------------------------------------------------ */
/*  Default Chart of Accounts                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_ACCOUNTS = [
  // ── Assets ─────────────────────────────────────────────────
  { code: '1000', name: 'Cash Drawer',          account_type: 'Asset',     sub_type: 'Cash',                normal_balance: 'Debit', is_system: true },
  { code: '1010', name: 'Cash Safe',            account_type: 'Asset',     sub_type: 'Cash',                normal_balance: 'Debit', is_system: true },
  { code: '1100', name: 'Bank – Primary',       account_type: 'Asset',     sub_type: 'Bank',                normal_balance: 'Debit', is_system: true },
  { code: '1110', name: 'Card Clearing',        account_type: 'Asset',     sub_type: 'Bank',                normal_balance: 'Debit', is_system: true },
  { code: '1120', name: 'Mobile Wallet',        account_type: 'Asset',     sub_type: 'Bank',                normal_balance: 'Debit', is_system: true },
  { code: '1200', name: 'Accounts Receivable',  account_type: 'Asset',     sub_type: 'Accounts Receivable', normal_balance: 'Debit', is_system: true },
  { code: '1300', name: 'Inventory',            account_type: 'Asset',     sub_type: 'Inventory',           normal_balance: 'Debit', is_system: true },
  { code: '1400', name: 'Exchange Clearing',    account_type: 'Asset',     sub_type: 'Other Current Asset', normal_balance: 'Debit', is_system: true },

  // ── Liabilities ────────────────────────────────────────────
  { code: '2000', name: 'Accounts Payable',     account_type: 'Liability', sub_type: 'Accounts Payable',       normal_balance: 'Credit', is_system: true },
  { code: '2100', name: 'Tax Payable',          account_type: 'Liability', sub_type: 'Tax Payable',            normal_balance: 'Credit', is_system: true },
  { code: '2200', name: 'Customer Deposits',    account_type: 'Liability', sub_type: 'Other Current Liability', normal_balance: 'Credit', is_system: true },

  // ── Equity ─────────────────────────────────────────────────
  { code: '3000', name: 'Owner Equity',         account_type: 'Equity',    sub_type: 'Owner Equity',       normal_balance: 'Credit', is_system: true },
  { code: '3100', name: 'Retained Earnings',    account_type: 'Equity',    sub_type: 'Retained Earnings',  normal_balance: 'Credit', is_system: true },

  // ── Revenue ────────────────────────────────────────────────
  { code: '4000', name: 'Sales Revenue',        account_type: 'Revenue',   sub_type: 'Sales Revenue',  normal_balance: 'Credit', is_system: true },
  { code: '4100', name: 'Sales Returns',        account_type: 'Revenue',   sub_type: 'Sales Returns',  normal_balance: 'Debit',  is_system: true },
  { code: '4200', name: 'Other Revenue',        account_type: 'Revenue',   sub_type: 'Other Revenue',  normal_balance: 'Credit', is_system: true },

  // ── Expenses ───────────────────────────────────────────────
  { code: '5000', name: 'Cost of Goods Sold',   account_type: 'Expense',   sub_type: 'Cost of Goods Sold',  normal_balance: 'Debit', is_system: true },
  { code: '6000', name: 'Operating Expenses',   account_type: 'Expense',   sub_type: 'Operating Expense',   normal_balance: 'Debit', is_system: true },
  { code: '6100', name: 'Rent Expense',         account_type: 'Expense',   sub_type: 'Operating Expense',   normal_balance: 'Debit', is_system: false },
  { code: '6200', name: 'Utilities Expense',    account_type: 'Expense',   sub_type: 'Operating Expense',   normal_balance: 'Debit', is_system: false },
  { code: '6300', name: 'Payroll Expense',      account_type: 'Expense',   sub_type: 'Payroll Expense',     normal_balance: 'Debit', is_system: false },
  { code: '6400', name: 'Tax Expense',          account_type: 'Expense',   sub_type: 'Tax Expense',         normal_balance: 'Debit', is_system: false },
];

/* ------------------------------------------------------------------ */
/*  Default Account Mappings                                           */
/*  key → account code                                                 */
/* ------------------------------------------------------------------ */
const DEFAULT_MAPPINGS = [
  { key: 'CASH_DRAWER',        code: '1000', description: 'POS cash drawer' },
  { key: 'CASH_SAFE',          code: '1010', description: 'Cash safe / vault' },
  { key: 'BANK_PRIMARY',       code: '1100', description: 'Primary bank account' },
  { key: 'CARD_CLEARING',      code: '1110', description: 'Card payment clearing' },
  { key: 'MOBILE_WALLET',      code: '1120', description: 'Mobile wallet clearing' },
  { key: 'EXCHANGE_CLEARING',  code: '1400', description: 'Exchange return clearing' },
  { key: 'ACCOUNTS_RECEIVABLE',code: '1200', description: 'Customer receivables' },
  { key: 'INVENTORY',          code: '1300', description: 'Inventory asset' },
  { key: 'ACCOUNTS_PAYABLE',   code: '2000', description: 'Supplier payables' },
  { key: 'TAX_PAYABLE',        code: '2100', description: 'Tax payable (collected)' },
  { key: 'CUSTOMER_DEPOSITS',  code: '2200', description: 'Customer advance deposits' },
  { key: 'SALES_REVENUE',      code: '4000', description: 'Product sales revenue' },
  { key: 'SALES_RETURNS',      code: '4100', description: 'Sales returns and allowances' },
  { key: 'COGS',               code: '5000', description: 'Cost of goods sold' },
  { key: 'OPERATING_EXPENSES', code: '6000', description: 'General operating expenses' },
];

/* ------------------------------------------------------------------ */
/*  Seed Function                                                      */
/* ------------------------------------------------------------------ */
async function seedAccounting(strapi) {
  strapi.log.info('[Accounting Seed] Starting...');

  // 1. Seed accounts
  const accountIdByCode = {};

  for (const acct of DEFAULT_ACCOUNTS) {
    const existing = await strapi.entityService.findMany(
      'api::acc-account.acc-account',
      { filters: { code: acct.code }, limit: 1 }
    );

    if (existing && existing.length > 0) {
      accountIdByCode[acct.code] = existing[0].id;
      continue; // skip — already exists
    }

    const created = await strapi.entityService.create(
      'api::acc-account.acc-account',
      { data: { ...acct, balance: 0 } }
    );
    accountIdByCode[acct.code] = created.id;
    strapi.log.info(`[Accounting Seed] Created account ${acct.code} – ${acct.name}`);
  }

  // 2. Seed account mappings
  for (const mapping of DEFAULT_MAPPINGS) {
    const existing = await strapi.entityService.findMany(
      'api::acc-account-mapping.acc-account-mapping',
      { filters: { key: mapping.key }, limit: 1 }
    );

    if (existing && existing.length > 0) continue; // skip

    const accountId = accountIdByCode[mapping.code];
    if (!accountId) {
      strapi.log.warn(
        `[Accounting Seed] Cannot map "${mapping.key}" — account ${mapping.code} not found.`
      );
      continue;
    }

    await strapi.entityService.create(
      'api::acc-account-mapping.acc-account-mapping',
      {
        data: {
          key: mapping.key,
          description: mapping.description,
          account: accountId,
        },
      }
    );
    strapi.log.info(`[Accounting Seed] Created mapping ${mapping.key} → ${mapping.code}`);
  }

  // 3. Seed a default fiscal period for the current year (if none exists)
  const year = new Date().getFullYear();
  const existingPeriod = await strapi.entityService.findMany(
    'api::acc-fiscal-period.acc-fiscal-period',
    { filters: { fiscal_year: String(year) }, limit: 1 }
  );

  if (!existingPeriod || existingPeriod.length === 0) {
    await strapi.entityService.create(
      'api::acc-fiscal-period.acc-fiscal-period',
      {
        data: {
          name: `FY ${year}`,
          start_date: `${year}-01-01`,
          end_date: `${year}-12-31`,
          status: 'Open',
          fiscal_year: String(year),
        },
      }
    );
    strapi.log.info(`[Accounting Seed] Created fiscal period FY ${year}`);
  }

  strapi.log.info('[Accounting Seed] Complete.');
}

module.exports = seedAccounting;
