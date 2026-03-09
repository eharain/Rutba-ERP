import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { authApi } from '@rutba/pos-shared/lib/api';

const EXPIRY_HOURS = 20;

function isExpiredCheck(register) {
    if (!register || !register.opened_at) return false;
    const openedMs = new Date(register.opened_at).getTime();
    return Date.now() - openedMs > EXPIRY_HOURS * 60 * 60 * 1000;
}

function hoursOpen(register) {
    if (!register || !register.opened_at) return 0;
    return (Date.now() - new Date(register.opened_at).getTime()) / (60 * 60 * 1000);
}

// ── Context ───────────────────────────────────────────────────
const CashRegisterContext = createContext(null);

/**
 * useCashRegister()
 *
 * Returns:
 *  - deskHasCashRegister : boolean  — desk-level flag
 *  - registerStatus      : 'loading' | 'ok' | 'no-register' | 'expired' | 'no-desk'
 *  - canCheckout         : boolean  — true only when register is active
 *  - crossDesk           : boolean  — register is from a different desk
 *  - warningHours        : number | null
 *  - openRegisterModal() : opens the "Open Register" modal
 */
export function useCashRegister() {
    const ctx = useContext(CashRegisterContext);
    if (!ctx) throw new Error('useCashRegister must be used inside <CashRegisterGuard>');
    return ctx;
}

// ── Guard (non-blocking) ──────────────────────────────────────

/**
 * CashRegisterGuard
 *
 * Wraps sale pages. **Never blocks** the children — it always renders
 * them. Instead it provides register state via context so that individual
 * buttons (e.g. Checkout) can decide whether to be enabled.
 *
 * When the desk's `has_cash_register` flag is false the guard skips the
 * register lookup entirely and reports `canCheckout = false`.
 */
export default function CashRegisterGuard({ children }) {
    const { desk, branch, user, cashRegister, setCashRegister, currency } = useUtil();

    const deskHasCashRegister = desk?.has_cash_register !== false; // default true for backward compat

    const [status, setStatus] = useState('loading'); // loading | ok | no-register | expired | no-desk
    const [expiredRegister, setExpiredRegister] = useState(null);
    const [crossDesk, setCrossDesk] = useState(false);
    const [warningHours, setWarningHours] = useState(null);
    const [showModal, setShowModal] = useState(false);

    const setCashRegisterRef = useRef(setCashRegister);
    setCashRegisterRef.current = setCashRegister;

    // ── Register lookup ───────────────────────────────────────
    const checkRegister = useCallback(async () => {
        // Skip lookup entirely when desk doesn't support cash register
        if (!deskHasCashRegister) {
            setCashRegisterRef.current(null);
            setCrossDesk(false);
            setStatus('no-register');
            return;
        }

        const userId = user?.documentId ?? user?.id;
        if (!desk?.id && !userId) {
            setStatus('no-desk');
            return;
        }

        try {
            const params = new URLSearchParams();
            if (desk?.id) params.set('desk_id', desk.id);
            if (userId) params.set('user_id', userId);

            const res = await authApi.get(`/cash-registers/active?${params.toString()}`);
            const register = res?.data ?? null;

            if (res?.meta?.expired) {
                setExpiredRegister(res.meta.expired);
                setCashRegisterRef.current(null);
                setCrossDesk(false);
                setStatus('expired');
                return;
            }

            if (!register) {
                setCashRegisterRef.current(null);
                setCrossDesk(false);
                setStatus('no-register');
                return;
            }

            if (isExpiredCheck(register)) {
                setExpiredRegister(register);
                setCashRegisterRef.current(null);
                setCrossDesk(false);
                setStatus('expired');
                return;
            }

            setCashRegisterRef.current(register);
            const onDifferentDesk = desk?.id && register.desk_id && Number(register.desk_id) !== Number(desk.id);
            setCrossDesk(!!onDifferentDesk);

            const hrs = hoursOpen(register);
            setWarningHours(hrs >= 18 ? Math.round(hrs) : null);
            setStatus('ok');
        } catch (err) {
            console.error('CashRegisterGuard: check failed', err);
            setStatus('no-register');
        }
    }, [desk?.id, user?.documentId, user?.id, deskHasCashRegister]);

    useEffect(() => { checkRegister(); }, [checkRegister]);

    // ── Derived state ─────────────────────────────────────────
    const canCheckout = deskHasCashRegister && status === 'ok';

    const ctxValue = {
        deskHasCashRegister,
        registerStatus: status,
        canCheckout,
        crossDesk,
        warningHours,
        expiredRegister,
        openRegisterModal: () => setShowModal(true),
        refreshRegister: checkRegister,
    };

    return (
        <CashRegisterContext.Provider value={ctxValue}>
            {/* Informational banners (non-blocking) */}
            {status !== 'loading' && !deskHasCashRegister && (
                <div className="alert alert-secondary py-2 mb-2 d-flex align-items-center">
                    <i className="fas fa-info-circle me-2"></i>
                    <span>This desk is <strong>not set up for payments</strong>. You can create and save sales. Checkout must be done from a payment desk.</span>
                </div>
            )}
            {crossDesk && cashRegister && (
                <div className="alert alert-info py-2 mb-2 d-flex align-items-center">
                    <i className="fas fa-exchange-alt me-2"></i>
                    <span>Using your cash register from <strong>{cashRegister.desk_name || `Desk ${cashRegister.desk_id}`}</strong>.</span>
                </div>
            )}
            {warningHours && (
                <div className="alert alert-warning py-2 mb-2 d-flex align-items-center">
                    <i className="fas fa-clock me-2"></i>
                    <span>Cash register open for <strong>{warningHours} hours</strong>. Auto-expires at {EXPIRY_HOURS}h.</span>
                </div>
            )}
            {status === 'expired' && (
                <div className="alert alert-danger py-2 mb-2 d-flex align-items-center">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    <span>Cash register has <strong>expired</strong>. <Link href="/cash-register">Close it</Link> or open a new one to process payments.</span>
                </div>
            )}

            {children}

            {/* Open Register Modal (shown on demand) */}
            {showModal && deskHasCashRegister && (
                <OpenRegisterModal
                    onClose={() => setShowModal(false)}
                    onOpened={() => { setShowModal(false); checkRegister(); }}
                    status={status}
                    expiredRegister={expiredRegister}
                />
            )}
        </CashRegisterContext.Provider>
    );
}

