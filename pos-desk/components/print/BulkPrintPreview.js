// file: /pos-desk/components/print/BulkPrintPreview.js
import React, { useEffect } from 'react';
import BulkBarcodePrint from './BulkBarcodePrint';
import { useUtil } from '../../context/UtilContext';

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

    return (
        <div>
            {/* Print Controls - Only visible on screen */}
            <div className="d-print-none position-fixed top-0 end-0 m-3" style={{ zIndex: 1100, minWidth: 260 }}>
                <div className="card shadow-sm">
                    <div className="card-body p-2">
                        <div className="container-fluid">
                            {/* First row: two selects (two columns) */}
                            <div className="row g-2 mb-2">
                                <div className="col-6">
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

                                <div className="col-6">
                                    <select
                                        className="form-select form-select-sm"
                                        value={printMode}
                                        onChange={(e) => setPrintMode(e.target.value)}
                                    >
                                        <option value="thermal">Thermal Printer</option>
                                        <option value="a4">A4 / Letter Printer</option>
                                    </select>
                                </div>
                            </div>

                            {/* Second row: two buttons (two columns) */}
                            <div className="row g-2">
                                <div className="col-6 d-grid">
                                    <button onClick={handlePrint} className="btn btn-sm btn-success">
                                        🖨️ Print Now
                                    </button>
                                </div>
                                <div className="col-6 d-grid">
                                    <button onClick={handleClose} className="btn btn-sm btn-secondary">
                                        Close
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <BulkBarcodePrint storageKey={storageKey} title={title} labelSize={labelSize} printMode={printMode} />
        </div>
    );
};

export default BulkPrintPreview;