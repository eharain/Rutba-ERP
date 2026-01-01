// file: /pos-desk/components/BarcodePrintPreview.js
import React from 'react';
import PrintBarcodeLabels from '../PrintBarcodeLabels';

const BarcodePrintPreview = ({ items, title, onClose }) => {
    const handlePrint = () => {
        window.print();
    };

    const handleClose = () => {
        if (onClose) {
            onClose();
        } else {
            window.close();
        }
    };

    React.useEffect(() => {
        // Auto-print when component mounts
        const timer = setTimeout(() => {
            window.print();
            // Close window after a delay if this is a popup
            if (window.opener) {
                setTimeout(() => window.close(), 1000);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div>
            <style jsx global>{`
                @media screen {
                    .no-print {
                        display: block;
                    }
                }
                @media print {
                    .no-print {
                        display: none;
                    }
                }
                body {
                    margin: 0;
                    padding: 20px;
                }
            `}</style>

            {/* Controls that don't print */}
            <div className="no-print" style={{
                position: 'fixed',
                top: '10px',
                right: '10px',
                background: 'grey',
                padding: '10px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                zIndex: 1000
            }}>
                <button
                    onClick={handlePrint}
                    style={{
                        marginRight: '10px',
                        padding: '8px 16px',
                        background: '#007bff',
                        color: 'grey',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Print
                </button>
                <button
                    onClick={handleClose}
                    style={{
                        padding: '8px 16px',
                        background: '#6c757d',
                        color: 'grey',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer'
                    }}
                >
                    Close
                </button>
            </div>

            <PrintBarcodeLabels items={items} title={title} />
        </div>
    );
};

export default BarcodePrintPreview;