import { useEffect, useState, useCallback } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { authApi } from '@rutba/pos-shared/lib/api';

const EXPIRY_HOURS = 20;

function isExpired(register) {
    if (!register || !register.opened_at) return false;
    const openedMs = new Date(register.opened_at).getTime();
    return Date.now() - openedMs > EXPIRY_HOURS * 60 * 60 * 1000;
}

function hoursOpen(register) {
    if (!register || !register.opened_at) return 0;
    return (Date.now() - new Date(register.opened_at).getTime()) / (60 * 60 * 1000);
}

/**
 * CashRegisterGuard
 *
 * Wraps sale-creation pages. Checks for an active cash register on the
 * current desk. If none exists (or the current one is expired), shows a
 * blocking modal instructing the user to open a new register.
 *
 * Props:
 *  - children: rendered when an active register is available
 */
export default function CashRegisterGuard({ children }) {
    const { desk, branch, user, cashRegister, setCashRegister, currency } = useUtil();
    const [status, setStatus] = useState('loading'); // loading | ok | no-register | expired | no-desk
    const [expiredRegister, setExpiredRegister] = useState(null);
    const [openingCash, setOpeningCash] = useState('');
    const [opening, setOpening] = useState(false);
    const [error, setError] = useState(null);
    const [warningHours, setWarningHours] = useState(null);

    const checkRegister = useCallback(async () => {
        if (!desk?.id) {
            setStatus('no-desk');
            return;
        }

        try {
            const res = await authApi.get(`/cash-registers/active?desk_id=${desk.id}`);
            const register = res?.data ?? null;

            if (res?.meta?.expired) {
                setExpiredRegister(res.meta.expired);
                setCashRegister(null);
                setStatus('expired');
                return;
            }

            if (!register) {
                setCashRegister(null);
                setStatus('no-register');
                return;
            }

            if (isExpired(register)) {
                setExpiredRegister(register);
                setCashRegister(null);
                setStatus('expired');
                return;
            }

            setCashRegister(register);
            const hrs = hoursOpen(register);
            if (hrs >= 18) {
                setWarningHours(Math.round(hrs));
            } else {
                setWarningHours(null);
            }
            setStatus('ok');
        } catch (err) {
            console.error('CashRegisterGuard: check failed', err);
            setStatus('no-register');
        }
    }, [desk?.id, setCashRegister]);

    useEffect(() => {
        checkRegister();
    }, [checkRegister]);

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
            setOpeningCash('');
            setExpiredRegister(null);
            setStatus('ok');
        } catch (err) {
            console.error('CashRegisterGuard: open failed', err);
            const msg = err?.response?.data?.error?.message || err?.message || 'Failed to open register';
            setError(msg);
        } finally {
            setOpening(false);
        }
    };

    if (status === 'loading') {
        return <div className="text-center p-5 text-muted">Checking cash register...</div>;
    }

    if (status === 'no-desk') {
        return (
            <div className="d-flex justify-content-center align-items-center" style={{ minHeight: 300 }}>
                <div className="card shadow" style={{ maxWidth: 480 }}>
                    <div className="card-body text-center p-4">
                        <i className="fas fa-desktop fa-3x text-warning mb-3"></i>
                        <h5>No Desk Selected</h5>
                        <p className="text-muted">Please select a branch and desk in <a href="/settings">Settings</a> before creating sales.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (status === 'no-register' || status === 'expired') {
        return (
            <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                <div className="modal-dialog modal-dialog-centered">
                    <div className="modal-content">
                        <div className="modal-header bg-warning text-dark">
                            <h5 className="modal-title">
                                <i className="fas fa-exclamation-triangle me-2"></i>
                                {status === 'expired' ? 'Cash Register Expired' : 'No Active Cash Register'}
                            </h5>
                        </div>
                        <div className="modal-body">
                            {status === 'expired' && expiredRegister && (
                                <div className="alert alert-danger">
                                    <strong>Register expired.</strong> The register opened at{' '}
                                    {new Date(expiredRegister.opened_at).toLocaleString()} has exceeded the
                                    maximum session duration ({EXPIRY_HOURS} hours) and has been automatically expired.
                                </div>
                            )}
                            <p>
                                {status === 'expired'
                                    ? 'Please open a new cash register to continue processing sales.'
                                    : 'No active cash register found for this desk. Please open a new register to start processing sales.'}
                            </p>
                            <form onSubmit={handleOpen}>
                                <div className="mb-3">
                                    <label className="form-label fw-semibold">Opening Cash</label>
                                    <div className="input-group">
                                        <span className="input-group-text">{currency}</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            className="form-control"
                                            value={openingCash}
                                            onChange={(e) => setOpeningCash(e.target.value)}
                                            disabled={opening}
                                            autoFocus
                                        />
                                    </div>
                                </div>
                                {error && <div className="alert alert-danger py-2">{error}</div>}
                                <button className="btn btn-success w-100" type="submit" disabled={opening}>
                                    {opening ? (
                                        <><span className="spinner-border spinner-border-sm me-2"></span>Opening...</>
                                    ) : (
                                        <><i className="fas fa-cash-register me-2"></i>Open Cash Register</>
                                    )}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // status === 'ok'
    return (
        <>
            {warningHours && (
                <div className="alert alert-warning py-2 mb-2 d-flex align-items-center">
                    <i className="fas fa-clock me-2"></i>
                    <span>
                        Cash register has been open for <strong>{warningHours} hours</strong>.
                        Consider closing and opening a new register soon (auto-expires at {EXPIRY_HOURS} hours).
                    </span>
                </div>
            )}
            {children}
        </>
    );
}
