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
        const timer = setTimeout(() => {
            window.print();
            if (window.opener) {
                setTimeout(() => window.close(), 1000);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div>
            {/* Controls that don't print */}
            <div
                className="d-print-none position-fixed"
                style={{
                    top: '10px',
                    right: '10px',
                    background: 'grey',
                    padding: '10px',
                    border: '1px solid #ccc',
                    borderRadius: '4px',
                    zIndex: 1000,
                    display: 'flex',
                    gap: '8px'
                }}
            >
                <button
                    onClick={handlePrint}
                    className="btn btn-primary"
                >
                    Print
                </button>
                <button
                    onClick={handleClose}
                    className="btn btn-secondary"
                >
                    Close
                </button>
            </div>

            <PrintBarcodeLabels items={items} title={title} />
        </div>
    );
};

export default BarcodePrintPreview;