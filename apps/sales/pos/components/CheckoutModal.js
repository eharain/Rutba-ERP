import { useState, useEffect } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

const round2 = (n) => Math.round(n * 100) / 100;

function validOrDefult(value, def) {
    const val = parseFloat(value);
    if (Number.isFinite(val) && !Number.isNaN(val)) {
        return val;
    }
    return def;
}

/**
 * Same test the sale summary uses: a return-linked tender, or the explicit method.
 * A refund payout is stored as a NEGATIVE payment that is also return-linked — that
 * is money leaving the drawer, not credit coming in, so it stays on the money side.
 */
export const isCreditTender = (p) => {
    if (Number(p?.amount || 0) < 0) return false;
    return !!p?.sale_return || (p?.payment_method || '').toLowerCase() === 'exchange return';
};

/**
 * An Exchange Return row is CREDIT, not money in the drawer. It settles the sale
 * but can never produce change, so what's still due — and what's owed back — is
 * measured against the money tenders alone. Treating credit as cash is what
 * blocked checkout whenever the returned goods were worth a little more than the
 * new sale ("Overpayment is only supported when using cash").
 */
export function computeTenderTotals(payments = [], total = 0) {
    const sumRows = (rows) => round2(rows.reduce((sum, p) => sum + validOrDefult(p.amount, 0), 0));

    const creditTotal = sumRows(payments.filter(isCreditTender));
    const moneyTotal = sumRows(payments.filter((p) => !isCreditTender(p)));
    // What the customer actually has to hand over once credit is applied.
    const amountDue = Math.max(round2(total - creditTotal), 0);

    return {
        creditTotal,
        moneyTotal,
        amountDue,
        totalPaid: round2(creditTotal + moneyTotal),
        // Credit worth more than the sale: not change — the drawer owes nothing.
        unusedCredit: Math.max(round2(creditTotal - total), 0),
        change: Math.max(round2(moneyTotal - amountDue), 0),
        remaining: Math.max(round2(amountDue - moneyTotal), 0),
    };
}

