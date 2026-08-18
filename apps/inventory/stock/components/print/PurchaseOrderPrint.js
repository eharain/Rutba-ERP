import React, { useEffect, useState } from 'react';
import PurchaseOrder from './PurchaseOrder';

/**
 * PurchaseOrderPrint — screen wrapper around the printable PurchaseOrder.
 * Auto-fires window.print() shortly after mount and renders floating (screen-only)
 * print / paper-width / close controls. Mirrors apps/sales/pos SaleInvoicePrint.
 */
const PurchaseOrderPrint = ({ purchase, onClose }) => {
    const [printer, setPrinter] = useState({ paperWidth: '210mm' });

    useEffect(() => {
        const timer = setTimeout(() => window.print(), 600);
        return () => clearTimeout(timer);
    }, []);

    return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', background: '#f3f4f6', minHeight: '100vh', paddingTop: '10px', paddingBottom: '40px' }}>
            {/* Floating controls — screen only */}
            <div className="d-print-none position-fixed d-flex gap-2" style={{ top: 16, right: 16, zIndex: 1100 }}>
                <select
                    className="form-select form-select-sm"
                    style={{ width: 'auto' }}
                    value={printer.paperWidth}
                    onChange={(e) => setPrinter({ ...printer, paperWidth: e.target.value })}
                    aria-label="Paper width"
                >
                    <option value="210mm">A4</option>
                    <option value="148mm">A5</option>
                    <option value="80mm">80mm</option>
                </select>
                <button type="button" className="btn btn-sm btn-success" onClick={() => window.print()}>
                    <i className="fas fa-print me-1"></i>Print
                </button>
                {onClose && (
                    <button type="button" className="btn btn-sm btn-secondary" onClick={onClose}>
                        <i className="fas fa-xmark me-1"></i>Close
                    </button>
                )}
            </div>

            <div style={{ background: 'white', boxShadow: '0 1px 6px rgba(0,0,0,0.15)' }}>
                <PurchaseOrder purchase={purchase} printerSettings={printer} />
            </div>
        </div>
    );
};

export default PurchaseOrderPrint;
