import React, { useEffect, useState } from 'react';
import SaleInvoice from './SaleInvoice';
import { useUtil } from '../../context/UtilContext';

const SaleInvoicePrint = ({ sale, items, totals, onClose  }) => {
    const { invoicePrintSettings, setInvoicePrintSettings } = useUtil();

    // Local editable copy so changes can be previewed before persisting
    const [localSettings, setLocalSettings] = useState(invoicePrintSettings ?? {
        paperWidth: '80mm',
        fontSize: 20,
        showTax: true,
        showBranch: true,
        branchFields: ['name', 'companyName', 'web']
    });

    useEffect(() => {
        const timer = setTimeout(() => {
            window.print();
        }, 500);

        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        // initialize local copy when context changes
        setLocalSettings(invoicePrintSettings ?? localSettings);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [invoicePrintSettings]);

    function applyAndSave() {
        setInvoicePrintSettings(localSettings);
    }

    function toggleBranchField(field) {
        const next = new Set(localSettings.branchFields || []);
        if (next.has(field)) next.delete(field); else next.add(field);
        setLocalSettings({ ...localSettings, branchFields: Array.from(next) });
    }

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
                    alignItems: 'center',
                    flexDirection: 'column',
                    minWidth: '220px'
                }}
            >
                <div className="w-100 mb-2">
                    <label className="form-label text-white small mb-1">Paper Width</label>
                    <select
                        className="form-select form-select-sm"
                        value={localSettings.paperWidth}
                        onChange={(e) => setLocalSettings({ ...localSettings, paperWidth: e.target.value })}
                    >
                        <option value="58mm">58mm</option>
                        <option value="80mm">80mm</option>
                        <option value="210mm">A4</option>
                    </select>
                </div>

                <div className="w-100 mb-2">
                    <label className="form-label text-white small mb-1">Font Size</label>
                    <input
                        type="number"
                        min="8"
                        max="18"
                        className="form-control form-control-sm"
                        value={localSettings.fontSize}
                        onChange={(e) => setLocalSettings({ ...localSettings, fontSize: Number(e.target.value) })}
                    />
                </div>

                <div className="form-check form-check-inline text-white">
                    <input
                        className="form-check-input"
                        type="checkbox"
                        id="showTax"
                        checked={localSettings.showTax}
                        onChange={(e) => setLocalSettings({ ...localSettings, showTax: e.target.checked })}
                    />
                    <label className="form-check-label small" htmlFor="showTax">Show Tax</label>
                </div>

                <div className="form-check form-check-inline text-white">
                    <input
                        className="form-check-input"
                        type="checkbox"
                        id="showBranch"
                        checked={localSettings.showBranch}
                        onChange={(e) => setLocalSettings({ ...localSettings, showBranch: e.target.checked })}
                    />
                    <label className="form-check-label small" htmlFor="showBranch">Show Branch</label>
                </div>

                <div className="w-100 mt-2" style={{ maxHeight: '120px', overflowY: 'auto' }}>
                    <div className="small text-white mb-1">Branch Fields</div>
                    <div className="form-check text-white">
                        <input className="form-check-input" type="checkbox" id="bf-name" checked={(localSettings.branchFields || []).includes('name')} onChange={() => toggleBranchField('name')} />
                        <label className="form-check-label small" htmlFor="bf-name">Branch Name</label>
                    </div>
                    <div className="form-check text-white">
                        <input className="form-check-input" type="checkbox" id="bf-company" checked={(localSettings.branchFields || []).includes('companyName')} onChange={() => toggleBranchField('companyName')} />
                        <label className="form-check-label small" htmlFor="bf-company">Company Name</label>
                    </div>
                    <div className="form-check text-white">
                        <input className="form-check-input" type="checkbox" id="bf-web" checked={(localSettings.branchFields || []).includes('web')} onChange={() => toggleBranchField('web')} />
                        <label className="form-check-label small" htmlFor="bf-web">Website</label>
                    </div>
                </div>

                <div className="d-flex w-100 gap-2 mt-2">
                    <button
                        onClick={() => { applyAndSave(); window.print(); }}
                        className="btn btn-primary btn-sm"
                        style={{ fontSize: '14px', fontWeight: 'bold', flex: 1 }}
                    >
                        Print
                    </button>
                    <button
                        onClick={() => { applyAndSave(); }}
                        className="btn btn-success btn-sm"
                        style={{ fontSize: '14px', fontWeight: 'bold' }}
                    >
                        Save
                    </button>
                </div>

                <button
                    onClick={onClose}
                    className="btn btn-secondary btn-sm w-100 mt-2"
                    style={{ fontSize: '14px', fontWeight: 'bold' }}
                >
                    Close
                </button>
            </div>

            <SaleInvoice sale={sale} items={items} totals={totals}  />
        </div>
    );
};

export default SaleInvoicePrint;

