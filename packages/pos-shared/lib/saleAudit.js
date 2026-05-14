import { SaleAuditLogsEndpoints } from '@rutba/api-provider/endpoints';
import { getBranch, getBranchDesk, getCashRegister, getUser } from './utils.js';
import { getAppName, getActiveRole } from '@rutba/api-provider/lib/api';

/** DOM event fired locally whenever a sale audit is recorded. The audit
 *  panel listens for this so admins see entries appear instantly without
 *  needing to refetch. Detail shape:
 *    { saleDocId, entry: { action, description, performed_at, performed_by, ... } } */
export const SALE_AUDIT_EVENT = 'pos.saleAuditRecorded';

/**
 * Fire-and-forget audit recorder for sale-page actions.
 *
 * We don't `await` the network call from the caller — the teller's flow
 * should never block on the audit POST. Failures are swallowed and
 * `console.warn`'d so a flaky audit endpoint doesn't break a sale.
 *
 * Context (branch / desk / register / user / app / role) is pulled at
 * call time from the same utils the rest of the sale flow uses, so the
 * caller passes only `saleDocId`, `action`, and a short `description`.
 *
 * @param {string|null} saleDocId  — documentId of the sale (null is fine
 *                                   for actions on an unsaved draft; the
 *                                   first save will fill it in)
 * @param {string} action          — one of the SaleAuditLog `action` enum
 *                                   values from the Strapi schema
 * @param {string} [description]   — short human-readable detail
 */
export function recordSaleAudit(saleDocId, action, description) {
    try {
        const branch = getBranch();
        const desk = getBranchDesk();
        const reg = getCashRegister();
        const user = getUser();
        const registerDocId = reg?.documentId || reg?.id || null;
        const userId = user?.documentId || user?.id || null;
        const performedAt = new Date().toISOString();
        const performedBy = user?.username || user?.email || '';

        // Local entry shape mirrors what the API returns on read, so the
        // audit panel can append it directly without re-shaping.
        const entry = {
            action,
            description: description ?? null,
            performed_at: performedAt,
            performed_by: performedBy,
            branch_id: branch?.id ?? null,
            branch_name: branch?.name || '',
            desk_id: desk?.id ?? null,
            desk_name: desk?.name || '',
            app_name: (() => { try { return getAppName(); } catch { return null; } })(),
            role_key: (() => { try { return getActiveRole(); } catch { return null; } })(),
            // Mark client-side so the panel can de-dupe if it later refetches.
            _localOnly: true,
        };

        // Server payload uses relation-connect form for relations.
        const payload = {
            ...entry,
            ...(userId ? { performed_by_user: { connect: [userId] } } : {}),
            ...(saleDocId ? { sale: { connect: [saleDocId] } } : {}),
            ...(registerDocId ? { cash_register: { connect: [registerDocId] } } : {}),
        };
        delete payload._localOnly;

        // Notify any open audit views IMMEDIATELY — don't wait for the
        // POST round trip. Admins watching the panel should see the
        // action land the same instant the teller did it.
        try {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent(SALE_AUDIT_EVENT, {
                    detail: { saleDocId, entry },
                }));
            }
        } catch { /* SSR / older browsers — silent */ }

        // Promise intentionally not awaited — audit must not block the
        // teller's flow. Swallow errors here; the controller-side log
        // suffices for ops visibility.
        Promise.resolve(SaleAuditLogsEndpoints.create(payload)).catch((err) => {
            console.warn('[saleAudit] failed', action, err?.response?.status || err?.message);
        });
    } catch (err) {
        console.warn('[saleAudit] dispatch threw', err?.message);
    }
}

/** Load the audit trail for one sale (admin / manager view). Returns
 *  the parsed array of entries sorted by `performed_at` ascending. */
export async function fetchSaleAudit(saleDocId) {
    if (!saleDocId) return [];
    try {
        const res = await SaleAuditLogsEndpoints.bySale(saleDocId);
        return res?.data || [];
    } catch (err) {
        console.warn('[saleAudit] fetch failed', err?.response?.status || err?.message);
        return [];
    }
}
