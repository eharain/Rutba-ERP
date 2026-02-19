// file: /pos-desk/components/print/BulkPrintPreview.js
import React, { useEffect, useState } from 'react';
import BulkBarcodePrint from './BulkBarcodePrint';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

const BulkPrintPreview = ({ storageKey, title, onClose }) => {
    const { labelSize, setLabelSize, printMode, setPrintMode } = useUtil();

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

    const [showControls, setShowControls] = useState(false);

    return (
        <div>
            {/* Gear toggle - visible on screen only */}
            <button
                type="button"
                className="d-print-none btn btn-sm btn-primary position-fixed"
                aria-label="Toggle print settings"
                onClick={() => setShowControls(s => !s)}
                style={{ top: '20px', right: '20px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                ?
            </button>

            {/* Quick print when controls hidden */}
            {!showControls && (
                <button
                    type="button"
                    className="d-print-none btn btn-sm btn-success position-fixed"
                    aria-label="Quick print"
                    onClick={handlePrint}
                    style={{ top: '20px', right: '70px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                    ??
                </button>
            )}

            {/* Print Controls - Only visible on screen and when toggled */}
            {showControls && (
            <div className="d-print-none position-fixed" style={{ top: '70px', right: '20px', zIndex: 1100, minWidth: 260 }}>
                <div className="card shadow-sm">
                    <div className="card-body p-2">
                        <div className="container-fluid">
                            {/* Stacked controls: label size and print mode */}
                            <div className="mb-2">
                                <label className="form-label small mb-1">Label Size</label>
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
                            </div>

                            <div className="mb-2">
                                <label className="form-label small mb-1">Print Mode</label>
                                <select
                                    className="form-select form-select-sm"
                                    value={printMode}
                                    onChange={(e) => setPrintMode(e.target.value)}
                                >
                                    <option value="thermal">Thermal Printer</option>
                                    <option value="a4">A4 / Letter Printer</option>
                                </select>
                            </div>

                            {/* Stacked buttons: print and close */}
                            <div className="d-grid gap-2 mt-2">
                                <button onClick={handlePrint} className="btn btn-sm btn-success w-100">
                                    ??? Print Now
                                </button>
                                <button onClick={handleClose} className="btn btn-sm btn-secondary w-100">
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            )}

            <BulkBarcodePrint storageKey={storageKey} title={title} labelSize={labelSize} printMode={printMode} />
        </div>
    );
};

export default BulkPrintPreview;