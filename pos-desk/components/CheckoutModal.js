import { useState, useEffect } from 'react';
import { useUtil } from '../context/UtilContext';

const CheckoutModal = ({ isOpen, onClose, total, onComplete, loading }) => {
    const { currency } = useUtil();
    const [cashReceived, setCashReceived] = useState('');
    const [change, setChange] = useState(0);

    useEffect(() => {
        if (isOpen) {
            setCashReceived('');
            setChange(0);
        }
    }, [isOpen]);

    useEffect(() => {
        const cash = parseFloat(cashReceived) || 0;
        const calculatedChange = cash - total;
        setChange(calculatedChange >= 0 ? calculatedChange : 0);
    }, [cashReceived, total]);

    const handleCashReceivedChange = (e) => {
        const value = e.target.value;
        // Allow only numbers and decimal point
        if (value === '' || /^\d*\.?\d*$/.test(value)) {
            setCashReceived(value);
        }
    };

    const handlePay = () => {
        const cash = parseFloat(cashReceived) || 0;
        if (cash < total) {
            alert(`Insufficient payment. Total is ${currency}${total.toFixed(2)}, but only ${currency}${cash.toFixed(2)} received.`);
            return;
        }
        onComplete({ payment_method: 'Cash', amount : cash, payment_date : new Date() });
    };

    const handleExactAmount = () => {
        // set cash received to total (formatted) to satisfy validation
        setCashReceived((Math.ceil(total * 100) / 100).toFixed(2));
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Overlay */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 1000,
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
                onClick={onClose}
            >
                {/* Modal */}
                <div
                    style={{
                        background: 'black',
                        borderRadius: '8px',
                        padding: '30px',
                        minWidth: '400px',
                        maxWidth: '500px',
                        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
                        zIndex: 1001
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <style jsx>{`
                        .checkout-modal h2 {
                            margin-top: 0;
                            margin-bottom: 20px;
                            color: #333;
                            font-size: 24px;
                        }
                        
                        .checkout-row {
                            display: flex;
                            justify-content: space-between;
                            padding: 12px 0;
                            border-bottom: 1px solid #eee;
                            font-size: 16px;
                        }
                        
                        .checkout-row.total {
                            font-size: 20px;
                            font-weight: bold;
                            border-bottom: 2px solid #333;
                            margin-bottom: 20px;
                            padding-bottom: 15px;
                        }
                        
                        .checkout-row.change {
                            font-size: 18px;
                            font-weight: bold;
                            color: ${change > 0 ? '#28a745' : '#333'};
                            background: ${change > 0 ? '#f0f8f0' : 'transparent'};
                            padding: 15px;
                            border-radius: 4px;
                            margin-top: 10px;
                        }
                        
                        .cash-input-container {
                            margin: 20px 0;
                        }
                        
                        .cash-input-container label {
                            display: block;
                            margin-bottom: 8px;
                            font-weight: bold;
                            font-size: 16px;
                        }
                        
                        .cash-input-wrapper {
                            display: flex;
                            gap: 10px;
                            align-items: center;
                        }
                        
                        .cash-input {
                            flex: 1;
                            padding: 12px;
                            font-size: 18px;
                            border: 2px solid #007bff;
                            border-radius: 4px;
                            text-align: right;
                        }
                        
                        .cash-input:focus {
                            outline: none;
                            border-color: #0056b3;
                        }
                        
                        .exact-amount-btn {
                            padding: 12px 16px;
                            background: #6c757d;
                            color: white;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            font-size: 14px;
                        }
                        
                        .exact-amount-btn:hover {
                            background: #5a6268;
                        }
                        
                        .button-group {
                            display: flex;
                            gap: 10px;
                            margin-top: 25px;
                        }
                        
                        .btn {
                            flex: 1;
                            padding: 14px;
                            font-size: 16px;
                            font-weight: bold;
                            border: none;
                            border-radius: 4px;
                            cursor: pointer;
                            transition: all 0.2s;
                        }
                        
                        .btn:disabled {
                            opacity: 0.6;
                            cursor: not-allowed;
                        }
                        
                        .btn-cancel {
                            background: #6c757d;
                            color: white;
                        }
                        
                        .btn-cancel:hover:not(:disabled) {
                            background: #5a6268;
                        }
                        
                        .btn-pay {
                            background: #28a745;
                            color: white;
                        }
                        
                        .btn-pay:hover:not(:disabled) {
                            background: #218838;
                        }
                    `}</style>

                    <h2>Payment</h2>

                    <div className="checkout-row total">
                        <span>Total Amount:</span>
                        <span>{currency}{total.toFixed(2)}</span>
                    </div>

                    <div className="cash-input-container">
                        <label>Cash Received:</label>
                        <div className="cash-input-wrapper">
                            <input
                                type="text"
                                className="cash-input"
                                value={cashReceived}
                                onChange={handleCashReceivedChange}
                                placeholder="0.00"
                                autoFocus
                                disabled={loading}
                            />
                            <button
                                className="exact-amount-btn"
                                onClick={handleExactAmount}
                                disabled={loading}
                            >
                                Exact
                            </button>
                        </div>
                    </div>

                    {change > 0 && (
                        <div className="checkout-row change">
                            <span>Change to Return:</span>
                            <span>{currency}{change.toFixed(2)}</span>
                        </div>
                    )}

                    {parseFloat(cashReceived) < total && cashReceived !== '' && (
                        <div style={{
                            color: '#dc3545',
                            fontSize: '14px',
                            marginTop: '10px',
                            textAlign: 'center'
                        }}>
                            Insufficient payment
                        </div>
                    )}

                    <div className="button-group">
                        <button
                            className="btn btn-cancel"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-pay"
                            onClick={handlePay}
                            disabled={loading || !cashReceived || parseFloat(cashReceived) < total}
                        >
                            {loading ? 'Processing...' : 'Pay'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
};

export default CheckoutModal;

