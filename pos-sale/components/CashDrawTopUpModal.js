import { useState } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';
import { authApi } from '@rutba/pos-shared/lib/api';

/**
 * CashDrawTopUpModal
 *
 * Quick-access modal for recording Cash Draw (CashDrop) and Cash Top-Up
 * transactions against the active cash register.
 *
 * When a saleRegister is provided (the register the sale was created on),
 * it is preferred over the user's own register — so an admin operating
 * from a different desk records the draw against the correct register.
 *
 * Props:
 *  - isOpen        : boolean
 *  - onClose       : () => void
 *  - onComplete    : () => void  (called after a successful transaction)
 *  - saleRegister  : object|null (the cash_register populated on the sale)
 */
export default function CashDrawTopUpModal({ isOpen, onClose, onComplete, saleRegister }) {
    const { cashRegister, currency, user, desk } = useUtil();

    const [txnType, setTxnType] = useState('CashDrop');
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    if (!isOpen) return null;

    // Determine which register to target:
    // Prefer the sale's register (if active) so draws go where the sale was made.
    const saleReg = saleRegister && saleRegister.status === 'Active' ? saleRegister : null;
    const ownReg = cashRegister || null;
    const targetRegister = saleReg || ownReg;
    const registerId = targetRegister?.documentId ?? targetRegister?.id;

    // Detect cross-desk: admin is on a different desk than the target register
    const isCrossDesk = targetRegister && desk?.id
        && targetRegister.desk_id && Number(targetRegister.desk_id) !== Number(desk.id);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!registerId || !amount) return;

        setLoading(true);
        setError(null);
        setSuccess(null);

        try {
            await authApi.post('/cash-register-transactions', {
                data: {
                    type: txnType,
                    amount: Number(amount),
                    description: description || (txnType === 'CashDrop' ? 'Cash Draw' : 'Cash Top-Up'),
                    transaction_date: new Date().toISOString(),
                    performed_by: user?.username || user?.email || '',
                    cash_register: { connect: [registerId] }
                }
            });

            const label = txnType === 'CashDrop' ? 'Cash Draw' : 'Cash Top-Up';
            setSuccess(`${label} of ${currency}${Number(amount).toFixed(2)} recorded successfully.`);
            setAmount('');
            setDescription('');
            if (onComplete) onComplete();
        } catch (err) {
            console.error('CashDrawTopUpModal: failed', err);
            const msg = err?.response?.data?.error?.message || err?.message || 'Failed to record transaction';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        setError(null);
        setSuccess(null);
        setAmount('');
        setDescription('');
        setTxnType('CashDrop');
        onClose();
    };

    const registerLabel = targetRegister
        ? (targetRegister.desk_name || `Desk ${targetRegister.desk_id || '?'}`)
        : null;

    return (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered modal-sm">
                <div className="modal-content">
                    <div className="modal-header py-2">
                        <h6 className="modal-title mb-0">
                            <i className="fas fa-coins me-2"></i>Cash Draw / Top-Up
                        </h6>
                        <button type="button" className="btn-close btn-close-sm" onClick={handleClose}></button>
                    </div>
                    <div className="modal-body py-2">
                        {!registerId && (
                            <div className="alert alert-warning py-2 mb-2 small">
                                <i className="fas fa-exclamation-triangle me-1"></i>
                                No active cash register. Open one first.
                            </div>
                        )}

                        {registerId && (
                            <div className={`alert py-2 mb-2 small ${isCrossDesk ? 'alert-info' : 'alert-light border'}`}>
                                <i className={`fas ${isCrossDesk ? 'fa-exchange-alt' : 'fa-cash-register'} me-1`}></i>
                                <strong>Register:</strong> {registerLabel}
                                {targetRegister?.opened_by && <span className="ms-1">({targetRegister.opened_by})</span>}
                                {isCrossDesk && (
                                    <div className="mt-1 text-muted" style={{ fontSize: '0.8em' }}>
                                        <i className="fas fa-info-circle me-1"></i>
                                        Recording on the register where this sale was made.
                                    </div>
                                )}
                            </div>
                        )}

                        {saleRegister && saleRegister.status !== 'Active' && ownReg && (
                            <div className="alert alert-warning py-2 mb-2 small">
                                <i className="fas fa-exclamation-triangle me-1"></i>
                                Sale's register ({saleRegister.desk_name || 'unknown desk'}) is <strong>{saleRegister.status || 'closed'}</strong>.
                                Using your own register instead.
                            </div>
                        )}

                        {success && (
                            <div className="alert alert-success py-2 mb-2 small">
                                <i className="fas fa-check-circle me-1"></i>{success}
                            </div>
                        )}

                        {error && (
                            <div className="alert alert-danger py-2 mb-2 small">
                                <i className="fas fa-times-circle me-1"></i>{error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit}>
                            <div className="mb-2">
                                <div className="btn-group w-100" role="group">
                                    <input type="radio" className="btn-check" name="txnType" id="txnDraw"
                                        value="CashDrop" checked={txnType === 'CashDrop'}
                                        onChange={(e) => setTxnType(e.target.value)} />
                                    <label className="btn btn-outline-danger btn-sm" htmlFor="txnDraw">
                                        <i className="fas fa-arrow-up me-1"></i>Cash Draw
                                    </label>

                                    <input type="radio" className="btn-check" name="txnType" id="txnTopUp"
                                        value="CashTopUp" checked={txnType === 'CashTopUp'}
                                        onChange={(e) => setTxnType(e.target.value)} />
                                    <label className="btn btn-outline-success btn-sm" htmlFor="txnTopUp">
                                        <i className="fas fa-arrow-down me-1"></i>Top-Up
                                    </label>
                                </div>
                            </div>

                            <div className="mb-2">
                                <div className="input-group input-group-sm">
                                    <span className="input-group-text">{currency}</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        className="form-control"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="Amount"
                                        required
                                        disabled={!registerId || loading}
                                        autoFocus
                                    />
                                </div>
                            </div>

                            <div className="mb-2">
                                <input
                                    type="text"
                                    className="form-control form-control-sm"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Reason (optional)"
                                    disabled={!registerId || loading}
                                />
                            </div>

                            <button
                                className={`btn btn-sm w-100 ${txnType === 'CashDrop' ? 'btn-danger' : 'btn-success'}`}
                                type="submit"
                                disabled={!registerId || loading || !amount}
                            >
                                {loading
                                    ? <><span className="spinner-border spinner-border-sm me-1"></span>Recording...</>
                                    : <><i className={`fas ${txnType === 'CashDrop' ? 'fa-arrow-up' : 'fa-arrow-down'} me-1`}></i>
                                        {txnType === 'CashDrop' ? 'Record Cash Draw' : 'Record Top-Up'}</>
                                }
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}
