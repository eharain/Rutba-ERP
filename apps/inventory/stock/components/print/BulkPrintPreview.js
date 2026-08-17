// file: /pos-desk/components/print/BulkPrintPreview.js
import React, { useEffect, useState } from 'react';
import BulkBarcodePrint from './BulkBarcodePrint';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

const BulkPrintPreview = ({ storageKey, title, onClose }) => {
    const { labelSize, setLabelSize, printMode, setPrintMode, labelPriceMode, setLabelPriceMode } = useUtil();

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
                <i className="fas fa-cog"></i>
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
                    <i className="fas fa-print"></i>
                </button>
            )}

            {/* Print Controls - Only visible on screen and when toggled */}
            {showControls && (
            <div className="d-print-none position-fixed" style={{ top: '70px', right: '20px', zIndex: 1100, minWidth: 260 }}>
                <div className="card shadow-sm">
                    <div className="card-body p-2">
                        <div className="container-fluid">
                            <div className="small text-muted fw-bold mb-2">
                                <i className="fas fa-tags me-1"></i>{'Label Settings'}
                            </div>

                            {/* Label size — pairs with CSS classes .label-X and .sheet-X */}
                            <div className="mb-2">
                                <label className="form-label small mb-1">Label Size</label>
                                <select
                                    className="form-select form-select-sm"
                                    value={labelSize}
                                    onChange={(e) => setLabelSize(e.target.value)}
                                >
                                    <option value="2.4x1.5">2.4 × 1.5 in</option>
                                    <option value="2.25x1.25">2.25 × 1.25 in</option>
                                    <option value="2x1">2 × 1 in</option>
                                    <option value="1.5x1">1.5 × 1 in</option>
                                    <option value="1x1">1 × 1 in</option>
                                    <option value="4x6">4 × 6 in (Shipping)</option>
                                </select>
                            </div>

                            {/* Print mode — thermal = one label per page, A4 = grid */}
                            <div className="mb-2">
                                <label className="form-label small mb-1">Print Mode</label>
                                <select
                                    className="form-select form-select-sm"
                                    value={printMode}
                                    onChange={(e) => setPrintMode(e.target.value)}
                                >
                                    <option value="thermal">Thermal (one per page)</option>
                                    <option value="a4">A4 / Letter (grid)</option>
                                </select>
                                <div className="form-text small text-muted">
                                    {printMode === 'a4'
                                        ? `Grid layout — multiple labels per A4 sheet for ${labelSize}.`
                                        : 'Roll layout — each label prints as its own page.'}
                                </div>
                            </div>

                            {/* Price display — selling / offer / both */}
                            <div className="mb-2">
                                <label className="form-label small mb-1">Price to print</label>
                                <select
                                    className="form-select form-select-sm"
                                    value={labelPriceMode}
                                    onChange={(e) => setLabelPriceMode(e.target.value)}
                                >
                                    <option value="selling">Selling price only</option>
                                    <option value="offer">Offer price (if set)</option>
                                    <option value="both">Both: selling crossed out + offer</option>
                                </select>
                                <div className="form-text small text-muted">
                                    {labelPriceMode === 'offer'
                                        ? 'Falls back to selling price when no offer is set.'
                                        : labelPriceMode === 'both'
                                        ? 'Only renders the strike+offer pair when an offer is set lower than selling.'
                                        : 'Standard selling price; offer price is ignored.'}
                                </div>
                            </div>

                            {/* Stacked buttons: print and close */}
                            <div className="d-grid gap-2 mt-3">
                                <button onClick={handlePrint} className="btn btn-sm btn-success w-100">
                                    <i className="fas fa-print me-1"></i>{'Print Now'}
                                </button>
                                <button onClick={handleClose} className="btn btn-sm btn-secondary w-100">
                                    {'Close'}
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