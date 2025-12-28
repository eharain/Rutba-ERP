import React, { useEffect } from 'react';
import SaleInvoice from './SaleInvoice';

const SaleInvoicePrint = ({ sale, items, totals, onClose }) => {
    useEffect(() => {
        // Auto-print when component mounts
        const timer = setTimeout(() => {
            window.print();
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <style jsx global>{`
                @media screen {
                    .print-controls {
                        display: flex;
                        position: fixed;
                        top: 20px;
                        right: 20px;
                        background: black;
                        padding: 15px;
                        border: 2px solid #007bff;
                        border-radius: 8px;
                        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                        z-index: 1000;
                        gap: 10px;
                        align-items: center;
                    }
                    
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: flex-start;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                }
                
                @media print {
                    .print-controls {
                        display: none !important;
                        size: auto;
                    }
                    
                    body {
                        display: flex;
                        justify-content: center;
                        align-items: flex-start;
                        min-height: 100vh;
                        margin: 0;
                        padding: 20px;
                    }
                    
                    html {
                        width: 100%;
                        display: flex;
                        justify-content: center;
                    }
                }
            `}</style>

            {/* Print Controls - Only visible on screen */}
            <div className="print-controls">
                <button
                    onClick={() => window.print()}
                    style={{
                        padding: '10px 20px',
                        background: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}
                >
                    Print
                </button>
                <button
                    onClick={onClose}
                    style={{
                        padding: '10px 20px',
                        background: '#6c757d',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}
                >
                    Close
                </button>
            </div>

            <SaleInvoice sale={sale} items={items} totals={totals} />
        </div>
    );
};

export default SaleInvoicePrint;