// ── Open Register Modal ───────────────────────────────────────

function OpenRegisterModal({ onClose, onOpened, status, expiredRegister }) {
    const { desk, branch, user, setCashRegister, currency } = useUtil();
    const [openingCash, setOpeningCash] = useState('');
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState(null);

    const handleOpen = async (e) => {
        e.preventDefault();
        if (!desk?.id) return;
        setOpening(true);
        setError(null);
        try {
            const branchId = branch?.documentId ?? branch?.id;
            const userId = user?.documentId ?? user?.id;
            const payload = {
                opening_cash: Number(openingCash || 0),
                desk_id: desk.id,
                desk_name: desk.name || '',
                branch_id: branchId || null,
                branch_name: branch?.name || '',
                opened_by: user?.username || user?.email || '',
                opened_by_id: user?.id ?? null,
                ...(branchId ? { branch: { connect: [branchId] } } : {}),
                ...(userId ? { opened_by_user: { connect: [userId] } } : {}),
            };
            const res = await authApi.post('/cash-registers/open', { data: payload });
            const created = res?.data ?? res;
            setCashRegister(created);
            onOpened();
        } catch (err) {
            console.error('OpenRegisterModal: open failed', err);
            const msg = err?.response?.data?.error?.message || err?.message || 'Failed to open register';
            setError(msg);
        } finally {
            setOpening(false);
        }
    };

    return (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header bg-warning text-dark">
                        <h5 className="modal-title">
                            <i className="fas fa-exclamation-triangle me-2"></i>
                            {status === 'expired' ? 'Cash Register Expired' : 'No Active Cash Register'}
                        </h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>
                    <div className="modal-body">
                        {status === 'expired' && expiredRegister && (
                            <div className="alert alert-danger">
                                <strong>Register expired.</strong> Opened at{' '}
                                {new Date(expiredRegister.opened_at).toLocaleString()} — exceeded {EXPIRY_HOURS}h.
                            </div>
                        )}
                        <p>
                            {status === 'expired'
                                ? 'Open a new register to continue processing payments.'
                                : 'No active cash register found. Open one to process payments.'}
                        </p>
                        <form onSubmit={handleOpen}>
                            <div className="mb-3">
                                <label className="form-label fw-semibold">Opening Cash</label>
                                <div className="input-group">
                                    <span className="input-group-text">{currency}</span>
                                    <input type="number" step="0.01" min="0" className="form-control"
                                        value={openingCash} onChange={(e) => setOpeningCash(e.target.value)}
                                        disabled={opening} autoFocus />
                                </div>
                            </div>
                            {error && <div className="alert alert-danger py-2">{error}</div>}
                            <button className="btn btn-success w-100" type="submit" disabled={opening}>
                                {opening
                                    ? <><span className="spinner-border spinner-border-sm me-2"></span>Opening...</>
                                    : <><i className="fas fa-cash-register me-2"></i>Open Cash Register</>}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
