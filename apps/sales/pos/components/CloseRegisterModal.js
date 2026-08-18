import { useEffect, useMemo, useState } from 'react';
import { useUtil } from '@rutba/shared/context/UtilContext';
import {
    CashRegistersEndpoints,
    PaymentsEndpoints,
    CashRegisterTransactionEndpoints,
} from '@rutba/api-provider/endpoints/index.js';

/**
 * CloseRegisterModal
 *
 * Closes ANY register from a list, without having to be logged in as its
 * owner on its desk. Registers that expire on an unattended desk (the staff
 * member went home, the shift rolled over) used to be closable only from
 * /cash-register — i.e. only by whoever the `active` lookup happened to
 * resolve — so they piled up as "Expired — never closed" in the report.
 * Admins and managers now clear them from the Cash Registers list.
 *
 * Expected cash is recomputed here from the register's own payments and
 * transactions (same formula the server uses on close) so the closer sees
 * what the drawer *should* hold before entering the count.
 *
 * Force close covers the registers that have no closing data to enter at all —
 * an old shift whose cash nobody can vouch for. It records the count as
 * UNKNOWN (not zero), requires a written reason, and flags the register as
 * force-closed so the report never reads it as a genuine count.
 *
 * Props:
 *  - register   : the register row to close (null → closed modal)
 *  - allowForce : whether to offer force close (admin/manager only)
 *  - onCancel   : () => void
 *  - onClosed   : (updatedRegister) => void — fired after a successful close
 */
