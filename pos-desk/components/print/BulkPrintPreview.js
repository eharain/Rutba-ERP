// file: /pos-desk/components/print/BulkPrintPreview.js
import React, { useEffect } from 'react';
import BulkBarcodePrint from './BulkBarcodePrint';

const BulkPrintPreview = ({ storageKey, title, onClose }) => {
    const handlePrint = () => {
        window.print();
    };

    const handleClose = () => {
        if (onClose) {
            onClose();
        } else if (window.opener) {
            window.close();
        } else {
            window.history.back();
        }
    };

    useEffect(() => {
        const timer = setTimeout(() => {
            window.print();
        }, 3000);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div>
            {/* Print Controls - Only visible on screen */}
            <div
                className="d-print-none position-fixed"
                style={{
                    top: '20px',
                    right: '20px',
                    background: 'lightgrey',
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
                    onClick={handlePrint}
                    className="btn btn-success"
                >
                    🖨️ Print Now
                </button>
                <button
                    onClick={handleClose}
                    className="btn btn-secondary"
                >
                    Close
                </button>
            </div>

            <BulkBarcodePrint storageKey={storageKey} title={title} />
        </div>
    );
};

export default BulkPrintPreview;