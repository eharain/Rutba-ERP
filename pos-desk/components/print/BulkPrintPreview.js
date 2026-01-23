// file: /pos-desk/components/print/BulkPrintPreview.js
import React, {  useEffect } from 'react';
import BulkBarcodePrint from './BulkBarcodePrint';
import { useUtil } from '../../context/UtilContext';

const BulkPrintPreview = ({ storageKey, title, onClose }) => {
    const { labelSize, setLabelSize } = useUtil()

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
                <select
                    className="form-select form-select-sm"
                    value={labelSize}
                    onChange={(e) => setLabelSize(e.target.value)}
                >
                    <option value="2.4x1.5">2.4 x 1.5 in</option>
                    <option value="2.25x1.25">2.25 x 1.25 in</option>
                    <option value="2x1">2 x 1 in</option>
                    <option value="1.5x1">1.5 x 1 in</option> 
                    <option value="1x1">1 x 1 in</option>
                    <option value="4x6">4 x 6 in (Shipping)</option>
                </select>

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

            <BulkBarcodePrint storageKey={storageKey} title={title} labelSize={labelSize} />
        </div>
    );
};

export default BulkPrintPreview;