export default function CloseRegisterModal({ register, allowForce = true, onCancel, onClosed }) {
    const { currency, user, desk, cashRegister, setCashRegister } = useUtil();

    const [payments, setPayments] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loadingTotals, setLoadingTotals] = useState(false);
    const [totalsError, setTotalsError] = useState(null);

    const [cashLeft, setCashLeft] = useState('');
    const [cashDrawn, setCashDrawn] = useState('');
    const [leftEdited, setLeftEdited] = useState(false);
    const [drawnEdited, setDrawnEdited] = useState(false);
    const [notes, setNotes] = useState('');
    const [forceMode, setForceMode] = useState(false);
    const [forceReason, setForceReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const registerId = register?.documentId ?? register?.id;

    // Reset the form whenever a different register is opened.
    useEffect(() => {
        setCashLeft('');
        setCashDrawn('');
        setLeftEdited(false);
        setDrawnEdited(false);
        setNotes('');
        setForceMode(false);
        setForceReason('');
        setError(null);
        setPayments([]);
        setTransactions([]);
    }, [registerId]);

    // Pull the register's own ledger so expected cash is real, not guessed.
    useEffect(() => {
        if (!registerId) return;
        let cancelled = false;
        (async () => {
            setLoadingTotals(true);
            setTotalsError(null);
            try {
                const [payRes, txnRes] = await Promise.all([
                    PaymentsEndpoints.fetchByRegister(registerId, { useDocumentId: !!register?.documentId }),
                    CashRegisterTransactionEndpoints.fetchByRegister(registerId, { useDocumentId: !!register?.documentId }),
                ]);
                if (cancelled) return;
                setPayments(payRes?.data ?? []);
                setTransactions(txnRes?.data ?? []);
            } catch (err) {
                console.error('CloseRegisterModal: failed to load register totals', err);
                if (!cancelled) setTotalsError('Could not load this register’s payments — expected cash may be incomplete.');
            } finally {
                if (!cancelled) setLoadingTotals(false);
            }
        })();
        return () => { cancelled = true; };
    }, [registerId, register?.documentId]);

    // Net cash in from sales: only positive Cash tenders move the drawer;
    // refund payouts are negative payments paired with a Refund transaction.
    const cashNet = useMemo(() => {
        let received = 0;
        let change = 0;
        for (const p of payments) {
            if (p.payment_method !== 'Cash') continue;
            const amt = Number(p.amount || 0);
            if (amt < 0) continue;
            received += Number(p.cash_received || amt);
            change += Number(p.change || 0);
        }
        return received - change;
    }, [payments]);

    const txnTotals = useMemo(() => {
        const t = { cashDrops: 0, topups: 0, expenses: 0, refunds: 0, adjustments: 0 };
        for (const tx of transactions) {
            const amt = Number(tx.amount || 0);
            switch (tx.type) {
                case 'CashDrop': t.cashDrops += amt; break;
                case 'CashTopUp': t.topups += amt; break;
                case 'Expense': t.expenses += amt; break;
                case 'Refund': t.refunds += amt; break;
                case 'Adjustment': t.adjustments += amt; break;
            }
        }
        return t;
    }, [transactions]);

    const expectedCash = useMemo(
        () => Number(register?.opening_cash || 0)
            + cashNet
            + txnTotals.topups
            + txnTotals.adjustments
            - txnTotals.refunds
            - txnTotals.expenses
            - txnTotals.cashDrops,
        [register?.opening_cash, cashNet, txnTotals]
    );

    const countedTotal = Number(cashLeft || 0) + Number(cashDrawn || 0);
    const hasCountInput = cashLeft !== '' || cashDrawn !== '';
    const difference = countedTotal - expectedCash;
    const uncounted = hasCountInput && countedTotal === 0 && Math.abs(expectedCash) >= 0.01;

    const fmt = (v) => `${currency}${Number(v || 0).toFixed(2)}`;
    const roundCash = (n) => String(Math.max(Math.round(n * 100) / 100, 0));

    // Left + Drawn complete each other against expected — same behaviour as the
    // Close Day strip on /cash-register.
    const handleLeftChange = (v) => {
        setCashLeft(v);
        setLeftEdited(v !== '');
        if (!drawnEdited) setCashDrawn(v === '' ? '' : roundCash(expectedCash - Number(v || 0)));
    };
    const handleDrawnChange = (v) => {
        setCashDrawn(v);
        setDrawnEdited(v !== '');
        if (!leftEdited) setCashLeft(v === '' ? '' : roundCash(expectedCash - Number(v || 0)));
    };

    // Both quick-fills mark the fields as edited so the left/drawn
    // auto-completion doesn't immediately overwrite the other one.
    const fillFromExpected = () => {
        setCashLeft(roundCash(expectedCash));
        setCashDrawn('0');
        setLeftEdited(true);
        setDrawnEdited(true);
    };

    // The abandoned-drawer case: nobody counted, and the cash is gone or was
    // never verified. Recorded honestly as a short rather than assumed correct.
    const fillNothingCounted = () => {
        setCashLeft('0');
        setCashDrawn('0');
        setLeftEdited(true);
        setDrawnEdited(true);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!registerId || saving) return;
        if (forceMode && !forceReason.trim()) {
            setError('Give a reason for force-closing this register.');
            return;
        }
        setSaving(true);
        setError(null);
        try {
            const userId = user?.documentId ?? user?.id;
            const res = await CashRegistersEndpoints.postClose(registerId, {
                // A force close sends no count at all — the server records it
                // as unknown rather than storing a zero it can't stand behind.
                ...(forceMode
                    ? { force: true, force_reason: forceReason.trim() }
                    : {
                        cash_left: Number(cashLeft || 0),
                        cash_drawn: Number(cashDrawn || 0),
                        counted_cash: countedTotal,
                        notes,
                    }),
                // The desk this close is performed from — the server accepts it
                // as ownership for registers that record no opener.
                desk_id: desk?.id ?? null,
                closed_by: user?.username || user?.email || '',
                closed_by_id: user?.id ?? null,
                ...(userId ? { closed_by_user: { connect: [userId] } } : {}),
            });
            // If this was also the closer's own current register, drop it from
            // the POS chrome so checkout doesn't keep treating it as live.
            const ownId = cashRegister?.documentId ?? cashRegister?.id;
            if (ownId && String(ownId) === String(registerId)) setCashRegister(null);
            onClosed?.(res?.data ?? res);
        } catch (err) {
            console.error('CloseRegisterModal: close failed', err);
            setError(err?.response?.data?.error?.message || err?.message || 'Failed to close register');
        } finally {
            setSaving(false);
        }
    };

    if (!register) return null;

    const isExpired = register.status === 'Expired';
    const openedLabel = register.opened_at ? new Date(register.opened_at).toLocaleString() : '—';
    const openedByLabel = register.opened_by || register.opened_by_user?.username || '';

    return (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered">
                <div className="modal-content">
                    <div className="modal-header py-2">
                        <h6 className="modal-title mb-0">
                            <i className="fas fa-lock me-2"></i>
                            Close Register #{register.id}
                        </h6>
                        <button type="button" className="btn-close" onClick={onCancel} disabled={saving}></button>
                    </div>

                    <div className="modal-body py-2">
                        <div className={`alert py-2 mb-2 small ${isExpired ? 'alert-warning' : 'alert-light border'}`}>
                            <div>
                                <i className={`fas ${isExpired ? 'fa-triangle-exclamation' : 'fa-cash-register'} me-1`}></i>
                                <strong>{register.desk_name || `Desk ${register.desk_id}`}</strong>
                                {openedByLabel
                                    ? <> · opened by <strong>{openedByLabel}</strong></>
                                    : <span className="text-muted"> · no opener recorded</span>}
                            </div>
                            <div className="text-muted">Open since {openedLabel}{isExpired ? ' · expired' : ''}</div>
                        </div>

                        {totalsError && (
                            <div className="alert alert-warning py-2 mb-2 small">
                                <i className="fas fa-triangle-exclamation me-1"></i>{totalsError}
                            </div>
                        )}
                        {error && (
                            <div className="alert alert-danger py-2 mb-2 small">
                                <i className="fas fa-times-circle me-1"></i>{error}
                            </div>
                        )}

                        {/* Expected cash breakdown */}
                        <div className="card mb-2">
                            <div className="card-body p-0">
                                <table className="table table-sm mb-0">
                                    <tbody>
                                        <tr><td className="small">Opening float</td><td className="text-end small">{fmt(register.opening_cash)}</td></tr>
                                        <tr><td className="small">(+) Net cash sales</td><td className="text-end small text-success">{fmt(cashNet)}</td></tr>
                                        {txnTotals.topups > 0 && <tr><td className="small">(+) Top-ups</td><td className="text-end small text-success">{fmt(txnTotals.topups)}</td></tr>}
                                        {txnTotals.adjustments !== 0 && <tr><td className="small">(+/−) Adjustments</td><td className="text-end small text-info">{fmt(txnTotals.adjustments)}</td></tr>}
                                        {txnTotals.refunds > 0 && <tr><td className="small">(−) Refunds</td><td className="text-end small text-danger">{fmt(txnTotals.refunds)}</td></tr>}
                                        {txnTotals.expenses > 0 && <tr><td className="small">(−) Expenses</td><td className="text-end small text-danger">{fmt(txnTotals.expenses)}</td></tr>}
                                        {txnTotals.cashDrops > 0 && <tr><td className="small">(−) Cash drops</td><td className="text-end small text-danger">{fmt(txnTotals.cashDrops)}</td></tr>}
                                        <tr className="table-primary">
                                            <td className="fw-bold small">Expected cash</td>
                                            <td className="text-end fw-bold small">
                                                {loadingTotals
                                                    ? <span className="spinner-border spinner-border-sm"></span>
                                                    : fmt(expectedCash)}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit}>
                            {!forceMode && (
                                <>
                                    <div className="row g-2 mb-2">
                                        <div className="col-6">
                                            <label className="form-label small text-muted mb-1">Left in drawer</label>
                                            <div className="input-group input-group-sm">
                                                <span className="input-group-text">{currency}</span>
                                                <input type="number" step="0.01" min="0" className="form-control"
                                                    value={cashLeft} onChange={(e) => handleLeftChange(e.target.value)}
                                                    disabled={saving} autoFocus />
                                            </div>
                                        </div>
                                        <div className="col-6">
                                            <label className="form-label small text-muted mb-1">Drawn out</label>
                                            <div className="input-group input-group-sm">
                                                <span className="input-group-text">{currency}</span>
                                                <input type="number" step="0.01" min="0" className="form-control"
                                                    value={cashDrawn} onChange={(e) => handleDrawnChange(e.target.value)}
                                                    disabled={saving} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="d-flex align-items-center justify-content-between mb-2 small">
                                        <span>
                                            <button type="button" className="btn btn-link btn-sm p-0" onClick={fillFromExpected} disabled={loadingTotals || saving}>
                                                Count = expected ({fmt(expectedCash)})
                                            </button>
                                            <span className="text-muted mx-2">·</span>
                                            <button type="button" className="btn btn-link btn-sm p-0 text-danger" onClick={fillNothingCounted} disabled={saving}>
                                                Nothing counted
                                            </button>
                                        </span>
                                        {hasCountInput && (
                                            <span>
                                                Counted {fmt(countedTotal)} ·{' '}
                                                <span className={difference >= 0 ? 'text-success' : 'text-danger'}>
                                                    {difference >= 0 ? '+' : ''}{fmt(difference)}
                                                </span>
                                            </span>
                                        )}
                                    </div>

                                    {uncounted && (
                                        <div className="alert alert-warning py-2 mb-2 small">
                                            <i className="fas fa-triangle-exclamation me-1"></i>
                                            Closing with nothing counted books the whole {fmt(expectedCash)} as a cash short
                                            and flags this register in the Register Report.
                                        </div>
                                    )}

                                    <input type="text" className="form-control form-control-sm mb-2" value={notes}
                                        onChange={(e) => setNotes(e.target.value)} disabled={saving}
                                        placeholder={isExpired ? 'Why is this being closed by an admin? (recommended)' : 'Notes (optional)'} />
                                </>
                            )}

                            {allowForce && (
                                <div className="form-check form-switch mb-2">
                                    <input className="form-check-input" type="checkbox" role="switch" id="forceCloseSwitch"
                                        checked={forceMode} onChange={(e) => { setForceMode(e.target.checked); setError(null); }}
                                        disabled={saving} />
                                    <label className="form-check-label small" htmlFor="forceCloseSwitch">
                                        No cash count available — <strong>force close</strong>
                                    </label>
                                </div>
                            )}

                            {forceMode && (
                                <>
                                    <div className="alert alert-danger py-2 mb-2 small">
                                        <i className="fas fa-triangle-exclamation me-1"></i>
                                        The counted cash is recorded as <strong>unknown</strong>, the expected{' '}
                                        {loadingTotals || totalsError ? 'drawer balance' : fmt(expectedCash)}{' '}
                                        is written off to Cash Short/Over, and the register is
                                        permanently marked <strong>force-closed</strong>. Use this only when no count
                                        can be produced.
                                    </div>
                                    <input type="text" className="form-control form-control-sm mb-2" value={forceReason}
                                        onChange={(e) => setForceReason(e.target.value)} disabled={saving}
                                        placeholder="Reason for force close (required)" required autoFocus />
                                </>
                            )}

                            <div className="d-flex gap-2 justify-content-end">
                                <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onCancel} disabled={saving}>
                                    Cancel
                                </button>
                                {forceMode ? (
                                    <button type="submit" className="btn btn-danger btn-sm" disabled={saving || !forceReason.trim()}>
                                        {saving
                                            ? <><span className="spinner-border spinner-border-sm me-1"></span>Force closing…</>
                                            : <><i className="fas fa-triangle-exclamation me-1"></i>Force Close</>}
                                    </button>
                                ) : (
                                    <button type="submit" className="btn btn-dark btn-sm" disabled={saving || loadingTotals || !hasCountInput}>
                                        {saving
                                            ? <><span className="spinner-border spinner-border-sm me-1"></span>Closing…</>
                                            : <><i className="fas fa-lock me-1"></i>Close Register</>}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
