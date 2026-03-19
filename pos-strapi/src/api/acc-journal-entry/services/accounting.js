'use strict';

/**
 * Accounting Engine Service
 *
 * Central service for creating, posting, and reversing double-entry
 * journal entries.  Every balance-affecting operation in the system
 * MUST go through this service to keep the books balanced.
 */

module.exports = ({ strapi }) => ({

  /* ------------------------------------------------------------------ */
  /*  Generate a unique, sequential entry number                         */
  /* ------------------------------------------------------------------ */
  async generateEntryNumber(prefix = 'JE') {
    const latest = await strapi.entityService.findMany(
      'api::acc-journal-entry.acc-journal-entry',
      {
        sort: { id: 'desc' },
        limit: 1,
        fields: ['entry_number'],
      }
    );

    let seq = 1;
    if (latest && latest.length > 0) {
      const match = (latest[0].entry_number || '').match(/(\d+)$/);
      if (match) seq = parseInt(match[1], 10) + 1;
    }

    return `${prefix}-${String(seq).padStart(6, '0')}`;
  },

  /* ------------------------------------------------------------------ */
  /*  Find the open fiscal period for a given date                       */
  /* ------------------------------------------------------------------ */
  async findOpenPeriod(date) {
    const d = typeof date === 'string' ? date : new Date(date).toISOString().slice(0, 10);

    const periods = await strapi.entityService.findMany(
      'api::acc-fiscal-period.acc-fiscal-period',
      {
        filters: {
          status: 'Open',
          start_date: { $lte: d },
          end_date: { $gte: d },
        },
        limit: 1,
      }
    );

    return periods && periods.length > 0 ? periods[0] : null;
  },

  /* ------------------------------------------------------------------ */
  /*  Create and optionally post a journal entry                         */
  /*                                                                     */
  /*  @param {Object} opts                                               */
  /*    date          – entry date (Date | string)                       */
  /*    description   – text                                             */
  /*    reference     – optional reference code                          */
  /*    source_type   – enum value (e.g. "POS Sale")                     */
  /*    source_id     – id of the source document                        */
  /*    source_ref    – human-readable source ref (e.g. invoice_no)      */
  /*    lines         – array of { account: id, debit, credit, desc }    */
  /*    branch        – branch id (optional)                             */
  /*    currency      – currency id (optional)                           */
  /*    exchange_rate – decimal, defaults to 1                           */
  /*    posted_by     – user identifier                                  */
  /*    autoPost      – if true, immediately post (default: true)        */
  /* ------------------------------------------------------------------ */
  async createAndPost(opts) {
    const {
      date = new Date(),
      description = '',
      reference = '',
      source_type = 'Manual',
      source_id = null,
      source_ref = '',
      lines = [],
      branch = null,
      currency = null,
      exchange_rate = 1,
      posted_by = '',
      autoPost = true,
    } = opts;

    // --- Validate lines ---------------------------------------------------
    if (!lines || lines.length < 2) {
      throw new Error('A journal entry must have at least two lines.');
    }

    let totalDebit = 0;
    let totalCredit = 0;
    for (const l of lines) {
      if (!l.account) throw new Error('Every journal line must reference an account.');
      const d = Number(l.debit || 0);
      const c = Number(l.credit || 0);
      if (d < 0 || c < 0) throw new Error('Debit and credit amounts must be non-negative.');
      if (d > 0 && c > 0) throw new Error('A single line cannot have both debit and credit.');
      if (d === 0 && c === 0) throw new Error('A line must have either a debit or a credit.');
      totalDebit += d;
      totalCredit += c;
    }

    // Balance check (using cents to avoid floating-point drift)
    if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100)) {
      throw new Error(
        `Journal entry is not balanced. Debits: ${totalDebit.toFixed(2)}, Credits: ${totalCredit.toFixed(2)}`
      );
    }

    // --- Fiscal period ----------------------------------------------------
    const entryDate =
      typeof date === 'string' ? date : date.toISOString().slice(0, 10);
    const period = await this.findOpenPeriod(entryDate);

    // --- Entry number -----------------------------------------------------
    const entry_number = await this.generateEntryNumber(
      source_type === 'Manual' ? 'JE' : 'JE'
    );

    // --- Create header ----------------------------------------------------
    const headerData = {
      entry_number,
      date: entryDate,
      description,
      reference,
      source_type,
      source_id,
      source_ref,
      status: autoPost ? 'Posted' : 'Draft',
      total_debit: totalDebit,
      total_credit: totalCredit,
      exchange_rate,
      posted_by: autoPost ? posted_by : null,
      posted_at: autoPost ? new Date() : null,
      ...(branch ? { branch } : {}),
      ...(currency ? { currency } : {}),
      ...(period ? { fiscal_period: period.id } : {}),
    };

    const entry = await strapi.entityService.create(
      'api::acc-journal-entry.acc-journal-entry',
      { data: headerData }
    );

    // --- Create lines -----------------------------------------------------
    for (const l of lines) {
      await strapi.entityService.create(
        'api::acc-journal-line.acc-journal-line',
        {
          data: {
            journal_entry: entry.id,
            account: l.account,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            description: l.description || '',
            tax_rate: l.tax_rate || null,
            tax_amount: l.tax_amount || null,
          },
        }
      );
    }

    // --- Update account balances (only if posted) -------------------------
    if (autoPost) {
      await this.updateAccountBalances(lines);
    }

    return entry;
  },

  /* ------------------------------------------------------------------ */
  /*  Reverse a posted journal entry                                     */
  /*                                                                     */
  /*  Creates a new entry with debits ↔ credits swapped, links it       */
  /*  back via reversal_of, and marks the original as Reversed.          */
  /* ------------------------------------------------------------------ */
  async reverse(entryId, { posted_by = '', description = '' } = {}) {
    const original = await strapi.entityService.findOne(
      'api::acc-journal-entry.acc-journal-entry',
      entryId,
      { populate: { lines: { populate: { account: true } } } }
    );

    if (!original) throw new Error(`Journal entry ${entryId} not found.`);
    if (original.status !== 'Posted') {
      throw new Error(`Only Posted entries can be reversed. Current status: ${original.status}`);
    }

    // Build reversed lines (swap debit ↔ credit)
    const reversedLines = (original.lines || []).map((l) => ({
      account: l.account?.id || l.account,
      debit: Number(l.credit || 0),
      credit: Number(l.debit || 0),
      description: l.description ? `Reversal — ${l.description}` : 'Reversal',
      tax_rate: l.tax_rate,
      tax_amount: l.tax_amount ? -Number(l.tax_amount) : null,
    }));

    // Create the reversal entry
    const reversal = await this.createAndPost({
      date: new Date(),
      description: description || `Reversal of ${original.entry_number}`,
      reference: original.reference,
      source_type: original.source_type,
      source_id: original.source_id,
      source_ref: original.source_ref,
      lines: reversedLines,
      branch: original.branch?.id || original.branch || null,
      currency: original.currency?.id || original.currency || null,
      exchange_rate: original.exchange_rate || 1,
      posted_by,
      autoPost: true,
    });

    // Link reversal to original
    await strapi.entityService.update(
      'api::acc-journal-entry.acc-journal-entry',
      reversal.id,
      { data: { reversal_of: original.id } }
    );

    // Mark original as Reversed
    await strapi.entityService.update(
      'api::acc-journal-entry.acc-journal-entry',
      original.id,
      { data: { status: 'Reversed' } }
    );

    return reversal;
  },

  /* ------------------------------------------------------------------ */
  /*  Update account running balances                                    */
  /*                                                                     */
  /*  For Debit-normal accounts  → balance += debit – credit             */
  /*  For Credit-normal accounts → balance += credit – debit             */
  /* ------------------------------------------------------------------ */
  async updateAccountBalances(lines) {
    for (const l of lines) {
      const accountId = l.account?.id || l.account;
      const account = await strapi.entityService.findOne(
        'api::acc-account.acc-account',
        accountId,
        { fields: ['balance', 'normal_balance'] }
      );
      if (!account) continue;

      const debit = Number(l.debit || 0);
      const credit = Number(l.credit || 0);
      const currentBalance = Number(account.balance || 0);

      let newBalance;
      if (account.normal_balance === 'Debit') {
        newBalance = currentBalance + debit - credit;
      } else {
        newBalance = currentBalance + credit - debit;
      }

      await strapi.entityService.update(
        'api::acc-account.acc-account',
        accountId,
        { data: { balance: newBalance } }
      );
    }
  },

  /* ------------------------------------------------------------------ */
  /*  Find all posted journal entries for a given source document         */
  /* ------------------------------------------------------------------ */
  async findBySource(source_type, source_id) {
    return strapi.entityService.findMany(
      'api::acc-journal-entry.acc-journal-entry',
      {
        filters: {
          source_type,
          source_id,
          status: 'Posted',
        },
        populate: { lines: { populate: { account: true } } },
      }
    );
  },

  /* ------------------------------------------------------------------ */
  /*  Reverse ALL posted entries for a given source document              */
  /* ------------------------------------------------------------------ */
  async reverseBySource(source_type, source_id, { posted_by = '' } = {}) {
    const entries = await this.findBySource(source_type, source_id);
    const reversals = [];
    for (const entry of entries) {
      const reversal = await this.reverse(entry.id, { posted_by });
      reversals.push(reversal);
    }
    return reversals;
  },
});
