import React, { useEffect } from 'react';
import SaleInvoice from './SaleInvoice';

const SaleInvoicePrint = ({ sale, items, totals, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            window.print();
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            {/* Print Controls - Only visible on screen */}
            <div
                className="d-print-none position-fixed"
                style={{
                    top: '20px',
                    right: '20px',
                    background: 'black',
                    padding: '15px',
                    border: '2px solid #007bff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    zIndex: 1000,
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center'
                }}
            >
                <button
                    onClick={() => window.print()}
                    className="btn btn-primary"
                    style={{ fontSize: '14px', fontWeight: 'bold' }}
                >
                    Print
                </button>
                <button
                    onClick={onClose}
                    className="btn btn-secondary"
                    style={{ fontSize: '14px', fontWeight: 'bold' }}
                >
                    Close
                </button>
            </div>

            <SaleInvoice sale={sale} items={items} totals={totals} />
        </div>
    );
};

export default SaleInvoicePrint;

