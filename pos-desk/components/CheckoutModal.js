import { useState, useEffect } from 'react';
import { useUtil } from '../context/UtilContext';

const CheckoutModal = ({ isOpen, onClose, total, onComplete, loading }) => {
    const { currency } = useUtil();
    const [payments, setPayments] = useState([]);
    function validOrDefult(value, def) {

        const val = parseFloat(value);
        if (Number.isFinite(val) && !Number.isNaN(val)) {
            return val;
        }
        return def;
    }
    useEffect(() => {
        if (isOpen) {
            setPayments([
                { id: Date.now(), payment_method: 'Cash', amount: '', transaction_no: '' }
            ]);
        }
    }, [isOpen]);

    const totalPaid = payments.reduce((sum, payment) => sum + validOrDefult(payment.amount, 0), 0);
    const change = Math.max(totalPaid - total, 0);
    const remaining = Math.max(total - totalPaid, 0);
    const hasCashPayment = payments.some((payment) => payment.payment_method === 'Cash');

    const updatePayment = (index, updates) => {
        setPayments((prev) => prev.map((payment, idx) => (idx === index ? { ...payment, ...updates } : payment)));
    };

    const handleAmountChange = (index, value) => {
        updatePayment(index, { amount: value });
    };

    const handleMethodChange = (index, value) => {
        updatePayment(index, { payment_method: value });
    };

    const handleTransactionChange = (index, value) => {
        updatePayment(index, { transaction_no: value });
    };

    const handleExactAmount = (index) => {
        const currentAmount = validOrDefult(payments[index]?.amount, 0);
        const nextAmount = Math.max(total - (totalPaid - currentAmount), 0);
        updatePayment(index, { amount: (Math.ceil(nextAmount * 100) / 100).toFixed(2) });
    };

    const handleAddPayment = () => {
        setPayments((prev) => [
            ...prev,
            { id: Date.now() + prev.length, payment_method: 'Card', amount: '', transaction_no: '' }
        ]);
    };

    const handleRemovePayment = (index) => {
        setPayments((prev) => prev.filter((_, idx) => idx !== index));
    };

    const handlePay = () => {
        if (totalPaid < total) {
            alert(`Insufficient payment. Total is ${currency}${total.toFixed(2)}, but only ${currency}${totalPaid.toFixed(2)} received.`);
            return;
        }
        if (totalPaid > total && !hasCashPayment) {
            alert('Overpayment is only supported when using cash.');
            return;
        }

        const hasInvalidAmount = payments.some((payment) => validOrDefult(payment.amount, 0) <= 0);
        if (hasInvalidAmount) {
            alert('Please enter a valid amount for each payment.');
            return;
        }

        const lastCashIndex = [...payments].reverse().findIndex((payment) => payment.payment_method === 'Cash');
        const cashIndex = lastCashIndex === -1 ? -1 : payments.length - 1 - lastCashIndex;
        const paymentsPayload = payments.map((payment, index) => {
            const amount = validOrDefult(payment.amount, 0);
            const payload = {
                payment_method: payment.payment_method,
                amount,
                transaction_no: payment.transaction_no || undefined,
                payment_date: new Date(),
                due: total
            };

            if (payment.payment_method === 'Cash') {
                payload.cash_received = amount;
                payload.change = index === cashIndex ? change : 0;
            }

            return payload;
        });

        onComplete(paymentsPayload);
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

                        {payments.map((payment, index) => (
                            <div key={payment.id} className="border rounded p-2 mb-2">
                                <div className="d-flex gap-2 mb-2">
                                    <select
                                        className="form-select"
                                        value={payment.payment_method}
                                        onChange={(e) => handleMethodChange(index, e.target.value)}
                                        disabled={loading}
                                    >
                                        <option value="Cash">Cash</option>
                                        <option value="Card">Card</option>
                                        <option value="Bank">Bank</option>
                                        <option value="Mobile Wallet">Mobile Wallet</option>
                                    </select>
                                    <button
                                        type="button"
                                        className="btn btn-outline-danger"
                                        onClick={() => handleRemovePayment(index)}
                                        disabled={loading || payments.length === 1}
                                    >
                                        Remove
                                    </button>
                                </div>
                                <div className="input-group mb-2">
                                    <input
                                        type="text"
                                        className="form-control text-end"
                                        value={payment.amount}
                                        onChange={(e) => handleAmountChange(index, e.target.value)}
                                        placeholder="0.00"
                                        autoFocus={index === 0}
                                        disabled={loading}
                                    />
                                    <button
                                        className="btn btn-secondary"
                                        type="button"
                                        onClick={() => handleExactAmount(index)}
                                        disabled={loading}
                                    >
                                        Exact
                                    </button>
                                </div>
                                {payment.payment_method !== 'Cash' && (
                                    <input
                                        type="text"
                                        className="form-control"
                                        value={payment.transaction_no}
                                        onChange={(e) => handleTransactionChange(index, e.target.value)}
                                        placeholder="Transaction No. (optional)"
                                        disabled={loading}
                                    />
                                )}
                            </div>
                        ))}

                        <div className="d-grid mb-2">
                            <button className="btn btn-outline-primary" type="button" onClick={handleAddPayment} disabled={loading}>
                                Add Payment Method
                            </button>
                        </div>

                        <div className="d-flex justify-content-between mb-2">
                            <div>Paid:</div>
                            <div className="fw-bold">{currency}{totalPaid.toFixed(2)}</div>
                        </div>
                        <div className="d-flex justify-content-between mb-2">
                            <div>Remaining:</div>
                            <div className="fw-bold">{currency}{remaining.toFixed(2)}</div>
                        </div>

                        {change > 0 && (
                            <div className="alert alert-success d-flex justify-content-between align-items-center py-2 mb-2" role="alert">
                                <div>Change to Return:</div>
                                <div className="fw-bold">{currency}{change.toFixed(2)}</div>
                            </div>
                        )}

                        {totalPaid < total && totalPaid > 0 && (
                            <div className="text-danger text-center small">Insufficient payment</div>
                        )}
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="button" className="btn btn-success" onClick={handlePay} disabled={loading || payments.length === 0 || totalPaid < total}>
                            {loading ? 'Processing...' : 'Pay'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutModal;

