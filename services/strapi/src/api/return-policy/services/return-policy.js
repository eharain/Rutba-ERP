'use strict';

const { createCoreService } = require('@strapi/strapi').factories;

const POLICY_UID = 'api::return-policy.return-policy';

module.exports = createCoreService(POLICY_UID, ({ strapi }) => ({
    /**
     * Resolve the policy row for an app: `app_slug` match first, then the row
     * flagged `is_default`, then any row. Mirrors site-setting's resolver —
     * the policy is a collection now, and both must answer "which row?" the
     * same way or an app could get its site identity from one row and its
     * return window from another.
     */
    async resolveRow(appSlug = null) {
        const attempts = [];
        if (appSlug) attempts.push({ app_slug: appSlug });
        attempts.push({ is_default: true });
        attempts.push(null);

        for (const filters of attempts) {
            const row = await strapi.documents(POLICY_UID)
                .findFirst(filters ? { filters } : {})
                .catch(() => null);
            if (row) return row;
        }
        return null;
    },

    /**
     * Read the policy row for an app, falling back to safe defaults when no
     * row has been seeded yet. Keeps callers — controllers, eligibility
     * checks, the storefront /me window probe — from having to defensively
     * coalesce on every read.
     */
    async getEffective(appSlug = null) {
        const row = await this.resolveRow(appSlug);
        return {
            window_days:               row?.window_days ?? 7,
            restocking_fee_percent:    Number(row?.restocking_fee_percent) || 0,
            return_shipping_borne_by:  row?.return_shipping_borne_by || 'merchant',
            exchange_enabled:          !!row?.exchange_enabled,
            auto_approve_under_paisa:  row?.auto_approve_under_paisa ?? null,
            policy_text:               row?.policy_text || '',
        };
    },

    /**
     * Decide whether an order is still within the return window. Centralised
     * here so the customer-side eligibility check, the storefront button
     * gate, and the staff "is this even allowed?" warning all agree.
     *
     * Returns { eligible: bool, reason?: string, deadline: ISO date }.
     */
    async checkWindow(order, appSlug = null) {
        const policy = await this.getEffective(appSlug);
        if (order?.order_status !== 'DELIVERED') {
            return { eligible: false, reason: 'order_not_delivered', deadline: null };
        }
        const delivered = order.actual_delivery_time
            ? new Date(order.actual_delivery_time)
            : new Date(order.createdAt);
        const deadline = new Date(delivered.getTime() + policy.window_days * 86400 * 1000);
        const eligible = Date.now() <= deadline.getTime();
        return {
            eligible,
            reason: eligible ? null : 'window_expired',
            deadline: deadline.toISOString(),
            window_days: policy.window_days,
        };
    },
}));
