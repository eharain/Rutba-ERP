import React, { useEffect } from 'react';
import { useUtil } from '@rutba/pos-shared/context/UtilContext';

const SaleReturnReceipt = ({ saleReturn, onClose }) => {
    const { currency, branch, user, invoicePrintSettings } = useUtil();

    const companyName = branch?.companyName || branch?.name || 'Company Name';
    const userName = user?.displayName || user?.username || user?.email || 'User';
    const returnNo = saleReturn?.return_no || 'N/A';
    const returnDate = saleReturn?.return_date ? new Date(saleReturn.return_date).toLocaleDateString() : new Date().toLocaleDateString();
    const saleInvoice = saleReturn?.sale?.invoice_no || 'N/A';
    const customerName = saleReturn?.sale?.customer?.name || saleReturn?.sale?.customer?.email || 'Walk-in Customer';
    const totalRefund = Number(saleReturn?.total_refund || 0);
    const items = saleReturn?.items || [];

    const paperWidth = invoicePrintSettings?.paperWidth || '80mm';
    const fontSize = invoicePrintSettings?.fontSize || 11;
    const showBranch = invoicePrintSettings?.showBranch ?? true;
    const branchFields = invoicePrintSettings?.branchFields ?? ['name', 'companyName', 'web'];

    useEffect(() => {
        const timer = setTimeout(() => {
            window.print();
        }, 500);
        return () => clearTimeout(timer);
    }, []);

    const renderBranchFields = () => {
        if (!showBranch || !branch) return null;
        const pieces = [];
        if (branchFields.includes('companyName') && (branch.companyName || branch.name)) {
            pieces.push(branch.companyName || branch.name);
        }
        if (branchFields.includes('name') && branch.name && branch.companyName) {
            pieces.push(branch.name);
        }
        if (branchFields.includes('web') && branch.web) {
            pieces.push(branch.web.toUpperCase());
        }
        if (pieces.length === 0 && branch.name) pieces.push(branch.name);
        return pieces.map((p, i) => <div key={i}>{p}</div>);
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
            <button
                type="button"
                className="d-print-none btn btn-sm btn-success position-fixed"
                aria-label="Quick print"
                onClick={() => window.print()}
                style={{ top: '20px', right: '70px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                🖨
            </button>
            <button
                type="button"
                className="d-print-none btn btn-sm btn-secondary position-fixed"
                aria-label="Close"
                onClick={onClose}
                style={{ top: '20px', right: '20px', zIndex: 1100, borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
                ✕
            </button>

            <div className="sale-invoice-container" style={{ fontFamily: "'Courier New', monospace", width: paperWidth, margin: '20px auto', padding: '10px', textAlign: 'center', fontSize: `${fontSize}px` }}>
                <style jsx global>{`
                    @media print {
                        body * { visibility: hidden; }
                        .sale-invoice-container, .sale-invoice-container * { visibility: visible; }
                        .sale-invoice-container {
                            position: absolute;
                            left: 0; top: 0;
                            width: 100%;
                            margin: 0; padding: 0;
                            background: white !important;
                        }
                        @page { margin: 0; size: auto; }
                    }
                `}</style>

                {/* Header */}
                <div className="mb-2 pb-1" style={{ borderBottom: '1px dashed #555' }}>
                    <div className="fs-5 fw-bold text-uppercase">{companyName}</div>
                    <div className="small mt-1" style={{ lineHeight: 1.4 }}>
                        {showBranch && renderBranchFields()}
                        {returnDate}<br />
                        User: {userName}
                    </div>
                    <div className="text-uppercase fw-bold text-danger mt-1" style={{ fontSize: '14px' }}>
                        RETURN RECEIPT
                    </div>
                </div>

                {/* Return info */}
                <div className="text-start small mb-2" style={{ lineHeight: 1.4 }}>
                    <div><strong>Return #:</strong> {returnNo}</div>
                    <div><strong>Original Invoice:</strong> {saleInvoice}</div>
                    <div><strong>Customer:</strong> {customerName}</div>
                    <div><strong>Type:</strong> {saleReturn?.type || 'Return'}</div>
                </div>

                {/* Items */}
                <table className="w-100 table-borderless" style={{ fontSize: '10px', marginBottom: '10px' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px dashed #999' }}>
                            <th className="text-center" style={{ width: '15%' }}>Qty</th>
                            <th className="text-start" style={{ width: '55%' }}>Item</th>
                            <th className="text-end" style={{ width: '30%' }}>Amt</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index}>
                                <td className="text-center">{item.quantity || 0}</td>
                                <td className="text-start">{item.product?.name || 'Item'}</td>
                                <td className="text-end">{currency}{Number(item.total || 0).toFixed(2)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* Totals */}
                <div style={{ borderTop: '1px dashed #555', paddingTop: '5px', fontSize: '11px' }}>
                    <table className="w-100" style={{ borderCollapse: 'collapse', fontSize: '11px' }}>
                        <tbody>
                            <tr className="fw-bold" style={{ fontSize: '14px', borderTop: '1px solid #555', paddingTop: '5px' }}>
                                <td className="text-start">Total Refund:</td>
                                <td className="text-end">{currency}{totalRefund.toFixed(2)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="mt-3" style={{ borderTop: '1px dashed #555', paddingTop: '5px' }}>
                    <div className="small">{returnNo}</div>
                    <div className="small mt-2 text-muted">Thank you</div>
                </div>
            </div>
        </div>
    );
};

export default SaleReturnReceipt;
