import { useState, useEffect } from 'react';
import { useUtil } from '../context/UtilContext';

const CheckoutModal = ({ isOpen, onClose, total, onComplete, loading }) => {
    const { currency } = useUtil();
    const [cashReceived, setCashReceived] = useState('');
    const [change, setChange] = useState(0);
    function validOrDefult(value, def) {

        const val = parseFloat(value);
        if (Number.isFinite(val) && !Number.isNaN(val)) {
            return val;
        }
        return def;
    }
    useEffect(() => {
        if (isOpen) {
            setCashReceived('');
            setChange(0);
        }
    }, [isOpen]);

    useEffect(() => {
        const cash = validOrDefult(cashReceived, 0);
        const calculatedChange = cash - total;
        setChange(calculatedChange >= 0 ? calculatedChange : 0);
    }, [cashReceived, total]);

    const handleCashReceivedChange = (e) => {
        const value = validOrDefult(e.target.value, 0);
        setCashReceived(value);
    };

    const handlePay = () => {
        const cash = validOrDefult(cashReceived, 0);
        if (cash < total) {
            alert(`Insufficient payment. Total is ${currency}${total.toFixed(2)}, but only ${currency}${cash.toFixed(2)} received.`);
            return;
        }
        onComplete({ payment_method: 'Cash', amount: cash, payment_date: new Date(), cash_received: cashReceived, change, due: total });
    };

    const handleExactAmount = () => {
        // set cash received to total (formatted) to satisfy validation
        setCashReceived((Math.ceil(total * 100) / 100).toFixed(2));
    };

    if (!isOpen) return null;

    return (
        <div className="modal show d-block  " tabIndex="-1" role="dialog" onClick={onClose}>
            <div className="modal-dialog modal-sm modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
                <div className="modal-content border border-primary rounded-2">
                    <div className="modal-header">
                        <h5 className="modal-title">Payment</h5>
                        <button type="button" className="btn-close" aria-label="Close" onClick={onClose} disabled={loading}></button>
                    </div>
                    <div className="modal-body">
                        <div className="d-flex justify-content-between mb-3">
                            <div>Total Amount:</div>
                            <div className="fw-bold">{currency}{total.toFixed(2)}</div>
                        </div>

                        <label className="form-label">Cash Received:</label>
                        <div className="input-group mb-2">
                            <input
                                type="text"
                                className="form-control text-end"
                                value={cashReceived}
                                onChange={handleCashReceivedChange}
                                placeholder="0.00"
                                autoFocus
                                disabled={loading}
                            />
                            <button
                                className="btn btn-secondary"
                                type="button"
                                onClick={handleExactAmount}
                                disabled={loading}
                            >
                                Exact
                            </button>
                        </div>

                        {change > 0 && (
                            <div className="alert alert-success d-flex justify-content-between align-items-center py-2 mb-2" role="alert">
                                <div>Change to Return:</div>
                                <div className="fw-bold">{currency}{change.toFixed(2)}</div>
                            </div>
                        )}

                        {parseFloat(cashReceived) < total && cashReceived !== '' && (
                            <div className="text-danger text-center small">Insufficient payment</div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="button" className="btn btn-success" onClick={handlePay} disabled={loading || !cashReceived || parseFloat(cashReceived) < total}>
                            {loading ? 'Processing...' : 'Pay'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutModal;

