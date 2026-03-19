'use strict';

/**
 * Account Resolver Service
 *
 * Maps operational event keys (e.g. CASH_DRAWER, INVENTORY, SALES_REVENUE)
 * to actual ledger account IDs via the acc-account-mapping entity.
 *
 * Resolution order:
 *   1. Branch-specific mapping  (key + branch)
 *   2. Global mapping           (key, no branch)
 *   3. Throw if not found
 */

module.exports = ({ strapi }) => ({

  /**
   * Resolve a mapping key to an account ID.
   *
   * @param {string}      key      – e.g. "CASH_DRAWER", "INVENTORY", "SALES_REVENUE"
   * @param {number|null} branchId – optional branch context
   * @returns {number} The acc-account id
   */
  async resolve(key, branchId = null) {
    let mapping = null;

    // 1. Try branch-specific mapping
    if (branchId) {
      const results = await strapi.entityService.findMany(
        'api::acc-account-mapping.acc-account-mapping',
        {
          filters: { key, branch: branchId },
          populate: { account: { fields: ['id', 'code', 'name', 'is_active'] } },
          limit: 1,
        }
      );
      if (results && results.length > 0) mapping = results[0];
    }

    // 2. Fallback to global mapping (no branch)
    if (!mapping) {
      const results = await strapi.entityService.findMany(
        'api::acc-account-mapping.acc-account-mapping',
        {
          filters: {
            key,
            branch: { id: { $null: true } },
          },
          populate: { account: { fields: ['id', 'code', 'name', 'is_active'] } },
          limit: 1,
        }
      );
      if (results && results.length > 0) mapping = results[0];
    }

    // 3. If still nothing, try without the branch filter as a last resort
    if (!mapping) {
      const results = await strapi.entityService.findMany(
        'api::acc-account-mapping.acc-account-mapping',
        {
          filters: { key },
          populate: { account: { fields: ['id', 'code', 'name', 'is_active'] } },
          limit: 1,
        }
      );
      if (results && results.length > 0) mapping = results[0];
    }

    if (!mapping || !mapping.account) {
      throw new Error(
        `Account mapping not found for key "${key}"${branchId ? ` (branch ${branchId})` : ''}. ` +
        'Please configure the mapping in Acc Account Mapping.'
      );
    }

    if (mapping.account.is_active === false) {
      throw new Error(
        `Account "${mapping.account.code} – ${mapping.account.name}" mapped to key "${key}" is inactive.`
      );
    }

    return mapping.account.id;
  },

  /**
   * Resolve a payment method to the appropriate ledger account.
   *
   * Mapping convention:
   *   Cash           → CASH_DRAWER
   *   Card           → CARD_CLEARING
   *   Bank           → BANK_PRIMARY
   *   Mobile Wallet  → MOBILE_WALLET
   *   Exchange Return → EXCHANGE_CLEARING
   *
   * @param {string}      method   – payment_method enum value
   * @param {number|null} branchId – optional branch context
   * @returns {number} The acc-account id
   */
  async resolvePaymentMethod(method, branchId = null) {
    const map = {
      'Cash': 'CASH_DRAWER',
      'Card': 'CARD_CLEARING',
      'Bank': 'BANK_PRIMARY',
      'Mobile Wallet': 'MOBILE_WALLET',
      'Exchange Return': 'EXCHANGE_CLEARING',
    };

    const key = map[method];
    if (!key) {
      throw new Error(`Unknown payment method "${method}". Cannot resolve to a ledger account.`);
    }

    return this.resolve(key, branchId);
  },
});