const CheckoutModal = ({ isOpen, onClose, total, exchangeReturnCredit = 0, existingPayments = [], onComplete, onSavePayments, loading }) => {
    const { currency } = useUtil();
    const [payments, setPayments] = useState([]);
    const [submitting, setSubmitting] = useState(false);
    useEffect(() => {
        if (isOpen) {
            setSubmitting(false);
            const initial = [];
            let alreadyPaid = 0;

            // Add existing saved payments as locked rows
            if (existingPayments && existingPayments.length > 0) {
                existingPayments.forEach((ep, i) => {
                    initial.push({
                        id: Date.now() - 1000 + i,
                        payment_method: ep.payment_method || 'Cash',
                        amount: Number(ep.amount || 0).toFixed(2),
                        transaction_no: ep.transaction_no || '',
                        _locked: true,
                        _existing: true
                    });
                    alreadyPaid += Number(ep.amount || 0);
                });
            }

            // One definition of "credit" for the whole modal — the rows copied above
            // lose the sale_return relation, so classify from the source records.
            const alreadyExchangeReturn = (existingPayments || [])
                .filter(isCreditTender)
                .reduce((s, p) => s + Number(p.amount || 0), 0);
            const pendingExchangeReturn = Math.max(exchangeReturnCredit - alreadyExchangeReturn, 0);
            if (pendingExchangeReturn > 0) {
                initial.push({
                    id: Date.now() - 1,
                    payment_method: 'Exchange Return',
                    amount: pendingExchangeReturn.toFixed(2),
                    transaction_no: '',
                    _locked: true
                });
            }
            // Seed a blank Cash row only when money is still owed after every
            // existing tender and the pending credit are applied.
            const stillOwed = Math.max(total - alreadyPaid - pendingExchangeReturn, 0);
            if (stillOwed > 0 || initial.length === 0) {
                initial.push({
                    id: Date.now(),
                    payment_method: 'Cash',
                    amount: stillOwed > 0 ? '' : '0',
                    transaction_no: ''
                });
            }
            setPayments(initial);
        }
    }, [isOpen]);

    const { creditTotal, moneyTotal, totalPaid, amountDue, unusedCredit, change, remaining } =
        computeTenderTotals(payments, total);
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
        const nextAmount = Math.max(round2(amountDue - (moneyTotal - currentAmount)), 0);
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

    const buildPaymentsPayload = () => {
        const newPayments = payments.filter((p) => !p._locked);
        const lastCashIndex = [...newPayments].reverse().findIndex((payment) => payment.payment_method === 'Cash');
        const cashIndex = lastCashIndex === -1 ? -1 : newPayments.length - 1 - lastCashIndex;
        return newPayments.map((payment, index) => {
            const amount = validOrDefult(payment.amount, 0);
            const payload = {
                payment_method: payment.payment_method,
                amount,
                transaction_no: payment.transaction_no || undefined,
                payment_date: new Date(),
                due: amountDue
            };

            if (payment.payment_method === 'Cash') {
                payload.cash_received = amount;
                payload.change = index === cashIndex ? change : 0;
            }

            return payload;
        });
    };

    const handlePay = () => {
        if (submitting) return;
        if (remaining > 0) {
            alert(`Insufficient payment. ${currency}${amountDue.toFixed(2)} is due, but only ${currency}${moneyTotal.toFixed(2)} received.`);
            return;
        }
        if (change > 0 && !hasCashPayment) {
            alert('Overpayment is only supported when using cash.');
            return;
        }

        const hasInvalidAmount = payments.filter((p) => !p._locked).some((payment) => validOrDefult(payment.amount, 0) <= 0);
        if (hasInvalidAmount) {
            alert('Please enter a valid amount for each payment.');
            return;
        }

        setSubmitting(true);
        onComplete(buildPaymentsPayload());
    };

    const handleSaveDraft = () => {
        if (submitting) return;

        const newPayments = payments.filter((p) => !p._locked);
        if (newPayments.length === 0) {
            alert('No new payments to save.');
            return;
        }
        const hasInvalidAmount = newPayments.some((payment) => validOrDefult(payment.amount, 0) <= 0);
        if (hasInvalidAmount) {
            alert('Please enter a valid amount for each payment.');
            return;
        }

        setSubmitting(true);
        onSavePayments(buildPaymentsPayload());
    };

    if (!isOpen) return null;

    return (
        <div className="modal show d-block" tabIndex="-1" role="dialog" onClick={onClose} style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <div className="modal-dialog modal-dialog-centered" role="document" onClick={(e) => e.stopPropagation()}>
                <div className="modal-content">
                    <div className="modal-header bg-dark text-white">
                        <h5 className="modal-title"><i className="fas fa-cash-register me-2"></i>Payment</h5>
                        <button type="button" className="btn-close btn-close-white" aria-label="Close" onClick={onClose} disabled={loading}></button>
                    </div>
                    <div className="modal-body">
                        {/* Total banner */}
                        <div className="bg-light rounded p-3 mb-3 text-center">
                            <div className="text-muted small">Amount Due</div>
                            <div className="fw-bold fs-3">{currency}{amountDue.toFixed(2)}</div>
                            {creditTotal > 0 && (
                                <div className="small text-muted mt-1">
                                    Sale {currency}{total.toFixed(2)} · exchange credit −{currency}{Math.min(creditTotal, total).toFixed(2)}
                                </div>
                            )}
                        </div>

                        {/* Payment rows */}
                        {payments.map((payment, index) => (
                            <div key={payment.id} className={`border rounded p-2 mb-2 ${payment._locked ? 'bg-light' : ''}`}>
                                <div className="row g-2 align-items-center">
                                    <div className="col">
                                        <select
                                            className="form-select form-select-sm"
                                            value={payment.payment_method}
                                            onChange={(e) => handleMethodChange(index, e.target.value)}
                                            disabled={loading || payment._locked}
                                        >
                                            <option value="Cash">Cash</option>
                                            <option value="Card">Card</option>
                                            <option value="Bank">Bank</option>
                                            <option value="Mobile Wallet">Mobile Wallet</option>
                                            {payment.payment_method === 'Exchange Return' && (
                                                <option value="Exchange Return">Exchange Return</option>
                                            )}
                                        </select>
                                    </div>
                                    <div className="col">
                                        <div className="input-group input-group-sm">
                                            <span className="input-group-text">{currency}</span>
                                            <input
                                                type="text"
                                                className="form-control text-end"
                                                value={payment.amount}
                                                onChange={(e) => handleAmountChange(index, e.target.value)}
                                                placeholder="0.00"
                                                autoFocus={index === 0 && !payment._locked}
                                                disabled={loading || payment._locked}
                                            />
                                            {!payment._locked && (
                                                <button
                                                    className="btn btn-outline-secondary"
                                                    type="button"
                                                    onClick={() => handleExactAmount(index)}
                                                    disabled={loading}
                                                    title="Fill exact remaining"
                                                >
                                                    <i className="fas fa-equals"></i>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="col-auto">
                                        <button
                                            type="button"
                                            className="btn btn-sm btn-outline-danger"
                                            onClick={() => handleRemovePayment(index)}
                                            disabled={loading || payments.length === 1 || payment._locked}
                                            title="Remove"
                                        >
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </div>
                                </div>
                                {payment.payment_method !== 'Cash' && payment.payment_method !== 'Exchange Return' && (
                                    <input
                                        type="text"
                                        className="form-control form-control-sm mt-2"
                                        value={payment.transaction_no}
                                        onChange={(e) => handleTransactionChange(index, e.target.value)}
                                        placeholder="Transaction No. (optional)"
                                        disabled={loading}
                                    />
                                )}
                            </div>
                        ))}

                        <button className="btn btn-sm btn-outline-primary w-100 mb-3" type="button" onClick={handleAddPayment} disabled={loading}>
                            <i className="fas fa-plus me-1"></i>Add Payment Method
                        </button>

                        {/* Summary */}
                        <div className="border-top pt-2">
                            <div className="d-flex justify-content-between mb-1">
                                <span className="text-muted">Paid</span>
                                <span className="fw-bold">{currency}{totalPaid.toFixed(2)}</span>
                            </div>
                            {remaining > 0 && (
                                <div className="d-flex justify-content-between mb-1 text-danger">
                                    <span>Remaining</span>
                                    <span className="fw-bold">{currency}{remaining.toFixed(2)}</span>
                                </div>
                            )}
                            {unusedCredit > 0 && (
                                <div className="d-flex justify-content-between mb-1 text-muted">
                                    <span>Unused credit</span>
                                    <span>{currency}{unusedCredit.toFixed(2)}</span>
                                </div>
                            )}
                            {change > 0 && (
                                <div className="d-flex justify-content-between align-items-center bg-success bg-opacity-10 rounded p-2">
                                    <span className="text-success"><i className="fas fa-coins me-1"></i>Change</span>
                                    <span className="fw-bold text-success fs-5">{currency}{change.toFixed(2)}</span>
                                </div>
                            )}
                            {remaining > 0 && moneyTotal > 0 && (
                                <div className="text-danger text-center small mt-1">Insufficient payment</div>
                            )}
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-outline-secondary" onClick={onClose} disabled={loading}>Cancel</button>
                        <button type="button" className="btn btn-outline-primary px-3" onClick={handleSaveDraft} disabled={submitting || loading || payments.filter(p => !p._locked).length === 0 || totalPaid <= 0}>
                            {loading ? (<><span className="spinner-border spinner-border-sm me-1"></span>Saving...</>) : (<><i className="fas fa-save me-1"></i>Save Payments</>)}
                        </button>
                        <button type="button" className="btn btn-success px-4" onClick={handlePay} disabled={submitting || loading || payments.length === 0 || remaining > 0}>
                            {loading ? (<><span className="spinner-border spinner-border-sm me-1"></span>Processing...</>) : (<><i className="fas fa-check me-1"></i>Confirm Payment</>)}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutModal;

