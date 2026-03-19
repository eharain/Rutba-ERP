'use strict';

/**
 * Tax Calculator Service
 *
 * Utility for computing net, tax, and gross from an amount and tax rate.
 */

module.exports = ({ strapi }) => ({

  /**
   * Calculate tax breakdown.
   *
   * @param {number} amount – the source amount
   * @param {number} rate   – tax rate as a percentage (e.g. 15 for 15 %)
   * @param {string} type   – "Inclusive" or "Exclusive"
   * @returns {{ net: number, tax: number, gross: number }}
   */
  calculate(amount, rate, type = 'Exclusive') {
    const amt = Number(amount || 0);
    const r = Number(rate || 0);

    if (r <= 0) {
      return { net: amt, tax: 0, gross: amt };
    }

    if (type === 'Inclusive') {
      // Amount already includes tax
      const net = Math.round((amt / (1 + r / 100)) * 100) / 100;
      const tax = Math.round((amt - net) * 100) / 100;
      return { net, tax, gross: amt };
    }

    // Exclusive — tax is added on top
    const tax = Math.round((amt * r / 100) * 100) / 100;
    const gross = Math.round((amt + tax) * 100) / 100;
    return { net: amt, tax, gross };
  },
});
